import crypto from 'node:crypto';
import { getUser } from './users.js';
import { verifyPassword, DUMMY_HASH } from './password.js';

const COOKIE = 'ec_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 días: el vendedor no tiene que volver a entrar cada día

const secret = () => {
  const s = process.env.SESSION_SECRET || '';
  if (s.length < 24) throw new Error('SESSION_SECRET debe tener al menos 24 caracteres');
  return s;
};

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sign = (payload) => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

const safeEqual = (a, b) => {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};

// Login contra la base de datos (clave cifrada con scrypt)
export async function checkLogin(user, password) {
  const u = await getUser(user);
  const ok = verifyPassword(password || '', u?.active ? u.passHash : DUMMY_HASH);
  return ok && u?.active ? u : null;
}

export function makeCookie(user, req) {
  const payload = b64(JSON.stringify({ n: user.name, v: user.sessionV, e: Date.now() + MAX_AGE * 1000 }));
  const value = `${payload}.${sign(payload)}`;
  return serialize(value, MAX_AGE, req);
}

export function clearCookie(req) {
  return serialize('', 0, req);
}

function serialize(value, maxAge, req) {
  const secure = process.env.VERCEL || req?.headers?.['x-forwarded-proto'] === 'https';
  return [
    `${COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

export async function getSession(req) {
  const raw = (req.headers.cookie || '')
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE}=`));
  if (!raw) return null;
  const value = raw.slice(COOKIE.length + 1);
  const [payload, sig] = value.split('.');
  if (!payload || !sig) return null;
  try {
    if (!safeEqual(sig, sign(payload))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data.e || data.e < Date.now()) return null;
    // El rol y los datos se leen en cada petición: un usuario desactivado o con clave nueva pierde la sesión
    const user = await getUser(data.n);
    if (!user || !user.active || user.sessionV !== data.v) return null;
    const { passHash, ...safe } = user;
    return safe;
  } catch {
    return null;
  }
}
