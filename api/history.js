import { json, route } from '../lib/http.js';
import { listEvents } from '../lib/events.js';
import { seesAll, listUsers } from '../lib/users.js';

// Historial: el admin ve todo; cada vendedor ve sus acciones y lo de sus soumissions
export default route(['GET'], async (req, res, user) => {
  const events = await listEvents({
    targetId: req.query?.targetId ? String(req.query.targetId).slice(0, 64) : undefined,
    actorOrOwner: seesAll(user) ? (req.query?.who ? String(req.query.who) : undefined) : user.name,
    limit: Math.min(Number(req.query?.limit) || 100, 300),
  });
  const people = await listUsers({ all: true });
  const names = new Map(people.map((u) => [u.name, u.display]));
  json(res, 200, {
    events: events.map((e) => ({ ...e, actorName: names.get(e.actor) || e.actor, ownerName: names.get(e.owner) || e.owner || '' })),
    ...(seesAll(user) ? { people: people.map((u) => ({ name: u.name, display: u.display })) } : {}),
  });
});
