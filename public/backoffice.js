// Back Office (solo admin): catálogo, vendedores y ajustes.
import {
  S, t, m, h, fill, alertBox, api, errText, isSession, go, flash, render, num,
  page, backLink, loadingBox, field, input, textarea, select, checkRow, busyBtn, confirmBtn,
} from './core.js';
import { capLabel, ecoBase, PRICE_RULES, MULTIPLIERS, minMargin, r2 } from './pricing.js';
import { richText } from './preview.js';

const KINDS = ['warranty', 'lineset', 'electrical', 'accessory', 'credit'];
const catName = (c) => (c ? (S.lang === 'en' ? c.nameEn || c.nameFr : c.nameFr) : '');
const loadAll = async () => { const c = await api('GET', 'catalog?all=1'); S.cat = null; return c; };
const offChip = (active) => (active === false ? h('span', { class: 'chip off' }, t('inactive')) : null);
const saved = (to) => { S.cat = null; flash(t('saved')); go(to); };

/* ================= Catálogo ================= */
export function viewCatalog(tab = 'products') {
  const box = h('div', {}, loadingBox());
  const tabs = [['products', t('tabProducts')], ['options', t('tabOptions')], ['categories', t('tabCategories')]];
  (async () => {
    try {
      const c = await loadAll();
      fill(box, tab === 'options' ? optionsTab(c) : tab === 'categories' ? categoriesTab(c) : productsTab(c));
    } catch (e) { if (!isSession(e)) fill(box, alertBox(errText(e))); }
  })();
  return h('main', { class: 'page wide-list' },
    h('h1', {}, t('catalog')),
    h('div', { class: 'segs three sub-tabs' }, tabs.map(([k, label]) => h('a', { class: k === tab ? 'seg on' : 'seg', href: `#/catalog/${k}`, 'aria-current': k === tab ? 'page' : null }, label))),
    box);
}

// Lista de verificación del documento ECOAIR: precio base, modelo y descripción
const incomplete = (p) => !(p.basePrice > 0) || !p.model || !String(p.descriptionFr || '').trim();

function productsTab(c) {
  const list = h('ul', { class: 'quotes' });
  const catSel = select([['', t('all')], ...c.categories.map((x) => [x.id, catName(x)])], '');
  const q = input({ type: 'search', placeholder: t('search'), 'aria-label': t('search') });
  const brandOf = (id) => c.brands.find((b) => b.id === id);
  const capOf = (p) => { const cp = c.capacities.find((x) => x.id === p.capacityId); return cp ? capLabel(cp.value, c.categories.find((x) => x.id === p.categoryId)?.unit, S.lang) : ''; };
  const paint = () => {
    const needle = q.value.trim().toLowerCase();
    const rows = c.products.filter((p) => (!catSel.value || p.categoryId === Number(catSel.value)) && (!needle || `${p.name} ${p.model}`.toLowerCase().includes(needle)));
    fill(list, rows.length ? rows.map((p) => h('li', {}, h('a', { class: 'quote link-card', href: `#/catalog/p/${p.id}` },
      h('div', {},
        h('div', { class: 'q-who' }, p.name, offChip(p.active), incomplete(p) ? h('span', { class: 'chip todo' }, t('toComplete')) : null),
        h('div', { class: 'q-what' }, [catName(c.categories.find((x) => x.id === p.categoryId)), brandOf(p.brandId)?.name, capOf(p), p.model].filter(Boolean).join(' · '))),
      h('div', { class: 'q-amt' }, p.basePrice > 0 ? m(p.basePrice) : '—', p.minPrice > 0 ? h('span', { class: 'q-min' }, `${t('minShort')} ${m(p.minPrice)}`) : null))))
      : h('p', { class: 'empty' }, t('noProducts')));
  };
  catSel.addEventListener('change', paint);
  q.addEventListener('input', paint);
  paint();
  return [
    h('a', { class: 'btn big hi', href: '#/catalog/p/new' }, t('newProduct')),
    h('div', { class: 'two-col' }, field(t('category'), catSel), field(t('search'), q)),
    h('p', { class: 'muted' }, t('productsCount', c.products.length), c.products.some(incomplete) ? ` · ${t('toCompleteCount', c.products.filter(incomplete).length)}` : ''),
    list,
  ];
}

function optionsTab(c) {
  return [
    h('a', { class: 'btn big hi', href: '#/catalog/o/new' }, t('newOption')),
    KINDS.map((k) => {
      const list = c.addons.filter((a) => a.kind === k);
      return [h('p', { class: 'h2' }, t(`kind_${k}`), ` (${list.length})`),
        list.length ? h('ul', { class: 'quotes' }, list.map((a) => h('li', {}, h('a', { class: 'quote link-card', href: `#/catalog/o/${a.id}` },
          h('div', {},
            h('div', { class: 'q-who' }, a.name, offChip(a.active)),
            h('div', { class: 'q-what' }, [t(`pm_${a.priceMode}`), t(`tax_${a.tax}`), a.editable ? t('editableShort') : null,
              a.categoryIds.length ? a.categoryIds.map((id) => catName(c.categories.find((x) => x.id === id))).filter(Boolean).join(', ') : t('all')].filter(Boolean).join(' · '))),
          h('div', { class: 'q-amt' }, m(a.price)))))) : h('p', { class: 'muted' }, t('none'))];
    }),
  ];
}

function categoriesTab(c) {
  const err = h('div');
  const refresh = () => render();
  const card = (cat) => {
    const brands = c.brands.filter((b) => b.categoryId === cat.id);
    const nb = input({ placeholder: t('brand'), 'aria-label': t('newBrand') });
    return h('details', { class: 'card fold' },
      h('summary', { class: 'h3' }, catName(cat), ' ', h('span', { class: 'muted small' }, `· ${t(`unit_${cat.unit}`)} · ${t('productsCount', c.products.filter((p) => p.categoryId === cat.id).length)}`), offChip(cat.active)),
      categoryForm(cat, err, c.categories),
      h('p', { class: 'h3 top-gap' }, t('brand')),
      h('p', { class: 'muted small' }, t('capHelp')),
      brands.map((b) => {
        const caps = c.capacities.filter((x) => x.brandId === b.id).sort((x, y) => x.value - y.value);
        const nc = input({ inputmode: 'decimal', placeholder: cat.unit === 'btu' ? '12000' : '3', class: 'in num short', 'aria-label': t('newCapacity') });
        return h('div', { class: 'brand-row' },
          h('div', { class: 'line-top' },
            h('strong', {}, b.name, offChip(b.active)),
            h('div', { class: 'tools' },
              busyBtn(b.active ? t('deactivate') : t('activate'), 'tool', async () => { await api('PUT', `catalog?type=brand&id=${b.id}`, { ...b, active: !b.active }); refresh(); }, err),
              confirmBtn(t('delete'), t('confirmDelete'), async () => { try { const r = await api('DELETE', `catalog?type=brand&id=${b.id}`); if (r.deactivated) flash(t('deactivated'), 'warn'); refresh(); } catch (e) { if (!isSession(e)) fill(err, alertBox(errText(e))); } }))),
          cat.unit !== 'none' ? h('div', { class: 'caps-row' },
            caps.map((cp) => h('button', {
              type: 'button', class: cp.active ? 'capchip on' : 'capchip', 'aria-pressed': String(cp.active),
              onclick: async () => { try { await api('PUT', `catalog?type=capacity&id=${cp.id}`, { brandId: b.id, value: cp.value, active: !cp.active }); refresh(); } catch (e) { if (!isSession(e)) fill(err, alertBox(errText(e))); } },
            }, capLabel(cp.value, cat.unit, S.lang))),
            h('span', { class: 'add-cap' }, nc, busyBtn(t('add'), 'tool', async () => {
              const v = num(nc.value);
              if (!(v > 0)) return;
              await api('POST', 'catalog?type=capacity', { brandId: b.id, value: v, active: true }); refresh();
            }, err))) : null);
      }),
      h('div', { class: 'add-brand' }, nb, busyBtn(t('newBrand'), 'tool', async () => {
        if (!nb.value.trim()) return;
        await api('POST', 'catalog?type=brand', { categoryId: cat.id, name: nb.value.trim() }); refresh();
      }, err)));
  };
  const newCat = h('details', { class: 'card fold' }, h('summary', { class: 'h3' }, t('newCategory')), categoryForm(null, err, c.categories));
  return [err, c.categories.map(card), newCat];
}

function categoryForm(cat, err, all = []) {
  // Sección madre: un solo nivel (ej. Multi-split dentro de Murale)
  const parents = all.filter((x) => !x.parentId && x.id !== cat?.id);
  const f = {
    parent: select([['', t('noParent')], ...parents.map((x) => [x.id, catName(x)])], cat?.parentId ?? ''),
    code: input({ value: cat?.code || '', autocapitalize: 'none' }), nameFr: input({ value: cat?.nameFr || '' }), nameEn: input({ value: cat?.nameEn || '' }),
    unit: select([['ton', t('unit_ton')], ['btu', t('unit_btu')], ['none', t('unit_none')]], cat?.unit || 'ton'),
    sort: input({ value: cat?.sort ?? 0, inputmode: 'numeric', class: 'in num short' }),
  };
  let active = cat ? cat.active : true;
  return h('div', {},
    h('div', { class: 'two-col' }, field(t('nameFr'), f.nameFr), field(t('nameEn'), f.nameEn)),
    h('div', { class: 'two-col' }, field(t('code'), f.code), field(t('unit'), f.unit)),
    field(t('sortOrder'), f.sort),
    field(t('parentSection'), f.parent, t('parentHelp')),
    checkRow(t('active'), active, (v) => { active = v; }),
    h('div', { class: 'tools' }, busyBtn(t('save'), 'primary', async () => {
      const body = { code: f.code.value || f.nameFr.value, nameFr: f.nameFr.value, nameEn: f.nameEn.value, unit: f.unit.value, sort: Number(f.sort.value) || 0, active, parentId: f.parent.value ? Number(f.parent.value) : null };
      await api(cat ? 'PUT' : 'POST', `catalog?type=category${cat ? `&id=${cat.id}` : ''}`, body);
      flash(t('saved')); render();
    }, err)));
}

// Área de texto con botones "+ Titre" y "+ Puce" y vista previa del formato
function richArea(value, onInput) {
  const ta = textarea({ value, class: 'in desc' });
  const pv = h('div', { class: 'rt-preview' }, richText(value));
  const sync = () => { onInput(ta.value); fill(pv, richText(ta.value)); };
  ta.addEventListener('input', sync);
  const ins = (prefix) => {
    const pos = ta.selectionStart ?? ta.value.length;
    const before = ta.value.slice(0, pos);
    const nl = before && !before.endsWith('\n') ? '\n' : '';
    ta.value = `${before}${nl}${prefix}${ta.value.slice(pos)}`;
    const at = before.length + nl.length + prefix.length;
    ta.focus(); ta.setSelectionRange(at, at); sync();
  };
  return h('div', { class: 'desc-box' },
    h('div', { class: 'tools' },
      h('button', { class: 'btn tool', type: 'button', onclick: () => ins('# ') }, t('toolTitle')),
      h('button', { class: 'btn tool', type: 'button', onclick: () => ins('• ') }, t('toolBullet')),
      h('span', { class: 'muted small' }, t('descHelp'))),
    ta, h('details', { class: 'fold' }, h('summary', { class: 'link' }, t('pdfPreview')), pv));
}

/* ---------- Producto ---------- */
export function viewProductEdit(id) {
  const main = page(backLink('catalog/products'), loadingBox());
  (async () => {
    try {
      const c = await loadAll();
      const p = id === 'new' ? null : c.products.find((x) => x.id === Number(id));
      if (id !== 'new' && !p) return fill(main, backLink('catalog/products'), alertBox(t('notFound')));
      fill(main, backLink('catalog/products'), productForm(c, p));
    } catch (e) { if (!isSession(e)) fill(main, backLink('catalog/products'), alertBox(errText(e))); }
  })();
  return main;
}

function productForm(c, p) {
  const d = p ? structuredClone(p) : { categoryId: c.categories[0]?.id, brandId: null, capacityId: null, name: '', model: '', descriptionFr: '', descriptionEn: '', basePrice: 0, minPrice: 0, ahri: '', subsidy: 0, heads: null, attachments: [], defaultAddons: [], active: true, sort: 0 };
  const err = h('div');
  const brandBox = h('div');
  const capBox = h('div');
  const unitOf = () => c.categories.find((x) => x.id === Number(d.categoryId))?.unit;

  const paintCaps = () => {
    const caps = c.capacities.filter((x) => x.brandId === Number(d.brandId)).sort((a, b) => a.value - b.value);
    const sel = select([['', t('noCapacity')], ...caps.map((x) => [x.id, `${capLabel(x.value, unitOf(), S.lang)}${x.active ? '' : ` (${t('inactive')})`}`])], d.capacityId ?? '');
    sel.addEventListener('change', () => { d.capacityId = sel.value ? Number(sel.value) : null; });
    if (!caps.some((x) => x.id === d.capacityId)) d.capacityId = null;
    fill(capBox, field(t('capacity'), sel));
  };
  const paintBrands = () => {
    const brands = c.brands.filter((b) => b.categoryId === Number(d.categoryId));
    const sel = select([['', t('noBrand')], ...brands.map((b) => [b.id, b.name])], d.brandId ?? '');
    sel.addEventListener('change', () => { d.brandId = sel.value ? Number(sel.value) : null; paintCaps(); });
    if (!brands.some((b) => b.id === d.brandId)) d.brandId = null;
    fill(brandBox, field(t('brand'), sel));
    paintCaps();
  };
  const catSel = select(c.categories.map((x) => [x.id, catName(x)]), d.categoryId);
  catSel.addEventListener('change', () => { d.categoryId = Number(catSel.value); paintBrands(); });
  paintBrands();

  const txt = (k, props = {}) => { const el = input({ value: d[k] ?? '', ...props }); el.addEventListener('input', () => { d[k] = el.value; }); return el; };

  // Fichas técnicas
  const attBox = h('div');
  const paintAtt = () => fill(attBox, d.attachments.map((a, i) => h('div', { class: 'att-row' },
    (() => { const el = input({ value: a.name, placeholder: t('attName'), 'aria-label': t('attName') }); el.addEventListener('input', () => { a.name = el.value; }); return el; })(),
    (() => { const el = input({ value: a.url, placeholder: 'https://', type: 'url', 'aria-label': t('attUrl') }); el.addEventListener('input', () => { a.url = el.value; }); return el; })(),
    h('button', { class: 'link danger', type: 'button', onclick: () => { d.attachments.splice(i, 1); paintAtt(); } }, t('removeLine')))),
  h('button', { class: 'btn tool', type: 'button', onclick: () => { d.attachments.push({ name: '', url: '' }); paintAtt(); } }, t('addAttachment')));
  paintAtt();

  // Opciones por defecto
  const defBox = h('div');
  const paintDefs = () => fill(defBox, KINDS.map((k) => {
    const list = c.addons.filter((a) => a.kind === k && (a.active || d.defaultAddons.some((x) => x.addonId === a.id)));
    if (!list.length) return null;
    return [h('p', { class: 'muted small kind-label' }, t(`kind_${k}`)), list.map((a) => {
      const cur = d.defaultAddons.find((x) => x.addonId === a.id);
      return h('div', { class: cur ? 'opt on' : 'opt' },
        checkRow(h('span', {}, h('span', { class: 'opt-name' }, a.name), h('span', { class: 'opt-sub' }, m(a.price))), !!cur, (v) => {
          if (v) d.defaultAddons.push({ addonId: a.id, ...(a.editable ? { price: a.price } : {}) });
          else d.defaultAddons = d.defaultAddons.filter((x) => x.addonId !== a.id);
          paintDefs();
        }),
        cur && a.editable ? h('div', { class: 'opt-edit' }, field(t('price'), (() => {
          const el = input({ value: cur.price ?? a.price, inputmode: 'decimal', class: 'in num short' });
          el.addEventListener('input', () => { cur.price = el.value; });
          return el;
        })())) : null);
    })];
  }));
  paintDefs();

  const base = txt('basePrice', { inputmode: 'decimal', class: 'in num short', value: d.basePrice || '' });
  const minP = txt('minPrice', { inputmode: 'decimal', class: 'in num short', value: d.minPrice || '' });
  const ahri = txt('ahri', { inputmode: 'numeric', class: 'in num short', maxLength: 40 });
  const subsidy = txt('subsidy', { inputmode: 'decimal', class: 'in num short', value: d.subsidy || '' });
  const heads = txt('heads', { inputmode: 'numeric', class: 'in num short', value: d.heads ?? '' });
  const calc = priceCalculator(c, d, (b, mn) => { d.basePrice = b; d.minPrice = mn; base.value = String(b).replace('.', ','); minP.value = String(mn).replace('.', ','); });

  return [
    h('h1', {}, p ? p.name : t('newProduct').replace('+ ', '')),
    p?.fromGhl ? h('p', { class: 'muted small' }, t('fromGhl')) : null,
    h('div', { class: 'card' },
      field(t('category'), catSel), brandBox, capBox,
      field(t('productName'), txt('name', { maxLength: 160 })),
      field(t('model'), txt('model', { maxLength: 80 })),
      h('div', { class: 'two-col' }, field(t('basePriceEcoair'), base, t('basePriceHelp')), field(t('minPrice'), minP, t('minPriceHelp'))),
      calc,
      field(`${t('heads')} ${t('optional')}`, heads)),
    h('div', { class: 'card' }, h('p', { class: 'h3' }, t('rebateTitle')), h('p', { class: 'muted small' }, t('rebateHelp')),
      h('div', { class: 'two-col' }, field(t('ahri'), ahri), field(t('subsidy'), subsidy))),
    h('div', { class: 'card' }, h('p', { class: 'h3' }, t('descFr')), richArea(d.descriptionFr, (v) => { d.descriptionFr = v; })),
    h('details', { class: 'card fold', open: !!d.descriptionEn }, h('summary', { class: 'h3' }, t('descEn')), richArea(d.descriptionEn, (v) => { d.descriptionEn = v; })),
    h('div', { class: 'card' }, h('p', { class: 'h3' }, t('attachments')), attBox),
    h('div', { class: 'card' }, h('p', { class: 'h3' }, t('defaultOptions')), h('p', { class: 'muted small' }, t('defaultOptionsHelp')), defBox),
    h('div', { class: 'card' }, checkRow(t('active'), d.active, (v) => { d.active = v; }), field(t('sortOrder'), txt('sort', { inputmode: 'numeric', class: 'in num short' }))),
    err,
    h('div', { class: 'final-btns' },
      busyBtn(t('save'), 'big hi', async () => {
        if (num(d.minPrice) > 0 && num(d.basePrice) > num(d.minPrice)) throw Object.assign(new Error(t('minBelowBase')), { status: 400 });
        const body = { ...d, basePrice: num(d.basePrice) || 0, minPrice: num(d.minPrice) || 0, subsidy: num(d.subsidy) || 0, heads: d.heads === '' || d.heads == null ? null : Math.round(num(d.heads)) || null, sort: Number(d.sort) || 0 };
        await api(p ? 'PUT' : 'POST', `catalog?type=product${p ? `&id=${p.id}` : ''}`, body);
        saved('catalog/products');
      }, err),
      p ? confirmBtn(t('delete'), t('confirmDelete'), async () => {
        try { const r = await api('DELETE', `catalog?type=product&id=${p.id}`); S.cat = null; flash(r.deactivated ? t('deactivated') : t('done'), r.deactivated ? 'warn' : 'ok'); go('catalog/products'); } catch (e) { if (!isSession(e)) fill(err, alertBox(errText(e))); }
      }) : null),
  ];
}

/* ---------- Calculateur de prix ECOAIR (document « Price Calculation Logic ») ----------
 * Prix de liste des composantes × multiplicateur du fabricant + quincaillerie + main-d’œuvre + profit = base;
 * MINIMUM = base + 1 000 $ (murale + 500 $). Rien n’est enregistré sauf la base et le minimum (jamais le coût). */
function priceCalculator(c, d, apply) {
  const mults = { ...MULTIPLIERS, ...(c.pricing?.multipliers || {}) };
  const catCode = () => c.categories.find((x) => x.id === Number(d.categoryId))?.code;
  const brandName = () => c.brands.find((b) => b.id === Number(d.brandId))?.name || '';
  const st = { rule: PRICE_RULES[catCode()] ? catCode() : 'central', tons: c.capacities.find((x) => x.id === d.capacityId)?.value || 2, parts: [{ label: '', list: '', mult: mults[brandName()] ?? 0.35 }], over: {} };
  const out = h('div', { class: 'calc-out' });
  const partsBox = h('div');
  const paint = () => {
    const equipment = r2(st.parts.reduce((a, p) => a + (num(p.list) || 0) * (num(p.mult) || 0), 0));
    const r = ecoBase(st.rule, { equipment, tons: num(st.tons) || 0, quinc: st.over.quinc, labour: st.over.labour, profit: st.over.profit });
    fill(out, h('ul', { class: 'summary' },
      h('li', {}, h('span', {}, t('calcEquipment')), h('span', {}, m(r.equipment))),
      h('li', {}, h('span', {}, t('calcQuinc')), h('span', {}, m(r.quinc))),
      h('li', {}, h('span', {}, t('calcLabour')), h('span', {}, m(r.labour))),
      h('li', {}, h('span', {}, t('calcProfit')), h('span', {}, m(r.profit))),
      h('li', { class: 'calc-total' }, h('strong', {}, t('basePriceEcoair')), h('strong', {}, m(r.base))),
      h('li', {}, h('span', {}, `${t('minPrice')} (+ ${m(minMargin(st.rule))})`), h('span', {}, m(r.min)))),
    h('button', { class: 'btn hi', type: 'button', onclick: () => apply(r.base, r.min) }, t('calcApply')));
  };
  const paintParts = () => fill(partsBox, st.parts.map((p, i) => h('div', { class: 'calc-part' },
    (() => { const el = input({ value: p.label, placeholder: t('calcPart'), 'aria-label': t('calcPart') }); el.addEventListener('input', () => { p.label = el.value; }); return el; })(),
    (() => { const el = input({ value: p.list, inputmode: 'decimal', class: 'in num short', placeholder: t('calcList'), 'aria-label': t('calcList') }); el.addEventListener('input', () => { p.list = el.value; paint(); }); return el; })(),
    (() => {
      const opts = Object.entries(mults).map(([k, v]) => [String(v), `× ${String(v).replace('.', ',')} (${k})`]);
      const el = select(opts, String(p.mult));
      el.addEventListener('change', () => { p.mult = Number(el.value); paint(); });
      return el;
    })(),
    st.parts.length > 1 ? h('button', { class: 'link danger', type: 'button', onclick: () => { st.parts.splice(i, 1); paintParts(); paint(); } }, t('removeLine')) : null)),
  h('button', { class: 'btn tool', type: 'button', onclick: () => { st.parts.push({ label: '', list: '', mult: st.parts[0]?.mult ?? 0.35 }); paintParts(); } }, t('calcAddPart')));
  const ruleSel = select(Object.keys(PRICE_RULES).map((k) => [k, t(`rule_${k}`)]), st.rule);
  ruleSel.addEventListener('change', () => { st.rule = ruleSel.value; st.over = {}; paint(); });
  const tons = input({ value: String(st.tons).replace('.', ','), inputmode: 'decimal', class: 'in num short' });
  tons.addEventListener('input', () => { st.tons = num(tons.value); paint(); });
  paintParts(); paint();
  return h('details', { class: 'fold calc' }, h('summary', { class: 'link' }, t('calcTitle')),
    h('p', { class: 'muted small' }, t('calcHelp')),
    h('div', { class: 'two-col' }, field(t('calcRule'), ruleSel), field(t('calcTons'), tons)),
    partsBox, out);
}

/* ---------- Opción ---------- */
export function viewAddonEdit(id) {
  const main = page(backLink('catalog/options'), loadingBox());
  (async () => {
    try {
      const c = await loadAll();
      const a = id === 'new' ? null : c.addons.find((x) => x.id === Number(id));
      if (id !== 'new' && !a) return fill(main, backLink('catalog/options'), alertBox(t('notFound')));
      fill(main, backLink('catalog/options'), addonForm(c, a));
    } catch (e) { if (!isSession(e)) fill(main, backLink('catalog/options'), alertBox(errText(e))); }
  })();
  return main;
}

function addonForm(c, a) {
  const d = a ? structuredClone(a) : { kind: 'accessory', name: '', model: '', descriptionFr: '', descriptionEn: '', price: 0, priceMode: 'fixed', tax: 'added', editable: false, categoryIds: [], brandIds: [], active: true, sort: 0 };
  const err = h('div');
  const txt = (k, props = {}) => { const el = input({ value: d[k] ?? '', ...props }); el.addEventListener('input', () => { d[k] = el.value; }); return el; };
  const sel = (k, opts) => { const el = select(opts, d[k]); el.addEventListener('change', () => { d[k] = el.value; }); return el; };
  const brandBox = h('div');
  const paintBrands = () => {
    const brands = c.brands.filter((b) => !d.categoryIds.length || d.categoryIds.includes(b.categoryId));
    fill(brandBox, h('p', { class: 'h3' }, t('brand'), ' ', h('span', { class: 'muted small' }, t('appliesTo'))),
      h('div', { class: 'chips-wrap' }, brands.map((b) => {
        const on = d.brandIds.includes(b.id);
        return h('button', { type: 'button', class: on ? 'capchip on' : 'capchip', 'aria-pressed': String(on), onclick: () => { d.brandIds = on ? d.brandIds.filter((x) => x !== b.id) : [...d.brandIds, b.id]; paintBrands(); } },
          `${b.name} · ${catName(c.categories.find((x) => x.id === b.categoryId))}`);
      })));
  };
  const catChips = h('div', { class: 'chips-wrap' });
  const paintCats = () => fill(catChips, c.categories.map((x) => {
    const on = d.categoryIds.includes(x.id);
    return h('button', { type: 'button', class: on ? 'capchip on' : 'capchip', 'aria-pressed': String(on), onclick: () => { d.categoryIds = on ? d.categoryIds.filter((y) => y !== x.id) : [...d.categoryIds, x.id]; paintCats(); paintBrands(); } }, catName(x));
  }));
  paintCats();
  paintBrands();

  return [
    h('h1', {}, a ? a.name : t('newOption').replace('+ ', '')),
    h('div', { class: 'card' },
      field(t('kind'), sel('kind', KINDS.map((k) => [k, t(`kind_${k}`)]))),
      field(t('optionName'), txt('name', { maxLength: 160 })),
      field(t('model'), txt('model', { maxLength: 80 })),
      h('div', { class: 'two-col' },
        field(t('price'), txt('price', { inputmode: 'decimal', class: 'in num short' }), t('creditHelp')),
        field(t('priceMode'), sel('priceMode', [['fixed', t('pm_fixed')], ['per_head', t('pm_per_head')], ['per_foot', t('pm_per_foot')]]))),
      field(t('taxMode'), sel('tax', [['added', t('tax_added')], ['included', t('tax_included')], ['none', t('tax_none')]])),
      checkRow(t('editable'), d.editable, (v) => { d.editable = v; })),
    h('div', { class: 'card' }, h('p', { class: 'h3' }, t('category'), ' ', h('span', { class: 'muted small' }, t('appliesTo'))), catChips, brandBox),
    h('div', { class: 'card' }, h('p', { class: 'h3' }, t('descFr')), richArea(d.descriptionFr, (v) => { d.descriptionFr = v; })),
    h('details', { class: 'card fold', open: !!d.descriptionEn }, h('summary', { class: 'h3' }, t('descEn')), richArea(d.descriptionEn, (v) => { d.descriptionEn = v; })),
    h('div', { class: 'card' }, checkRow(t('active'), d.active, (v) => { d.active = v; })),
    err,
    h('div', { class: 'final-btns' },
      busyBtn(t('save'), 'big hi', async () => {
        await api(a ? 'PUT' : 'POST', `catalog?type=addon${a ? `&id=${a.id}` : ''}`, { ...d, price: num(d.price) || 0, sort: Number(d.sort) || 0 });
        saved('catalog/options');
      }, err),
      a ? confirmBtn(t('delete'), t('confirmDelete'), async () => {
        try { const r = await api('DELETE', `catalog?type=addon&id=${a.id}`); S.cat = null; flash(r.deactivated ? t('deactivated') : t('done'), r.deactivated ? 'warn' : 'ok'); go('catalog/options'); } catch (e) { if (!isSession(e)) fill(err, alertBox(errText(e))); }
      }) : null),
  ];
}

/* ================= Vendedores ================= */
// readOnly: « Admin View » voit les vendeurs et leurs coordonnées, sans rien modifier
export function viewSellers({ readOnly = false } = {}) {
  const box = h('div', {}, loadingBox());
  (async () => {
    try {
      const { users } = await api('GET', 'admin');
      const inner = (u) => [
        h('div', {}, h('div', { class: 'q-who' }, u.display, offChip(u.active)),
          h('div', { class: 'q-what' }, [u.name, t(`role_${u.role}`), u.email, u.phone].filter(Boolean).join(' · '))),
        h('div', { class: 'q-amt' }, `${String(u.commissionPct).replace('.', ',')} %`)];
      fill(box, h('ul', { class: 'quotes' }, users.map((u) => h('li', {}, readOnly
        ? h('div', { class: 'quote' }, inner(u), u.phone ? h('a', { class: 'btn call', href: `tel:${u.phone.replace(/[^\d+]/g, '')}` }, `☎ ${u.phone}`) : null)
        : h('a', { class: 'quote link-card', href: `#/sellers/${encodeURIComponent(u.name)}` }, inner(u))))));
    } catch (e) { if (!isSession(e)) fill(box, alertBox(errText(e))); }
  })();
  return page(backLink('more'), h('h1', {}, t('sellers')), h('p', { class: 'muted' }, readOnly ? t('sellersViewHelp') : t('sellersHelp')),
    readOnly ? null : h('a', { class: 'btn big hi', href: '#/sellers/new' }, t('newSeller')), box);
}

export function viewSellerEdit(name) {
  const main = page(backLink('sellers'), loadingBox());
  (async () => {
    try {
      const { users } = await api('GET', 'admin');
      const u = name === 'new' ? null : users.find((x) => x.name === name);
      if (name !== 'new' && !u) return fill(main, backLink('sellers'), alertBox(t('notFound')));
      const d = u ? { ...u } : { name: '', display: '', role: 'seller', commissionPct: 0, ghlId: '', email: '', phone: '', active: true };
      const err = h('div');
      const txt = (k, props = {}) => { const el = input({ value: d[k] ?? '', ...props }); el.addEventListener('input', () => { d[k] = el.value; }); return el; };
      const pw = input({ type: 'password', autocomplete: 'new-password' });
      const role = select([['seller', t('role_seller')], ['viewer', t('role_viewer')], ['admin', t('role_admin')]], d.role);
      role.addEventListener('change', () => { d.role = role.value; });
      fill(main, backLink('sellers'),
        h('h1', {}, u ? u.display : t('newSeller').replace('+ ', '')),
        h('div', { class: 'card' },
          field(t('display'), txt('display', { maxLength: 80 })),
          field(t('username'), txt('name', { autocapitalize: 'none', disabled: !!u, maxLength: 40 })),
          field(t('role'), role),
          field(t('commissionPct'), txt('commissionPct', { inputmode: 'decimal', class: 'in num short' }), t('commissionHelp')),
          h('div', { class: 'two-col' }, field(t('email'), txt('email', { type: 'email' })), field(t('phone'), txt('phone', { type: 'tel' }), t('sellerPhoneHelp'))),
          field(t('ghlId'), txt('ghlId', { autocapitalize: 'none' })),
          field(u ? t('setPw') : t('password'), pw, u ? t('setPwHelp') : t('newPw')),
          checkRow(t('active'), d.active, (v) => { d.active = v; })),
        err,
        h('div', { class: 'final-btns' }, busyBtn(t('save'), 'big hi', async () => {
          await api(u ? 'PUT' : 'POST', 'admin?section=users', { ...d, commissionPct: num(d.commissionPct) || 0, password: pw.value || undefined });
          S.sellers = null;
          flash(t('saved')); go('sellers');
        }, err)));
    } catch (e) { if (!isSession(e)) fill(main, backLink('sellers'), alertBox(errText(e))); }
  })();
  return main;
}

/* ================= Ajustes ================= */
export function viewSettings() {
  const main = page(backLink('more'), h('h1', {}, t('settings')), loadingBox());
  (async () => {
    try {
      const { settings: st } = await api('GET', 'admin');
      fill(main, backLink('more'), h('h1', {}, t('settings')), settingsForm(st));
    } catch (e) { if (!isSession(e)) fill(main, backLink('more'), alertBox(errText(e))); }
  })();
  return main;
}

function settingsForm(st) {
  const section = (title, key, build, open = false) => {
    const v = structuredClone(st[key]);
    const err = h('div');
    const { nodes, value } = build(v);
    return h('details', { class: 'card fold', open },
      h('summary', { class: 'h3' }, title),
      nodes, err,
      h('div', { class: 'tools top-gap' }, busyBtn(t('save'), 'primary', async () => {
        const r = await api('PUT', `admin?section=settings&key=${key}`, { value: value() });
        Object.assign(st, r.settings);
        S.cat = null;
        fill(err, alertBox(t('saved'), 'ok'));
      }, err)));
  };
  // Campos de texto sobre un objeto
  const objFields = (labels, extra) => (v) => ({
    nodes: [Object.entries(labels).map(([k, label]) => {
      const multi = k === '_text';
      const el = input({ value: v[k] ?? '' });
      el.addEventListener('input', () => { v[k] = el.value; });
      return multi ? null : field(label, el);
    }), extra ? extra(v) : null],
    value: () => v,
  });
  const textField = (v) => {
    const box = { v };
    return { nodes: [h('div', {}, (() => {
      const ta = textarea({ value: v, class: 'in long' });
      ta.addEventListener('input', () => { box.v = ta.value; });
      return h('div', {}, h('p', { class: 'muted small' }, t('descHelp')), ta);
    })())], value: () => box.v };
  };

  const msgSection = (v) => {
    const nodes = ['send', 'reminder', 'review'].map((kind) => h('details', { class: 'fold sub-fold' },
      h('summary', { class: 'h3' }, t(`msg_${kind}`)),
      ['fr', 'en'].map((lang) => h('div', { class: 'msg-lang' },
        h('p', { class: 'kind-label muted small' }, lang === 'fr' ? 'Français' : 'English'),
        [['subject', input], ['body', textarea], ['sms', textarea]].map(([part, mk]) => {
          const k = `${kind}_${part}_${lang}`;
          const el = mk({ value: v[k] ?? '', class: part === 'sms' ? 'in sms' : 'in' });
          el.addEventListener('input', () => { v[k] = el.value; });
          return field(t(part), el);
        })))));
    return { nodes: [h('p', { class: 'muted small' }, t('messagesHelp')), nodes], value: () => v };
  };

  const reviewSection = (v) => {
    const link = input({ value: v.link || '', type: 'url', placeholder: 'https://g.page/r/…' });
    link.addEventListener('input', () => { v.link = link.value.trim(); });
    v.channels = Array.isArray(v.channels) ? v.channels : ['sms', 'email'];
    const ch = (c, label) => checkRow(label, v.channels.includes(c), (on) => { v.channels = on ? [...new Set([...v.channels, c])] : v.channels.filter((x) => x !== c); });
    return { nodes: [field(t('reviewLink'), link), checkRow(t('reviewAuto'), !!v.auto, (on) => { v.auto = on; }), h('p', { class: 'h3' }, t('sendBy')), ch('email', t('byEmail')), ch('sms', t('bySms'))], value: () => v };
  };

  const ghlSection = (v) => ({
    nodes: [h('p', { class: 'muted small' }, t('ghlHelp')), ['sent', 'accepted', 'paid', 'lost'].map((s) => {
      v[s] = v[s] || {};
      const mk = (k, label) => { const el = input({ value: v[s][k] ?? '', autocapitalize: 'none' }); el.addEventListener('input', () => { v[s][k] = el.value.trim(); }); return field(label, el); };
      const stSel = select([['open', 'open'], ['won', 'won'], ['lost', 'lost']], v[s].status || 'open');
      stSel.addEventListener('change', () => { v[s].status = stSel.value; });
      return h('div', { class: 'ghl-row' }, h('p', { class: 'h3' }, t(`status_${s}`)), mk('pipelineId', t('pipelineId')), mk('stageId', t('stageId')), field(t('oppStatus'), stSel));
    })],
    value: () => v,
  });

  const quoteSection = (v) => {
    const pre = input({ value: v.prefix ?? 'SOU-' });
    const days = input({ value: v.validDays ?? 30, inputmode: 'numeric', class: 'in num short' });
    pre.addEventListener('input', () => { v.prefix = pre.value; });
    days.addEventListener('input', () => { v.validDays = Math.round(num(days.value)) || 30; });
    return { nodes: [h('div', { class: 'two-col' }, field(t('prefix'), pre), field(t('validDays'), days))], value: () => v };
  };

  // Prix: « Directeur des ventes » (désactivé par défaut) et multiplicateurs des fabricants (calculateur du catalogue)
  const pricingSection = (v) => {
    v.multipliers = v.multipliers || {};
    const rows = h('div', { class: 'mult-rows' });
    const paintRows = () => fill(rows, Object.keys(v.multipliers).map((name) => {
      const el = input({ value: String(v.multipliers[name]).replace('.', ','), inputmode: 'decimal', class: 'in num short' });
      el.addEventListener('input', () => { v.multipliers[name] = num(el.value); });
      return h('div', { class: 'mult-row' }, field(name, el),
        h('button', { class: 'link', type: 'button', onclick: () => { delete v.multipliers[name]; paintRows(); } }, t('removeLine')));
    }));
    paintRows();
    const newName = input({ placeholder: t('brand') });
    const add = h('button', { class: 'btn', type: 'button', onclick: () => { const n = newName.value.trim(); if (n && !(n in v.multipliers)) { v.multipliers[n] = 0.35; newName.value = ''; paintRows(); } } }, t('addMultiplier'));
    return {
      nodes: [
        checkRow(t('directeurOn'), !!v.directeur, (on) => { v.directeur = on; }),
        h('p', { class: 'muted small' }, t('directeurSettingHelp')),
        h('p', { class: 'h3 top-gap' }, t('multipliers')), h('p', { class: 'muted small' }, t('multipliersHelp')),
        rows, h('div', { class: 'tools' }, newName, add)],
      value: () => v,
    };
  };

  return [
    section(t('pricingSettings'), 'pricing', pricingSection),
    section(t('reviewSettings'), 'review', reviewSection, !st.review?.link),
    section(t('company'), 'company', objFields({ name: t('company'), legal: t('legal'), address: t('address'), city: t('city'), province: t('province'), postal: t('postal'), phone: t('phone'), email: t('email'), website: t('website'), rbq: t('rbq'), logoUrl: t('logoUrl') })),
    section(t('taxNumbers'), 'tax', objFields({ tps: t('tpsNo'), tvq: t('tvqNo') })),
    section(t('quoteSettings'), 'estimate', quoteSection),
    section(t('termsFr'), 'terms_fr', textField),
    section(t('termsEn'), 'terms_en', textField),
    section(t('messages'), 'messages', msgSection),
    section(t('ghlStages'), 'ghl', ghlSection),
  ];
}
