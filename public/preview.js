// Vista previa del PDF que recibe el cliente (el PDF real lo hace el servidor con el mismo cálculo).
// Se construye con el DOM, sin innerHTML: el texto viene de los vendedores y del catálogo.
import { h, t } from './core.js';
import { money, TPS_RATE, TVQ_RATE } from './pricing.js';

// Las etiquetas siguen el idioma del PDF, no el de la pantalla
const L = {
  fr: { title: 'SOUMISSION', date: 'Date', valid: 'Valide jusqu’au', seller: 'Vendeur', to: 'Soumission pour', qty: 'Qté', model: 'Modèle',
    desc: 'Description', unit: 'Prix unit.', total: 'Total', sub: 'Sous-total', grand: 'TOTAL', taxIncl: 'Taxes incluses', noTax: 'Non taxable',
    notes: 'Notes', terms: 'Conditions', files: 'Fiches techniques', tpsNo: 'N° TPS', tvqNo: 'N° TVQ', cad: 'Montants en dollars canadiens (CAD).',
    ft: 'pi', head: 'tête(s)', sign: 'Acceptation du client', client: 'Nom du client', noLines: 'Choisissez un équipement.' },
  en: { title: 'QUOTE', date: 'Date', valid: 'Valid until', seller: 'Salesperson', to: 'Quote for', qty: 'Qty', model: 'Model',
    desc: 'Description', unit: 'Unit price', total: 'Total', sub: 'Subtotal', grand: 'TOTAL', taxIncl: 'Taxes included', noTax: 'Not taxable',
    notes: 'Notes', terms: 'Terms and conditions', files: 'Spec sheets', tpsNo: 'GST No.', tvqNo: 'QST No.', cad: 'Amounts in Canadian dollars (CAD).',
    ft: 'ft', head: 'head(s)', sign: 'Client acceptance', client: 'Client name', noLines: 'Choose an equipment.' },
};

// Texto con "# Título" y "• punto" → nodos
export function richText(text, cls = 'rt') {
  const box = h('div', { class: cls });
  let ul = null;
  for (const raw of String(text || '').split('\n')) {
    const s = raw.trim();
    if (!s) { ul = null; continue; }
    const bullet = s.match(/^[•\-*]\s+(.*)$/);
    if (bullet) {
      if (!ul) { ul = h('ul'); box.append(ul); }
      ul.append(h('li', {}, bullet[1]));
      continue;
    }
    ul = null;
    const head = s.match(/^#+\s*(.*)$/);
    box.append(head ? h('p', { class: 'rt-h' }, head[1]) : h('p', {}, s));
  }
  return box;
}

const pct = (n, lang) => String(n).replace('.', lang === 'fr' ? ',' : '.');

// model: { doc, lang, number, issueDate, validDays, sellerName, client, lines (con price/amount), totals, notes }
export function docPreview(model) {
  const lang = model.lang === 'en' ? 'en' : 'fr';
  const x = L[lang];
  const mm = (n) => money(n, lang);
  const d = model.doc || {};
  const c = d.company || {};
  const issue = model.issueDate ? new Date(`${model.issueDate}T12:00:00`) : new Date();
  const until = new Date(issue.getTime() + (Number(model.validDays || d.validDays) || 30) * 864e5);
  const fd = (dt) => new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', { dateStyle: 'long', timeZone: 'America/Toronto' }).format(dt);
  const cl = model.client;
  const lines = model.lines || [];
  const tot = model.totals || { subtotal: 0, tps: 0, tvq: 0, total: 0 };
  const files = lines.flatMap((l) => l.attachments || []);

  return h('article', { class: 'doc', 'aria-label': t('pdfPreview') },
    h('header', { class: 'doc-head' },
      h('div', { class: 'doc-biz' },
        c.logoUrl ? h('img', { class: 'doc-logo', src: c.logoUrl, alt: c.name || '' }) : null,
        h('div', { class: 'doc-biz-name' }, c.name || ''),
        [c.address, [c.city, c.province].filter(Boolean).join(', '), c.postal].filter(Boolean).map((v) => h('div', {}, v)),
        [c.phone, c.email].filter(Boolean).length ? h('div', {}, [c.phone, c.email].filter(Boolean).join(' · ')) : null,
        c.website ? h('div', { class: 'doc-web' }, c.website) : null,
        c.rbq ? h('div', {}, `RBQ ${c.rbq}`) : null),
      h('div', { class: 'doc-meta' },
        h('div', { class: 'doc-title' }, x.title),
        h('div', { class: 'doc-num' }, model.number ? `N° ${d.prefix || ''}${model.number}` : t('pdfNumberSoon')),
        h('dl', {},
          h('dt', {}, x.date), h('dd', {}, fd(issue)),
          h('dt', {}, x.valid), h('dd', {}, fd(until)),
          model.sellerName ? [h('dt', {}, x.seller), h('dd', {}, model.sellerName)] : null))),
    h('section', { class: 'doc-to' },
      h('div', { class: 'doc-label' }, x.to),
      cl ? [h('strong', {}, cl.name || ''), cl.companyName ? h('div', {}, cl.companyName) : null,
        [cl.address1, cl.city, cl.postalCode].filter(Boolean).length ? h('div', {}, [cl.address1, cl.city, cl.postalCode].filter(Boolean).join(', ')) : null,
        [cl.email, cl.phone].filter(Boolean).length ? h('div', {}, [cl.email, cl.phone].filter(Boolean).join(' · ')) : null]
        : h('div', { class: 'doc-ph' }, x.client)),
    h('div', { class: 'doc-table-wrap' },
      h('table', { class: 'doc-table' },
        h('thead', {}, h('tr', {},
          h('th', { class: 'n' }, x.qty), h('th', {}, x.model), h('th', {}, x.desc), h('th', { class: 'n' }, x.unit), h('th', { class: 'n' }, x.total))),
        h('tbody', {}, lines.length
          ? lines.map((l) => h('tr', {},
            h('td', { class: 'n' }, l.unit === 'ft' ? `${l.qty} ${x.ft}` : l.unit === 'head' ? `${l.qty} ${x.head}` : l.qty),
            h('td', { class: 'doc-model' }, l.model || ''),
            h('td', {},
              h('div', { class: 'doc-item' }, l.name || ''),
              l.tax === 'included' ? h('div', { class: 'doc-tag' }, x.taxIncl) : l.tax === 'none' ? h('div', { class: 'doc-tag' }, x.noTax) : null,
              l.description ? richText(l.description, 'rt doc-desc') : null),
            h('td', { class: 'n' }, mm(l.price)),
            h('td', { class: 'n' }, mm(l.amount))))
          : h('tr', {}, h('td', { colspan: 5, class: 'doc-ph' }, x.noLines))))),
    h('dl', { class: 'doc-totals' },
      h('dt', {}, x.sub), h('dd', {}, mm(tot.subtotal)),
      h('dt', {}, `TPS (${pct(TPS_RATE, lang)} %)`), h('dd', {}, mm(tot.tps)),
      h('dt', {}, `TVQ (${pct(TVQ_RATE, lang)} %)`), h('dd', {}, mm(tot.tvq)),
      h('dt', { class: 'grand-t' }, x.grand), h('dd', { class: 'grand-t' }, mm(tot.total))),
    d.tax ? h('p', { class: 'doc-taxno' }, `${x.tpsNo}: ${d.tax.tps} · ${x.tvqNo}: ${d.tax.tvq}`, h('br'), x.cad) : null,
    model.notes ? h('section', { class: 'doc-terms' }, h('div', { class: 'doc-label' }, x.notes), richText(model.notes)) : null,
    h('section', { class: 'doc-terms' }, h('div', { class: 'doc-label' }, x.terms), richText(lang === 'en' ? d.terms_en : d.terms_fr)),
    files.length ? h('section', { class: 'doc-att' }, h('div', { class: 'doc-label' }, x.files),
      files.map((f) => h('div', { class: 'doc-file' }, h('span', { class: 'doc-pdf' }, 'PDF'), f.name))) : null,
    h('section', { class: 'doc-sign' }, h('div', { class: 'doc-label' }, x.sign), h('div', { class: 'doc-sign-lines' }, h('span'), h('span'))),
    h('p', { class: 'doc-foot' }, t('pdfNote')));
}
