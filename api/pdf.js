import { route, fail } from '../lib/http.js';
import { getSession } from '../lib/auth.js';
import { one } from '../lib/db.js';
import { view } from '../lib/estimates.js';
import { checkPdfToken } from '../lib/messaging.js';
import { getSettings } from '../lib/settings.js';
import { getUser, seesAll } from '../lib/users.js';
import { renderPdf } from '../lib/pdf.js';

// PDF de la soumission. El cliente entra con el enlace firmado (?id=&k=); el equipo, con su sesión.
export default route(['GET'], async (req, res) => {
  const id = Number(req.query?.id);
  if (!Number.isInteger(id) || id < 1) return fail(res, 404, 'not_found');
  const r = await one('select * from ec_estimates where id = $1', [id]);
  if (!r) return fail(res, 404, 'not_found');
  let allowed = checkPdfToken(id, req.query?.k);
  if (!allowed) {
    const s = await getSession(req);
    allowed = !!s && (seesAll(s) || r.seller === s.name || r.created_by === s.name);
  }
  if (!allowed) return fail(res, 404, 'not_found');
  const st = await getSettings();
  const seller = await getUser(r.seller);
  const bytes = await renderPdf(view(r, { internal: false }), st, seller?.display || r.seller, seller?.phone || '');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${st.estimate.prefix}${r.number}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(Buffer.from(bytes));
}, { auth: false });
