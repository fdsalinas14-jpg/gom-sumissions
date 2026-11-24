import { getSession } from './auth.js';

export const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

export const fail = (res, status, message, extra = {}) => json(res, status, { error: message, ...extra });

// Envuelve un handler: método permitido, sesión obligatoria, JSON obligatorio en POST, errores controlados.
export const route = (methods, handler, { auth = true } = {}) => async (req, res) => {
  try {
    if (!methods.includes(req.method)) {
      res.setHeader('Allow', methods.join(', '));
      return fail(res, 405, 'method_not_allowed');
    }
    let session = null;
    if (auth) {
      session = await getSession(req);
      if (!session) return fail(res, 401, 'unauthorized');
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const ct = String(req.headers['content-type'] || '');
      const hasBody = Number(req.headers['content-length'] || 0) > 0 || !!req.headers['transfer-encoding'];
      if (req.method !== 'DELETE' && hasBody && !ct.includes('application/json')) {
        return fail(res, 415, 'json_required');
      }
    }
    return await handler(req, res, session);
  } catch (e) {
    const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
    if (status === 403) return fail(res, 403, e.message);
    if (status >= 500 || (e.detail && !e.expose)) console.error('[api]', e.message, e.detail ? JSON.stringify(e.detail).slice(0, 800) : '');
    return fail(res, status, status >= 500 && !e.expose ? 'server_error' : e.message, e.expose ? { detail: e.detail } : {});
  }
};

export const forbidden = (message = 'Réservé à l’administrateur') => Object.assign(new Error(message), { status: 403 });

export const bad = (message, detail) => {
  const e = new Error(message);
  e.status = 400;
  if (detail) {
    e.detail = detail;
    e.expose = true;
  }
  return e;
};
