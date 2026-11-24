// Asistente de soumission en 4 pasos: Cliente → Equipo → Precios y opciones → Verificar y enviar.
// El vendedor escribe su precio SIN comisión; la app suma la comisión (invisible para el cliente).
import {
  S, store, t, m, h, fill, alertBox, api, errText, isSession, go, flash, num, quoteNo, warnText,
  loadCatalog, loadSellers, sellerName, page, loadingBox, field, input, textarea, select, checkRow, confirmBtn,
} from './core.js';
import { priceLines, totals, capLabel, clientPrice, r2, withRebate, specialOf } from './pricing.js';
import { docPreview, richText } from './preview.js';

const KEY = 'ec_draft_v3';
const KIND_ORDER = ['warranty', 'lineset', 'electrical', 'accessory', 'credit'];

const blank = () => ({
  owner: S.user?.name, id: null, number: null, status: 'draft', step: 1, contact: null, seller: S.user?.name, lang: S.lang,
  items: [], addons: {}, notes: '', internalNote: '', channels: { email: true, sms: true }, pick: {}, issueDate: null,
});
let Q = (() => {
  try { const d = JSON.parse(store.get(KEY)); if (d && Array.isArray(d.items)) return { ...blank(), ...d }; } catch {}
  return blank();
})();
const save = () => store.set(KEY, JSON.stringify(Q));
export const resetDraft = () => { Q = blank(); store.del(KEY); };
// Si el borrador guardado es de otra persona (otro usuario en el mismo teléfono), se descarta
const mine = () => { if (Q.owner !== S.user?.name) resetDraft(); return Q; };
export const hasDraft = () => mine() && !Q.id && (Q.contact || Q.items.length);

export function startNew() { resetDraft(); save(); go('new/1'); }

// Abrir una soumission existente en el asistente
export async function startEdit(id) {
  const { estimate: e } = await api('GET', `estimates?id=${encodeURIComponent(id)}`);
  // « Admin View »: consultation seulement pour les soumissions des autres
  if (!S.user.isAdmin && e.seller !== S.user.name && e.createdBy !== S.user.name) throw Object.assign(new Error(t('readOnly')), { status: 403 });
  resetDraft();
  Object.assign(Q, {
    id: e.id, number: e.number, status: e.status, step: 3, contact: e.contact, seller: e.seller, lang: e.lang,
    notes: e.notes || '', internalNote: e.internalNote || '', issueDate: e.issueDate,
    items: e.lines.filter((l) => l.kind === 'equipment').map((l, i) => ({
      key: `e${i}${Date.now()}`, productId: l.productId, qty: l.qty, base: String(l.base ?? ''),
      commission: String(l.commissionUnit ?? r2((Number(l.price) || 0) - (Number(l.base) || 0) - (Number(l.directeurUnit) || 0))),
      directeur: l.directeurUnit ? String(l.directeurUnit) : '', hadDirecteur: Number(l.directeurUnit) > 0, special: !!l.special,
      snap: { name: l.name, model: l.model, description: l.description, attachments: l.attachments || [], basePrice: l.basePrice || 0, minPrice: l.minPrice || 0 },
    })),
    addons: Object.fromEntries(e.lines.filter((l) => l.kind === 'addon').map((l) => [l.addonId, {
      qty: l.qty, price: String(l.price), snap: { kind: l.addonKind, name: l.name, model: l.model, descriptionFr: l.description, descriptionEn: l.description, price: l.price, tax: l.tax, priceMode: l.unit === 'ft' ? 'per_foot' : l.unit === 'head' ? 'per_head' : 'fixed', editable: true },
    }])),
  });
  save();
  go(`new/3`);
}

/* ---------- Catálogo ---------- */
const C = () => S.cat;
const product = (id) => C().products.find((p) => p.id === id);
const addonOf = (id) => C().addons.find((a) => a.id === Number(id)) || Q.addons[id]?.snap;
const category = (id) => C().categories.find((c) => c.id === id);
const brand = (id) => C().brands.find((b) => b.id === id);
const capacity = (id) => C().capacities.find((c) => c.id === id);
const catName = (c) => (c ? (S.lang === 'en' ? c.nameEn || c.nameFr : c.nameFr) : '');
const capText = (p) => { const cp = p && capacity(p.capacityId); return cp ? capLabel(cp.value, category(p.categoryId)?.unit, S.lang) : ''; };
// « Spécial » (volume): centrale −500 $, Steffes −1 000 $ sur la base et le minimum; seul l’admin complet l’active
const specialCut = (it) => { const p = product(it.productId); return it.special && p ? specialOf(category(p.categoryId)?.code) : 0; };
const directeurOn = () => !!S.cat?.pricing?.directeur;
const pctOf = (seller) => S.sellers?.find((s) => s.name === seller)?.commissionPct ?? (seller === S.user.name ? S.user.commissionPct : 0) ?? 0;

/* ---------- Líneas y totales (mismo cálculo que el servidor) ---------- */
function addonPrice(a, v) { return a.editable ? (Number.isFinite(num(v.price)) ? num(v.price) : 0) : Number(a.price) || 0; }
function orderedAddons() {
  return Object.entries(Q.addons)
    .map(([id, v]) => ({ id: Number(id), v, a: addonOf(id) }))
    .filter((x) => x.a)
    .sort((x, y) => KIND_ORDER.indexOf(x.a.kind) - KIND_ORDER.indexOf(y.a.kind));
}
function draftLines() {
  const en = Q.lang === 'en';
  const eq = Q.items.map((it) => {
    const p = product(it.productId);
    const s = p || it.snap || {};
    return {
      kind: 'equipment', name: s.name, model: s.model || '', qty: it.qty, base: Number.isFinite(num(it.base)) ? num(it.base) : 0, tax: 'added',
      // comisión escrita por el vendedor; vacía = % del vendedor
      commissionUnit: it.commission != null && it.commission !== '' && Number.isFinite(num(it.commission)) ? num(it.commission) : null,
      directeurUnit: (directeurOn() || it.hadDirecteur) && Number.isFinite(num(it.directeur)) && num(it.directeur) > 0 ? num(it.directeur) : 0,
      description: p ? withRebate((en && p.descriptionEn) || p.descriptionFr, p, Q.lang) : s.description, attachments: s.attachments || [],
      minPrice: p ? (p.minPrice > 0 ? Math.max(0, p.minPrice - specialCut(it)) : 0) : s.minPrice || 0,
    };
  });
  const ad = orderedAddons().map(({ v, a }) => ({
    kind: 'addon', name: a.name, model: a.model || '', qty: v.qty, price: addonPrice(a, v), tax: a.tax,
    description: (en && a.descriptionEn) || a.descriptionFr, unit: a.priceMode === 'per_foot' ? 'ft' : a.priceMode === 'per_head' ? 'head' : '',
  }));
  const priced = priceLines([...eq, ...ad], pctOf(Q.seller));
  return { lines: priced, totals: totals(priced) };
}
const payload = () => {
  const { lines } = draftLines();
  return {
  contact: Q.contact, seller: Q.seller, lang: Q.lang, notes: Q.notes, internalNote: Q.internalNote,
  items: [
    ...Q.items.map((it, i) => ({
      type: 'product', productId: it.productId, qty: it.qty, base: it.base, commission: lines[i].commissionUnit,
      ...(directeurOn() || it.hadDirecteur ? { directeur: lines[i].directeurUnit || '' } : {}), ...(it.special ? { special: true } : {}),
    })),
    ...orderedAddons().map(({ id, v, a }) => ({ type: 'addon', addonId: id, qty: v.qty, ...(a.editable ? { price: v.price } : {}) })),
  ],
  };
};

// Agregar un equipo: con sus opciones por defecto (la cantidad sube si ya estaban)
function addProduct(p) {
  Q.items.push({ key: `e${Date.now()}`, productId: p.id, qty: 1, base: p.basePrice > 0 ? String(p.basePrice) : '' });
  for (const d of p.defaultAddons || []) {
    const a = addonOf(d.addonId);
    if (!a || a.active === false) continue;
    const cur = Q.addons[d.addonId];
    const qty = a.priceMode === 'per_foot' ? 25 : a.priceMode === 'per_head' ? p.heads || 1 : 1;
    if (cur) { if (a.priceMode === 'fixed') cur.qty = Math.min(cur.qty + 1, 50); }
    else Q.addons[d.addonId] = { qty, price: String(d.price ?? a.price ?? 0) };
  }
  Q.pick = {};
}

/* ---------- Pantalla ---------- */
const STEPS = 4;
export function viewWizard(stepArg) {
  mine();
  const step = Math.min(Math.max(Number(stepArg) || Q.step || 1, 1), STEPS);
  // No se puede saltar pasos sin lo necesario
  const maxStep = !Q.contact ? 1 : !Q.items.length ? 2 : STEPS;
  if (step > maxStep) { setTimeout(() => go(`new/${maxStep}`)); return page(loadingBox()); }
  Q.step = step; save();

  const main = h('main', { class: step >= 3 ? 'page wide has-dock' : 'page has-dock' });
  const body = h('div');
  const dock = h('div', { class: 'dock' });
  main.append(stepHead(step), body, dock);
  fill(body, loadingBox());
  Promise.all([loadCatalog(), loadSellers()]).then(() => {
    const paint = () => {
      fill(body, [renderStep1, renderStep2, renderStep3, renderStep4][step - 1](paint));
      fill(dock, dockBar(step));
    };
    paint();
  }).catch((e) => { if (!isSession(e)) fill(body, alertBox(errText(e))); });
  return main;
}

function stepHead(step) {
  const titles = [t('step1'), t('step2'), t('step3'), t('step4')];
  return h('div', { class: 'step-head' },
    Q.id ? h('p', { class: 'step-of' }, `${t('edit')} · ${quoteNo(Q.number)}`) : null,
    h('nav', { class: 'progress p4', 'aria-label': t('stepOf', step, STEPS) },
      titles.map((tt, i) => h('button', {
        type: 'button', class: i < step ? 'on' : '', 'aria-current': i + 1 === step ? 'step' : null, title: tt,
        disabled: i + 1 > (!Q.contact ? 1 : !Q.items.length ? 2 : STEPS), onclick: () => go(`new/${i + 1}`),
      }, h('span', { class: 'sr' }, tt)))),
    h('p', { class: 'step-of' }, t('stepOf', step, STEPS)),
    h('h1', {}, titles[step - 1]));
}

function dockBar(step) {
  const { totals: tt } = draftLines();
  const back = step > 1 ? h('button', { class: 'btn big', type: 'button', onclick: () => go(`new/${step - 1}`) }, t('back'))
    : h('button', { class: 'btn big', type: 'button', onclick: () => go(Q.id ? `q/${Q.id}` : 'home') }, t('cancel'));
  const next = step < STEPS ? h('button', {
    class: 'btn big hi', type: 'button', disabled: (step === 1 && !Q.contact) || (step === 2 && !Q.items.length),
    onclick: () => {
      if (step === 3) {
        const missing = Q.items.find((it) => !(num(it.base) > 0));
        if (missing) { const el = document.getElementById(`price-${missing.key}`); el?.focus(); el?.closest('.card')?.querySelector('.need')?.removeAttribute('hidden'); return; }
      }
      go(`new/${step + 1}`);
    },
  }, t('next')) : null;
  return h('div', { class: 'dock-in' },
    Q.items.length ? h('div', { class: 'dock-total' }, h('span', {}, t('total')), h('strong', { 'data-total': '' }, m(tt.total))) : null,
    h('div', { class: 'dock-btns' }, back, next));
}
// Actualiza los montos sin redibujar (no se pierde el foco al escribir)
function refreshNumbers() {
  const { lines, totals: tt } = draftLines();
  document.querySelectorAll('[data-total]').forEach((el) => { el.textContent = m(tt.total); });
  Q.items.forEach((it, i) => {
    const l = lines[i];
    const cp = document.querySelector(`[data-client="${it.key}"]`);
    if (cp) cp.textContent = m(l.price);
    // comisión automática (% del vendedor): el campo sigue al precio hasta que el vendedor la cambie
    const ci = document.querySelector(`[data-comm-in="${it.key}"]`);
    if (ci && (it.commission == null || it.commission === '') && document.activeElement !== ci) ci.value = l.commissionUnit ? String(l.commissionUnit).replace('.', ',') : '';
    const mn = document.querySelector(`[data-min="${it.key}"]`);
    if (mn) mn.classList.toggle('warn', l.minPrice > 0 && l.price < l.minPrice);
    const low = document.querySelector(`[data-low="${it.key}"]`);
    const bp = Math.max(0, ((product(it.productId) || it.snap || {}).basePrice || 0) - specialCut(it));
    if (low) low.hidden = !(bp > 0 && num(it.base) < bp);
    if (num(it.base) > 0) document.querySelector(`[data-need="${it.key}"]`)?.setAttribute('hidden', '');
  });
  const pv = document.querySelector('[data-preview]');
  if (pv) fill(pv, preview());
}


/* ---------- Paso 1: cliente ---------- */
function renderStep1(paint) {
  const out = [];
  if (Q.contact) {
    const c = Q.contact;
    out.push(h('div', { class: 'card chosen-client' },
      h('p', { class: 'muted' }, t('chosenClient')),
      h('p', { class: 'client-name' }, c.name),
      [c.phone, c.email, [c.address1, c.city].filter(Boolean).join(', ')].filter(Boolean).map((x) => h('p', { class: 'pick-sub' }, x)),
      !c.email && !c.phone ? alertBox(t('noContactInfo'), 'warn') : null,
      h('button', { class: 'link', type: 'button', onclick: () => { Q.contact = null; save(); paint(); } }, t('otherClient'))));
    return out;
  }
  const results = h('ul', { class: 'pick-list' });
  const err = h('div');
  let timer = null;
  let seq = 0;
  const search = input({ type: 'search', autocomplete: 'off', placeholder: t('searchClient'), 'aria-label': t('searchClient') });
  search.addEventListener('input', () => {
    clearTimeout(timer);
    const qv = search.value.trim();
    if (qv.length < 2) { fill(results); return; }
    timer = setTimeout(async () => {
      const my = ++seq;
      fill(results, h('li', { class: 'muted' }, t('loading')));
      try {
        const { contacts } = await api('GET', `contacts?q=${encodeURIComponent(qv)}`);
        if (my !== seq) return;
        fill(results, contacts.length ? contacts.map((c) => h('li', {}, h('button', {
          class: 'pick', type: 'button', onclick: () => { Q.contact = c; save(); go('new/2'); },
        }, h('span', { class: 'pick-name' }, c.name || c.email || c.phone), h('span', { class: 'pick-sub' }, [c.phone, c.email, c.city].filter(Boolean).join(' · ')))))
          : h('li', { class: 'muted' }, t('noClient')));
      } catch (e) { if (!isSession(e)) fill(results, h('li', {}, alertBox(errText(e)))); }
    }, 350);
  });
  setTimeout(() => search.focus(), 50);

  // Cliente nuevo (se crea en GoHighLevel)
  const f = { name: input({ autocomplete: 'off' }), phone: input({ type: 'tel', autocomplete: 'off' }), email: input({ type: 'email', autocomplete: 'off' }),
    address1: input({ autocomplete: 'off' }), city: input({ autocomplete: 'off' }), postalCode: input({ autocomplete: 'off' }) };
  const createBtn = h('button', { class: 'btn big primary', type: 'button' }, t('saveClient'));
  createBtn.addEventListener('click', async () => {
    const [firstName, ...rest] = f.name.value.trim().split(/\s+/);
    createBtn.disabled = true;
    fill(err);
    try {
      const { contact } = await api('POST', 'contacts', {
        firstName: firstName || '', lastName: rest.join(' '), phone: f.phone.value, email: f.email.value,
        address1: f.address1.value, city: f.city.value, postalCode: f.postalCode.value,
      });
      Q.contact = contact; save(); go('new/2');
    } catch (e) { if (!isSession(e)) fill(err, alertBox(errText(e))); } finally { createBtn.disabled = false; }
  });
  return [
    field(t('searchClient'), search), results,
    h('details', { class: 'card fold' }, h('summary', { class: 'h3' }, `+ ${t('newClient')}`),
      field(t('fullName'), f.name), field(t('phone'), f.phone), field(t('email'), f.email, t('emailHelp')),
      field(`${t('address')} ${t('optional')}`, f.address1),
      h('div', { class: 'two-col' }, field(`${t('city')} ${t('optional')}`, f.city), field(`${t('postal')} ${t('optional')}`, f.postalCode)),
      err, h('div', { class: 'final-btns' }, createBtn)),
  ];
}

/* ---------- Paso 2: equipo (catégorie → marque → capacité → modèle) ---------- */
function renderStep2(paint) {
  const cat = C();
  const out = [];
  if (Q.items.length) {
    out.push(h('p', { class: 'h2' }, t('chosenEquipment')),
      h('ul', { class: 'pick-list' }, Q.items.map((it) => {
        const p = product(it.productId) || it.snap || {};
        return h('li', { class: 'card eq-chosen' },
          h('div', {}, h('div', { class: 'pick-name' }, p.name), h('div', { class: 'pick-sub' }, [catName(category(p.categoryId)), capText(p), p.model].filter(Boolean).join(' · '))),
          confirmBtn(t('removeLine'), t('confirmRemove'), async () => { Q.items = Q.items.filter((x) => x !== it); save(); paint(); }));
      })));
    if (!Q.pick.open) {
      out.push(h('button', { class: 'btn big', type: 'button', onclick: () => { Q.pick = { open: true }; paint(); } }, t('addAnother')));
      return out;
    }
  }
  const P = Q.pick;
  const prods = cat.products;
  const crumbs = [];
  const choose = (patch) => { Object.assign(Q.pick, { open: true }, patch); save(); paint(); };

  const has = (x) => prods.some((p) => p.categoryId === x.id);
  const count = (x) => prods.filter((p) => p.categoryId === x.id).length;
  const kids = (x) => cat.categories.filter((k) => k.parentId === x.id && has(k));
  const tile = (label, n, onclick) => h('button', { class: 'tile', type: 'button', onclick },
    h('span', { class: 'tile-name' }, label), n != null ? h('span', { class: 'tile-sub' }, t('productsCount', n)) : null);

  if (!P.categoryId) {
    // Sub-secciones (ej. Murale → une zone / Multi-split)
    if (P.parentId) {
      const par = category(P.parentId);
      const subs = [...(has(par) ? [par] : []), ...kids(par)];
      out.push(crumbBar([[catName(par), () => choose({ parentId: null })]]), h('p', { class: 'h2' }, t('pickSubCategory')),
        h('div', { class: 'tiles' }, subs.map((x) => tile(x === par ? `${catName(par)} (${t('singleZone')})` : catName(x), count(x), () => choose({ categoryId: x.id })))));
      return out;
    }
    const tops = cat.categories.filter((x) => (!x.parentId || !category(x.parentId)) && (has(x) || kids(x).length));
    out.push(h('p', { class: 'h2' }, t('pickCategory')),
      tops.length ? h('div', { class: 'tiles' }, tops.map((x) => tile(catName(x), count(x) + kids(x).reduce((n, k) => n + count(k), 0),
        () => (kids(x).length ? choose({ parentId: x.id }) : choose({ categoryId: x.id })))))
        : alertBox(t('noProducts'), 'info'));
    return out;
  }
  const c = category(P.categoryId);
  const par = c.parentId ? category(c.parentId) : P.parentId ? category(P.parentId) : null;
  if (par && par !== c) crumbs.push([catName(par), () => choose({ parentId: null, categoryId: null, brandId: undefined, capacityId: undefined })]);
  crumbs.push([par === c ? `${catName(c)} (${t('singleZone')})` : catName(c), () => choose({ categoryId: null, brandId: undefined, capacityId: undefined })]);
  const inCat = prods.filter((p) => p.categoryId === c.id);

  if (P.brandId === undefined) {
    const brands = cat.brands.filter((b) => b.categoryId === c.id && inCat.some((p) => p.brandId === b.id));
    const hasOther = inCat.some((p) => !p.brandId || !brand(p.brandId));
    out.push(crumbBar(crumbs), h('p', { class: 'h2' }, t('pickBrand')),
      h('div', { class: 'tiles' },
        brands.map((b) => tile(b.name, inCat.filter((p) => p.brandId === b.id).length, () => choose({ brandId: b.id }))),
        hasOther ? tile(t('otherBrand'), null, () => choose({ brandId: null })) : null));
    return out;
  }
  const inBrand = inCat.filter((p) => (P.brandId === null ? !p.brandId || !brand(p.brandId) : p.brandId === P.brandId));
  crumbs.push([P.brandId === null ? t('otherBrand') : brand(P.brandId)?.name, () => choose({ brandId: undefined, capacityId: undefined })]);

  // Capacidad: solo las capacidades que existen (sin «Toutes»); los modelos sin capacidad van debajo
  const caps = cat.capacities.filter((cp) => inBrand.some((p) => p.capacityId === cp.id)).sort((a, b) => a.value - b.value);
  const noCap = inBrand.filter((p) => !p.capacityId || !caps.some((cp) => cp.id === p.capacityId));
  if (P.capacityId === undefined && caps.length > 1) {
    out.push(crumbBar(crumbs), h('p', { class: 'h2' }, t('pickCapacity')),
      h('div', { class: 'tiles caps' },
        caps.map((cp) => h('button', { class: 'tile', type: 'button', onclick: () => choose({ capacityId: cp.id }) }, h('span', { class: 'tile-name' }, capLabel(cp.value, c.unit, S.lang))))));
    if (noCap.length) out.push(h('p', { class: 'h2' }, t('otherModels')), productPicks(noCap, paint));
    return out;
  }
  if (P.capacityId) crumbs.push([capLabel(capacity(P.capacityId)?.value, c.unit, S.lang), () => choose({ capacityId: undefined })]);
  const list = inBrand.filter((p) => !P.capacityId || p.capacityId === P.capacityId);
  out.push(crumbBar(crumbs), h('p', { class: 'h2' }, t('pickProduct')), list.length ? productPicks(list, paint) : alertBox(t('noProducts'), 'info'));
  return out;
}
// Variantes du même équipement (ex. add-on York HH8 3 T: largeur du cabinet et position): le début commun du nom
// passe en petit et la différence (« cabinet 21" multiposition – CTM36C5CDS1 ») devient le titre de la tuile.
function commonHead(names) {
  if (names.length < 2) return '';
  const parts = names.map((n) => n.split(' – '));
  let k = 0;
  while (parts.every((x) => x.length > k + 1 && x[k] === parts[0][k])) k++;
  return k ? `${parts[0].slice(0, k).join(' – ')} – ` : '';
}
const productPicks = (list, paint) => {
  const head = commonHead(list.map((p) => p.name));
  return h('ul', { class: 'pick-list' }, list.map((p) => h('li', {}, h('button', {
    class: 'pick', type: 'button', onclick: () => { addProduct(p); save(); paint(); window.scrollTo(0, 0); },
  }, head ? h('span', { class: 'pick-pre' }, head.replace(/ – $/, '')) : null,
  h('span', { class: 'pick-name' }, head ? p.name.slice(head.length) : p.name),
  h('span', { class: 'pick-sub' }, [capText(p), p.model, p.basePrice > 0 ? `${t('basePrice')}: ${m(p.basePrice)}` : t('priceBySeller')].filter(Boolean).join(' · '))))));
};
const crumbBar = (crumbs) => h('div', { class: 'crumbs' }, crumbs.map(([label, fn]) => h('button', { class: 'crumb', type: 'button', onclick: fn }, `✕ ${label}`)));

/* ---------- Paso 3: precios y opciones ---------- */
function stepper(value, set, { min = 1, max = 50, label }) {
  const out = h('output', { 'aria-live': 'polite' }, value);
  const upd = (d) => { const v = Math.min(Math.max(Number(out.value || out.textContent) + d, min), max); out.textContent = v; set(v); };
  return h('div', { class: 'stepper', role: 'group', 'aria-label': label },
    h('button', { type: 'button', 'aria-label': t('less'), onclick: () => upd(-1) }, '−'), out,
    h('button', { type: 'button', 'aria-label': t('more'), onclick: () => upd(1) }, '+'));
}
const moneyInput = (value, onInput, props = {}) => {
  const el = input({ type: 'text', inputmode: 'decimal', autocomplete: 'off', class: 'in num', value, ...props });
  el.addEventListener('input', () => { onInput(el.value); save(); refreshNumbers(); });
  return el;
};

function renderStep3(paint) {
  const pct = pctOf(Q.seller);
  const { lines } = draftLines();
  const eqCards = Q.items.map((it, i) => {
    const p = product(it.productId) || it.snap || {};
    const bp = Math.max(0, (p.basePrice || 0) - specialCut(it));
    const off = product(it.productId) && p.basePrice > 0 ? specialOf(category(p.categoryId)?.code) : 0;
    // Bouton « Spécial »: change la base (si elle n’a pas été modifiée) et le minimum
    const toggleSpecial = () => {
      const before = Math.max(0, (p.basePrice || 0) - specialCut(it));
      it.special = !it.special;
      const after = Math.max(0, (p.basePrice || 0) - specialCut(it));
      if (Math.abs(num(it.base) - before) < 0.005) it.base = String(after).replace('.', ',');
      save(); paint();
    };
    return h('div', { class: `card line-card${it.special ? ' is-special' : ''}` },
      h('div', { class: 'pick-name' }, p.name),
      h('div', { class: 'pick-sub' }, [catName(category(p.categoryId)), capText(p), p.model].filter(Boolean).join(' · ')),
      h('div', { class: 'price-qty' },
        field(t('yourPrice'), moneyInput(it.base, (v) => { it.base = v; }, { id: `price-${it.key}`, placeholder: '0,00' })),
        h('div', { class: 'fld' }, h('span', { class: 'f' }, t('qty')), stepper(it.qty, (v) => { it.qty = v; save(); refreshNumbers(); }, { label: t('qty') }))),
      h('p', { class: 'need msg err', 'data-need': it.key, hidden: true }, t('needPrice')),
      h('p', { class: 'msg warn', 'data-low': it.key, hidden: !(bp > 0 && num(it.base) < bp) }, `${t('belowBase')}: ${m(bp)}`),
      // Comisión: la elige el vendedor (por unidad). Se suma a su precio; el cliente nunca la ve.
      h('div', { class: 'comm-box' },
        field(t('yourCommission'), moneyInput(it.commission ?? (lines[i].commissionUnit ? String(lines[i].commissionUnit).replace('.', ',') : ''), (v) => { it.commission = v; },
          { 'data-comm-in': it.key, placeholder: '0,00' }), pct > 0 ? t('commissionHelpPct', String(pct).replace('.', ',')) : t('commissionHelpSeller')),
        // « Directeur des ventes »: ligne interne (activée par l’admin dans les Réglages), ajoutée au prix
        directeurOn() || it.hadDirecteur ? field(t('directeur'), moneyInput(it.directeur || '', (v) => { it.directeur = v; }, { 'data-dir-in': it.key, placeholder: '0,00' }), t('directeurHelp')) : null),
      off > 0 && S.user.isAdmin ? h('div', { class: 'special-box' },
        h('button', { class: `btn special-btn${it.special ? ' on' : ''}`, type: 'button', 'aria-pressed': String(!!it.special), onclick: toggleSpecial },
          it.special ? `✓ ${t('special')}` : t('special')),
        h('p', { class: 'muted small' }, t('specialHelp', m(off), category(p.categoryId)?.code === 'steffes' ? '5 000 $ → 4 000 $' : '3 000 $ → 2 500 $'))) : null,
      off > 0 && !S.user.isAdmin && it.special ? h('p', { class: 'chip special-chip' }, t('specialOn')) : null,
      h('div', { class: 'client-price' },
        h('span', {}, t('clientPrice')), h('strong', { 'data-client': it.key }, m(lines[i].price))),
      lines[i].minPrice > 0 ? h('p', { class: `min-line${lines[i].price < lines[i].minPrice ? ' warn' : ''}`, 'data-min': it.key }, `${t('minClient')}: ${m(lines[i].minPrice)}`) : null);
  });

  // Opciones que aplican a las categorías/marcas elegidas (vacío = todas)
  const catIds = new Set(Q.items.map((it) => product(it.productId)?.categoryId).filter(Boolean));
  const brandIds = new Set(Q.items.map((it) => product(it.productId)?.brandId).filter(Boolean));
  const applies = (a) => (!a.categoryIds?.length || a.categoryIds.some((x) => catIds.has(x))) && (!a.brandIds?.length || a.brandIds.some((x) => brandIds.has(x)));
  const avail = [...C().addons.filter(applies), ...Object.keys(Q.addons).map(Number).filter((id) => !C().addons.some((a) => a.id === id)).map((id) => ({ id, ...Q.addons[id].snap }))];
  const groups = KIND_ORDER.map((k) => [k, avail.filter((a) => a.kind === k)]).filter(([, l]) => l.length);

  const optRow = (a) => {
    const on = !!Q.addons[a.id];
    const v = Q.addons[a.id];
    const priceTxt = a.editable ? '' : `${m(a.price)}${a.priceMode === 'per_foot' ? ` ${t('perFoot')}` : a.priceMode === 'per_head' ? ` ${t('perHead')}` : ''}`;
    const taxTxt = a.tax === 'included' ? t('taxIncl') : a.tax === 'none' ? t('noTax') : '';
    return h('div', { class: on ? 'opt on' : 'opt' },
      checkRow(h('span', {}, h('span', { class: 'opt-name' }, a.name), h('span', { class: 'opt-sub' }, [priceTxt, taxTxt].filter(Boolean).join(' · '))), on, (yes) => {
        if (yes) Q.addons[a.id] = { qty: a.priceMode === 'per_foot' ? 25 : 1, price: String(a.price ?? 0) };
        else delete Q.addons[a.id];
        save(); paint();
      }),
      on ? h('div', { class: 'opt-edit' },
        a.priceMode === 'per_foot'
          ? field(t('feet'), (() => { const el = input({ type: 'text', inputmode: 'numeric', class: 'in num short', value: v.qty }); el.addEventListener('input', () => { const n = Math.round(num(el.value)); if (n >= 1 && n <= 500) { v.qty = n; save(); refreshNumbers(); } }); return el; })())
          : h('div', { class: 'fld' }, h('span', { class: 'f' }, a.priceMode === 'per_head' ? t('heads') : t('qty')), stepper(v.qty, (n) => { v.qty = n; save(); refreshNumbers(); }, { label: t('qty') })),
        a.editable ? field(a.priceMode === 'per_foot' ? `${t('price')} (${t('perFoot')})` : t('price'), moneyInput(v.price, (x) => { v.price = x; }, { class: 'in num short' })) : null) : null);
  };

  const isAdm = S.user.isAdmin;
  const sellers = S.sellers || [];
  return h('div', { class: 'ed-layout', 'data-view': 'edit' },
    h('div', { class: 'ed-col' },
      eqCards,
      h('button', { class: 'link', type: 'button', onclick: () => { Q.pick = { open: true }; save(); go('new/2'); } }, t('addAnother')),
      groups.length ? [h('p', { class: 'h2' }, t('options')), groups.map(([k, list]) => h('fieldset', { class: 'card opts' },
        h('legend', { class: 'h3' }, t(`kind_${k}`)), list.map(optRow)))] : null,
      h('div', { class: 'card' },
        isAdm
          ? field(t('seller'), (() => { const el = select(sellers.map((s) => [s.name, s.display]), Q.seller); el.addEventListener('change', () => { Q.seller = el.value; save(); paint(); }); return el; })())
          : h('div', { class: 'fld' }, h('span', { class: 'f' }, t('seller')), h('p', { class: 'pick-name' }, sellerName(Q.seller) || S.user.display)),
        h('div', { class: 'fld' }, h('span', { class: 'f' }, t('pdfLang')),
          h('div', { class: 'segs two' }, [['fr', 'Français'], ['en', 'English']].map(([code, label]) => h('button', {
            type: 'button', class: Q.lang === code ? 'seg on' : 'seg', 'aria-pressed': String(Q.lang === code), onclick: () => { Q.lang = code; save(); paint(); },
          }, label)))),
        field(t('notes'), (() => { const el = textarea({ value: Q.notes, maxLength: 2000 }); el.addEventListener('input', () => { Q.notes = el.value; save(); refreshNumbers(); }); return el; })(), t('notesHelp')),
        field(t('internalNote'), (() => { const el = textarea({ value: Q.internalNote, maxLength: 2000, class: 'in internal' }); el.addEventListener('input', () => { Q.internalNote = el.value; save(); }); return el; })(), t('internalHelp')))),
    previewCol());
}

const preview = () => {
  const { lines, totals: tt } = draftLines();
  return docPreview({ doc: C().doc, lang: Q.lang, number: Q.number, issueDate: Q.issueDate, sellerName: sellerName(Q.seller), client: Q.contact, lines, totals: tt, notes: Q.notes });
};
const previewCol = () => h('div', { class: 'pv-col' },
  h('details', { class: 'pv-fold card', open: window.matchMedia?.('(min-width: 1100px)').matches },
    h('summary', { class: 'h3' }, t('pdfPreview')),
    h('div', { class: 'pv-sticky', 'data-preview': '' }, preview())));

/* ---------- Paso 4: verificar y enviar ---------- */
function renderStep4() {
  const { lines, totals: tt } = draftLines();
  const c = Q.contact;
  const err = h('div');
  const canEmail = !!c.email;
  const canSms = !!c.phone;
  if (!canEmail) Q.channels.email = false;
  if (!canSms) Q.channels.sms = false;
  const locked = Q.id && !['draft', 'sent', 'reminder'].includes(Q.status) && !S.user.isAdmin;

  const submit = async (send, btn) => {
    const missing = Q.items.find((it) => !(num(it.base) > 0));
    if (missing) { go('new/3'); return; }
    const channels = Object.entries(Q.channels).filter(([, v]) => v).map(([k]) => k);
    if (send && !channels.length) { fill(err, alertBox(t('pickChannel'))); return; }
    btn.disabled = true;
    fill(err);
    try {
      let est; let warnings = []; let sent = [];
      if (Q.id) {
        est = (await api('PUT', `estimates?id=${Q.id}`, payload())).estimate;
        if (send) {
          const x = await api('POST', `estimates?id=${Q.id}&action=send`, { channels });
          est = x.estimate; warnings = x.warnings; sent = x.sent;
        }
      } else {
        const x = await api('POST', 'estimates', { ...payload(), send, channels });
        est = x.estimate; warnings = x.warnings; sent = x.sent;
      }
      resetDraft();
      const ws = warnText(warnings);
      flash([send && sent.length ? t('sentTo', sent.map((s) => (s === 'email' ? t('byEmail') : t('bySms'))).join(' + ')) : t('saved'), ...ws].join(' '), ws.length ? 'warn' : 'ok');
      go(`q/${est.id}`);
    } catch (e) {
      if (!isSession(e)) fill(err, alertBox(errText(e)));
      btn.disabled = false;
    }
  };
  const draftBtn = h('button', { class: 'btn big', type: 'button' }, Q.id ? t('saveChanges') : t('saveDraft'));
  draftBtn.addEventListener('click', () => submit(false, draftBtn));
  const sendBtn = h('button', { class: 'btn big hi', type: 'button', disabled: !canEmail && !canSms }, Q.id && Q.status !== 'draft' ? t('actResend') : t('sendNow'));
  sendBtn.addEventListener('click', () => submit(true, sendBtn));
  const pdfBtn = h('button', { class: 'btn big primary', type: 'button' }, `📄 ${t('previewPdf')}`);
  pdfBtn.addEventListener('click', () => openPreviewPdf(pdfBtn, err));

  return h('div', { class: 'ed-layout', 'data-view': 'edit' },
    h('div', { class: 'ed-col' },
      h('div', { class: 'card' },
        h('p', { class: 'muted' }, t('client')), h('p', { class: 'client-name' }, c.name),
        h('p', { class: 'pick-sub' }, [c.phone, c.email].filter(Boolean).join(' · ')),
        h('p', { class: 'muted' }, `${t('seller')}: ${sellerName(Q.seller)} · ${t('pdfLang')}: ${Q.lang === 'en' ? 'English' : 'Français'}`)),
      h('div', { class: 'card' },
        // Cada línea con su descripción (lo que el cliente verá en el PDF)
        h('ul', { class: 'summary sum-lines' }, lines.map((l) => h('li', { class: 'sum-line' },
          h('div', { class: 'sum-head' }, h('span', {}, `${l.unit === 'ft' ? `${l.qty} ${t('ftShort')}` : `${l.qty} ×`} ${l.name}`), h('span', {}, m(l.amount))),
          l.model ? h('div', { class: 'muted small' }, `${t('modelLabel')}: ${l.model}`) : null,
          l.description ? richText(l.description, 'rt line-desc') : null))),
        h('ul', { class: 'summary' },
          h('li', {}, h('span', {}, t('subtotal')), h('span', {}, m(tt.subtotal))),
          h('li', {}, h('span', {}, 'TPS (5 %)'), h('span', {}, m(tt.tps))),
          h('li', {}, h('span', {}, 'TVQ (9,975 %)'), h('span', {}, m(tt.tvq)))),
        h('div', { class: 'grand' }, h('span', {}, t('total')), h('strong', {}, m(tt.total))),
        tt.commission > 0 ? h('p', { class: 'muted small' }, `${t('commissionInt')}: ${m(tt.commission)}`) : null,
        tt.directeur > 0 ? h('p', { class: 'muted small' }, `${t('directeurInt')}: ${m(tt.directeur)}`) : null),
      locked ? alertBox(t('locked'), 'warn') : [
        !canEmail && !canSms ? alertBox(t('noContactInfo'), 'warn') : h('fieldset', { class: 'card' },
          h('legend', { class: 'h3' }, t('sendBy')),
          checkRow(`${t('byEmail')}${canEmail ? ` — ${c.email}` : ''}`, Q.channels.email, (v) => { Q.channels.email = v; save(); }, { disabled: !canEmail }),
          checkRow(`${t('bySms')}${canSms ? ` — ${c.phone}` : ''}`, Q.channels.sms, (v) => { Q.channels.sms = v; save(); }, { disabled: !canSms })),
        err,
        h('div', { class: 'final-btns' }, pdfBtn, sendBtn, draftBtn)]),
    previewCol());
}

// Abre el PDF real (generado por el servidor, sin guardar) en otra pestaña.
// La pestaña se abre antes de esperar: Safari (iPhone) bloquea las que se abren después.
async function openPreviewPdf(btn, err) {
  if (btn.disabled) return;
  const w = window.open('', '_blank');
  try { w?.document.write(`<p style="font:20px system-ui,sans-serif;padding:24px">${t('loading')}</p>`); } catch {}
  btn.disabled = true;
  fill(err);
  try {
    const r = await fetch('/api/estimates?preview=1', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload(), id: Q.id || undefined }),
    });
    if (!r.ok) {
      let msg = t('error');
      try { const d = await r.json(); if (r.status === 400 && d.error) msg = d.error; } catch {}
      throw new Error(msg);
    }
    const url = URL.createObjectURL(await r.blob());
    if (w && !w.closed) w.location.href = url; else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    try { w?.close(); } catch {}
    fill(err, alertBox(e.message || t('error')));
  } finally { btn.disabled = false; }
}

export const _test = { draftLines, payload, Q: () => Q, r2, clientPrice };
