import { json, route, bad, forbidden } from '../lib/http.js';
import { getCatalog, saveCategory, saveBrand, saveCapacity, saveProduct, saveAddon, removeItem } from '../lib/catalog.js';
import { isAdmin } from '../lib/users.js';
import { logEvent } from '../lib/events.js';
import { getSettings } from '../lib/settings.js';

const SAVE = { category: saveCategory, brand: saveBrand, capacity: saveCapacity, product: saveProduct, addon: saveAddon };

// Catálogo: todos lo leen; solo el admin lo modifica (Back Office)
export default route(['GET', 'POST', 'PUT', 'DELETE'], async (req, res, user) => {
  if (req.method === 'GET') {
    const st = await getSettings();
    return json(res, 200, {
      ...(await getCatalog({ all: isAdmin(user) && req.query?.all === '1' })),
      // lo que necesita la vista previa del PDF en el navegador
      doc: { company: st.company, tax: st.tax, terms_fr: st.terms_fr, terms_en: st.terms_en, prefix: st.estimate.prefix, validDays: st.estimate.validDays },
      // « Directeur des ventes » visible dans la soumission seulement si l’admin l’a activé; multiplicateurs pour le calculateur (admin)
      pricing: { directeur: !!st.pricing?.directeur, ...(isAdmin(user) ? { multipliers: st.pricing?.multipliers || {} } : {}) },
    });
  }
  if (!isAdmin(user)) throw forbidden();

  const type = String(req.query?.type || '');
  const id = req.query?.id ? Number(req.query.id) : null;
  if (!SAVE[type]) throw bad('Type invalide');
  if (id !== null && !Number.isInteger(id)) throw bad('Identifiant invalide');
  if (req.method === 'DELETE') {
    if (!id) throw bad('Identifiant requis');
    const r = await removeItem(type, id);
    await logEvent({ actor: user.name, action: `catalog.${type}.${r.deleted ? 'deleted' : 'deactivated'}`, target_type: type, target_id: id });
    return json(res, 200, r);
  }
  if (req.method === 'PUT' && !id) throw bad('Identifiant requis');
  const r = await SAVE[type](req.body || {}, req.method === 'PUT' ? id : null);
  if (!r) return json(res, 404, { error: 'not_found' });
  await logEvent({ actor: user.name, action: `catalog.${type}.${req.method === 'PUT' ? 'updated' : 'created'}`, target_type: type, target_id: r.id, title: req.body?.name || req.body?.nameFr || '' });
  return json(res, 200, { id: r.id });
});
