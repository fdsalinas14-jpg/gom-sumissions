import { checkLogin, makeCookie, clearCookie, getSession } from '../lib/auth.js';
import { json, fail, route, bad } from '../lib/http.js';
import { publicUser, setPassword, getUser } from '../lib/users.js';
import { verifyPassword } from '../lib/password.js';
import { logEvent } from '../lib/events.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default route(
  ['GET', 'POST', 'PUT', 'DELETE'],
  async (req, res) => {
    if (req.method === 'GET') {
      const s = await getSession(req);
      return s ? json(res, 200, { user: publicUser(s) }) : fail(res, 401, 'unauthorized');
    }
    if (req.method === 'DELETE') {
      res.setHeader('Set-Cookie', clearCookie(req));
      return json(res, 200, { ok: true });
    }
    if (req.method === 'PUT') {
      // Cambiar mi propia clave
      const s = await getSession(req);
      if (!s) return fail(res, 401, 'unauthorized');
      const { current, password } = req.body || {};
      const me = await getUser(s.name);
      if (!verifyPassword(current || '', me.passHash)) { await sleep(600); throw bad('Le mot de passe actuel n’est pas bon'); }
      if (String(password || '').length < 8) throw bad('Le nouveau mot de passe doit avoir au moins 8 caractères');
      await setPassword(s.name, password);
      await logEvent({ actor: s.name, action: 'user.password_changed', target_type: 'user', target_id: s.name });
      const fresh = await getUser(s.name);
      res.setHeader('Set-Cookie', makeCookie(fresh, req));
      return json(res, 200, { ok: true });
    }
    const { user, password } = req.body || {};
    const u = await checkLogin(user, password);
    if (!u) {
      await sleep(600); // frena fuerza bruta
      return fail(res, 401, 'invalid_credentials');
    }
    res.setHeader('Set-Cookie', makeCookie(u, req));
    return json(res, 200, { user: publicUser(u) });
  },
  { auth: false },
);
