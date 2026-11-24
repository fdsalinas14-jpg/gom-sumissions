import { json, route, bad, forbidden } from '../lib/http.js';
import { isAdmin, seesAll, ROLES, listUsers, adminView, saveUser, setPassword, getUser } from '../lib/users.js';
import { getSettings, setSetting } from '../lib/settings.js';
import { logEvent } from '../lib/events.js';

const s = (v, n) => String(v ?? '').trim().slice(0, n);

// Back Office: vendedores (comisión, rol, claves) y ajustes. Admin completo modifica; « Admin View » solo mira.
export default route(['GET', 'POST', 'PUT'], async (req, res, user) => {
  if (!seesAll(user)) throw forbidden();
  const section = String(req.query?.section || '');

  if (req.method === 'GET') {
    return json(res, 200, { settings: await getSettings({ fresh: true }), users: (await listUsers({ all: true })).map(adminView), readOnly: !isAdmin(user) });
  }
  if (!isAdmin(user)) throw forbidden();

  if (section === 'settings') {
    const key = String(req.query?.key || '');
    await setSetting(key, req.body?.value);
    await logEvent({ actor: user.name, action: 'settings.updated', target_type: 'settings', target_id: key });
    return json(res, 200, { settings: await getSettings({ fresh: true }) });
  }

  if (section === 'users') {
    const b = req.body || {};
    const name = s(b.name, 40).toLowerCase();
    if (!/^[a-z0-9._-]{2,40}$/.test(name)) throw bad('Nom d’utilisateur: lettres minuscules, chiffres, . _ -');
    const data = {
      name, display: s(b.display, 80) || name, role: ROLES.includes(b.role) ? b.role : 'seller',
      commissionPct: Number(String(b.commissionPct ?? 0).replace(',', '.')), ghlId: s(b.ghlId, 40), email: s(b.email, 120), phone: s(b.phone, 30),
      active: b.active !== false, password: b.password,
    };
    if (!(data.commissionPct >= 0 && data.commissionPct <= 100)) throw bad('Commission entre 0 et 100 %');
    if (req.method === 'POST') {
      if (await getUser(name)) throw bad('Ce nom d’utilisateur existe déjà');
      if (String(b.password || '').length < 8) throw bad('Mot de passe: au moins 8 caractères');
      await saveUser(data, { create: true });
    } else {
      if (!(await getUser(name))) return json(res, 404, { error: 'not_found' });
      if (name === user.name && (data.role !== 'admin' || !data.active)) throw bad('Vous ne pouvez pas retirer votre propre accès administrateur');
      await saveUser(data);
      if (b.password) {
        if (String(b.password).length < 8) throw bad('Mot de passe: au moins 8 caractères');
        await setPassword(name, b.password);
      }
    }
    await logEvent({ actor: user.name, action: req.method === 'POST' ? 'user.created' : 'user.updated', target_type: 'user', target_id: name, title: data.display, details: { role: data.role, commissionPct: data.commissionPct, active: data.active, password: b.password ? 'changed' : undefined } });
    return json(res, 200, { users: (await listUsers({ all: true })).map(adminView) });
  }
  throw bad('Section invalide');
});
