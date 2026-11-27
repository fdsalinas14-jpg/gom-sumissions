// Pruebas v3 contra Postgres real (PGlite en memoria) y un GHL simulado.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startMockGhl } from './mock-ghl.js';
import { createServer } from '../dev.js';
import { priceLines, totals, clientPrice, withRebate, ecoBase, specialOf } from '../public/pricing.js';
import { htmlToText, textToHtml } from '../lib/lines.js';
import { classify, findModel, pickMain, importFromGhl } from '../lib/importer.js';
import { q as dbq } from '../lib/db.js';
import { applyCatalogData } from '../lib/seed.js';
import catalogData from '../lib/catalog-data.json' with { type: 'json' };
import zlib from 'node:zlib';
import { pdfToken } from '../lib/messaging.js';

// PNG real (trazo de firma) para la prueba de firma electrónica
const pngDataUrl = (w = 120, h = 40) => {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.abs(y - h / 2 - 12 * Math.sin(x / 9)) < 2) raw.writeUInt32BE(0x12263aff, y * (w * 4 + 1) + 1 + x * 4);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
};

let passed = 0;
const t = async (name, fn) => {
  try { await fn(); passed++; console.log('  ok  ', name); }
  catch (e) { console.error('  FAIL', name, '\n      ', e.stack?.split('\n').slice(0, 3).join('\n       ')); process.exitCode = 1; }
};

const mock = await startMockGhl();
Object.assign(process.env, {
  GHL_BASE: `http://127.0.0.1:${mock.port}`,
  GHL_TOKEN: 'pit-test-token',
  GHL_LOCATION_ID: 'loc_TEST',
  GHL_FROM_EMAIL: 'soumission@ecoair.test',
  SESSION_SECRET: 'x'.repeat(40),
  APP_URL: 'https://app.test',
  CATALOG_DATA: 'off', // la lista de precios real se prueba aparte (abajo)
  APP_USERS: [
    'nico:clave-nico:coord:ghl_nico:Nicolas Ampère:nico@ecoair.test',
    'marie:clave-marie:seller:ghl_marie:Marie',
    'jean:clave-jean:seller:ghl_jean:Jean',
    'fausto:clave-fausto:support::Fausto',
  ].join(','),
});
delete process.env.DATABASE_URL;
const app = createServer();
await new Promise((r) => app.listen(0, r));
const base = `http://127.0.0.1:${app.address().port}`;

const client = () => {
  const c = { cookie: '' };
  c.api = async (method, p, body, { raw = false, headers = {}, binary = false } = {}) => {
    const r = await fetch(base + p, {
      method,
      headers: { ...(body !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}), ...(c.cookie ? { Cookie: c.cookie } : {}), ...headers },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
    const sc = r.headers.get('set-cookie');
    if (sc && sc.includes('ec_session=')) c.cookie = sc.split(';')[0];
    if (binary) return { status: r.status, buf: Buffer.from(await r.arrayBuffer()), headers: r.headers };
    const text = await r.text();
    let data = {};
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data, headers: r.headers };
  };
  return c;
};
const login = async (user, pass) => {
  const c = client();
  const r = await c.api('POST', '/api/session', { user, password: pass });
  assert.equal(r.status, 200, `login ${user}: ${JSON.stringify(r.data)}`);
  return c;
};
const pdfText = (buf) => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-')), 'x.pdf');
  fs.writeFileSync(f, buf);
  return execFileSync('pdftotext', ['-layout', f, '-']).toString();
};

console.log('cálculo y texto');
await t('comisión oculta: el cliente ve el precio con comisión; TPS/TVQ solo sobre lo gravable', () => {
  const lines = priceLines([
    { kind: 'equipment', base: 8700, qty: 1, tax: 'added' },
    { kind: 'addon', price: 475, qty: 1, tax: 'included' },
    { kind: 'addon', price: -1000, qty: 1, tax: 'none' },
  ], 10);
  assert.equal(lines[0].price, 9570);
  assert.equal(lines[0].commission, 870);
  const x = totals(lines);
  assert.deepEqual(x, { subtotal: 9045, taxable: 9570, tps: 478.5, tvq: 954.61, total: 10478.11, commission: 870, directeur: 0 });
  assert.equal(clientPrice(1234.56, 7.5), 1327.15);
  // « Directeur des ventes »: se suma al precio como la comisión (interno)
  const d = priceLines([{ kind: 'equipment', base: 8000, commissionUnit: 500, directeurUnit: 200, qty: 2, tax: 'added' }], 10);
  assert.deepEqual([d[0].price, d[0].commission, d[0].directeur, totals(d).directeur], [8700, 1000, 400, 400]);
  // reglas oficiales: centrale 2 T = equipo + 1 200 + 1 500 + 3 000; MIN + 1 000; murale + 500; Spécial centrale −500
  assert.deepEqual(ecoBase('central', { equipment: 3515.75, tons: 2 }), { equipment: 3515.75, quinc: 1200, labour: 1500, profit: 3000, base: 9215.75, min: 10215.75 });
  assert.equal(ecoBase('wall', { equipment: 1000 }).min, 1000 + 600 + 800 + 800 + 500);
  assert.deepEqual([ecoBase('steffes', { equipment: 1, tons: 4 }).base, specialOf('central'), specialOf('steffes'), specialOf('wall')], [2000 + 4000 + 5000 + 1, 500, 1000, 0]);
});
await t('descripción con títulos y viñetas', () => {
  const html = '<h2><strong>❄️ Équipement</strong></h2><ul><li><p>SEER : 18</p></li></ul>';
  assert.equal(htmlToText(html), '# ❄️ Équipement\n• SEER : 18');
  assert.equal(textToHtml('# T\n- a'), '<p><strong>T</strong></p><ul><li><p>a</p></li></ul>');
});
await t('importador: clasifica nombres reales de GHL', () => {
  assert.deepEqual(classify('Hitachi Central 4T'), { category: 'central', brand: 'Hitachi', capacity: 4 });
  // murales: el equipo vale 1 $ y el raccordement 350 $ → el equipo sigue siendo el producto
  assert.equal(pickMain([{ name: 'Eliose 9000 Btu26 Trés2', amount: 1 }, { name: 'RACCORDEMENT ELECTRIQUE', amount: 350 }]).name, 'Eliose 9000 Btu26 Trés2');
  assert.equal(pickMain([{ name: 'module wifi hitachi airgo', amount: 0 }, { name: 'Thermopompe centrale Hitachi', amount: 12838 }]).name, 'Thermopompe centrale Hitachi');
  assert.equal(pickMain([{ name: 'Thermopompe centrale YORK – 3 tonnes', amount: 0 }, { name: 'Serpentin intérieur – YORK (Add-On)', amount: 0 }]).name, 'Thermopompe centrale YORK – 3 tonnes');
  assert.deepEqual(classify('Murale Elios18 MBH 26Trés2'), { category: 'wall', brand: 'Elios', capacity: 18000 });
  assert.deepEqual(classify('STEFFES + ELIOS 2.5T'), { category: 'steffes', brand: 'Elios', capacity: 2.5 });
  assert.deepEqual(classify('Thermopompe centrale YORK – 3 MBH Add-on'), { category: 'central', brand: 'York', capacity: 3 });
  assert.deepEqual(classify('MaxiCentral 5 T'), { category: 'central', brand: 'Maxivent', capacity: 5 });
  assert.equal(findModel('Réfrigérant R-454B, unité ESHMA60R2AN1'), 'ESHMA60R2AN1');
});

console.log('usuarios y seguridad');
const anon = client();
await t('sin sesión → 401; usuarios de APP_USERS migrados con clave cifrada', async () => {
  assert.equal((await anon.api('GET', '/api/catalog')).status, 401);
  assert.equal((await anon.api('POST', '/api/session', { user: 'marie', password: 'mala' })).status, 401);
});
const nico = await login('nico', 'clave-nico');
const marie = await login('Marie', 'clave-marie');
const jean = await login('jean', 'clave-jean');
const fausto = await login('fausto', 'clave-fausto');
await t('roles: coord y support → admin; seller → vendedor', async () => {
  assert.equal((await nico.api('GET', '/api/session')).data.user.isAdmin, true);
  assert.equal((await fausto.api('GET', '/api/session')).data.user.isAdmin, true);
  assert.equal((await marie.api('GET', '/api/session')).data.user.role, 'seller');
});
await t('vendedor no entra al Back Office', async () => {
  assert.equal((await marie.api('GET', '/api/admin')).status, 403);
  assert.equal((await marie.api('POST', '/api/catalog?type=category', { code: 'x', nameFr: 'X' })).status, 403);
});
await t('admin define la comisión de cada vendedor', async () => {
  const r = await nico.api('PUT', '/api/admin?section=users', { name: 'marie', display: 'Marie (Gigi)', role: 'seller', commissionPct: 10, ghlId: 'ghl_marie' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.users.find((u) => u.name === 'marie').commissionPct, 10);
  assert.ok(!JSON.stringify(r.data).includes('scrypt'), 'nunca devuelve la clave');
  await nico.api('PUT', '/api/admin?section=users', { name: 'jean', display: 'Jean', role: 'seller', commissionPct: 5 });
});
await t('cambiar mi clave cierra las sesiones viejas', async () => {
  const other = await login('jean', 'clave-jean');
  assert.equal((await jean.api('PUT', '/api/session', { current: 'mala', password: 'nueva-clave-1' })).status, 400);
  assert.equal((await jean.api('PUT', '/api/session', { current: 'clave-jean', password: 'corta' })).status, 400);
  assert.equal((await jean.api('PUT', '/api/session', { current: 'clave-jean', password: 'nueva-clave-1' })).status, 200);
  assert.equal((await other.api('GET', '/api/session')).status, 401, 'sesión vieja cerrada');
  assert.equal((await jean.api('GET', '/api/session')).status, 200, 'la mía sigue');
  await login('jean', 'nueva-clave-1');
});
await t('crear vendedor y desactivarlo le quita el acceso', async () => {
  assert.equal((await nico.api('POST', '/api/admin?section=users', { name: 'gigi', display: 'Gigi', password: 'corta' })).status, 400);
  assert.equal((await nico.api('POST', '/api/admin?section=users', { name: 'gigi', display: 'Gigi', password: 'clave-gigi-1', commissionPct: 12 })).status, 200);
  const g = await login('gigi', 'clave-gigi-1');
  await nico.api('PUT', '/api/admin?section=users', { name: 'gigi', display: 'Gigi', role: 'seller', commissionPct: 12, active: false });
  assert.equal((await g.api('GET', '/api/session')).status, 401);
  assert.equal((await nico.api('PUT', '/api/admin?section=users', { name: 'nico', display: 'Nico', role: 'seller' })).status, 400, 'no se quita su propio acceso');
});

console.log('catálogo');
let cat;
await t('categorías, marcas y capacidades del documento', async () => {
  cat = (await marie.api('GET', '/api/catalog')).data;
  assert.deepEqual(cat.categories.map((c) => c.code), ['wall', 'multi', 'central', 'addon', 'ac']);
  const central = cat.categories.find((c) => c.code === 'central');
  const brands = cat.brands.filter((b) => b.categoryId === central.id).map((b) => b.name);
  assert.deepEqual(brands, ['Kinghome', 'Zephyr']);
  const kh = cat.brands.find((b) => b.categoryId === central.id && b.name === 'Kinghome');
  assert.deepEqual(cat.capacities.filter((c) => c.brandId === kh.id).map((c) => c.value), [2, 2.5, 3, 4, 5]);
});
await t('importación única de GHL (script, sin botón en la app): sin duplicar', async () => {
  assert.equal((await nico.api('POST', '/api/catalog?action=import')).status, 400, 'ya no hay importación desde la app');
  const r = await importFromGhl();
  assert.equal(r.products, 3);
  const again = await importFromGhl();
  assert.equal(again.products, 0);
  assert.equal(again.updated, 3);
  cat = (await marie.api('GET', '/api/catalog')).data;
  const maxi = cat.products.find((p) => p.name === 'MaxiCentral 2T');
  assert.equal(maxi.basePrice, 8700);
  assert.equal(maxi.model, 'MAXS2430');
  assert.match(maxi.descriptionFr, /^❄️ Équipement inclus\n🔹 Unité extérieure/);
  assert.equal(maxi.attachments.length, 1);
  const warranty = cat.addons.find((a) => a.name === 'Garantie Cornerstone MaxiVent');
  assert.equal(warranty.kind, 'warranty');
  assert.equal(warranty.tax, 'included');
  assert.deepEqual(maxi.defaultAddons, [{ addonId: warranty.id, price: 475 }]);
  const brand = cat.brands.find((b) => b.id === maxi.brandId);
  assert.equal(brand.name, 'Maxivent');
  assert.equal(cat.capacities.find((c) => c.id === maxi.capacityId).value, 2);
});
await t('admin crea y edita productos y opciones; borrar algo en uso lo desactiva', async () => {
  const wall = cat.categories.find((c) => c.code === 'wall');
  const samsung = cat.brands.find((b) => b.categoryId === wall.id && b.name === 'Zephyr');
  const cap = cat.capacities.find((c) => c.brandId === samsung.id && c.value === 12000);
  const r = await nico.api('POST', '/api/catalog?type=product', {
    categoryId: wall.id, brandId: samsung.id, capacityId: cap.id, name: 'Zephyr spécial 12 000 BTU', model: 'ZE12TEST',
    descriptionFr: '# Unité murale\n• 12 000 BTU', basePrice: '3 250,00', attachments: [{ name: 'Fiche', url: 'https://cdn.test/f.pdf' }, { name: 'bad', url: 'javascript:x' }],
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const line = await nico.api('POST', '/api/catalog?type=addon', { kind: 'lineset', name: 'Ligne 1/4-1/2 au pied', price: 12.5, priceMode: 'per_foot', editable: false, categoryIds: [wall.id] });
  assert.equal(line.status, 200);
  assert.equal((await nico.api('POST', '/api/catalog?type=addon', { kind: 'nope', name: 'x' })).status, 400);
  assert.equal((await nico.api('POST', '/api/catalog?type=addon', { kind: 'accessory', name: 'x', price: -5 })).status, 400, 'solo crédito puede ser negativo');
  cat = (await nico.api('GET', '/api/catalog?all=1')).data;
  const p = cat.products.find((x) => x.id === r.data.id);
  assert.equal(p.basePrice, 3250);
  assert.equal(p.attachments.length, 1, 'enlaces no https se descartan');
  const del = await nico.api('DELETE', `/api/catalog?type=brand&id=${samsung.id}`);
  assert.deepEqual(del.data, { deactivated: true });
  await nico.api('PUT', `/api/catalog?type=brand&id=${samsung.id}`, { categoryId: wall.id, name: 'Zephyr', active: true });
});

await t('catálogo GOM (Kinghome + Zephyr): se carga una vez, sin precio base, fichas y garantías', async () => {
  const exec = (text, params) => dbq(text, params);
  assert.equal(await applyCatalogData(exec, catalogData), true);
  assert.equal(await applyCatalogData(exec, catalogData), false, 'misma versión: no se vuelve a aplicar');
  const all = (await nico.api('GET', '/api/catalog?all=1')).data;
  const [{ n }] = await dbq('select count(*)::int as n from ec_products where source_key is not null');
  assert.equal(n, catalogData.products.length);
  // el vendedor escribe el precio: nada de precio base ni mínimo, y nunca el costo de las listas
  assert.ok(catalogData.products.every((p) => p.basePrice === 0 && p.minPrice === 0));
  assert.ok(!/\$1,?557|1557/.test(JSON.stringify(catalogData)), 'sin precios coûtants');
  const pol = all.products.find((p) => p.name === 'Thermopompe murale Kinghome 12 000 BTU – Polaris');
  assert.deepEqual([pol.model, pol.ahri, pol.subsidy, pol.active], ['KWP12R32C3O', '218451122', 1800, true]);
  assert.match(pol.descriptionFr, /Unité intérieure murale – KWP12R32C3I/);
  assert.match(pol.descriptionFr, /Raccords frigorifiques : 1\/2 \(gaz\) × 1\/4 \(liquide\)/);
  assert.match(pol.descriptionFr, /12 ans – pièces et compresseur\n• 6 ans – main-d’œuvre/);
  assert.match(pol.descriptionEn, /12 years – parts and compressor/);
  const z3 = all.products.find((p) => p.name === 'Thermopompe centrale Zephyr 3 T');
  assert.deepEqual([z3.model, z3.ahri, z3.subsidy], ['ZE636HPA', '215381146', 3840]);
  assert.match(z3.descriptionFr, /10 ans – pièces et compresseur/);
  // multizone: la cabeza se elige aparte, en una subsección de Multizone
  const multi = all.categories.find((c) => c.code === 'multi');
  assert.equal(all.categories.find((c) => c.code === 'heads').parentId, multi.id);
  const km = all.products.find((p) => p.model === 'KM24X6O');
  assert.match(km.descriptionFr, /Mixte murales et gainables : AHRI 215708452 – subvention estimée 2 760 \$/);
  assert.equal(all.products.filter((p) => /^Tête murale Kinghome 9 000 BTU/.test(p.name)).length, 3, 'Charmo, Clivia, Airy');
  const el = all.addons.find((a) => a.name === 'Élément électrique Zephyr 7,5 kW');
  assert.deepEqual([el.price, el.editable], [0, true]);
  // el admin corrige un producto: una versión nueva no pisa su texto
  await nico.api('PUT', `/api/catalog?type=product&id=${pol.id}`, { ...pol, descriptionFr: 'Revisé par GOM' });
  await applyCatalogData(exec, { ...catalogData, version: 'test-v2', products: catalogData.products.map((p) => (p.model === 'ZE636HPA' && p.category === 'central' ? { ...p, descriptionFr: 'Nouvelle description' } : p)) });
  const v2 = (await nico.api('GET', '/api/catalog?all=1')).data.products;
  assert.equal(v2.find((p) => p.id === pol.id).descriptionFr, 'Revisé par GOM');
  assert.equal(v2.find((p) => p.id === z3.id).descriptionFr, 'Nouvelle description');
});

console.log('soumissions');
const contact = { id: 'cont_abc123', name: 'Marie Tremblay', email: 'marie@example.com', phone: '+15145550101', address1: '12 rue X', city: 'Brossard' };
let est;
const ids = () => ({
  maxi: cat.products.find((p) => p.name === 'MaxiCentral 2T'),
  warranty: cat.addons.find((a) => a.name === 'Garantie Cornerstone MaxiVent'),
  line: cat.addons.find((a) => a.name === 'Ligne 1/4-1/2 au pied'),
  credit: null,
});
await t('vendedora crea una soumission: comisión 10 % invisible, precios del catálogo', async () => {
  const { maxi, warranty, line } = ids();
  const r = await marie.api('POST', '/api/estimates', {
    contact, lang: 'fr', notes: 'Accès par la cour arrière.',
    items: [
      { type: 'product', productId: maxi.id, qty: 1, base: 8000 },
      { type: 'addon', addonId: warranty.id, qty: 1, price: 1 }, // no editable: se ignora el precio del navegador
      { type: 'addon', addonId: line.id, qty: 25 },
    ],
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  est = r.data.estimate;
  assert.equal(est.number, 1001);
  assert.equal(est.status, 'draft');
  assert.equal(est.seller, 'marie');
  assert.deepEqual(est.lines.map((l) => [l.price, l.qty, l.tax]), [[8800, 1, 'added'], [475, 1, 'included'], [12.5, 25, 'added']]);
  assert.equal(est.commission, 800);
  assert.equal(est.subtotal, 9587.5);
  assert.equal(est.tps, 455.63); // (8800 + 312.50) × 5 %
  assert.equal(est.tvq, 908.97);
  assert.equal(est.total, 10952.1);
  assert.match(r.data.pdf, /^https:\/\/app\.test\/api\/pdf\?id=\d+&k=/);
});
await t('la comisión depende del vendedor elegido', async () => {
  const { maxi } = ids();
  const r = await marie.api('POST', '/api/estimates', { contact, seller: 'jean', items: [{ type: 'product', productId: maxi.id, qty: 1 }] });
  assert.equal(r.data.estimate.lines[0].price, 9135); // 8700 + 5 %
  assert.equal(r.data.estimate.seller, 'jean');
  assert.equal((await marie.api('POST', '/api/estimates', { contact, seller: 'nadie', items: [{ type: 'product', productId: maxi.id, qty: 1 }] })).status, 400);
});
await t('validaciones', async () => {
  const { maxi, line } = ids();
  for (const b of [
    { contact, items: [] },
    { contact: { id: '../x' }, items: [{ type: 'product', productId: maxi.id, qty: 1 }] },
    { contact, items: [{ type: 'product', productId: 99999, qty: 1 }] },
    { contact, items: [{ type: 'product', productId: maxi.id, qty: 0 }] },
    { contact, items: [{ type: 'product', productId: maxi.id, qty: 1, base: -5 }] },
    { contact, items: [{ type: 'addon', addonId: line.id, qty: 501 }] },
  ]) assert.equal((await marie.api('POST', '/api/estimates', b)).status, 400, JSON.stringify(b));
});
await t('prix MINIMUM: referencia, no bloquea (la comisión es libre)', async () => {
  const all = (await nico.api('GET', '/api/catalog?all=1')).data;
  const maxi = all.products.find((p) => p.name === 'MaxiCentral 2T');
  assert.equal((await nico.api('PUT', `/api/catalog?type=product&id=${maxi.id}`, { ...maxi, minPrice: 9000, ahri: '215798837', subsidy: 2784 })).status, 200);
  const r = await marie.api('POST', '/api/estimates', { contact, items: [{ type: 'product', productId: maxi.id, qty: 1, base: 8000, commission: 0 }] }); // 8 000 $ < 9 000 $
  assert.equal(r.status, 200, 'bajo el mínimo: se guarda igual');
  assert.equal(r.data.estimate.lines[0].minPrice, 9000);
  await marie.api('POST', `/api/estimates?id=${r.data.estimate.id}&action=delete`, {});
  const p = (await nico.api('GET', '/api/catalog?all=1')).data.products.find((x) => x.id === maxi.id);
  assert.deepEqual([p.minPrice, p.ahri, p.subsidy], [9000, '215798837', 2784]);
  await nico.api('PUT', `/api/catalog?type=product&id=${maxi.id}`, { ...maxi, minPrice: 0, ahri: '', subsidy: 0 });
  const d = withRebate('Unité 3 T', { ahri: '215798837', subsidy: 2784 }, 'fr');
  assert.match(d, /# Aide financière – Hydro-Québec\n• AHRI: 215798837\n• Subvention estimée: 2\s784,00\s\$/);
  assert.equal(withRebate('Unité', {}, 'fr'), 'Unité');
});
await t('cada vendedor ve lo suyo; el admin ve todo con totales por estado', async () => {
  assert.equal((await jean.api('GET', `/api/estimates?id=${est.id}`)).status, 404);
  const mine = (await marie.api('GET', '/api/estimates')).data;
  assert.equal(mine.total, 2, 'la suya y la que hizo para Jean');
  assert.equal(mine.stats.draft.commission, undefined, 'el vendedor no ve la comisión total');
  const all = (await nico.api('GET', '/api/estimates')).data;
  assert.equal(all.stats.draft.n, 2);
  assert.equal(all.stats.draft.commission, 800 + 435);
  assert.equal((await nico.api('GET', '/api/estimates?seller=jean')).data.total, 1);
  assert.equal((await nico.api('GET', '/api/estimates?q=Tremblay')).data.total, 2);
  assert.equal((await nico.api('GET', '/api/estimates?q=1001')).data.estimates[0].id, est.id);
  assert.ok(all.sellers.some((s) => s.name === 'marie' && s.commissionPct === 10));
  const ms = (await jean.api('GET', '/api/estimates')).data.sellers;
  assert.equal(ms.find((s) => s.name === 'marie').commissionPct, undefined, 'un vendedor no ve la comisión de otro');
});

console.log('PDF');
await t('enlace firmado del cliente abre el PDF; sin la firma correcta, no', async () => {
  const link = new URL((await marie.api('GET', `/api/estimates?id=${est.id}`)).data.pdf);
  const ok = await anon.api('GET', `/api/pdf${link.search}`, undefined, { binary: true });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'application/pdf');
  assert.equal(ok.buf.subarray(0, 5).toString(), '%PDF-');
  assert.equal((await anon.api('GET', `/api/pdf?id=${est.id}&k=abc`, undefined, { binary: true })).status, 404);
  assert.equal((await jean.api('GET', `/api/pdf?id=${est.id}`, undefined, { binary: true })).status, 404);
  assert.equal((await marie.api('GET', `/api/pdf?id=${est.id}`, undefined, { binary: true })).status, 200);
});
await t('contenido del PDF: modelo, descripción, taxes con números, sin comisión', async () => {
  const r = await nico.api('GET', `/api/pdf?id=${est.id}`, undefined, { binary: true });
  const txt = pdfText(r.buf);
  for (const s of ['SOUMISSION', 'SOU-1001', 'Marie Tremblay', 'MAXS2430', 'MaxiCentral 2T', 'Équipement inclus', '8 800,00 $', 'Taxes incluses', '25 pi',
    'TPS (5 %)', 'TVQ (9,975 %)', '847924636 RT0001', '1220364905 TQ0001', '10 952,10 $', 'Accès par la cour arrière', 'Aucun retour', 'Vendeur', 'Marie (Gigi)', 'Page 1 /', 'RBQ 5672-1970-01']) {
    assert.ok(txt.includes(s), `falta "${s}" en el PDF`);
  }
  assert.ok(!/commission/i.test(txt), 'la comisión nunca sale en el PDF');
  assert.ok(!txt.includes('8 000,00'), 'el precio sin comisión no sale');
});
await t('descripciones largas pasan a la página siguiente; inglés', async () => {
  const { maxi } = ids();
  const long = Array.from({ length: 140 }, (_, i) => `• Point ${i + 1} : détail technique de l’installation`).join('\n');
  await nico.api('PUT', `/api/catalog?type=product&id=${maxi.id}`, { ...maxi, descriptionEn: `# Included\n${long}` });
  const r = await marie.api('POST', '/api/estimates', { contact, lang: 'en', items: [{ type: 'product', productId: maxi.id, qty: 2 }] });
  const txt = pdfText((await marie.api('GET', `/api/pdf?id=${r.data.estimate.id}`, undefined, { binary: true })).buf);
  assert.ok(txt.includes('QUOTE') && txt.includes('Point 140') && txt.includes('Page 2 /'), 'multi-página en inglés');
  await nico.api('PUT', `/api/catalog?type=product&id=${maxi.id}`, { ...maxi, descriptionEn: '' });
  await marie.api('POST', `/api/estimates?id=${r.data.estimate.id}&action=delete`);
});

console.log('ciclo de vida y GHL');
await t('enviar: correo + SMS por GHL con enlace al PDF, oportunidad en "Soumission Sended", etiqueta', async () => {
  mock.calls.length = 0;
  const r = await marie.api('POST', `/api/estimates?id=${est.id}&action=send`, { channels: ['email', 'sms'] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.estimate.status, 'sent');
  assert.deepEqual(r.data.sent, ['email', 'sms']);
  const msgs = mock.calls.filter((x) => x.path === '/conversations/messages');
  const email = msgs.find((x) => x.body.type === 'Email');
  assert.equal(email.body.contactId, 'cont_abc123');
  assert.match(email.body.subject, /SOU-1001/);
  assert.match(email.body.html, /https:\/\/app\.test\/signer\?id=\d+&amp;k=/); // página para ver y firmar
  const up = mock.calls.find((x) => x.path === '/conversations/messages/upload');
  assert.ok(up && up.body.isPdf && up.body.contactId === 'cont_abc123', 'el PDF se sube a GHL');
  assert.equal(up.body.filename, 'SOU-1001.pdf');
  assert.deepEqual(email.body.attachments, ['https://files.test/SOU-1001.pdf'], 'el correo lleva el PDF adjunto');
  assert.equal(msgs.find((x) => x.body.type === 'SMS').body.attachments, undefined, 'el SMS no lleva adjunto');
  assert.match(msgs.find((x) => x.body.type === 'SMS').body.message, /SOU-1001.*https:\/\/app\.test/);
  const opp = mock.calls.find((x) => x.path === '/opportunities/');
  assert.equal(opp.body.pipelineStageId, '78dd0289-e3b8-4d27-a732-8034f71ea258', 'GOM: « Soumission Sent »');
  assert.equal(opp.body.monetaryValue, 10952.1);
  assert.equal(opp.body.assignedTo, 'ghl_marie');
  assert.deepEqual(mock.calls.find((x) => x.path.endsWith('/tags')).body.tags, ['soumission-envoyee']);
  assert.match(mock.calls.find((x) => x.path.endsWith('/notes')).body.body, /SOU-1001 envoyée/);
});
await t('rappel: si GHL no acepta el PDF, el correo sale igual (sin adjunto) y avisa', async () => {
  mock.calls.length = 0;
  mock.setFailUpload(true);
  try {
    const r = await marie.api('POST', `/api/estimates?id=${est.id}&action=remind`, { channels: ['email'] });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.deepEqual(r.data.sent, ['email']);
    assert.ok(r.data.warnings.includes('pdf_attach_failed'));
    const email = mock.calls.find((x) => x.path === '/conversations/messages' && x.body.type === 'Email');
    assert.equal(email.body.attachments, undefined);
  } finally { mock.setFailUpload(false); }
});
await t('cliente en « Ne pas déranger » (DND): no se envía y el mensaje lo dice', async () => {
  const { maxi } = ids();
  const c = await marie.api('POST', '/api/estimates', { contact: { ...contact, id: 'cont_dnd' }, items: [{ type: 'product', productId: maxi.id, qty: 1, base: 9000 }] });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  const r = await marie.api('POST', `/api/estimates?id=${c.data.estimate.id}&action=send`, { channels: ['email', 'sms'] });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Ne pas déranger/);
  await marie.api('POST', `/api/estimates?id=${c.data.estimate.id}&action=delete`);
});
await t('rappel, aceptada (pipeline Installation), pagada (ganada) — y transiciones inválidas', async () => {
  assert.equal((await marie.api('POST', `/api/estimates?id=${est.id}&action=pay`)).status, 200);
  await nico.api('POST', `/api/estimates?id=${est.id}&action=set_status`, { status: 'sent' });
  mock.calls.length = 0;
  const rem = await marie.api('POST', `/api/estimates?id=${est.id}&action=remind`, { channels: ['sms'] });
  assert.equal(rem.data.estimate.status, 'reminder');
  assert.deepEqual(rem.data.sent, ['sms']);
  const acc = await marie.api('POST', `/api/estimates?id=${est.id}&action=accept`);
  assert.equal(acc.data.estimate.status, 'accepted');
  const put = mock.calls.filter((x) => x.method === 'PUT' && x.path.startsWith('/opportunities/')).pop();
  assert.deepEqual([put.body.pipelineId, put.body.pipelineStageId, put.body.status], ['JLlgps9BBpJmFkiUHsaa', '8bbca04d-c1cc-40da-ad55-3da1462efd92', 'won'], 'GOM: « Won »');
  assert.equal((await marie.api('POST', `/api/estimates?id=${est.id}&action=remind`)).status, 409);
  assert.equal((await marie.api('PUT', `/api/estimates?id=${est.id}`, { items: [] })).status, 409, 'aceptada: el vendedor ya no la edita');
  const pay = await marie.api('POST', `/api/estimates?id=${est.id}&action=pay`);
  assert.equal(pay.data.estimate.status, 'paid');
  assert.equal(mock.calls.filter((x) => x.method === 'PUT').pop().body.status, 'won');
});
await t('reseña: pide el enlace en Réglages; luego SMS/correo, seguimiento y lista de pendientes', async () => {
  const no = await marie.api('POST', `/api/estimates?id=${est.id}&action=review_request`);
  assert.equal(no.status, 400);
  assert.match(no.data.error, /lien d’avis/);
  const st = (await nico.api('GET', '/api/admin')).data.settings;
  await nico.api('PUT', '/api/admin?section=settings&key=review', { value: { ...st.review, link: 'https://g.page/r/ecoair/review' } });
  mock.calls.length = 0;
  const r = await marie.api('POST', `/api/estimates?id=${est.id}&action=review_request`);
  assert.equal(r.data.estimate.reviewStatus, 'requested');
  assert.match(mock.calls.find((x) => x.body?.type === 'SMS').body.message, /g\.page\/r\/ecoair/);
  const pending = (await nico.api('GET', '/api/estimates?review=none,requested,not_completed')).data;
  assert.deepEqual(pending.estimates.map((e) => e.id), [est.id]);
  await marie.api('POST', `/api/estimates?id=${est.id}&action=review_done`);
  assert.equal((await nico.api('GET', '/api/estimates?review=none,requested,not_completed')).data.total, 0);
});
await t('reseña automática al marcar pagada (si está activada)', async () => {
  const st = (await nico.api('GET', '/api/admin')).data.settings;
  await nico.api('PUT', '/api/admin?section=settings&key=review', { value: { ...st.review, auto: true, channels: ['email'] } });
  const { maxi } = ids();
  const r = await marie.api('POST', '/api/estimates', { contact, items: [{ type: 'product', productId: maxi.id, qty: 1 }], send: true, channels: ['email'] });
  assert.equal(r.data.estimate.status, 'sent');
  const p = await marie.api('POST', `/api/estimates?id=${r.data.estimate.id}&action=pay`);
  assert.equal(p.data.estimate.reviewStatus, 'requested');
});
await t('editar un borrador recalcula; duplicar; borrar solo borradores', async () => {
  const { maxi } = ids();
  const d = await marie.api('POST', `/api/estimates?id=${est.id}&action=duplicate`);
  assert.equal(d.data.estimate.status, 'draft');
  assert.equal(d.data.estimate.total, est.total);
  const u = await marie.api('PUT', `/api/estimates?id=${d.data.estimate.id}`, { items: [{ type: 'product', productId: maxi.id, qty: 1, base: 9000 }] });
  assert.equal(u.data.estimate.lines[0].price, 9900);
  assert.equal((await marie.api('POST', `/api/estimates?id=${est.id}&action=delete`)).status, 409);
  assert.equal((await marie.api('POST', `/api/estimates?id=${d.data.estimate.id}&action=delete`)).status, 200);
  assert.equal((await marie.api('POST', `/api/estimates?id=${est.id}&action=set_status`, { status: 'draft' })).status, 403);
});
await t('si GHL no puede enviar, la soumission queda en borrador y avisa', async () => {
  const { maxi } = ids();
  const r = await marie.api('POST', '/api/estimates', { contact: { ...contact, email: '', phone: '' }, items: [{ type: 'product', productId: maxi.id, qty: 1 }], send: true });
  assert.equal(r.status, 200);
  assert.equal(r.data.estimate.status, 'draft');
  assert.ok(r.data.warnings.includes('send_failed'));
});
let signEst;
await t('comisión elegida por el vendedor y vista previa del PDF sin guardar', async () => {
  const { maxi } = ids();
  const body = { contact, items: [{ type: 'product', productId: maxi.id, qty: 2, base: 8000, commission: 650 }] };
  const before = (await nico.api('GET', '/api/estimates?limit=1')).data.total;
  const pv = await marie.api('POST', '/api/estimates?preview=1', body, { binary: true });
  assert.equal(pv.status, 200);
  assert.equal(pv.headers.get('content-type'), 'application/pdf');
  const txt = pdfText(pv.buf);
  assert.match(txt, /APERÇU/);
  assert.match(txt, /8\s650,00/, 'precio al cliente = precio + comisión elegida');
  assert.ok(!/650,00\s\$\s*$/m.test(txt.replace(/8\s650,00/g, '')), 'la comisión no aparece sola');
  assert.equal((await nico.api('GET', '/api/estimates?limit=1')).data.total, before, 'la vista previa no guarda nada');
  const r = await marie.api('POST', '/api/estimates', body);
  assert.equal(r.data.estimate.lines[0].price, 8650);
  assert.equal(r.data.estimate.lines[0].commissionUnit, 650);
  assert.equal(r.data.estimate.commission, 1300);
  assert.equal((await marie.api('POST', '/api/estimates?preview=1', { ...body, items: [{ ...body.items[0], commission: -5 }] })).status, 400);
  signEst = r.data.estimate;
});
await t('firma electrónica: el cliente firma con su enlace → Acceptée, GHL y PDF firmado', async () => {
  const anon = client();
  const k = pdfToken(signEst.id);
  assert.equal((await anon.api('GET', `/api/sign?id=${signEst.id}&k=nope`)).status, 404);
  const g = await anon.api('GET', `/api/sign?id=${signEst.id}&k=${k}`);
  assert.equal(g.status, 200);
  assert.equal(g.data.signable, true);
  assert.equal(g.data.total, signEst.total);
  assert.ok(!JSON.stringify(g.data).includes('commission'), 'el cliente nunca ve la comisión');
  assert.match(g.data.lines[0].description, /./);
  const sig = pngDataUrl();
  assert.equal((await anon.api('POST', `/api/sign?id=${signEst.id}&k=${k}`, { name: 'Marie Tremblay', signature: sig, agree: false })).status, 400);
  assert.equal((await anon.api('POST', `/api/sign?id=${signEst.id}&k=${k}`, { name: 'Marie Tremblay', signature: 'data:image/png;base64,AAAA', agree: true })).status, 400);
  mock.calls.length = 0;
  const ok = await anon.api('POST', `/api/sign?id=${signEst.id}&k=${k}`, { name: 'Marie Tremblay', signature: sig, agree: true });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.signed.name, 'Marie Tremblay');
  assert.equal((await anon.api('POST', `/api/sign?id=${signEst.id}&k=${k}`, { name: 'X', signature: sig, agree: true })).status, 409);
  const e = (await marie.api('GET', `/api/estimates?id=${signEst.id}`)).data.estimate;
  assert.deepEqual([e.status, e.signedName, !!e.acceptedAt, e.signature.startsWith('data:image/png')], ['accepted', 'Marie Tremblay', true, true]);
  assert.match(mock.calls.find((x) => x.path.endsWith('/notes')).body.body, /signée en ligne par Marie Tremblay/);
  assert.deepEqual(mock.calls.find((x) => x.path.endsWith('/tags')).body.tags, ['soumission-acceptee']);
  const txt = pdfText((await anon.api('GET', `/api/pdf?id=${signEst.id}&k=${k}`, undefined, { binary: true })).buf);
  assert.match(txt, /Signé électroniquement par Marie Tremblay/);
  const hist = (await nico.api('GET', '/api/history?limit=20')).data.events;
  assert.ok(hist.some((x) => x.action === 'estimate.signed' && x.actor === 'client'));
});
await t('CSV: el admin ve la comisión, el vendedor no', async () => {
  const a = await nico.api('GET', '/api/estimates?format=csv');
  assert.match(a.headers.get('content-disposition'), /attachment/);
  assert.match(a.data, /Commission/);
  assert.match(a.data, /SOU-1001/);
  const s = await marie.api('GET', '/api/estimates?format=csv');
  assert.ok(!/Commission/.test(s.data));
});
await t('Admin View: ve todas las soumissions y los vendedores, no modifica nada', async () => {
  const mk = await nico.api('POST', '/api/admin?section=users', { name: 'diane', display: 'Diane Gestion', role: 'viewer', commissionPct: 0, password: 'clave-diane-1' });
  assert.equal(mk.status, 200, JSON.stringify(mk.data));
  const diane = await login('diane', 'clave-diane-1');
  const me = (await diane.api('GET', '/api/session')).data.user;
  assert.deepEqual([me.isAdmin, me.seesAll, me.role], [false, true, 'viewer']);
  const all = (await nico.api('GET', '/api/estimates?limit=200')).data;
  const seen = (await diane.api('GET', '/api/estimates?limit=200')).data;
  assert.equal(seen.total, all.total, 've todas');
  assert.ok(seen.sellers.every((x) => x.commissionPct !== undefined));
  assert.equal((await diane.api('GET', `/api/estimates?id=${signEst.id}`)).status, 200);
  assert.equal((await diane.api('POST', `/api/estimates?id=${signEst.id}&action=lose`, {})).status, 403, 'no cambia la de otro');
  assert.equal((await diane.api('PUT', `/api/estimates?id=${signEst.id}`, { items: [] })).status, 403);
  const adm = await diane.api('GET', '/api/admin');
  assert.deepEqual([adm.status, adm.data.readOnly, adm.data.users.some((u) => u.name === 'marie')], [200, true, true]);
  assert.equal((await diane.api('PUT', '/api/admin?section=settings&key=estimate', { value: { prefix: 'X-', validDays: 5 } })).status, 403);
  assert.equal((await diane.api('POST', '/api/admin?section=users', { name: 'zz', role: 'admin', password: 'xxxxxxxxxx' })).status, 403);
  assert.equal((await diane.api('POST', '/api/catalog?type=category', { code: 'x', nameFr: 'X', nameEn: 'X' })).status, 403);
  assert.equal((await diane.api('GET', `/api/pdf?id=${signEst.id}`, undefined, { binary: true })).status, 200);
});
await t('teléfono del vendedor en el PDF y botón «Appeler» en la página del cliente', async () => {
  const m0 = (await nico.api('GET', '/api/admin')).data.users.find((u) => u.name === 'marie');
  assert.equal((await nico.api('PUT', '/api/admin?section=users', { ...m0, phone: '514 555-0199' })).status, 200);
  const k = pdfToken(signEst.id);
  const g = (await client().api('GET', `/api/sign?id=${signEst.id}&k=${k}`)).data;
  assert.equal(g.sellerPhone, '514 555-0199');
  const txt = pdfText((await client().api('GET', `/api/pdf?id=${signEst.id}&k=${k}`, undefined, { binary: true })).buf);
  assert.match(txt, /514 555-0199/);
});
await t('Spécial (solo admin completo) y « Directeur des ventes » (interno, activable en Réglages)', async () => {
  const c = (await nico.api('GET', '/api/catalog')).data;
  const central = c.products.find((p) => p.name === 'MaxiCentral 2T');
  const wall = c.products.find((p) => p.name === 'Thermopompe murale Kinghome 12 000 BTU – Polaris');
  // vendedor: no puede activar Spécial
  assert.equal((await marie.api('POST', '/api/estimates', { contact, items: [{ type: 'product', productId: central.id, qty: 1, special: true }] })).status, 403);
  // admin: base y mínimo bajan 500 $ en una centrale
  const r = await nico.api('POST', '/api/estimates', { contact, seller: 'marie', items: [{ type: 'product', productId: central.id, qty: 1, special: true, commission: 1000 }, { type: 'product', productId: wall.id, qty: 1, special: true, base: 4000, commission: 500 }] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const [l1, l2] = r.data.estimate.lines;
  // MINIMUM = base + 1 000 $: le prix au client (avec commission) ne peut pas être plus bas
  assert.deepEqual([l1.special, l1.base, l1.minPrice, l1.price], [true, central.basePrice - 500, central.minPrice > 0 ? central.minPrice - 500 : 0, central.basePrice - 500 + 1000]);
  assert.equal(l2.special, undefined, 'murale: sin Spécial');
  // la vendedora modifica la soumission: la línea Spécial se conserva
  const u = await marie.api('PUT', `/api/estimates?id=${r.data.estimate.id}`, { items: [{ type: 'product', productId: central.id, qty: 1, special: true, base: l1.base, commission: 1100 }] });
  assert.equal(u.status, 200, JSON.stringify(u.data));
  assert.equal(u.data.estimate.lines[0].price, l1.base + 1100);
  // Directeur des ventes: desactivado → se ignora
  const items = [{ type: 'product', productId: central.id, qty: 1, commission: 1000, directeur: 300 }];
  let x = await marie.api('POST', '/api/estimates', { contact, items });
  assert.equal(x.data.estimate.lines[0].price, central.basePrice + 1000);
  assert.equal((await nico.api('GET', '/api/catalog')).data.pricing.directeur, false);
  // solo el admin completo lo activa
  const st = (await nico.api('GET', '/api/admin')).data.settings.pricing;
  assert.equal((await nico.api('PUT', '/api/admin?section=settings&key=pricing', { value: { ...st, directeur: true } })).status, 200);
  assert.equal((await marie.api('GET', '/api/catalog')).data.pricing.directeur, true);
  x = await marie.api('POST', '/api/estimates', { contact, items });
  const e = x.data.estimate;
  assert.deepEqual([e.lines[0].price, e.lines[0].directeurUnit, e.directeur, e.commission], [central.basePrice + 1300, 300, 300, 1000]);
  // el cliente no ve ni la comisión ni el directeur
  const g = (await client().api('GET', `/api/sign?id=${e.id}&k=${pdfToken(e.id)}`)).data;
  assert.ok(!/directeur|commission/i.test(JSON.stringify(g)));
  assert.equal(g.lines[0].amount, central.basePrice + 1300);
  const csv = (await nico.api('GET', '/api/estimates?format=csv')).data;
  assert.match(csv, /Directeur des ventes/);
  assert.equal((await nico.api('PUT', '/api/admin?section=settings&key=pricing', { value: { ...st, multipliers: { York: 2 } } })).status, 400, 'multiplicador entre 0 y 1');
  await nico.api('PUT', '/api/admin?section=settings&key=pricing', { value: { ...st, directeur: false } });
  // desactivado después: la soumission que ya lo tenía lo conserva al modificarla
  const kept = await marie.api('PUT', `/api/estimates?id=${e.id}`, { items });
  assert.equal(kept.data.estimate.lines[0].directeurUnit, 300);
});
await t('historial: creación, envío, aceptación, pago, reseña, cambios de catálogo y vendedores', async () => {
  const ev = (await nico.api('GET', '/api/history')).data.events.map((e) => e.action);
  for (const a of ['estimate.created', 'estimate.sent', 'estimate.reminder', 'estimate.accepted', 'estimate.paid', 'review.requested', 'review.completed', 'catalog.product.created', 'catalog.product.updated', 'user.updated', 'user.password_changed']) {
    assert.ok(ev.includes(a), a);
  }
  const mine = (await jean.api('GET', '/api/history')).data.events;
  assert.ok(mine.every((e) => e.actor === 'jean' || e.owner === 'jean'));
});
await t('ajustes: solo claves conocidas', async () => {
  assert.equal((await nico.api('PUT', '/api/admin?section=settings&key=hack', { value: 1 })).status, 400);
  const st = (await nico.api('GET', '/api/admin')).data.settings;
  assert.equal(st.tax.tps, '847924636 RT0001');
  assert.match(st.terms_fr, /Aucun retour ni annulation/);
});
await t('logout', async () => assert.match((await marie.api('DELETE', '/api/session')).headers.get('set-cookie'), /Max-Age=0/));

console.log(`\n${passed} pruebas OK${process.exitCode ? ' — CON FALLOS' : ''}`);
app.close(); mock.server.close();
