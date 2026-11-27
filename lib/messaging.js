// Correos y SMS al cliente, enviados por GoHighLevel (las automatizaciones de GHL siguen funcionando).
import crypto from 'node:crypto';
import { sendEmail, sendSms } from './ghl.js';
import { getSettings, fillTemplate } from './settings.js';
import { money } from '../public/pricing.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Enlace público y firmado al PDF (el cliente no necesita cuenta)
const secret = () => process.env.SESSION_SECRET || '';
export const pdfToken = (id) => crypto.createHmac('sha256', secret()).update(`pdf:${id}`).digest('base64url').slice(0, 24);
export const checkPdfToken = (id, k) => {
  const want = Buffer.from(pdfToken(id));
  const got = Buffer.from(String(k || ''));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
};
// APP_URL si está definida; si no, el dominio de producción que Vercel da a la función
const appUrl = () => (process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')).replace(/\/$/, '');
export const pdfLink = (id) => `${appUrl()}/api/pdf?id=${id}&k=${pdfToken(id)}`;
// Página del cliente: ver la soumission, descargar el PDF y firmar para aceptarla
export const signLink = (id) => `${appUrl()}/signer?id=${id}&k=${pdfToken(id)}`; // cleanUrls: signer.html

function emailHtml(company, body, link, linkLabel) {
  const paras = String(body).split('\n').map((l) => (l.trim() ? `<p style="margin:0 0 12px">${esc(l).replace(esc(link), `<a href="${esc(link)}">${esc(link)}</a>`)}</p>` : '')).join('');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#161616;max-width:560px">
${company.logoUrl ? `<p><img src="${esc(company.logoUrl)}" alt="${esc(company.name)}" style="max-height:60px"></p>` : ''}
${paras}
${link ? `<p style="margin:20px 0"><a href="${esc(link)}" style="display:inline-block;background:#dc1d1d;color:#ffffff;padding:14px 26px;border-radius:999px;font-weight:bold;text-decoration:none">${esc(linkLabel)}</a></p>` : ''}
<p style="color:#4f5f6f;font-size:13px">${esc(company.name)} · ${esc(company.phone)} · RBQ ${esc(company.rbq)}</p></div>`;
}

// kind: send | reminder | review ; channels: ['email','sms']
export async function messageClient(est, kind, { channels = ['email', 'sms'], sellerName = '' } = {}) {
  const st = await getSettings();
  const lang = est.lang === 'en' ? 'en' : 'fr';
  const c = est.contact || {};
  const link = kind === 'review' ? st.review.link : signLink(est.id);
  const vars = {
    client: c.name || '', numero: `${st.estimate.prefix}${est.number}`, total: money(est.total, lang),
    lien: link, vendeur: sellerName, avis: st.review.link,
  };
  const M = st.messages;
  const warnings = [];
  const sent = [];
  if (!est.ghl_contact_id) return { sent, warnings: ['no_contact'] };
  if (kind === 'review' && !st.review.link) return { sent, warnings: ['no_review_link'] };

  if (channels.includes('email')) {
    if (!c.email) warnings.push('no_email');
    else {
      try {
        const subject = fillTemplate(M[`${kind}_subject_${lang}`], vars);
        const body = fillTemplate(M[`${kind}_body_${lang}`], vars);
        const label = kind === 'review' ? (lang === 'fr' ? 'Laisser un avis' : 'Leave a review') : (lang === 'fr' ? 'Voir et accepter la soumission' : 'View and accept the quote');
        await sendEmail(est.ghl_contact_id, { subject, html: emailHtml(st.company, body, link, label), emailTo: c.email });
        sent.push('email');
      } catch (e) {
        console.error('[email]', e.message, JSON.stringify(e.detail || '').slice(0, 300));
        warnings.push('email_failed');
      }
    }
  }
  if (channels.includes('sms')) {
    if (!c.phone) warnings.push('no_phone');
    else {
      try {
        await sendSms(est.ghl_contact_id, fillTemplate(M[`${kind}_sms_${lang}`], vars));
        sent.push('sms');
      } catch (e) {
        console.error('[sms]', e.message, JSON.stringify(e.detail || '').slice(0, 300));
        warnings.push('sms_failed');
      }
    }
  }
  return { sent, warnings };
}
