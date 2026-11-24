// Página pública del cliente (/signer.html): ver la soumission y firmarla para aceptarla.
// Acceso solo con el enlace firmado (?id=&k=), el mismo que abre el PDF. Sin cuenta.
import { json, route, fail } from '../lib/http.js';
import { one } from '../lib/db.js';
import { view, signEstimate } from '../lib/estimates.js';
import { checkPdfToken, pdfLink } from '../lib/messaging.js';
import { getSettings } from '../lib/settings.js';
import { getUser } from '../lib/users.js';

const ERR = {
  already_signed: { fr: 'Cette soumission est déjà signée.', en: 'This quote is already signed.' },
  not_signable: { fr: 'Cette soumission ne peut plus être signée. Communiquez avec nous.', en: 'This quote can no longer be signed. Please contact us.' },
  name_required: { fr: 'Écrivez votre nom complet.', en: 'Write your full name.' },
  agree_required: { fr: 'Cochez la case pour accepter la soumission.', en: 'Check the box to accept the quote.' },
  signature_required: { fr: 'Signez dans le cadre avec votre doigt ou la souris.', en: 'Sign in the box with your finger or mouse.' },
};

export default route(['GET', 'POST'], async (req, res) => {
  const id = Number(req.query?.id);
  if (!Number.isInteger(id) || id < 1 || !checkPdfToken(id, req.query?.k)) return fail(res, 404, 'not_found');
  let r = await one('select * from ec_estimates where id = $1', [id]);
  if (!r) return fail(res, 404, 'not_found');
  const lang = r.lang === 'en' ? 'en' : 'fr';

  if (req.method === 'POST') {
    const b = req.body || {};
    try {
      r = await signEstimate(id, { name: b.name, signature: b.signature, agree: b.agree }, {
        ip: String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim(),
        ua: req.headers['user-agent'],
      });
    } catch (e) {
      const m = ERR[e.message];
      if (m) return fail(res, e.status || 400, m[lang], { code: e.message });
      throw e;
    }
  }

  // Solo lo que el cliente ve en su PDF (nunca comisión, nota interna ni precio base)
  const st = await getSettings();
  const e = view(r, { internal: false });
  const seller = await getUser(r.seller);
  const issue = e.issueDate ? new Date(`${e.issueDate}T12:00:00Z`) : new Date(r.created_at);
  const validUntil = new Date(issue.getTime() + (Number(e.validDays) || 30) * 864e5).toISOString().slice(0, 10);
  return json(res, 200, {
    lang, number: `${st.estimate.prefix}${e.number}`, issueDate: issue.toISOString().slice(0, 10), validUntil,
    company: { name: st.company.name, logoUrl: st.company.logoUrl, phone: st.company.phone, email: st.company.email, rbq: st.company.rbq },
    client: { name: e.contact?.name || '' }, seller: seller?.display || r.seller, sellerPhone: seller?.phone || '',
    lines: e.lines.map((l) => ({ qty: l.qty, unit: l.unit || '', name: l.name, model: l.model || '', description: l.description || '', amount: l.amount })),
    subtotal: e.subtotal, tps: e.tps, tvq: e.tvq, total: e.total,
    terms: lang === 'en' ? st.terms_en : st.terms_fr,
    pdf: pdfLink(id),
    status: e.status, signable: !e.signedAt && ['draft', 'sent', 'reminder', 'lost', 'accepted'].includes(e.status),
    signed: e.signedAt ? { name: e.signedName, at: e.signedAt } : null,
  });
}, { auth: false });
