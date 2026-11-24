import { json, route, bad } from '../lib/http.js';
import { searchContacts, upsertContact } from '../lib/ghl.js';

const str = (v, max) => String(v ?? '').trim().slice(0, max);

export default route(['GET', 'POST'], async (req, res) => {
  if (req.method === 'GET') {
    const q = str(req.query?.q, 80);
    if (q.length < 2) return json(res, 200, { contacts: [] });
    return json(res, 200, { contacts: await searchContacts(q) });
  }

  const b = req.body || {};
  const firstName = str(b.firstName, 80);
  const email = str(b.email, 120);
  const phone = str(b.phone, 30);
  if (!firstName) throw bad('Le prénom ou le nom du client est requis');
  if (!email && !phone) throw bad('Ajoutez un courriel ou un téléphone');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Courriel invalide');

  const contact = await upsertContact({
    firstName,
    lastName: str(b.lastName, 80),
    email,
    phone,
    companyName: str(b.companyName, 120),
    address1: str(b.address1, 160),
    city: str(b.city, 80),
    postalCode: str(b.postalCode, 12),
  });
  return json(res, 200, { contact });
});
