// Importa las plantillas de Estimates de GHL al catálogo (se puede repetir: no duplica).
// La categoría, la marca y la capacidad salen del nombre de la plantilla; las líneas secundarias
// (garantía, raccordement électrique, thermostat, subvention…) se vuelven opciones del catálogo.
import { q, one } from './db.js';
import { listTemplates } from './ghl.js';
import { htmlToText } from './lines.js';

const BRANDS = [
  [/hitachi/i, 'Hitachi'], [/maxi/i, 'Maxivent'], [/eliose?/i, 'Elios'], [/york/i, 'York'],
  [/moov ?air/i, 'MoovAir'], [/direct ?air/i, 'Direct Air'], [/samsung/i, 'Samsung'], [/signature/i, 'Signature'],
];

export function classify(name, firstItemName = '') {
  const n = `${name} ${firstItemName}`;
  let category = null;
  if (/steffes/i.test(n)) category = 'steffes';
  else if (/multi/i.test(name)) category = 'multi';
  else if (/mura(le)?\b|mural|wall|direct air heat/i.test(n)) category = 'wall';
  else if (/centra(l|le)|maxicentral|add.?on/i.test(n)) category = 'central';
  if (/gaz|gas|fournaise|furnace/i.test(name)) category = 'gas';
  // marca: en Steffes la que acompaña (York / Elios)
  const brand = (BRANDS.find(([re]) => re.test(name.replace(/steffes/i, ''))) || BRANDS.find(([re]) => re.test(firstItemName)) || [])[1] || null;
  let capacity = null;
  const ton = name.match(/(\d+(?:[.,]\d+)?)\s*(?:T\b|ton)/i);
  const mbh = name.match(/(\d+)\s*MBH/i);
  if (category === 'wall' || category === 'multi') { if (mbh) capacity = Number(mbh[1]) * 1000; }
  else if (ton) capacity = Number(ton[1].replace(',', '.'));
  else if (mbh) capacity = Number(mbh[1]) <= 6 ? Number(mbh[1]) : Number(mbh[1]) / 12; // "3 MBH Add-on" = 3 T ; 36 MBH = 3 T
  return { category, brand, capacity };
}

// Primer código de modelo que aparece en la descripción (ej. MAXS2430, PAS48BUFASDQ1)
const MODEL_RE = /\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9][A-Z0-9-]{4,}\b/g;
const REFRIGERANT = /^R-?\d{2,3}[A-Z]?$/; // R-454B, R410A: refrigerante, no modelo
export const findModel = (text) => (String(text).match(MODEL_RE) || []).find((m) => !REFRIGERANT.test(m)) || '';

export const addonKind = (name, amount) => {
  if (amount < 0 || /subvention|rebate/i.test(name)) return 'credit';
  if (/garantie|warrant/i.test(name)) return 'warranty';
  if (/raccordement|electri/i.test(name)) return 'electrical';
  if (/ligne|line ?set/i.test(name)) return 'lineset';
  return 'accessory';
};
// Equipo = la línea más cara que no sea una opción (raccordement, garantie, thermostat…).
// En las murales GHL tiene el equipo a 1 $ y el raccordement a 350 $: el monto solo no alcanza.
const ADDON_NAME = /raccordement|electri|garantie|warrant|subvention|rebate|thermostat|wi-?fi|module|serpentin|coil|ligne|line ?set/i;
export function pickMain(items) {
  const eq = items.filter((it) => !ADDON_NAME.test(it.name || '') && Number(it.amount) >= 0);
  const pool = eq.length ? eq : items;
  return pool.reduce((a, b) => (Number(b.amount) > Number(a.amount) ? b : a), pool[0]);
}
export const taxOf = (it) => (!it.taxes?.length ? 'none' : it.taxInclusive ? 'included' : 'added');

export async function importFromGhl({ fresh = true } = {}) {
  const templates = await listTemplates({ fresh });
  const cats = Object.fromEntries((await q('select id, code from ec_categories')).map((r) => [r.code, r.id]));
  const report = { products: 0, updated: 0, addons: 0, skipped: [] }; // updated = ya existían (no se tocan)

  const brandId = async (catId, name) => {
    if (!name) return null;
    const r = await one('insert into ec_brands (category_id, name) values ($1,$2) on conflict (category_id, name) do update set name = excluded.name returning id', [catId, name]);
    return r.id;
  };
  const capId = async (bId, value) => {
    if (!bId || !value) return null;
    const r = await one('insert into ec_capacities (brand_id, value) values ($1,$2) on conflict (brand_id, value) do update set value = excluded.value returning id', [bId, value]);
    return r.id;
  };
  const addonFor = async (it, catId, bId) => {
    const amount = Number(it.amount) || 0;
    const kind = addonKind(it.name, amount);
    const name = String(it.name || '').trim().replace(/\s+/g, ' ').slice(0, 160);
    const desc = htmlToText(it.description);
    // misma opción en varias plantillas: se suman categorías y marcas donde aplica
    const r = await one(
      `insert into ec_addons (kind, name, model, description_fr, price, tax, editable, category_ids, brand_ids)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (kind, name) do update set
         category_ids = (select array(select distinct unnest(ec_addons.category_ids || excluded.category_ids))),
         brand_ids = (select array(select distinct unnest(ec_addons.brand_ids || excluded.brand_ids))),
         description_fr = case when ec_addons.description_fr = '' then excluded.description_fr else ec_addons.description_fr end
       returning id, (xmax = 0) as inserted`,
      [kind, name, findModel(desc), desc, amount, taxOf(it), kind === 'electrical' || kind === 'credit' || amount === 0, [catId], bId ? [bId] : []],
    );
    if (r.inserted) report.addons++;
    return { addonId: r.id, price: amount };
  };

  for (const t of templates) {
    const raw = t.raw || {};
    const items = raw.items || [];
    if (!items.length) { report.skipped.push(t.name); continue; }
    const main = pickMain(items);
    const { category, brand, capacity } = classify(t.name, main.name || '');
    if (!category || !cats[category]) { report.skipped.push(t.name); continue; }
    const catId = cats[category];
    const bId = await brandId(catId, brand);
    const cId = await capId(bId, capacity);
    const desc = htmlToText(main.description);
    const defaults = [];
    for (const it of items) if (it !== main) defaults.push(await addonFor(it, catId, bId));
    const attachments = (raw.attachments || []).filter((a) => a.url).map((a) => ({ name: a.name, url: a.url }));
    // precio 1 $ en GHL = "precio a escribir por el vendedor"
    const base = Number(main.amount) <= 1 ? 0 : Number(main.amount);
    const r = await one(
      `insert into ec_products (category_id, brand_id, capacity_id, name, model, description_fr, base_price, attachments, default_addons, source_template_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (source_template_id) do nothing
       returning id`,
      [catId, bId, cId, String(t.name).trim(), findModel(desc), desc, base, JSON.stringify(attachments), JSON.stringify(defaults), t.id],
    );
    // ya importado antes: no se pisa lo que el admin haya corregido
    if (r) report.products++; else report.updated++;
  }
  return report;
}
