// Arma el catálogo de Climatisation GOM (lib/catalog-data.json) desde las listas Kinghome y Zephyr (scripts/gom-lists.mjs).
//
//   node scripts/build-catalog.mjs [docs/chargement-catalogue.md]
//
// Reglas (pedido del 24 nov. 2026):
// - Solo residencial: murales, multizone (unidades exteriores + cabezas), centrales, add-on (case coil), A/C.
//   Sin rooftop comercial ni modelos R410a en liquidación.
// - El vendedor escribe el precio: precio base 0, sin mínimo. El costo de las listas nunca se guarda.
// - Descripción FR/EN con la estructura de las plantillas GHL de GOM: equipo incluido (fichas de la lista),
//   instalación incluida, garantía (Kinghome 12 ans, Zephyr 10 ans; main-d’œuvre 6 ans). AHRI y subvención
//   salen de sus campos, debajo de la descripción.
import fs from 'node:fs';
import { KINGHOME, ZEPHYR } from './gom-lists.mjs';

const VERSION = '2026-11-24-gom-kinghome-zephyr';
const reportPath = process.argv[2];

const CATEGORIES = [
  { code: 'wall', fr: 'Murale', en: 'Wall unit', unit: 'btu', sort: 0 },
  { code: 'multi', fr: 'Multizone', en: 'Multi-zone', unit: 'btu', sort: 1 },
  { code: 'heads', fr: 'Têtes intérieures (multizone)', en: 'Indoor heads (multi-zone)', unit: 'btu', sort: 2, parent: 'multi' },
  { code: 'central', fr: 'Centrale', en: 'Central', unit: 'ton', sort: 3 },
  { code: 'addon', fr: 'Add-on (sur fournaise)', en: 'Add-on (on furnace)', unit: 'ton', sort: 4 },
  { code: 'ac', fr: 'Climatiseur (A/C seulement)', en: 'Air conditioner (A/C only)', unit: 'btu', sort: 5 },
];

const fmtN = (n) => new Intl.NumberFormat('fr-CA').format(n).replace(/\s/g, ' ');
const fmtNen = (n) => new Intl.NumberFormat('en-CA').format(n);
const tonFr = (t) => `${String(t).replace('.', ',')} T`;
const dims = (d) => String(d || '').replace(/\s*[x×]\s*/g, ' × ').trim();
const power = (v) => (v === 115 ? ['115 V – 1 Ph', '115 V – 1 Ph'] : ['208/230 V – 1 Ph', '208/230 V – 1 Ph']);
const lines = (s) => { const [liq, gas] = String(s || '').split(/\s*-\s*/); return liq && gas ? { liq, gas } : null; };
const LABOUR = { fr: '6 ans – main-d’œuvre', en: '6 years – labour' };

// Descripción con secciones (« # » = título, « • » = punto), en los dos idiomas
function doc() {
  const fr = [], en = [];
  return {
    h: (f, e) => { fr.push(`# ${f}`); en.push(`# ${e}`); },
    li: (f, e) => { fr.push(`• ${f}`); en.push(`• ${e ?? f}`); },
    out: () => ({ fr: fr.join('\n'), en: en.join('\n') }),
  };
}
function unitBlock(d, { titleFr, titleEn, model, dims: dm, volt, breaker, lines: ln, ref, seer2, hspf2, es, extraFr = [], extraEn = [] }) {
  d.h(`${titleFr} – ${model}`, `${titleEn} – ${model}`);
  extraFr.forEach((f, i) => d.li(f, extraEn[i]));
  if (seer2) d.li(`Efficacité : SEER2 ${String(seer2).replace('.', ',')}${hspf2 ? ` / HSPF2 ${String(hspf2).replace('.', ',')}` : ''}`, `Efficiency: SEER2 ${seer2}${hspf2 ? ` / HSPF2 ${hspf2}` : ''}`);
  if (es) d.li(`Système homologué Energy Star 6.1 climat froid (n° ${es})`, `Energy Star 6.1 cold climate certified system (No. ${es})`);
  if (dm) d.li(`Dimensions : ${dims(dm)} po`, `Dimensions: ${dims(dm)} in`);
  if (volt) { const [f, e] = power(volt); d.li(`Alimentation : ${f}`, `Power supply: ${e}`); }
  const l = lines(ln);
  if (l) d.li(`Raccords frigorifiques : ${l.gas} (gaz) × ${l.liq} (liquide)`, `Refrigerant connections: ${l.gas} (gas) × ${l.liq} (liquid)`);
  if (ref) d.li(`Réfrigérant : ${ref}`, `Refrigerant: ${ref}`);
  if (breaker) d.li(`Disjoncteur requis : ${breaker} A`, `Required breaker: ${breaker} A`);
}
function install(d, fr, en) {
  d.h('Installation incluse – matériel et main-d’œuvre', 'Installation included – materials and labour');
  d.li('Fourniture de tout le matériel nécessaire à l’installation', 'Supply of all materials required for installation');
  d.li(fr, en);
  d.li('Raccordements frigorifiques et électriques', 'Refrigerant and electrical connections');
  d.li('Mise en service, essais et calibrations', 'Start-up, testing and calibration');
}
function warranty(d, w) {
  d.h('Garantie', 'Warranty');
  d.li(w.fr, w.en);
  d.li(LABOUR.fr, LABOUR.en);
}

const products = [];
const addons = [];
const brands = new Set();
const report = { products: [], notes: [] };
const add = (p) => {
  brands.add(`${p.category}|${p.brand}`);
  products.push({ basePrice: 0, minPrice: 0, attachments: [], defaults: [], active: true, heads: null, ...p, sort: Math.round(p.sort) });
  report.products.push(p);
};

/* ---------- Murales (et A/C) ---------- */
function walls(brand, list, w, cat = 'wall') {
  for (const s of list) {
    s.rows.forEach((r, i) => {
      const series = s.series;
      const ref = s.ref || KINGHOME.ref;
      const v115 = r.volt === 115 ? ' 115 V' : '';
      const ac = cat === 'ac';
      const name = ac
        ? `Climatiseur mural ${brand} ${fmtN(r.btu)} BTU – A/C seulement${v115}`
        : `Thermopompe murale ${brand} ${fmtN(r.btu)} BTU – ${series}${v115}`;
      const d = doc();
      d.h('Équipement inclus', 'Equipment included');
      unitBlock(d, {
        titleFr: `Unité extérieure (${fmtN(r.btu)} BTU)`, titleEn: `Outdoor unit (${fmtNen(r.btu)} BTU)`, model: r.outdoor, dims: r.dimsOut,
        volt: r.volt, breaker: r.breaker, lines: r.lines, ref, seer2: r.seer2, hspf2: r.hspf2, es: r.es,
        extraFr: [ac ? 'Climatisation seulement (pas de chauffage)' : 'Thermopompe Inverter à vitesse variable (chauffage et climatisation)'],
        extraEn: [ac ? 'Cooling only (no heating)' : 'Variable-speed Inverter heat pump (heating and cooling)'],
      });
      unitBlock(d, {
        titleFr: 'Unité intérieure murale', titleEn: 'Indoor wall unit', model: r.indoor, dims: r.dimsIn,
        extraFr: s.wifi ? ['Wi-Fi intégré'] : [], extraEn: s.wifi ? ['Built-in Wi-Fi'] : [],
      });
      install(d, 'Installation de l’unité extérieure et de l’unité intérieure murale', 'Installation of the outdoor unit and the indoor wall unit');
      warranty(d, w);
      add({
        key: `${cat}:${brand}:${series || 'ac'}:${r.outdoor}`.toLowerCase(), category: cat, brand, capacity: r.btu, name, model: r.outdoor,
        ahri: r.ahri, subsidy: r.subsidy || 0, descriptionFr: d.out().fr, descriptionEn: d.out().en, sort: r.btu / 100 + i / 100,
        source: brand === 'Kinghome' ? `Liste Kinghome R32 (2 mai 2026) – ${series}` : `Liste Zephyr (17 juillet 2025) – ${ac ? 'A/C seulement R32' : series}`,
      });
    });
    if (s.note) report.notes.push(`Kinghome ${s.series}: ${s.note}`);
  }
}
walls('Kinghome', KINGHOME.wall, KINGHOME.warranty);
walls('Zephyr', ZEPHYR.wall, ZEPHYR.warranty);
walls('Zephyr', [{ series: '', ...ZEPHYR.ac }], ZEPHYR.warranty, 'ac');

/* ---------- Multizone: unités extérieures ---------- */
for (const m of KINGHOME.multi) {
  const d = doc();
  d.h('Équipement inclus', 'Equipment included');
  unitBlock(d, {
    titleFr: `Unité extérieure multizone (${fmtN(m.btu)} BTU)`, titleEn: `Multi-zone outdoor unit (${fmtNen(m.btu)} BTU)`, model: m.model, dims: m.dims,
    volt: m.volt, breaker: m.breaker, lines: m.lines, ref: KINGHOME.ref, seer2: m.seer2, hspf2: m.hspf2, es: m.es,
    extraFr: ['Thermopompe Inverter à vitesse variable', 'Les têtes intérieures s’ajoutent à la soumission (section « Têtes intérieures »)'],
    extraEn: ['Variable-speed Inverter heat pump', 'Indoor heads are added to the quote separately ("Indoor heads" section)'],
  });
  d.h('Aide financière – Hydro-Québec (LogisVert)', 'Financial assistance – Hydro-Québec (LogisVert)');
  d.li(`Têtes murales seulement : AHRI ${m.ahri.wall} – subvention estimée ${fmtN(m.subsidy.wall)} $`, `Wall heads only: AHRI ${m.ahri.wall} – estimated rebate $${fmtNen(m.subsidy.wall)}`);
  d.li(`Têtes gainables seulement : AHRI ${m.ahri.ducted} – subvention estimée ${fmtN(m.subsidy.ducted)} $`, `Ducted heads only: AHRI ${m.ahri.ducted} – estimated rebate $${fmtNen(m.subsidy.ducted)}`);
  d.li(`Mixte murales et gainables : AHRI ${m.ahri.mixed} – subvention estimée ${fmtN(m.subsidy.mixed)} $`, `Mixed wall and ducted: AHRI ${m.ahri.mixed} – estimated rebate $${fmtNen(m.subsidy.mixed)}`);
  install(d, 'Installation de l’unité extérieure multizone et des têtes intérieures choisies', 'Installation of the multi-zone outdoor unit and the selected indoor heads');
  warranty(d, KINGHOME.warranty);
  add({
    key: `multi:kinghome:${m.model}`.toLowerCase(), category: 'multi', brand: 'Kinghome', capacity: m.btu,
    name: `Thermopompe multizone Kinghome ${fmtN(m.btu)} BTU (unité extérieure)`, model: m.model,
    // AHRI et subvention selon les têtes: dans la description (trois combinaisons), pas dans les champs
    ahri: '', subsidy: 0, descriptionFr: d.out().fr, descriptionEn: d.out().en, sort: m.btu / 100, source: 'Liste Kinghome R32 – multizone',
  });
}
for (const m of ZEPHYR.multi) {
  const d = doc();
  d.h('Équipement inclus', 'Equipment included');
  unitBlock(d, {
    titleFr: `Unité extérieure multizone (${fmtN(m.btu)} BTU)`, titleEn: `Multi-zone outdoor unit (${fmtNen(m.btu)} BTU)`, model: m.model, dims: m.dims,
    volt: m.volt, breaker: m.breaker, lines: m.lines, ref: 'R-454B', seer2: m.seer2, hspf2: m.hspf2, es: m.es,
    extraFr: ['Thermopompe Inverter à vitesse variable', `Jusqu’à ${m.zones} zones`, 'Les têtes intérieures s’ajoutent à la soumission (section « Têtes intérieures »)'],
    extraEn: ['Variable-speed Inverter heat pump', `Up to ${m.zones} zones`, 'Indoor heads are added to the quote separately ("Indoor heads" section)'],
  });
  install(d, 'Installation de l’unité extérieure multizone et des têtes intérieures choisies', 'Installation of the multi-zone outdoor unit and the selected indoor heads');
  warranty(d, ZEPHYR.warranty);
  add({
    key: `multi:zephyr:${m.model}`.toLowerCase(), category: 'multi', brand: 'Zephyr', capacity: m.btu, heads: m.zones,
    name: `Thermopompe multizone Zephyr ${fmtN(m.btu)} BTU – jusqu’à ${m.zones} zones (unité extérieure)`, model: m.model,
    ahri: m.ahri, subsidy: m.subsidy, descriptionFr: d.out().fr, descriptionEn: d.out().en, sort: m.btu / 100, source: 'Liste Zephyr – multizone R454b',
  });
}
report.notes.push('Zephyr multizone: le nombre de zones vient du modèle (ZE518M2… = 2, M3 = 3, M4 = 4, M5 = 5): à confirmer.');
report.notes.push('Kinghome multizone: l’AHRI et la subvention changent selon les têtes (murales, gainables ou mixte); les trois sont dans la description, les champs AHRI/subvention restent vides.');

/* ---------- Têtes intérieures multizone ---------- */
const HEAD = {
  wall: ['Tête murale', 'Wall head'], cassette: ['Cassette 4 voies', '4-way cassette'], oneway: ['Cassette 1 voie', 'One-way cassette'],
  console: ['Console au plancher', 'Floor console'], floorceiling: ['Unité plancher-plafond', 'Floor-ceiling unit'], ducted: ['Unité gainable (conduits)', 'Ducted unit'],
};
for (const [brand, src] of [['Kinghome', KINGHOME], ['Zephyr', ZEPHYR]]) {
  for (const [type, series, list] of src.heads) {
    for (const [model, btu, dm] of list) {
      const [fr, en] = HEAD[type];
      const d = doc();
      d.h('Équipement inclus', 'Equipment included');
      unitBlock(d, {
        titleFr: `${fr} multizone${series ? ` ${series}` : ''} (${fmtN(btu)} BTU)`, titleEn: `${en} multi-zone${series ? ` ${series}` : ''} (${fmtNen(btu)} BTU)`, model, dims: dm,
        volt: 230, extraFr: ['À raccorder à une unité extérieure multizone de la même marque'], extraEn: ['To be connected to a multi-zone outdoor unit of the same brand'],
      });
      install(d, 'Installation de l’unité intérieure et raccordement à l’unité extérieure multizone', 'Installation of the indoor unit and connection to the multi-zone outdoor unit');
      add({
        key: `heads:${brand}:${model}`.toLowerCase(), category: 'heads', brand, capacity: btu,
        name: `${fr} ${brand} ${fmtN(btu)} BTU${series ? ` – ${series}` : ''}`, model,
        ahri: '', subsidy: 0, descriptionFr: d.out().fr, descriptionEn: d.out().en,
        sort: Object.keys(HEAD).indexOf(type) * 1000 + btu / 1000, source: `Liste ${brand} – têtes multizone`,
      });
    }
  }
}

/* ---------- Centrales ---------- */
for (const [brand, src, series, ref] of [['Kinghome', KINGHOME, 'Ultranixx', 'R-32'], ['Zephyr', ZEPHYR, '', 'R-454B']]) {
  for (const [tons, btu, seer2, hspf2, ahri, es, indoor, brIn, dimsIn, outdoor, brOut, dimsOut, ln, subsidy] of src.central) {
    const d = doc();
    d.h('Équipement inclus', 'Equipment included');
    unitBlock(d, {
      titleFr: `Unité extérieure (${tonFr(tons)} – ${fmtN(btu)} BTU)`, titleEn: `Outdoor unit (${tons} tons – ${fmtNen(btu)} BTU)`, model: outdoor, dims: dimsOut,
      volt: 230, breaker: brOut, lines: ln, ref, seer2, hspf2, es,
      extraFr: ['Thermopompe centrale Inverter à vitesse variable'], extraEn: ['Variable-speed Inverter central heat pump'],
    });
    unitBlock(d, {
      titleFr: 'Unité intérieure (souffleur)', titleEn: 'Indoor unit (air handler)', model: indoor, dims: dimsIn, breaker: brIn,
      extraFr: [brand === 'Kinghome' ? 'Souffleur multiposition (vertical ou horizontal)' : 'Souffleur certifié avec l’unité extérieure'],
      extraEn: [brand === 'Kinghome' ? 'Multi-position air handler (vertical or horizontal)' : 'Air handler certified with the outdoor unit'],
    });
    install(d, 'Installation de l’unité extérieure et du souffleur', 'Installation of the outdoor unit and the air handler');
    warranty(d, src.warranty);
    add({
      key: `central:${brand}:${tons}`.toLowerCase(), category: 'central', brand, capacity: tons,
      name: `Thermopompe centrale ${brand}${series ? ` ${series}` : ''} ${tonFr(tons)}`, model: outdoor,
      ahri, subsidy, descriptionFr: d.out().fr, descriptionEn: d.out().en, sort: tons * 100, source: `Liste ${brand} – centrale`,
    });
  }
}
report.notes.push('Kinghome Ultranixx 2 T: la liste jumelle le souffleur KD24UXI avec l’unité extérieure KU36UXO (même extérieur que le 3 T).');

/* ---------- Add-on (case coil sur fournaise existante) ---------- */
for (const [brand, src, series, ref] of [['Kinghome', KINGHOME, 'Ultranixx', 'R-32'], ['Zephyr', ZEPHYR, '', 'R-454B']]) {
  for (const a of src.addon) {
    const c = src.central.find((r) => r[9] === a.outdoor);
    const d = doc();
    d.h('Équipement inclus', 'Equipment included');
    unitBlock(d, {
      titleFr: 'Unité extérieure', titleEn: 'Outdoor unit', model: a.outdoor, dims: c[11],
      volt: 230, breaker: c[10], lines: c[12], ref, es: '', extraFr: ['Thermopompe Inverter à vitesse variable'], extraEn: ['Variable-speed Inverter heat pump'],
    });
    unitBlock(d, {
      titleFr: 'Serpentin intérieur avec boîtier (case coil)', titleEn: 'Cased indoor coil', model: a.coil, dims: a.dims ? `${a.dims} (L × P × H)` : '',
      es: a.es, extraFr: ['Installé sur la fournaise existante'], extraEn: ['Installed on the existing furnace'],
    });
    install(d, 'Installation de l’unité extérieure et du serpentin sur la fournaise existante', 'Installation of the outdoor unit and of the coil on the existing furnace');
    warranty(d, src.warranty);
    add({
      key: `addon:${brand}:${a.coil}`.toLowerCase(), category: 'addon', brand, capacity: a.tons,
      name: `Thermopompe add-on ${brand}${series ? ` ${series}` : ''} ${tonFr(a.tons)} – ${a.coil}`, model: a.outdoor,
      ahri: a.ahri, subsidy: a.subsidy, descriptionFr: d.out().fr, descriptionEn: d.out().en, sort: a.tons * 100, source: `Liste ${brand} – case coil`,
    });
  }
}
report.notes.push('Kinghome case coil KCAC48HI et KCAC60HI: pas d’AHRI ni d’unité extérieure jumelée dans la liste: non chargés.');
report.notes.push('Kinghome KCAC24FI (add-on 2 T) est jumelé avec l’unité extérieure KU36UXO (3 T), comme dans la liste.');

/* ---------- Options: éléments électriques, grilles, MiniERV ---------- */
const opt = (kind, name, model, fr, en, categories, brandsList) => addons.push({
  key: `${kind}|${name}`, kind, name, model, descriptionFr: fr, descriptionEn: en, price: 0, tax: 'added', editable: true,
  categories, brands: brandsList,
});
for (const [brand, src] of [['Kinghome', KINGHOME], ['Zephyr', ZEPHYR]]) {
  for (const kw of src.elements) {
    opt('electrical', `Élément électrique ${brand} ${kw.replace('.', ',')} kW`, `${kw} kW`, `Élément électrique d’appoint de ${kw.replace('.', ',')} kW pour le souffleur ${brand}.`,
      `${kw} kW backup electric element for the ${brand} air handler.`, ['central'], [`central|${brand}`]);
  }
}
for (const x of KINGHOME.extras) opt('accessory', x.name, x.model, x.fr, x.en, x.categories, x.categories.map((c) => `${c}|Kinghome`));

const capKey = (v) => String(Math.round(v * 1000) / 1000);
const data = {
  version: VERSION,
  rewrite: true,
  retire: [],
  categories: CATEGORIES,
  brands: [...brands].map((b) => { const [category, name] = b.split('|'); return { category, name }; }),
  capacities: [...new Set(products.map((p) => `${p.category}|${p.brand}|${capKey(p.capacity)}`))]
    .map((c) => { const [category, brand, value] = c.split('|'); return { category, brand, value: Number(value) }; }),
  addons,
  products,
};
fs.writeFileSync(new URL('../lib/catalog-data.json', import.meta.url), JSON.stringify(data, null, 1));

const byCat = (c) => products.filter((p) => p.category === c);
const md = [
  `# Catalogue Climatisation GOM — ${VERSION}`, '',
  'Source: listes de prix Kinghome R32 (2 mai 2026) et Zephyr R32 / R454b (17 juillet 2025). Résidentiel seulement: pas de rooftop ni de modèles R410a en liquidation.',
  'Le vendeur écrit le prix de vente: aucun prix de base ni minimum n’est chargé, et le coûtant des listes n’est pas enregistré.',
  'Garantie: Kinghome 12 ans pièces et compresseur, Zephyr 10 ans pièces et compresseur (plantilles HighLevel de GOM); main-d’œuvre 6 ans.', '',
  ...CATEGORIES.flatMap((c) => [`## ${c.fr} (${byCat(c.code).length})`, ...byCat(c.code).map((p) => `- ${p.name} — ${p.model}${p.ahri ? ` · AHRI ${p.ahri}` : ''}${p.subsidy ? ` · subvention ${fmtN(p.subsidy)} $` : ''}`), '']),
  `## Options (${addons.length}) — prix écrit par le vendeur`, ...addons.map((a) => `- ${a.name}`), '',
  '## À vérifier', ...report.notes.map((n) => `- ${n}`), '',
];
if (reportPath) fs.writeFileSync(reportPath, md.join('\n'));
console.log(`produits ${products.length} · options ${addons.length} · catégories ${CATEGORIES.length}`);
