// PDF de la soumission (lo que recibe el cliente). Nunca muestra la comisión.
import { PDFDocument, StandardFonts, rgb, degrees, PDFString } from 'pdf-lib';
import { money, TPS_RATE, TVQ_RATE } from '../public/pricing.js';

const NAVY = rgb(0.071, 0.149, 0.227);
const INK = rgb(0.13, 0.17, 0.22);
const MUTED = rgb(0.31, 0.37, 0.44);
const LINE = rgb(0.84, 0.87, 0.9);
const HIVIS = rgb(1, 0.78, 0.17);
const WHITE = rgb(1, 1, 1);
const LINK = rgb(0.05, 0.33, 0.7);

const T = {
  fr: {
    title: 'SOUMISSION', no: 'N°', date: 'Date', valid: 'Valide jusqu’au', seller: 'Vendeur', sellerPhone: 'Téléphone', to: 'SOUMISSION POUR',
    qty: 'QTÉ', model: 'MODÈLE', desc: 'DESCRIPTION', unit: 'PRIX UNIT.', total: 'TOTAL', sub: 'Sous-total',
    grand: 'TOTAL', taxIncl: 'Taxes incluses', noTax: 'Non taxable', notes: 'Notes', terms: 'Conditions', files: 'Fiches techniques',
    preview: 'APERÇU — NON ENVOYÉE', previewNo: 'APERÇU',
    signedOnline: (n, at) => `Signé électroniquement par ${n} le ${at} (Eastern), via le lien personnel envoyé au client.`,
    accept: 'Acceptation du client', sign: 'Signature', page: 'Page', ft: 'pi', head: 'tête(s)', tpsNo: 'N° TPS', tvqNo: 'N° TVQ', cad: 'Montants en dollars canadiens (CAD).',
  },
  en: {
    title: 'QUOTE', no: 'No.', date: 'Date', valid: 'Valid until', seller: 'Salesperson', sellerPhone: 'Phone', to: 'QUOTE FOR',
    qty: 'QTY', model: 'MODEL', desc: 'DESCRIPTION', unit: 'UNIT PRICE', total: 'TOTAL', sub: 'Subtotal',
    grand: 'TOTAL', taxIncl: 'Taxes included', noTax: 'Not taxable', notes: 'Notes', terms: 'Terms and conditions', files: 'Spec sheets',
    preview: 'PREVIEW — NOT SENT', previewNo: 'PREVIEW',
    signedOnline: (n, at) => `Electronically signed by ${n} on ${at} (Eastern), through the personal link sent to the client.`,
    accept: 'Client acceptance', sign: 'Signature', page: 'Page', ft: 'ft', head: 'head(s)', tpsNo: 'GST No.', tvqNo: 'QST No.', cad: 'Amounts in Canadian dollars (CAD).',
  },
};

const logoCache = new Map();
async function fetchLogo(url) {
  if (!url) return null;
  if (logoCache.has(url)) return logoCache.get(url);
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const buf = r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
    logoCache.set(url, buf);
    return buf;
  } catch {
    return null;
  }
}

export async function renderPdf(e, st, sellerName, sellerPhone = '') {
  const L = T[e.lang === 'en' ? 'en' : 'fr'];
  const lang = e.lang === 'en' ? 'en' : 'fr';
  const doc = await PDFDocument.create();
  doc.setTitle(`${L.title} ${e.number ? `${st.estimate.prefix}${e.number}` : L.previewNo}`);
  doc.setAuthor(st.company.name);
  const R = await doc.embedFont(StandardFonts.Helvetica);
  const B = await doc.embedFont(StandardFonts.HelveticaBold);

  // Texto seguro para la fuente (quita emojis y caracteres que Helvetica no tiene)
  const ok = new Map();
  const clean = (str) => {
    let out = '';
    for (const ch of String(str ?? '').replace(/[    ]/g, ' ').replace(/[‐‑‒]/g, '-').replace(/️/g, '')) {
      if (!ok.has(ch)) { try { R.widthOfTextAtSize(ch, 10); ok.set(ch, true); } catch { ok.set(ch, false); } }
      if (ok.get(ch)) out += ch;
    }
    return out.replace(/\s+/g, ' ').trim();
  };
  const W = (txt, f, size) => f.widthOfTextAtSize(txt, size);
  const wrap = (txt, f, size, width) => {
    const words = clean(txt).split(' ').filter(Boolean);
    const lines = [];
    let cur = '';
    for (let w of words) {
      while (W(w, f, size) > width) { // palabra más larga que la columna
        let i = w.length;
        while (i > 1 && W(w.slice(0, i), f, size) > width) i--;
        if (cur) { lines.push(cur); cur = ''; }
        lines.push(w.slice(0, i));
        w = w.slice(i);
      }
      const t = cur ? `${cur} ${w}` : w;
      if (W(t, f, size) <= width) cur = t;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  };
  // Texto con "# título" y "• punto" → renglones con su fuente y sangría
  const rich = (txt, size, width) => {
    const out = [];
    for (const raw of String(txt || '').split('\n')) {
      const s = raw.trim();
      if (!s) continue;
      const bullet = s.match(/^[•\-*]\s+(.*)$/);
      const head = s.match(/^#+\s*(.*)$/);
      if (bullet) wrap(bullet[1], R, size, width - 10).forEach((l, i) => out.push({ t: l, f: R, x: 10, bullet: i === 0 }));
      else if (head) wrap(head[1], B, size, width).forEach((l) => out.push({ t: l, f: B, x: 0, gap: out.length ? 3 : 0 }));
      else wrap(s, R, size, width).forEach((l) => out.push({ t: l, f: R, x: 0 }));
    }
    return out;
  };

  const PW = 612;
  const PH = 792;
  const M = 40;
  const pages = [];
  let page;
  let y;
  const newPage = () => { page = doc.addPage([PW, PH]); pages.push(page); y = PH - M; };
  const text = (t, x, yy, f = R, size = 9, color = INK) => page.drawText(clean(t), { x, y: yy, size, font: f, color });
  const right = (t, xr, yy, f = R, size = 9, color = INK) => { const c = clean(t); page.drawText(c, { x: xr - W(c, f, size), y: yy, size, font: f, color }); };
  const fmtDate = (d) => new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', { dateStyle: 'long', timeZone: 'America/Toronto' }).format(d);

  newPage();

  /* ---------- Encabezado ---------- */
  const c = st.company;
  let lx = M;
  const logo = await fetchLogo(c.logoUrl);
  let logoH = 0;
  if (logo) {
    try {
      const img = logo[0] === 0x89 ? await doc.embedPng(logo) : await doc.embedJpg(logo);
      const s = Math.min(150 / img.width, 54 / img.height);
      logoH = img.height * s;
      page.drawImage(img, { x: lx, y: y - logoH, width: img.width * s, height: logoH });
    } catch { logoH = 0; }
  }
  let cy = y - (logoH ? logoH + 12 : 4);
  text(c.name, lx, cy, B, 12, NAVY); cy -= 13;
  for (const l of [c.address, [c.city, c.province].filter(Boolean).join(', ') + (c.postal ? `  ${c.postal}` : ''), [c.phone, c.email].filter(Boolean).join(' · '), c.website, c.rbq ? `RBQ ${c.rbq}` : '']) {
    if (l && l.trim()) { text(l, lx, cy, R, 8.5, MUTED); cy -= 11; }
  }
  // Derecha: título, número, fechas, vendedor
  const rx = PW - M;
  right(L.title, rx, y - 18, B, 22, NAVY);
  let ry = y - 36;
  right(e.number ? `${L.no} ${st.estimate.prefix}${e.number}` : L.previewNo, rx, ry, B, 10, INK); ry -= 15;
  const issue = e.issueDate ? new Date(`${e.issueDate}T12:00:00Z`) : new Date();
  const until = new Date(issue.getTime() + (Number(e.validDays) || 30) * 864e5);
  for (const [k, v] of [[L.date, fmtDate(issue)], [L.valid, fmtDate(until)], [L.seller, sellerName]]) {
    right(v, rx, ry, R, 9, INK);
    right(`${k}:`, rx - W(clean(v), R, 9) - 6, ry, R, 9, MUTED);
    ry -= 12;
  }
  // Téléphone du vendeur (cliquable): le client appelle directement son conseiller
  if (sellerPhone) {
    const v = clean(sellerPhone);
    const w = W(v, B, 9);
    page.drawText(v, { x: rx - w, y: ry, size: 9, font: B, color: LINK });
    right(`${L.sellerPhone}:`, rx - w - 6, ry, R, 9, MUTED);
    const tel = String(sellerPhone).replace(/[^\d+]/g, '');
    if (tel.length >= 7) {
      page.node.addAnnot(doc.context.register(doc.context.obj({
        Type: 'Annot', Subtype: 'Link', Rect: [rx - w, ry - 3, rx, ry + 9], Border: [0, 0, 0],
        A: { Type: 'Action', S: 'URI', URI: PDFString.of(`tel:${tel}`) },
      })));
    }
    ry -= 12;
  }
  y = Math.min(cy, ry) - 8;
  page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 1.5, color: NAVY });
  y -= 18;

  /* ---------- Cliente ---------- */
  const k = e.contact || {};
  text(L.to, M, y, B, 8, MUTED); y -= 13;
  text(k.name, M, y, B, 11, INK); y -= 13;
  for (const l of [k.companyName, k.address1, [k.city, k.postalCode].filter(Boolean).join('  '), [k.phone, k.email].filter(Boolean).join(' · ')]) {
    if (l && l.trim()) { text(l, M, y, R, 9, INK); y -= 11.5; }
  }
  y -= 10;

  /* ---------- Tabla ---------- */
  const cols = { qty: M, model: M + 38, desc: M + 122, unit: PW - M - 145, total: PW - M };
  const descW = cols.unit - cols.desc; // hasta donde empieza el precio unitario
  const header = () => {
    page.drawRectangle({ x: M, y: y - 6, width: PW - 2 * M, height: 18, color: NAVY });
    text(L.qty, cols.qty + 4, y, B, 7.5, WHITE);
    text(L.model, cols.model, y, B, 7.5, WHITE);
    text(L.desc, cols.desc, y, B, 7.5, WHITE);
    right(L.unit, cols.unit + 70, y, B, 7.5, WHITE);
    right(L.total, cols.total - 4, y, B, 7.5, WHITE);
    y -= 22;
  };
  let inTable = true; // el encabezado de la tabla se repite solo mientras la tabla continúa
  const need = (h) => { if (y - h < M + 40) { newPage(); if (inTable) header(); } };
  header();

  for (const l of e.lines) {
    const nameLines = wrap(l.name, B, 9, descW);
    const desc = rich(l.description, 8, descW);
    const note = l.tax === 'included' ? L.taxIncl : l.tax === 'none' ? L.noTax : '';
    const modelLines = wrap(l.model || '', R, 8, 78);
    need(Math.max(nameLines.length * 11, modelLines.length * 10) + 10);
    const top = y;
    const qtyTxt = l.unit === 'ft' ? `${l.qty} ${L.ft}` : l.unit === 'head' ? `${l.qty} ${L.head}` : String(l.qty);
    text(qtyTxt, cols.qty + 4, y, R, 9);
    modelLines.forEach((m, i) => text(m, cols.model, top - i * 10, R, 8, MUTED));
    right(money(l.price, lang), cols.unit + 70, y, R, 9);
    right(money(l.amount, lang), cols.total - 4, y, B, 9);
    for (const n of nameLines) { need(11); text(n, cols.desc, y, B, 9, NAVY); y -= 11; }
    if (note) { need(10); text(note, cols.desc, y, R, 7.5, MUTED); y -= 10; }
    for (const d of desc) {
      need(10 + (d.gap || 0));
      y -= d.gap || 0;
      if (d.bullet) text('•', cols.desc + 2, y, R, 8, MUTED);
      text(d.t, cols.desc + d.x, y, d.f, 8, d.f === B ? INK : MUTED);
      y -= 10;
    }
    y = Math.min(y, top - modelLines.length * 10 - 2) - 5;
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: PW - M, y: y + 6 }, thickness: 0.6, color: LINE });
    y -= 6;
  }

  /* ---------- Totales ---------- */
  inTable = false;
  need(90);
  y -= 4;
  const tx = PW - M - 230;
  const row = (label, val, f = R, size = 9.5) => { text(label, tx, y, f, size, f === B ? INK : MUTED); right(val, PW - M - 4, y, f, size); y -= 14; };
  row(L.sub, money(e.subtotal, lang));
  row(`TPS (${String(TPS_RATE).replace('.', lang === 'fr' ? ',' : '.')} %)`, money(e.tps, lang));
  row(`TVQ (${String(TVQ_RATE).replace('.', lang === 'fr' ? ',' : '.')} %)`, money(e.tvq, lang));
  y -= 12;
  page.drawRectangle({ x: tx - 8, y: y - 8, width: PW - M - tx + 8, height: 24, color: HIVIS });
  text(L.grand, tx, y, B, 12, NAVY);
  right(money(e.total, lang), PW - M - 4, y, B, 13, NAVY);
  y -= 26;
  text(`${L.tpsNo}: ${st.tax.tps}   ·   ${L.tvqNo}: ${st.tax.tvq}`, tx, y, R, 7.5, MUTED); y -= 10;
  text(L.cad, tx, y, R, 7.5, MUTED); y -= 18;

  /* ---------- Notas, condiciones, fichas ---------- */
  const section = (title, body) => {
    const lines = rich(body, 8.5, PW - 2 * M);
    if (!lines.length) return;
    need(30);
    text(title.toUpperCase(), M, y, B, 8, MUTED); y -= 4;
    page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 0.6, color: LINE });
    y -= 12;
    for (const d of lines) {
      need(11 + (d.gap || 0));
      y -= d.gap || 0;
      if (d.bullet) text('•', M + 2, y, R, 8.5, MUTED);
      text(d.t, M + d.x, y, d.f, 8.5, INK);
      y -= 11;
    }
    y -= 8;
  };
  if (e.notes) section(L.notes, e.notes);
  section(L.terms, lang === 'en' ? st.terms_en : st.terms_fr);
  const files = e.lines.flatMap((l) => l.attachments || []);
  // Fichas técnicas: el nombre es un enlace (sin mostrar la dirección larga)
  if (files.length) {
    need(30);
    text(L.files.toUpperCase(), M, y, B, 8, MUTED); y -= 4;
    page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 0.6, color: LINE });
    y -= 12;
    for (const f of files) {
      need(12);
      const label = clean(`${f.name || L.files} (PDF)`);
      text('•', M + 2, y, R, 8.5, MUTED);
      page.drawText(label, { x: M + 12, y, size: 8.5, font: R, color: LINK });
      const w = W(label, R, 8.5);
      page.drawLine({ start: { x: M + 12, y: y - 1.5 }, end: { x: M + 12 + w, y: y - 1.5 }, thickness: 0.4, color: LINK });
      if (/^https:\/\//.test(f.url || '')) {
        const annot = doc.context.register(doc.context.obj({
          Type: 'Annot', Subtype: 'Link', Rect: [M + 12, y - 3, M + 12 + w, y + 9], Border: [0, 0, 0],
          A: { Type: 'Action', S: 'URI', URI: PDFString.of(f.url) },
        }));
        page.node.addAnnot(annot);
      }
      y -= 12;
    }
    y -= 8;
  }

  /* ---------- Firma (electrónica si el cliente firmó en línea) ---------- */
  const sigImg = e.signature && /^data:image\/png;base64,/.test(e.signature)
    ? await doc.embedPng(Buffer.from(e.signature.split(',')[1], 'base64')).catch(() => null) : null;
  need(sigImg ? 110 : 50);
  y -= 6;
  text(L.accept, M, y, B, 9, INK);
  if (sigImg) {
    const h = 46;
    const w = Math.min(210, sigImg.width * (h / sigImg.height));
    y -= h + 4;
    page.drawImage(sigImg, { x: M + 4, y: y + 2, width: w, height: h });
  } else y -= 26;
  page.drawLine({ start: { x: M, y }, end: { x: M + 220, y }, thickness: 0.8, color: INK });
  page.drawLine({ start: { x: M + 260, y }, end: { x: M + 380, y }, thickness: 0.8, color: INK });
  if (e.signedAt) {
    const when = new Date(e.signedAt);
    const d = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', { dateStyle: 'long', timeZone: 'America/Toronto' }).format(when);
    text(d, M + 262, y + 5, B, 9, INK);
  }
  y -= 11;
  text(e.signedName ? `${L.sign} — ${e.signedName}` : L.sign, M, y, R, 8, MUTED);
  text(L.date, M + 260, y, R, 8, MUTED);
  if (e.signedAt) {
    y -= 12;
    const at = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Toronto' }).format(new Date(e.signedAt));
    text(L.signedOnline(e.signedName, at), M, y, R, 7.5, MUTED);
  }

  /* ---------- Pie de página ---------- */
  pages.forEach((p, i) => {
    page = p;
    // Vista previa (antes de enviar): marca de agua para que nunca se confunda con la soumission enviada
    if (e.preview) page.drawText(L.preview, { x: 120, y: 260, size: 54, font: B, color: rgb(0.85, 0.2, 0.15), opacity: 0.13, rotate: degrees(40) });
    const foot = `${c.legal ? `${c.legal} · ` : ''}${c.name} · RBQ ${c.rbq}`;
    text(foot, M, 22, R, 7, MUTED);
    right(`${L.page} ${i + 1} / ${pages.length}`, PW - M, 22, R, 7, MUTED);
  });
  return doc.save();
}
