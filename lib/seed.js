// Datos iniciales de Climatisation GOM: categorías, marcas, ajustes por defecto
// y los usuarios que estaban en APP_USERS (solo la primera vez).
import { hashPassword } from './password.js';

const CATEGORIES = [
  { code: 'wall', fr: 'Murale', en: 'Wall unit', unit: 'btu', brands: ['Kinghome', 'Zephyr'] },
  { code: 'multi', fr: 'Multi-zone', en: 'Multi-split', unit: 'btu', brands: ['Kinghome', 'Zephyr'] },
  { code: 'central', fr: 'Centrale', en: 'Central', unit: 'ton', brands: ['Kinghome', 'Zephyr'] },
  { code: 'addon', fr: 'Add-on (sur fournaise)', en: 'Add-on (on furnace)', unit: 'ton', brands: ['Kinghome', 'Zephyr'] },
  { code: 'ac', fr: 'Climatiseur (A/C seulement)', en: 'Air conditioner (A/C only)', unit: 'btu', brands: ['Zephyr'] },
];
const TONS = [2, 2.5, 3, 4, 5];
const BTUS = [9000, 12000, 15000, 18000, 24000, 27000];

export const DEFAULT_SETTINGS = {
  company: {
    name: 'Climatisation GOM inc.',
    legal: '',
    address: '202-5300, rue Molson',
    city: 'Montréal',
    province: 'Québec',
    postal: 'H1Y 3B5',
    phone: '514 791-8942',
    email: 'info@gomclimatisation.com',
    website: 'climatisationgom.com',
    rbq: '5672-1970-01',
    logoUrl: 'https://msgsndr-private.storage.googleapis.com/locationPhotos/96c889de-db2a-42f7-8e7c-4509dbbc60cb.png',
  },
  tax: { tps: '847924636 RT0001', tvq: '1220364905 TQ0001' },
  estimate: { prefix: 'SOU-', validDays: 30 },
  // Prix: ligne interne « Directeur des ventes » (désactivée par défaut, seul l’admin complet l’active)
  // et multiplicateurs des fabricants pour le calculateur de prix du catalogue
  pricing: { directeur: false, multipliers: { Kinghome: 1, Zephyr: 1 } },
  terms_fr: [
    '# Validité',
    'La présente soumission est valide pour une période de trente (30) jours à compter de sa date d’émission. Tous les prix sont en dollars canadiens (CAD).',
    '# Subvention Hydro-Québec (LogisVert)',
    'La subvention LogisVert est versée par Hydro-Québec selon ses conditions et s’applique après taxes.',
    '# Conditions',
    '• Intérêt de 2 % par mois sur les comptes passés dus (24 % par année).',
    '• Des frais administratifs de 60,00 $ seront chargés sur tout chèque sans provision.',
    '• Aucun retour ni annulation sur les commandes spéciales.',
    '• Seule la garantie du fabricant s’applique, selon ses conditions.',
    '• Les travaux non mentionnés dans cette soumission seront facturés en supplément.',
  ].join('\n'),
  terms_en: [
    '# Validity',
    'This quote is valid for thirty (30) days from its issue date. All prices are in Canadian dollars (CAD).',
    '# Hydro-Québec rebate (LogisVert)',
    'The LogisVert rebate is paid by Hydro-Québec according to its conditions and applies after taxes.',
    '# Conditions',
    '• Interest of 2% per month on overdue accounts (24% per year).',
    '• An administrative fee of $60.00 will be charged on any NSF cheque.',
    '• No returns or cancellations on special orders.',
    '• Only the manufacturer’s warranty applies, according to its terms.',
    '• Work not mentioned in this quote will be billed in addition.',
  ].join('\n'),
  messages: {
    send_subject_fr: 'Votre soumission {numero} — Climatisation GOM',
    send_subject_en: 'Your quote {numero} — Climatisation GOM',
    send_body_fr: 'Bonjour {client},\n\nVoici votre soumission {numero} au montant de {total}.\nVous pouvez la consulter, la télécharger et l’accepter en ligne (signature électronique) ici: {lien}\n\nPour toute question, contactez {vendeur} au 514 791-8942.\n\nMerci de votre confiance,\nClimatisation GOM',
    send_body_en: 'Hello {client},\n\nHere is your quote {numero} for {total}.\nYou can view it, download it and accept it online (electronic signature) here: {lien}\n\nIf you have any questions, contact {vendeur} at 514 791-8942.\n\nThank you,\nClimatisation GOM',
    send_sms_fr: 'Climatisation GOM: votre soumission {numero} ({total}) est prête. Consultez et signez ici: {lien}',
    send_sms_en: 'Climatisation GOM: your quote {numero} ({total}) is ready. View and sign here: {lien}',
    reminder_subject_fr: 'Rappel: votre soumission {numero}',
    reminder_subject_en: 'Reminder: your quote {numero}',
    reminder_body_fr: 'Bonjour {client},\n\nNous voulions nous assurer que vous avez bien reçu votre soumission {numero} ({total}): {lien}\n\nAvez-vous des questions? Répondez à ce courriel ou appelez {vendeur} au 514 791-8942.\n\nClimatisation GOM',
    reminder_body_en: 'Hello {client},\n\nWe wanted to make sure you received your quote {numero} ({total}): {lien}\n\nAny questions? Reply to this email or call {vendeur} at 514 791-8942.\n\nClimatisation GOM',
    reminder_sms_fr: 'Climatisation GOM: petit rappel pour votre soumission {numero}: {lien}',
    reminder_sms_en: 'Climatisation GOM: a quick reminder about your quote {numero}: {lien}',
    review_subject_fr: 'Merci! Votre avis compte pour nous',
    review_subject_en: 'Thank you! Your review matters to us',
    review_body_fr: 'Bonjour {client},\n\nMerci d’avoir choisi Climatisation GOM. Pourriez-vous prendre une minute pour nous laisser un avis? {avis}\n\nMerci beaucoup!\nClimatisation GOM',
    review_body_en: 'Hello {client},\n\nThank you for choosing Climatisation GOM. Could you take a minute to leave us a review? {avis}\n\nThank you so much!\nClimatisation GOM',
    review_sms_fr: 'Merci d’avoir choisi Climatisation GOM! Votre avis nous aide beaucoup: {avis}',
    review_sms_en: 'Thank you for choosing Climatisation GOM! Your review helps us a lot: {avis}',
  },
  review: { link: '', auto: false, channels: ['sms', 'email'] },
  // Etapas de GHL por estado (pipeline « GOM CLIMATISATION SALES PIPELINE »)
  ghl: {
    sent: { pipelineId: 'JLlgps9BBpJmFkiUHsaa', stageId: '78dd0289-e3b8-4d27-a732-8034f71ea258', status: 'open' },
    accepted: { pipelineId: 'JLlgps9BBpJmFkiUHsaa', stageId: '8bbca04d-c1cc-40da-ad55-3da1462efd92', status: 'won' },
    paid: { pipelineId: 'JLlgps9BBpJmFkiUHsaa', stageId: '8bbca04d-c1cc-40da-ad55-3da1462efd92', status: 'won' },
    lost: { pipelineId: 'JLlgps9BBpJmFkiUHsaa', stageId: 'ba39c849-5b72-477d-b3af-4f0e41c96c23', status: 'lost' },
  },
};

const DEFAULT_ADDONS = [
  { kind: 'lineset', name: 'Lignes frigorifiques existantes conservées', price: 0, price_mode: 'fixed', tax: 'none', description_fr: 'Les lignes frigorifiques existantes sont conservées et vérifiées.', description_en: 'Existing refrigerant lines are kept and checked.' },
  { kind: 'lineset', name: 'Nouvelles lignes frigorifiques', price: 0, price_mode: 'per_foot', tax: 'added', editable: true, description_fr: 'Fourniture et installation de nouvelles lignes frigorifiques isolées (prix au pied).', description_en: 'Supply and installation of new insulated refrigerant lines (price per foot).' },
  { kind: 'warranty', name: 'Garantie prolongée 10 ans', price: 0, tax: 'added', active: false, description_fr: 'Garantie prolongée de 10 ans (pièces et main-d’œuvre selon le contrat).', description_en: '10-year extended warranty (parts and labour per contract).' },
  { kind: 'warranty', name: 'Garantie prolongée 12 ans', price: 0, tax: 'added', active: false, description_fr: 'Garantie prolongée de 12 ans (pièces et main-d’œuvre selon le contrat).', description_en: '12-year extended warranty (parts and labour per contract).' },
  { kind: 'warranty', name: 'Garantie prolongée multi-zone (par tête)', price: 0, price_mode: 'per_head', tax: 'added', active: false, categories: ['multi'], description_fr: 'Garantie prolongée, prix par tête intérieure.', description_en: 'Extended warranty, price per indoor head.' },
];

const ROLE_MAP = { coord: 'admin', support: 'admin', admin: 'admin', viewer: 'viewer', seller: 'seller' };

// Catálogo de la lista de precios ECOAIR (lib/catalog-data.json, generado por scripts/build-catalog.mjs).
// Se aplica una vez por versión. En una versión nueva se actualizan precios, mínimo, AHRI y subvención;
// la descripción, el modelo y el estado activo solo se escriben si el producto es nuevo (no se pisa lo que Nicolas corrigió).
export async function applyCatalogData(exec, data) {
  const [done] = await exec(`select value from ec_settings where key = '_catalog_version'`, []);
  if (done && done.value === data.version) return false;
  const cat = {};
  for (const c of data.categories) {
    const [r] = await exec(
      `insert into ec_categories (code, name_fr, name_en, unit, sort, active) values ($1,$2,$3,$4,$5,true)
       on conflict (code) do update set name_fr = excluded.name_fr, name_en = excluded.name_en, unit = excluded.unit, sort = excluded.sort, active = true returning id`,
      [c.code, c.fr, c.en, c.unit, c.sort]);
    cat[c.code] = r.id;
  }
  // sous-sections (ej. Multi-split dentro de Murale)
  for (const c of data.categories) {
    if (c.parent && cat[c.parent]) await exec('update ec_categories set parent_id = $2 where id = $1', [cat[c.code], cat[c.parent]]);
  }
  const brand = {};
  for (const b of data.brands) {
    const [r] = await exec(
      `insert into ec_brands (category_id, name) values ($1,$2) on conflict (category_id, name) do update set active = true returning id`,
      [cat[b.category], b.name]);
    brand[`${b.category}|${b.name}`] = r.id;
  }
  const cap = {};
  for (const c of data.capacities) {
    const [r] = await exec(
      `insert into ec_capacities (brand_id, value) values ($1,$2) on conflict (brand_id, value) do update set active = true returning id`,
      [brand[`${c.category}|${c.brand}`], c.value]);
    cap[`${c.category}|${c.brand}|${Number(c.value)}`] = r.id;
  }
  const addon = {};
  for (const a of data.addons) {
    const [r] = await exec(
      `insert into ec_addons (kind, name, model, description_fr, description_en, price, tax, editable, category_ids, brand_ids)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (kind, name) do update set
         category_ids = (select array(select distinct unnest(ec_addons.category_ids || excluded.category_ids))),
         brand_ids = (select array(select distinct unnest(ec_addons.brand_ids || excluded.brand_ids)))
       returning id`,
      [a.kind, a.name, a.model || '', a.descriptionFr || '', a.descriptionEn || '', a.price, a.tax, !!a.editable,
        a.categories.map((c) => cat[c]), a.brands.map((b) => brand[b]).filter(Boolean)]);
    addon[a.key] = r.id;
  }
  // Versión « rewrite »: nombres, descripciones, modelos y estado se reescriben, salvo los productos que el admin
  // modificó a mano en el Back Office (historial catalog.product.*): a esos solo se les actualizan precios, AHRI y subvención.
  const edited = new Set();
  if (data.rewrite) {
    for (const r of await exec(`select distinct target_id from ec_events where target_type = 'product' and action like 'catalog.product.%'`, [])) edited.add(String(r.target_id));
  }
  // ids existentes en una sola consulta (el primer arranque en Vercel debe ser rápido: ~160 productos)
  const idByKey = new Map();
  if (data.rewrite || data.retire?.length) {
    for (const r of await exec('select id, source_key from ec_products where source_key is not null', [])) idByKey.set(r.source_key, r.id);
  }
  let rewritten = 0;
  for (const p of data.products) {
    const defaults = (p.defaults || []).filter((d) => addon[d.addon]).map((d) => ({ addonId: addon[d.addon], price: d.price }));
    const capId = p.capacity == null ? null : cap[`${p.category}|${p.brand}|${Number(p.capacity)}`] ?? null;
    if (data.rewrite) {
      const ex = idByKey.has(p.key) ? { id: idByKey.get(p.key) } : null;
      if (ex && !edited.has(String(ex.id))) {
        await exec(
          `update ec_products set category_id=$2, brand_id=$3, capacity_id=$4, name=$5, model=$6, description_fr=$7, description_en=$8,
             base_price=$9, min_price=$10, ahri=$11, subsidy=$12, heads=$13, attachments=$14, default_addons=$15, active=$16, sort=$17, updated_at=now()
           where id=$1`,
          [ex.id, cat[p.category], brand[`${p.category}|${p.brand}`], capId, p.name, p.model || '', p.descriptionFr || '', p.descriptionEn || '',
            p.basePrice, p.minPrice || 0, p.ahri || '', p.subsidy || 0, p.heads ?? null, JSON.stringify(p.attachments || []), JSON.stringify(defaults), !!p.active, p.sort || 0]);
        rewritten++;
        continue;
      }
    }
    await exec(
      `insert into ec_products (category_id, brand_id, capacity_id, name, model, description_fr, description_en, base_price, min_price, ahri, subsidy,
         heads, attachments, default_addons, active, sort, source_key)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       on conflict (source_key) do update set
         base_price = case when excluded.base_price > 0 then excluded.base_price else ec_products.base_price end,
         min_price = case when excluded.min_price > 0 then excluded.min_price else ec_products.min_price end,
         ahri = case when excluded.ahri <> '' then excluded.ahri else ec_products.ahri end,
         subsidy = case when excluded.subsidy > 0 then excluded.subsidy else ec_products.subsidy end,
         active = case when $18 then true else ec_products.active end,
         updated_at = now()`,
      [cat[p.category], brand[`${p.category}|${p.brand}`], capId,
        p.name, p.model || '', p.descriptionFr || '', p.descriptionEn || '', p.basePrice, p.minPrice || 0, p.ahri || '', p.subsidy || 0,
        p.heads ?? null, JSON.stringify(p.attachments || []), JSON.stringify(defaults), !!p.active, p.sort || 0, p.key, !!p.forceActive]);
  }
  // productos de versiones anteriores que ya no están en el catálogo (ej. add-on York del Excel → guía HH8)
  const off = (data.retire || []).map((k) => idByKey.get(k)).filter((id) => id != null && !edited.has(String(id)));
  if (off.length) await exec('update ec_products set active = false, updated_at = now() where id = any($1::int[])', [off]);
  if (data.rewrite) {
    await exec('insert into ec_events (actor, action, target_type, title, details) values ($1,$2,$3,$4,$5)',
      ['system', 'catalog.reloaded', 'catalog', data.version, JSON.stringify({ rewritten, keptManualEdits: edited.size, retired: (data.retire || []).length })]);
  }
  await exec(`insert into ec_settings (key, value) values ('_catalog_version', $1) on conflict (key) do update set value = excluded.value`, [JSON.stringify(data.version)]);
  return true;
}

export async function seed(exec) {
  // Ajustes: agrega las claves que falten (sin pisar lo que el admin cambió)
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await exec('insert into ec_settings (key, value) values ($1, $2) on conflict (key) do nothing', [key, JSON.stringify(value)]);
  }

  // Firma electrónica (13 nov.): los textos guardados antes decían «consulter et télécharger»; el enlace ahora
  // abre la página para ver y FIRMAR. Solo se reemplazan las frases de origen exactas (lo que el admin escribió queda).
  const [msg] = await exec(`select value from ec_settings where key = 'messages'`, []);
  if (msg?.value) {
    const OLD = {
      send_body_fr: ['Vous pouvez la consulter et la télécharger ici: {lien}', 'Vous pouvez la consulter, la télécharger et l’accepter en ligne (signature électronique) ici: {lien}'],
      send_body_en: ['You can view and download it here: {lien}', 'You can view it, download it and accept it online (electronic signature) here: {lien}'],
      send_sms_fr: ['est prête: {lien}', 'est prête. Consultez et signez ici: {lien}'],
      send_sms_en: ['is ready: {lien}', 'is ready. View and sign here: {lien}'],
    };
    const v = { ...msg.value };
    let changed = false;
    for (const [k, [from, to]] of Object.entries(OLD)) {
      if (typeof v[k] === 'string' && v[k].includes(from)) { v[k] = v[k].replace(from, to); changed = true; }
    }
    if (changed) await exec(`update ec_settings set value = $1 where key = 'messages'`, [JSON.stringify(v)]);
  }

  const [{ n: nCat }] = await exec('select count(*)::int as n from ec_categories', []);
  if (!nCat) {
    for (const [i, c] of CATEGORIES.entries()) {
      const [cat] = await exec('insert into ec_categories (code, name_fr, name_en, unit, sort, active) values ($1,$2,$3,$4,$5,$6) returning id', [c.code, c.fr, c.en, c.unit, i, c.active !== false]);
      for (const [j, b] of c.brands.entries()) {
        const [br] = await exec('insert into ec_brands (category_id, name, sort) values ($1,$2,$3) returning id', [cat.id, b, j]);
        const caps = c.unit === 'ton' ? TONS : c.code === 'gas' ? [] : BTUS;
        for (const v of caps) await exec('insert into ec_capacities (brand_id, value) values ($1,$2)', [br.id, v]);
      }
    }
    const cats = await exec('select id, code from ec_categories', []);
    const idOf = Object.fromEntries(cats.map((r) => [r.code, r.id]));
    for (const [i, a] of DEFAULT_ADDONS.entries()) {
      await exec(
        `insert into ec_addons (kind, name, price, price_mode, tax, editable, active, description_fr, description_en, category_ids, sort)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (kind, name) do nothing`,
        [a.kind, a.name, a.price, a.price_mode || 'fixed', a.tax, !!a.editable, a.active !== false, a.description_fr, a.description_en, (a.categories || []).map((c) => idOf[c]), 100 + i],
      );
    }
  }

  // Lista de precios ECOAIR (sin datos de prueba en los tests salvo que se pida)
  if (process.env.CATALOG_DATA !== 'off') {
    const { default: data } = await import('./catalog-data.json', { with: { type: 'json' } });
    await applyCatalogData(exec, data);
  }

  // Usuarios: la primera vez se copian de APP_USERS (usuario:clave:rol:idGHL:Nombre:correo)
  const [{ n: nUsers }] = await exec('select count(*)::int as n from ec_users', []);
  if (!nUsers) {
    for (const s of (process.env.APP_USERS || '').split(',').map((x) => x.trim()).filter(Boolean)) {
      const [name, pass, role, ghlId, display, email] = s.split(':').map((x) => (x ?? '').trim());
      if (!name || !pass) continue;
      await exec(
        'insert into ec_users (name, display, role, pass_hash, ghl_user_id, email) values ($1,$2,$3,$4,$5,$6) on conflict (name) do nothing',
        [name.toLowerCase(), display || name, ROLE_MAP[role] || 'seller', hashPassword(pass), ghlId || null, email || null],
      );
    }
  }
}
