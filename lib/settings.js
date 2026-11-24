// Ajustes editables por el admin (empresa, taxes, condiciones, mensajes, reseñas, etapas GHL).
import { q } from './db.js';
import { DEFAULT_SETTINGS } from './seed.js';

let cache = { at: 0, value: null };
const TTL = 15 * 1000;

export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache.value && Date.now() - cache.at < TTL) return cache.value;
  const rows = await q('select key, value from ec_settings');
  const value = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows) {
    if (r.key.startsWith('_')) continue; // claves internas (ej. versión del catálogo)
    const d = DEFAULT_SETTINGS[r.key];
    value[r.key] = d && typeof d === 'object' && !Array.isArray(d) ? { ...d, ...r.value } : r.value;
  }
  cache = { at: Date.now(), value };
  return value;
}

export async function setSetting(key, value) {
  if (!(key in DEFAULT_SETTINGS)) throw Object.assign(new Error('Réglage inconnu'), { status: 400 });
  if (key === 'pricing') value = cleanPricing(value);
  await q('insert into ec_settings (key, value) values ($1,$2) on conflict (key) do update set value = excluded.value', [key, JSON.stringify(value)]);
  cache = { at: 0, value: null };
}

// Plantillas de mensajes: {client} {numero} {total} {lien} {vendeur} {avis}
export const fillTemplate = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? '') : m));

// Réglages de prix: interrupteur « Directeur des ventes » et multiplicateurs (0 à 1) par fabricant
function cleanPricing(v) {
  const m = {};
  for (const [k, x] of Object.entries(v?.multipliers || {})) {
    const name = String(k).trim().slice(0, 40);
    const n = Number(String(x).replace(',', '.'));
    if (!name) continue;
    if (!(n > 0 && n <= 1)) throw Object.assign(new Error(`Multiplicateur invalide pour ${name} (entre 0 et 1)`), { status: 400 });
    m[name] = Math.round(n * 10000) / 10000;
  }
  return { directeur: v?.directeur === true, multipliers: m };
}
