// Estado, idioma, DOM y API compartidos por todas las pantallas.
import { money } from './pricing.js';
import { dict } from './i18n.js';

export const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};
// S.user = { name, display, role, isAdmin, commissionPct }
// S.cat = catálogo + doc (empresa, taxes, condiciones) ; S.sellers = vendedores activos
export const S = { lang: store.get('ec_lang') || 'fr', user: null, cat: null, sellers: null };

export const t = (k, ...a) => {
  const v = dict[S.lang][k] ?? dict.fr[k] ?? k;
  return typeof v === 'function' ? v(...a) : v;
};
export const m = (n) => money(n, S.lang);
const loc = () => (S.lang === 'fr' ? 'fr-CA' : 'en-CA');
export const fmtDate = (iso, withTime = true) => {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(loc(), withTime ? { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Toronto' } : { dateStyle: 'long', timeZone: 'America/Toronto' }).format(new Date(iso));
  } catch { return iso; }
};
export const num = (s) => {
  const n = Number(String(s ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
export const quoteNo = (n) => `${S.cat?.doc?.prefix || 'SOU-'}${n}`;

/* ---------- DOM ---------- */
// Nunca usa innerHTML: el texto de clientes o del catálogo no puede inyectar HTML.
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && !k.startsWith('aria') && k !== 'role' && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
// Como replaceChildren, pero ignora null/false y acepta listas
export const fill = (el, ...kids) => {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false).map((k) => (k.nodeType ? k : document.createTextNode(String(k)))));
  return el;
};
export const alertBox = (text, kind = 'err') => h('div', { class: `msg ${kind}`, role: kind === 'err' ? 'alert' : 'status' }, text);

/* ---------- Navegación ---------- */
let renderFn = () => {};
export const setRender = (fn) => { renderFn = fn; };
export const render = (...a) => renderFn(...a);
export const flash = (text, kind = 'ok') => { S.flash = { text, kind }; };
export const go = (r) => { if (location.hash === `#/${r}`) render(); else location.hash = `#/${r}`; };

/* ---------- API ---------- */
export async function api(method, path, body) {
  let r;
  try {
    r = await fetch(`/api/${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new Error('network');
  }
  let data = {};
  try { data = await r.json(); } catch {}
  if (r.status === 401 && !path.startsWith('session')) {
    S.user = null;
    render(t('sessionEnded'));
    throw new Error('session');
  }
  if (!r.ok) throw Object.assign(new Error(data.error || 'error'), { status: r.status, data });
  return data;
}
// Mensajes del servidor que sí son para el usuario (validación, conflicto, GHL rechazó)
export const errText = (e) => ([400, 403, 409, 502].includes(e?.status) && e.message && !['server_error', 'forbidden', 'error'].includes(e.message) ? e.message : e?.status === 404 ? t('notFound') : t('error'));
export const isSession = (e) => e?.message === 'session';
// Avisos de GHL/envío → texto
export const warnText = (ws) => [...new Set(ws || [])].map((w) => t(`warn_${w}`)).filter((x) => !x.startsWith('warn_'));

export async function loadCatalog(fresh = false) {
  if (S.cat && !fresh) return S.cat;
  S.cat = await api('GET', 'catalog');
  return S.cat;
}
export async function loadSellers(fresh = false) {
  if (S.sellers && !fresh) return S.sellers;
  S.sellers = (await api('GET', 'estimates?limit=1')).sellers;
  return S.sellers;
}
export const sellerName = (name) => S.sellers?.find((s) => s.name === name)?.display || name || '';

export async function refreshUser() {
  try { S.user = (await api('GET', 'session')).user; } catch {}
}

/* ---------- Piezas comunes ---------- */
export const page = (...kids) => h('main', { class: 'page' }, ...kids);
export const backLink = (to, label = t('back')) => h('button', { class: 'link back', type: 'button', onclick: () => go(to) }, `← ${label}`);
export const loadingBox = () => h('p', { class: 'muted' }, t('loading'));
export const statusChip = (s) => h('span', { class: `chip st-${s}` }, t(`status_${s}`));
export const reviewChip = (s) => h('span', { class: `chip rv-${s}` }, t(`review_${s}`));

// Campo con etiqueta
export function field(label, input, help) {
  const id = input.id || `f${Math.random().toString(36).slice(2, 9)}`;
  input.id = id;
  return h('div', { class: 'fld' }, h('label', { class: 'f', for: id }, label), help ? h('p', { class: 'muted small help' }, help) : null, input);
}
export const input = (props = {}) => h('input', { class: 'in', ...props });
export const textarea = (props = {}) => h('textarea', { class: 'in', ...props });
export function select(options, value, props = {}) {
  return h('select', { class: 'in', ...props }, options.map(([v, label]) => h('option', { value: v, selected: String(v) === String(value ?? '') }, label)));
}
export const checkRow = (label, checked, onchange, props = {}) =>
  h('label', { class: 'check-row' }, h('input', { type: 'checkbox', checked, onchange: (e) => onchange(e.target.checked), ...props }), h('span', {}, label));

// Botón que se desactiva mientras trabaja y muestra el error si falla
export function busyBtn(label, cls, work, errBox) {
  const b = h('button', { class: `btn ${cls}`, type: 'button' }, label);
  b.addEventListener('click', async () => {
    if (b.disabled) return;
    b.disabled = true;
    const old = b.textContent;
    b.textContent = t('saving');
    if (errBox) fill(errBox);
    try { await work(); } catch (e) {
      if (isSession(e)) return;
      if (errBox) fill(errBox, alertBox(errText(e)));
    } finally { if (b.isConnected) { b.disabled = false; b.textContent = old; } }
  });
  return b;
}
// Botón de borrar en dos toques (sin ventanas del navegador)
export function confirmBtn(label, confirmLabel, work, cls = 'link danger') {
  const b = h('button', { class: cls, type: 'button' }, label);
  let armed = false;
  b.addEventListener('click', async () => {
    if (!armed) { armed = true; b.textContent = confirmLabel; b.classList.add('armed'); setTimeout(() => { if (b.isConnected) { armed = false; b.textContent = label; b.classList.remove('armed'); } }, 5000); return; }
    b.disabled = true;
    try { await work(); } finally { if (b.isConnected) b.disabled = false; }
  });
  return b;
}
