// Página del cliente: ver su soumission, descargar el PDF y firmarla con el dedo para aceptarla.
// Se abre con el enlace personal del correo o del SMS (?id=&k=). Sin cuenta.
import { h, fill } from './core.js';
import { richText } from './preview.js';
import { money } from './pricing.js';

const P = new URLSearchParams(location.search);
const ID = P.get('id');
const K = P.get('k');
const root = document.getElementById('app');

const TX = {
  fr: {
    title: 'Votre soumission', for: 'Pour', date: 'Date', valid: 'Valide jusqu’au', seller: 'Votre conseiller',
    details: 'Voir la description', sub: 'Sous-total', total: 'Total avec taxes', pdf: 'Voir ou télécharger le PDF',
    terms: 'Conditions', acceptT: 'Accepter la soumission', name: 'Votre nom complet', signHere: 'Signez ici avec votre doigt (ou la souris)',
    clear: 'Effacer', agree: 'J’ai lu la soumission et ses conditions, et je l’accepte. Ma signature électronique a la même valeur qu’une signature à la main.',
    signBtn: 'Signer et accepter', signing: 'Envoi…', thanks: 'Merci! Votre soumission est acceptée.',
    signedBy: (n, d) => `Signée par ${n} le ${d}.`, pdfSigned: 'Télécharger le PDF signé', notSignable: 'Cette soumission ne peut plus être signée en ligne. Communiquez avec nous.',
    notFound: 'Ce lien n’est pas valide. Communiquez avec nous pour recevoir un nouveau lien.', error: 'Ça n’a pas fonctionné. Vérifiez votre connexion et réessayez.',
    call: 'Une question? Appelez-nous', callSeller: (n) => `Appeler ${n}`, ft: 'pi', expired: 'La période de validité est terminée: nous confirmerons les prix avec vous.',
  },
  en: {
    title: 'Your quote', for: 'For', date: 'Date', valid: 'Valid until', seller: 'Your advisor',
    details: 'See the description', sub: 'Subtotal', total: 'Total with taxes', pdf: 'View or download the PDF',
    terms: 'Terms and conditions', acceptT: 'Accept the quote', name: 'Your full name', signHere: 'Sign here with your finger (or mouse)',
    clear: 'Clear', agree: 'I have read the quote and its terms, and I accept it. My electronic signature has the same value as a handwritten signature.',
    signBtn: 'Sign and accept', signing: 'Sending…', thanks: 'Thank you! Your quote is accepted.',
    signedBy: (n, d) => `Signed by ${n} on ${d}.`, pdfSigned: 'Download the signed PDF', notSignable: 'This quote can no longer be signed online. Please contact us.',
    notFound: 'This link is not valid. Please contact us for a new link.', error: 'That did not work. Check your connection and try again.',
    call: 'A question? Call us', callSeller: (n) => `Call ${n}`, ft: 'ft', expired: 'The validity period is over: we will confirm the prices with you.',
  },
};

const fmt = (iso, lang, time = false) => new Intl.DateTimeFormat(lang === 'en' ? 'en-CA' : 'fr-CA',
  time ? { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Toronto' } : { dateStyle: 'long', timeZone: 'America/Toronto' })
  .format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));

async function load() {
  if (!ID || !K) return fill(root, h('main', { class: 'page' }, h('p', { class: 'msg err' }, `${TX.fr.notFound} / ${TX.en.notFound}`)));
  try {
    const r = await fetch(`/api/sign?id=${encodeURIComponent(ID)}&k=${encodeURIComponent(K)}`);
    if (!r.ok) return fill(root, h('main', { class: 'page' }, h('p', { class: 'msg err' }, r.status === 404 ? `${TX.fr.notFound} / ${TX.en.notFound}` : `${TX.fr.error} / ${TX.en.error}`)));
    render(await r.json());
  } catch {
    fill(root, h('main', { class: 'page' }, h('p', { class: 'msg err' }, `${TX.fr.error} / ${TX.en.error}`)));
  }
}

function render(d, justSigned = false) {
  const lang = d.lang === 'en' ? 'en' : 'fr';
  const x = TX[lang];
  document.documentElement.lang = lang;
  const m = (n) => money(n, lang);
  const expired = d.validUntil < new Date().toISOString().slice(0, 10);

  const head = h('header', { class: 'client-top' },
    d.company.logoUrl ? h('img', { src: d.company.logoUrl, alt: d.company.name, class: 'client-logo' }) : h('strong', {}, d.company.name),
    d.company.phone ? h('a', { class: 'client-phone', href: `tel:${d.company.phone.replace(/[^\d+]/g, '')}` }, `☎ ${d.company.phone}`) : null);

  const lines = h('ul', { class: 'summary sum-lines' }, d.lines.map((l) => h('li', { class: 'sum-line' },
    h('div', { class: 'sum-head' }, h('span', {}, `${l.unit === 'ft' ? `${l.qty} ${x.ft}` : `${l.qty} ×`} ${l.name}`), h('span', {}, m(l.amount))),
    l.description ? h('details', { class: 'fold' }, h('summary', { class: 'link' }, x.details), richText(l.description, 'rt line-desc')) : null)));

  const pdfBtn = h('a', { class: 'btn big primary', href: d.pdf, target: '_blank', rel: 'noopener' }, d.signed ? `📄 ${x.pdfSigned}` : `📄 ${x.pdf}`);

  const main = h('main', { class: 'page client' },
    h('p', { class: 'step-of' }, d.number),
    h('h1', {}, x.title),
    // Ya firmada: la confirmación va arriba, lo primero que ve el cliente
    d.signed ? h('div', { class: 'card signed-box', role: 'status' },
      justSigned ? h('p', { class: 'client-name' }, `✅ ${x.thanks}`) : null,
      h('p', {}, x.signedBy(d.signed.name, fmt(d.signed.at, lang, true)))) : null,
    h('div', { class: 'card' },
      h('p', {}, `${x.for}: `, h('strong', {}, d.client.name)),
      h('p', { class: 'muted' }, `${x.date}: ${fmt(d.issueDate, lang)} · ${x.valid}: ${fmt(d.validUntil, lang)}`),
      h('p', { class: 'muted' }, `${x.seller}: ${d.seller}`),
      // bouton « Appeler le vendeur »: le numéro vient du profil du vendeur
      d.sellerPhone ? h('a', { class: 'btn big call-seller', href: `tel:${d.sellerPhone.replace(/[^\d+]/g, '')}` }, `📞 ${x.callSeller(d.seller)} · ${d.sellerPhone}`) : null),
    h('div', { class: 'card' },
      lines,
      h('ul', { class: 'summary' },
        h('li', {}, h('span', {}, x.sub), h('span', {}, m(d.subtotal))),
        h('li', {}, h('span', {}, 'TPS (5 %)'), h('span', {}, m(d.tps))),
        h('li', {}, h('span', {}, lang === 'en' ? 'QST (9.975 %)' : 'TVQ (9,975 %)'), h('span', {}, m(d.tvq)))),
      h('div', { class: 'grand' }, h('span', {}, x.total), h('strong', {}, m(d.total)))),
    h('div', { class: 'final-btns' }, pdfBtn),
    d.terms ? h('details', { class: 'card fold' }, h('summary', { class: 'h3' }, x.terms), richText(d.terms, 'rt line-desc')) : null,
    d.signed ? null : d.signable ? signForm(d, x, lang, expired) : h('p', { class: 'msg warn' }, x.notSignable),
    d.company.phone ? h('p', { class: 'muted center' }, `${x.call}: `, h('a', { href: `tel:${d.company.phone.replace(/[^\d+]/g, '')}` }, d.company.phone)) : null,
    h('p', { class: 'muted small center' }, `${d.company.name}${d.company.rbq ? ` · RBQ ${d.company.rbq}` : ''}`));
  fill(root, head, main);
  if (justSigned) window.scrollTo(0, 0);
}

function signForm(d, x, lang, expired) {
  const name = h('input', { class: 'in', autocomplete: 'name', value: d.client.name || '', id: 'sig-name' });
  const pad = signaturePad();
  const agree = h('input', { type: 'checkbox', id: 'sig-agree' });
  const err = h('div');
  const btn = h('button', { class: 'btn big hi', type: 'button' }, `✍ ${x.signBtn}`);
  btn.addEventListener('click', async () => {
    fill(err);
    btn.disabled = true;
    btn.textContent = x.signing;
    try {
      const r = await fetch(`/api/sign?id=${encodeURIComponent(ID)}&k=${encodeURIComponent(K)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.value.trim(), signature: pad.empty() ? '' : pad.data(), agree: agree.checked }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(out.error || x.error);
      render(out, true);
    } catch (e) {
      fill(err, h('p', { class: 'msg err', role: 'alert' }, e.message === 'Failed to fetch' ? x.error : e.message));
      btn.disabled = false;
      btn.textContent = `✍ ${x.signBtn}`;
    }
  });
  return h('section', { class: 'card sign-card' },
    h('h2', { class: 'h2' }, x.acceptT),
    expired ? h('p', { class: 'msg warn' }, x.expired) : null,
    h('div', { class: 'fld' }, h('label', { class: 'f', for: 'sig-name' }, x.name), name),
    h('div', { class: 'fld' }, h('span', { class: 'f' }, x.signHere), pad.el,
      h('button', { class: 'link', type: 'button', onclick: () => pad.clear() }, x.clear)),
    h('label', { class: 'check-row agree' }, agree, h('span', {}, x.agree)),
    err,
    h('div', { class: 'final-btns' }, btn));
}

// Cuadro de firma (dedo, lápiz o ratón). Exporta PNG con fondo transparente.
function signaturePad() {
  const canvas = h('canvas', { class: 'sig-pad', 'aria-label': 'Signature' });
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let strokes = 0;
  let last = null;
  const size = () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const keep = strokes ? canvas.toDataURL() : null;
    canvas.width = Math.round(r.width * ratio);
    canvas.height = Math.round(r.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#12263a';
    if (keep) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height); img.src = keep; }
  };
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); drawing = true; last = pos(e); ctx.beginPath(); ctx.arc(last.x, last.y, 1.2, 0, Math.PI * 2); ctx.fillStyle = '#12263a'; ctx.fill(); strokes++; });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p;
  });
  const stop = () => { drawing = false; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  requestAnimationFrame(size);
  window.addEventListener('resize', size);
  return {
    el: canvas,
    empty: () => strokes === 0,
    clear: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); strokes = 0; },
    data: () => canvas.toDataURL('image/png'),
  };
}

load();
