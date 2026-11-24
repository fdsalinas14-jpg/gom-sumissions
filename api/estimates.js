import { json, route, bad } from '../lib/http.js';
import { createEstimate, updateEstimate, act, getRow, view, listEstimates, csvExport, previewEstimate } from '../lib/estimates.js';
import { renderPdf } from '../lib/pdf.js';
import { listUsers, seesAll } from '../lib/users.js';
import { listEvents } from '../lib/events.js';
import { pdfLink, signLink } from '../lib/messaging.js';

export default route(['GET', 'POST', 'PUT'], async (req, res, user) => {
  const Q = req.query || {};
  if (req.method === 'GET') {
    if (Q.id) {
      const r = await getRow(user, Q.id);
      return json(res, 200, { estimate: view(r), pdf: pdfLink(r.id), sign: signLink(r.id), events: await listEvents({ targetType: 'estimate', targetId: r.id, limit: 50 }) });
    }
    const f = { status: Q.status, seller: Q.seller, from: Q.from, to: Q.to, q: Q.q, review: Q.review, limit: Q.limit, offset: Q.offset };
    if (Q.format === 'csv') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="soumissions-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.end(await csvExport(user, f));
    }
    const out = await listEstimates(user, f);
    // lista de vendedores para elegir (todos la necesitan en el formulario)
    out.sellers = (await listUsers()).map((u) => ({ name: u.name, display: u.display, ...(seesAll(user) || u.name === user.name ? { commissionPct: u.commissionPct } : {}) }));
    return json(res, 200, out);
  }

  if (req.method === 'PUT') {
    if (!Q.id) throw bad('Identifiant requis');
    const r = await updateEstimate(user, Q.id, req.body || {});
    return json(res, 200, { estimate: view(r) });
  }

  // POST ?preview=1: el PDF tal cual lo verá el cliente, sin guardar
  if (Q.preview) {
    const { e, st, sellerName, sellerPhone } = await previewEstimate(user, req.body || {});
    const bytes = await renderPdf(e, st, sellerName, sellerPhone);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="apercu-soumission.pdf"');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.end(Buffer.from(bytes));
  }

  // POST sin id: nueva soumission (y si se pide, enviarla de una vez)
  if (!Q.id) {
    const b = req.body || {};
    let r = await createEstimate(user, b);
    let warnings = [];
    let sent = [];
    if (b.send) {
      try {
        const x = await act(user, r.id, 'send', { channels: b.channels });
        r = x.estimate; warnings = x.warnings; sent = x.sent;
      } catch (e) {
        warnings = ['send_failed', ...(Array.isArray(e.detail) ? e.detail : [])];
      }
    }
    return json(res, 200, { estimate: view(r), warnings, sent, pdf: pdfLink(r.id) });
  }

  // POST con id: acción del ciclo de vida
  const x = await act(user, Q.id, String(Q.action || ''), req.body || {});
  return json(res, 200, { estimate: view(x.estimate), warnings: x.warnings, sent: x.sent || [] });
});
