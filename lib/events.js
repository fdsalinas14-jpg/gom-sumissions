// Historial (quién hizo qué y cuándo)
import { q, iso } from './db.js';

export async function logEvent(e) {
  try {
    await q('insert into ec_events (actor, action, target_type, target_id, title, owner, details) values ($1,$2,$3,$4,$5,$6,$7)',
      [e.actor, e.action, e.target_type || null, e.target_id != null ? String(e.target_id) : null, e.title || null, e.owner || null, JSON.stringify(e.details || null)]);
  } catch (x) {
    console.error('[event]', x.message);
  }
}

export async function listEvents({ actorOrOwner, targetType, targetId, limit = 100 } = {}) {
  const where = [];
  const p = [];
  if (actorOrOwner) { p.push(actorOrOwner); where.push(`(actor = $${p.length} or owner = $${p.length})`); }
  if (targetType) { p.push(targetType); where.push(`target_type = $${p.length}`); }
  if (targetId) { p.push(String(targetId)); where.push(`target_id = $${p.length}`); }
  p.push(Math.min(limit, 500));
  const rows = await q(`select * from ec_events ${where.length ? 'where ' + where.join(' and ') : ''} order by at desc, id desc limit $${p.length}`, p);
  return rows.map((r) => ({ ...r, id: Number(r.id), at: iso(r.at) }));
}
