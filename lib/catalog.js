// Catálogo: categorías → marcas → capacidades → productos (modelos) + opciones (garantías, lignes, accessoires…)
import { q, one, num } from './db.js';
import { bad } from './http.js';

const s = (v, n) => String(v ?? '').trim().slice(0, n);
const bool = (v, d = true) => (v === undefined ? d : !!v);
const money = (v, { neg = false } = {}) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.').replace(/\s/g, '')) : Number(v);
  if (!Number.isFinite(n) || (!neg && n < 0) || Math.abs(n) > 1_000_000) throw bad('Prix invalide');
  return Math.round(n * 100) / 100;
};
const intOrNull = (v) => (v === null || v === undefined || v === '' ? null : Number.isInteger(Number(v)) ? Number(v) : (() => { throw bad('Valeur invalide'); })());
const ids = (v) => (Array.isArray(v) ? v.map(Number).filter(Number.isInteger) : []);
const attachments = (v) => (Array.isArray(v) ? v : [])
  .map((a) => ({ name: s(a?.name, 200), url: s(a?.url, 800) }))
  .filter((a) => a.name && /^https:\/\//.test(a.url))
  .slice(0, 10);
const defaults = (v) => (Array.isArray(v) ? v : [])
  .map((d) => ({ addonId: Number(d?.addonId), ...(d?.price != null && d.price !== '' ? { price: money(d.price, { neg: true }) } : {}) }))
  .filter((d) => Number.isInteger(d.addonId))
  .slice(0, 20);

const KINDS = ['warranty', 'lineset', 'electrical', 'accessory', 'credit'];
const UNITS = ['ton', 'btu', 'none'];

export async function getCatalog({ all = false } = {}) {
  const act = all ? '' : 'where active';
  const [categories, brands, capacities, products, addons] = await Promise.all([
    q(`select * from ec_categories ${act} order by sort, id`),
    q(`select * from ec_brands ${act} order by sort, name`),
    q(`select * from ec_capacities ${act} order by value`),
    q(`select * from ec_products ${act} order by sort, name`),
    q(`select * from ec_addons ${act} order by sort, kind, name`),
  ]);
  return {
    categories: categories.map((c) => ({ id: c.id, code: c.code, nameFr: c.name_fr, nameEn: c.name_en, unit: c.unit, sort: c.sort, active: c.active, parentId: c.parent_id ?? null })),
    brands: brands.map((b) => ({ id: b.id, categoryId: b.category_id, name: b.name, sort: b.sort, active: b.active })),
    capacities: capacities.map((c) => ({ id: c.id, brandId: c.brand_id, value: num(c.value), active: c.active })),
    products: products.map(productView),
    addons: addons.map(addonView),
  };
}

export const productView = (p) => p && ({
  id: p.id, categoryId: p.category_id, brandId: p.brand_id, capacityId: p.capacity_id, name: p.name, model: p.model,
  descriptionFr: p.description_fr, descriptionEn: p.description_en, basePrice: num(p.base_price), heads: p.heads,
  minPrice: num(p.min_price) || 0, ahri: p.ahri || '', subsidy: num(p.subsidy) || 0,
  attachments: p.attachments || [], defaultAddons: p.default_addons || [], active: p.active, sort: p.sort,
  fromGhl: !!p.source_template_id,
});
export const addonView = (a) => a && ({
  id: a.id, kind: a.kind, name: a.name, model: a.model, descriptionFr: a.description_fr, descriptionEn: a.description_en,
  price: num(a.price), priceMode: a.price_mode, tax: a.tax, editable: a.editable, categoryIds: a.category_ids || [], brandIds: a.brand_ids || [],
  active: a.active, sort: a.sort,
});

export const getProduct = async (id) => {
  const p = await one('select p.*, c.code as category_code from ec_products p left join ec_categories c on c.id = p.category_id where p.id = $1', [id]);
  return p && { ...productView(p), categoryCode: p.category_code };
};
export const getAddon = async (id) => addonView(await one('select * from ec_addons where id = $1', [id]));

/* ---------- Guardar (admin) ---------- */
export async function saveCategory(b, id) {
  const v = [s(b.code, 40).toLowerCase().replace(/[^a-z0-9-]/g, '-'), s(b.nameFr, 80), s(b.nameEn, 80) || s(b.nameFr, 80), UNITS.includes(b.unit) ? b.unit : 'none', Number(b.sort) || 0, bool(b.active)];
  if (!v[0] || !v[1]) throw bad('Code et nom requis');
  // sección madre (un solo nivel): no puede ser ella misma
  const parent = b.parentId ? Number(b.parentId) : null;
  if (parent && (parent === Number(id) || !(await one('select id from ec_categories where id = $1 and parent_id is null', [parent])))) throw bad('Section parente invalide');
  if (id) return one('update ec_categories set code=$2,name_fr=$3,name_en=$4,unit=$5,sort=$6,active=$7,parent_id=$8 where id=$1 returning id', [id, ...v, parent]);
  return one('insert into ec_categories (code,name_fr,name_en,unit,sort,active,parent_id) values ($1,$2,$3,$4,$5,$6,$7) returning id', [...v, parent]);
}
export async function saveBrand(b, id) {
  const v = [Number(b.categoryId), s(b.name, 80), Number(b.sort) || 0, bool(b.active)];
  if (!Number.isInteger(v[0]) || !v[1]) throw bad('Catégorie et nom requis');
  if (id) return one('update ec_brands set category_id=$2,name=$3,sort=$4,active=$5 where id=$1 returning id', [id, ...v]);
  return one('insert into ec_brands (category_id,name,sort,active) values ($1,$2,$3,$4) returning id', v);
}
export async function saveCapacity(b, id) {
  const value = Number(String(b.value).replace(',', '.'));
  if (!Number.isInteger(Number(b.brandId)) || !(value > 0)) throw bad('Marque et capacité requises');
  if (id) return one('update ec_capacities set brand_id=$2,value=$3,active=$4 where id=$1 returning id', [id, Number(b.brandId), value, bool(b.active)]);
  return one('insert into ec_capacities (brand_id,value,active) values ($1,$2,$3) on conflict (brand_id,value) do update set active=excluded.active returning id', [Number(b.brandId), value, bool(b.active)]);
}
export async function saveProduct(b, id) {
  const v = [
    Number(b.categoryId), intOrNull(b.brandId), intOrNull(b.capacityId), s(b.name, 160), s(b.model, 80),
    s(b.descriptionFr, 12000), s(b.descriptionEn, 12000), money(b.basePrice ?? 0), intOrNull(b.heads),
    JSON.stringify(attachments(b.attachments)), JSON.stringify(defaults(b.defaultAddons)), bool(b.active), Number(b.sort) || 0,
    money(b.minPrice ?? 0), s(b.ahri, 40), money(b.subsidy ?? 0),
  ];
  if (!Number.isInteger(v[0]) || !v[3]) throw bad('Catégorie et nom du produit requis');
  if (id) {
    return one(`update ec_products set category_id=$2,brand_id=$3,capacity_id=$4,name=$5,model=$6,description_fr=$7,description_en=$8,
      base_price=$9,heads=$10,attachments=$11,default_addons=$12,active=$13,sort=$14,min_price=$15,ahri=$16,subsidy=$17,updated_at=now() where id=$1 returning id`, [id, ...v]);
  }
  return one(`insert into ec_products (category_id,brand_id,capacity_id,name,model,description_fr,description_en,base_price,heads,attachments,default_addons,active,sort,min_price,ahri,subsidy)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id`, v);
}
export async function saveAddon(b, id) {
  const kind = KINDS.includes(b.kind) ? b.kind : null;
  if (!kind) throw bad('Type d’option invalide');
  const v = [
    kind, s(b.name, 160), s(b.model, 80), s(b.descriptionFr, 6000), s(b.descriptionEn, 6000), money(b.price ?? 0, { neg: kind === 'credit' }),
    ['fixed', 'per_head', 'per_foot'].includes(b.priceMode) ? b.priceMode : 'fixed', ['added', 'included', 'none'].includes(b.tax) ? b.tax : 'added',
    !!b.editable, ids(b.categoryIds), ids(b.brandIds), bool(b.active), Number(b.sort) || 0,
  ];
  if (!v[1]) throw bad('Nom requis');
  if (id) {
    return one(`update ec_addons set kind=$2,name=$3,model=$4,description_fr=$5,description_en=$6,price=$7,price_mode=$8,tax=$9,editable=$10,
      category_ids=$11,brand_ids=$12,active=$13,sort=$14 where id=$1 returning id`, [id, ...v]);
  }
  return one(`insert into ec_addons (kind,name,model,description_fr,description_en,price,price_mode,tax,editable,category_ids,brand_ids,active,sort)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`, v);
}

// Borrar: si algo depende de lo que se borra, se desactiva en lugar de borrar (las soumissions viejas no se rompen)
const TABLES = { category: 'ec_categories', brand: 'ec_brands', capacity: 'ec_capacities', product: 'ec_products', addon: 'ec_addons' };
export async function removeItem(type, id) {
  const t = TABLES[type];
  if (!t) throw bad('Type invalide');
  try {
    if (type === 'category') {
      const used = await one('select 1 from ec_products where category_id=$1 limit 1', [id]);
      if (used) { await q(`update ${t} set active=false where id=$1`, [id]); return { deactivated: true }; }
    }
    if (type === 'brand' || type === 'capacity') {
      const col = type === 'brand' ? 'brand_id' : 'capacity_id';
      const used = await one(`select 1 from ec_products where ${col}=$1 limit 1`, [id]);
      if (used) { await q(`update ${t} set active=false where id=$1`, [id]); return { deactivated: true }; }
    }
    await q(`delete from ${t} where id=$1`, [id]);
    return { deleted: true };
  } catch {
    await q(`update ${t} set active=false where id=$1`, [id]);
    return { deactivated: true };
  }
}
