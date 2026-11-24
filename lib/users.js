// Usuarios en la base de datos (v3). Roles: admin (accès complet) | viewer (« Admin View »: voit tout, ne modifie rien) | seller.
import { q, one, num } from './db.js';
import { hashPassword } from './password.js';

const row = (u) => u && {
  name: u.name, display: u.display, role: u.role, ghlId: u.ghl_user_id || '', email: u.email || '', phone: u.phone || '',
  commissionPct: num(u.commission_pct) || 0, active: u.active, sessionV: u.session_v, passHash: u.pass_hash,
};

export const getUser = async (name) => row(await one('select * from ec_users where name = $1', [String(name || '').trim().toLowerCase()]));
export const listUsers = async ({ all = false } = {}) =>
  (await q(`select * from ec_users ${all ? '' : 'where active'} order by role, display`)).map(row);

export const ROLES = ['admin', 'viewer', 'seller'];
export const isAdmin = (u) => u?.role === 'admin';
// Admin View: voit toutes les soumissions et les vendeurs, sans rien modifier (catalogue, réglages, vendeurs)
export const isViewer = (u) => u?.role === 'viewer';
export const seesAll = (u) => isAdmin(u) || isViewer(u);
export const publicUser = (u) => u && { name: u.name, display: u.display, role: u.role, isAdmin: isAdmin(u), seesAll: seesAll(u), phone: u.phone || '', commissionPct: u.commissionPct };
// Lo que ve el admin en la lista de vendedores (nunca la clave)
export const adminView = (u) => u && { name: u.name, display: u.display, role: u.role, ghlId: u.ghlId, email: u.email, phone: u.phone, commissionPct: u.commissionPct, active: u.active };

export async function saveUser(data, { create = false } = {}) {
  if (create) {
    await q(
      `insert into ec_users (name, display, role, pass_hash, commission_pct, ghl_user_id, email, phone, active)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [data.name, data.display, data.role, hashPassword(data.password), data.commissionPct, data.ghlId || null, data.email || null, data.phone || null, data.active !== false],
    );
  } else {
    await q(
      `update ec_users set display=$2, role=$3, commission_pct=$4, ghl_user_id=$5, email=$6, phone=$7, active=$8,
         session_v = session_v + (case when $8 then 0 else 1 end)
       where name=$1`,
      [data.name, data.display, data.role, data.commissionPct, data.ghlId || null, data.email || null, data.phone || null, data.active !== false],
    );
  }
  return getUser(data.name);
}

export async function setPassword(name, password) {
  await q('update ec_users set pass_hash = $2, session_v = session_v + 1 where name = $1', [name, hashPassword(password)]);
}
