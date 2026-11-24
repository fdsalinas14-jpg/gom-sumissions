// Claves cifradas con scrypt (sal aleatoria por usuario). Nunca se guarda la clave en claro.
import crypto from 'node:crypto';

const N = 16384;
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(pw), salt, 32, { N });
  return `scrypt$${N}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export function verifyPassword(pw, stored) {
  const [alg, n, s, k] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !s || !k) return false;
  const key = crypto.scryptSync(String(pw ?? ''), Buffer.from(s, 'base64url'), 32, { N: Number(n) });
  const want = Buffer.from(k, 'base64url');
  return want.length === key.length && crypto.timingSafeEqual(want, key);
}

// Para comparar contra nada sin revelar por el tiempo si el usuario existe
export const DUMMY_HASH = hashPassword(crypto.randomBytes(8).toString('hex'));
