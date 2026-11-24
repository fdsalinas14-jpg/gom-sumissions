// Soumissions (v3): viven en la base de la app. GHL recibe contacto, oportunidad, etiquetas, notas y mensajes.
import { q, one, num, iso } from './db.js';
import { bad, forbidden } from './http.js';
import { getProduct, getAddon } from './catalog.js';
import { getUser, listUsers, isAdmin, seesAll } from './users.js';
import { getSettings } from './settings.js';
import { logEvent } from './events.js';
import { messageClient, pdfLink } from './messaging.js';
import { createOpportunity, updateOpportunity, addTags, addNote } from './ghl.js';
import { priceLines, totals, money, withRebate, specialOf } from '../public/pricing.js';

export const STATUSES = ['draft', 'sent', 'reminder', 'accepted', 'lost', 'paid'];
const REVIEW = ['none', 'requested', 'completed', 'not_completed'];
const s = (v, n) => String(v ?? '').trim().slice(0, n);
const err = (status, m) => Object.assign(new Error(m), { status });

/* ---------- Vista ---------- */
export function view(r, { internal = true } = {}) {
  if (!r) return null;
  // interno: comisión, « Directeur des ventes », precio base, mínimo y « Spécial » (el cliente nunca los ve)
  const lines = (r.lines || []).map(({ commission, commissionUnit, directeur, directeurUnit, special, base, basePrice, minPrice, ...l }) => (internal
    ? { ...l, base, commission, commissionUnit, directeur, directeurUnit, special, basePrice, minPrice } : l));
  return {
    id: r.id, number: r.number, status: r.status, lang: r.lang, contact: r.contact, seller: r.seller, createdBy: r.created_by,
    lines, subtotal: num(r.subtotal), tps: num(r.tps), tvq: num(r.tvq), total: num(r.total),
    ...(internal ? { commission: num(r.commission), directeur: (r.lines || []).reduce((a, l) => a + (Number(l.directeur) || 0), 0), internalNote: r.internal_note } : {}),
    notes: r.notes, validDays: r.valid_days, issueDate: r.issue_date ? new Date(r.issue_date).toISOString().slice(0, 10) : null,
    sentAt: iso(r.sent_at), reminderAt: iso(r.reminder_at), acceptedAt: iso(r.accepted_at), lostAt: iso(r.lost_at), paidAt: iso(r.paid_at),
    reviewStatus: r.review_status, reviewRequestedAt: iso(r.review_requested_at), reviewDoneAt: iso(r.review_done_at),
    ghlContactId: r.ghl_contact_id, ghlOpportunityId: r.ghl_opportunity_id,
    createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
    signedAt: iso(r.signed_at), signedName: r.signed_name || null, signature: r.signature || null,
    ...(internal ? { signedIp: r.signed_ip || null } : {}),
  };
}

// « Admin View » voit tout mais ne modifie que ses propres soumissions
const own = (user, r) => r.seller === user.name || r.created_by === user.name;
const canSee = (user, r) => seesAll(user) || own(user, r);
export async function getRow(user, id, { write = false } = {}) {
  const r = await one('select * from ec_estimates where id = $1', [Number(id)]);
  if (!r || !canSee(user, r)) throw err(404, 'not_found');
  if (write && !isAdmin(user) && !own(user, r)) throw forbidden();
  return r;
}

/* ---------- Armar las líneas desde el catálogo (no se confía en precios del navegador) ---------- */
// items: [{ type:'product', productId, qty, base, commission?, directeur?, special? }] | [{ type:'addon', addonId, qty, price }]
// commission = comisión por unidad en $ elegida por el vendedor (si falta: % del vendedor)
// directeur  = « Directeur des ventes » por unidad (solo si está activado en Réglages)
// special    = precio « Spécial » (volumen) en una centrale o un Steffes: solo el admin completo lo activa;
//              baja la base y el mínimo (central −500 $, Steffes −1 000 $). Al modificar, una línea que ya era Spécial lo conserva.
const amount = (v, i, what) => {
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''));
  if (!(Number.isFinite(n) && n >= 0 && n <= 1_000_000)) throw bad(`Ligne ${i + 1}: ${what} invalide`);
  return Math.round(n * 100) / 100;
};
export async function buildLines(items, lang, ctx = {}) {
  if (!Array.isArray(items) || !items.length) throw bad('Choisissez au moins un équipement');
  if (items.length > 40) throw bad('Maximum 40 lignes');
  const out = [];
  for (const [i, it] of items.entries()) {
    const qty = Number(it?.qty);
    if (it?.type === 'product') {
      const p = await getProduct(Number(it.productId));
      if (!p) throw bad(`Ligne ${i + 1}: produit introuvable`);
      if (!(Number.isInteger(qty) && qty >= 1 && qty <= 50)) throw bad(`Ligne ${i + 1}: quantité invalide`);
      const off = p.basePrice > 0 ? specialOf(p.categoryCode) : 0;
      const special = !!it.special && off > 0 && (ctx.admin || (ctx.prevSpecial || new Set()).has(p.id));
      if (it.special && off > 0 && !special) throw forbidden('Seul l’administrateur peut activer le prix Spécial');
      const cut = special ? off : 0;
      const base = it.base === undefined || it.base === '' ? Math.max(0, p.basePrice - cut) : amount(it.base, i, 'prix');
      const commissionUnit = it.commission !== undefined && it.commission !== null && it.commission !== '' ? amount(it.commission, i, 'commission') : null;
      const directeurUnit = (ctx.directeur || (ctx.prevDirecteur || new Set()).has(p.id)) && it.directeur !== undefined && it.directeur !== null && it.directeur !== '' ? amount(it.directeur, i, 'montant Directeur des ventes') : 0;
      out.push({
        kind: 'equipment', productId: p.id, name: p.name, model: p.model,
        description: withRebate((lang === 'en' && p.descriptionEn) || p.descriptionFr, p, lang), qty, base,
        basePrice: Math.max(0, p.basePrice - cut), minPrice: p.minPrice > 0 ? Math.max(0, p.minPrice - cut) : 0, tax: 'added', attachments: p.attachments,
        commissionUnit, directeurUnit, ...(special ? { special: true } : {}),
      });
    } else if (it?.type === 'addon') {
      const a = await getAddon(Number(it.addonId));
      if (!a) throw bad(`Ligne ${i + 1}: option introuvable`);
      const maxQty = a.priceMode === 'per_foot' ? 500 : 50;
      if (!(Number.isInteger(qty) && qty >= 1 && qty <= maxQty)) throw bad(`Ligne ${i + 1}: quantité invalide`);
      let price = a.price;
      if (a.editable && it.price !== undefined && it.price !== '') {
        price = Number(String(it.price).replace(',', '.').replace(/\s/g, ''));
        if (!Number.isFinite(price) || Math.abs(price) > 1_000_000 || (price < 0 && a.kind !== 'credit')) throw bad(`Ligne ${i + 1}: prix invalide`);
      }
      out.push({
        kind: 'addon', addonId: a.id, addonKind: a.kind, name: a.name, model: a.model,
        description: (lang === 'en' && a.descriptionEn) || a.descriptionFr, qty, price: Math.round(price * 100) / 100, tax: a.tax,
        unit: a.priceMode === 'per_foot' ? 'ft' : a.priceMode === 'per_head' ? 'head' : '',
      });
    } else throw bad(`Ligne ${i + 1}: type invalide`);
  }
  return out;
}

const cleanContact = (c) => {
  if (!c?.id || !/^[A-Za-z0-9_-]{6,64}$/.test(String(c.id))) throw bad('Choisissez ou créez un client');
  return {
    id: String(c.id), name: s(c.name, 160) || 'Client', email: s(c.email, 120), phone: s(c.phone, 30),
    companyName: s(c.companyName, 120), address1: s(c.address1, 160), city: s(c.city, 80), postalCode: s(c.postalCode, 12),
  };
};

async function resolveSeller(user, name) {
  const want = s(name, 60).toLowerCase() || user.name;
  const u = await getUser(want);
  if (!u || !u.active) throw bad('Vendeur invalide');
  return u;
}

async function compute(body, user, prevLines = []) {
  const lang = body.lang === 'en' ? 'en' : 'fr';
  const seller = await resolveSeller(user, body.seller);
  const st = await getSettings();
  // si l’admin désactive « Directeur des ventes », les soumissions qui l’avaient déjà le gardent quand on les modifie
  const ctx = { admin: isAdmin(user), directeur: !!st.pricing?.directeur, prevSpecial: new Set(prevLines.filter((l) => l.special).map((l) => l.productId)),
    prevDirecteur: new Set(prevLines.filter((l) => Number(l.directeurUnit) > 0).map((l) => l.productId)) };
  const lines = priceLines(await buildLines(body.items, lang, ctx), seller.commissionPct);
  // Prix MINIMUM de la liste ECOAIR: solo una referencia para el vendedor. La comisión es libre (pedido de Nicolas,
  // 16 nov.): un precio al cliente bajo el mínimo ya no bloquea guardar ni enviar.
  return { lang, seller, lines, t: totals(lines) };
}

/* ---------- Crear / modificar ---------- */
// Vista previa: el PDF exacto que recibiría el cliente, sin guardar nada (botón «Voir le PDF» antes d’envoyer)
export async function previewEstimate(user, body) {
  const contact = cleanContact(body.contact);
  const { lang, seller, lines, t } = await compute(body, user);
  const st = await getSettings();
  const existing = body.id ? await getRow(user, body.id).catch(() => null) : null;
  const r = {
    id: 0, number: existing?.number ?? null, status: 'draft', lang, contact, seller: seller.name, lines,
    subtotal: t.subtotal, tps: t.tps, tvq: t.tvq, total: t.total, commission: t.commission,
    notes: s(body.notes, 2000), internal_note: '', valid_days: Number(st.estimate.validDays) || 30,
    issue_date: existing?.issue_date ?? null, created_at: new Date(), review_status: 'none',
  };
  return { e: { ...view(r, { internal: false }), preview: true }, st, sellerName: seller.display || seller.name, sellerPhone: seller.phone || '' };
}

export async function createEstimate(user, body, prevLines = []) {
  const contact = cleanContact(body.contact);
  const { lang, seller, lines, t } = await compute(body, user, prevLines);
  const st = await getSettings();
  const r = await one(
    `insert into ec_estimates (number, lang, contact, ghl_contact_id, seller, created_by, lines, subtotal, tps, tvq, total, commission, notes, internal_note, valid_days)
     values (nextval('ec_estimate_number'), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
    [lang, JSON.stringify(contact), contact.id, seller.name, user.name, JSON.stringify(lines), t.subtotal, t.tps, t.tvq, t.total, t.commission,
      s(body.notes, 2000), s(body.internalNote, 2000), Number(st.estimate.validDays) || 30],
  );
  await logEvent({ actor: user.name, action: 'estimate.created', target_type: 'estimate', target_id: r.id, title: titleOf(st, r), owner: seller.name, details: { total: t.total } });
  return r;
}

export async function updateEstimate(user, id, body) {
  const r0 = await getRow(user, id, { write: true });
  if (!['draft', 'sent', 'reminder'].includes(r0.status) && !isAdmin(user)) throw err(409, 'Cette soumission ne peut plus être modifiée');
  const contact = body.contact ? cleanContact(body.contact) : r0.contact;
  const { lang, seller, lines, t } = await compute({ ...body, seller: body.seller ?? r0.seller }, user, r0.lines || []);
  const r = await one(
    `update ec_estimates set lang=$2, contact=$3, ghl_contact_id=$4, seller=$5, lines=$6, subtotal=$7, tps=$8, tvq=$9, total=$10, commission=$11,
       notes=$12, internal_note=$13, updated_at=now() where id=$1 returning *`,
    [r0.id, lang, JSON.stringify(contact), contact.id, seller.name, JSON.stringify(lines), t.subtotal, t.tps, t.tvq, t.total, t.commission,
      s(body.notes ?? r0.notes, 2000), s(body.internalNote ?? r0.internal_note, 2000)],
  );
  const st = await getSettings();
  await logEvent({ actor: user.name, action: 'estimate.updated', target_type: 'estimate', target_id: r.id, title: titleOf(st, r), owner: r.seller, details: { before: num(r0.total), after: t.total } });
  if (r.ghl_opportunity_id) syncOpportunity(r, null).catch(() => {});
  return r;
}

const titleOf = (st, r) => `${st.estimate.prefix}${r.number} – ${r.contact?.name || ''}`;

/* ---------- GHL: oportunidad + etiquetas ---------- */
async function syncOpportunity(r, statusKey) {
  const st = await getSettings();
  const map = statusKey ? st.ghl[statusKey] || {} : {};
  const sellerUser = await getUser(r.seller);
  if (!r.ghl_opportunity_id) {
    if (!map.pipelineId) return null;
    const id = await createOpportunity({
      pipelineId: map.pipelineId, stageId: map.stageId, status: map.status || 'open', name: titleOf(st, r), contactId: r.ghl_contact_id,
      value: num(r.total), assignedTo: sellerUser?.ghlId,
    });
    if (id) await q('update ec_estimates set ghl_opportunity_id=$2 where id=$1', [r.id, id]);
    return id;
  }
  await updateOpportunity(r.ghl_opportunity_id, { pipelineId: map.pipelineId, stageId: map.stageId, status: map.status, value: num(r.total), name: titleOf(st, r) });
  return r.ghl_opportunity_id;
}

const TAGS = { sent: 'soumission-envoyee', reminder: 'soumission-rappel', accepted: 'soumission-acceptee', lost: 'soumission-perdue', paid: 'soumission-payee', review: 'avis-demande', reviewed: 'avis-recu' };

async function ghlEffects(r, statusKey, note) {
  const warnings = [];
  try { await syncOpportunity(r, statusKey); } catch (e) { warnings.push('opportunity'); console.error('[opp]', e.message, JSON.stringify(e.detail || '').slice(0, 300)); }
  if (r.ghl_contact_id) {
    try { await addTags(r.ghl_contact_id, [TAGS[statusKey]].filter(Boolean)); } catch (e) { warnings.push('tags'); console.error('[tags]', e.message); }
    if (note) { try { await addNote(r.ghl_contact_id, note); } catch (e) { warnings.push('note'); console.error('[note]', e.message); } }
  }
  return warnings;
}

/* ---------- Firma electrónica del cliente ---------- */
// El cliente entra con el enlace firmado (sin cuenta). Firmar = aceptar: estado «Acceptée» + GHL.
const SIGNABLE = ['draft', 'sent', 'reminder', 'lost', 'accepted'];
export async function signEstimate(id, { name, signature, agree }, meta = {}) {
  const r0 = await one('select * from ec_estimates where id = $1', [Number(id)]);
  if (!r0) throw err(404, 'not_found');
  if (r0.signed_at) throw err(409, 'already_signed');
  if (!SIGNABLE.includes(r0.status)) throw err(409, 'not_signable');
  const nm = s(name, 120);
  if (nm.length < 2) throw bad('name_required');
  if (agree !== true) throw bad('agree_required');
  const sig = String(signature || '');
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length < 400 || sig.length > 400_000) throw bad('signature_required');
  const st = await getSettings();
  const wasAccepted = r0.status === 'accepted';
  const r = await one(
    `update ec_estimates set signed_at = now(), signed_name = $2, signature = $3, signed_ip = $4, signed_ua = $5,
       status = 'accepted', accepted_at = coalesce(accepted_at, now()), updated_at = now()
     where id = $1 and signed_at is null returning *`,
    [r0.id, nm, sig, s(meta.ip, 80), s(meta.ua, 300)]);
  if (!r) throw err(409, 'already_signed');
  const when = new Date(r.signed_at).toLocaleString('fr-CA', { timeZone: 'America/Toronto' });
  const warnings = await ghlEffects(r, 'accepted',
    `Soumission ${st.estimate.prefix}${r.number} ${wasAccepted ? 'signée' : 'acceptée et signée'} en ligne par ${nm} le ${when} (${money(r.total)})\nPDF signé: ${pdfLink(r.id)}`);
  await logEvent({ actor: 'client', action: 'estimate.signed', target_type: 'estimate', target_id: r.id, title: titleOf(st, r), owner: r.seller, details: { name: nm, warnings } });
  return r;
}

/* ---------- Ciclo de vida ---------- */
const FLOW = {
  send: { from: ['draft', 'sent', 'reminder'], to: 'sent' },
  remind: { from: ['sent', 'reminder'], to: 'reminder' },
  accept: { from: ['draft', 'sent', 'reminder', 'lost'], to: 'accepted' },
  lose: { from: ['draft', 'sent', 'reminder', 'accepted'], to: 'lost' },
  pay: { from: ['sent', 'reminder', 'accepted'], to: 'paid' },
};
const STAMP = { sent: 'sent_at', reminder: 'reminder_at', accepted: 'accepted_at', lost: 'lost_at', paid: 'paid_at' };

export async function act(user, id, action, body = {}) {
  const st = await getSettings();
  let r = await getRow(user, id, { write: true });
  const seller = await getUser(r.seller);
  const sellerName = seller?.display || r.seller;
  const channels = Array.isArray(body.channels) ? body.channels.filter((c) => ['email', 'sms'].includes(c)) : ['email', 'sms'];
  let warnings = [];
  let sent = [];

  if (FLOW[action]) {
    const f = FLOW[action];
    if (!f.from.includes(r.status)) throw err(409, 'Action impossible dans cet état');
    if (action === 'send' || action === 'remind') {
      const m = await messageClient(r, action === 'send' ? 'send' : 'reminder', { channels, sellerName });
      sent = m.sent;
      warnings.push(...m.warnings);
      if (!sent.length) throw Object.assign(err(400, 'Rien n’a été envoyé: vérifiez le courriel et le téléphone du client'), { detail: warnings });
    }
    r = await one(`update ec_estimates set status=$2, ${STAMP[f.to]}=now(), updated_at=now() where id=$1 returning *`, [r.id, f.to]);
    const label = { send: 'envoyée', remind: 'rappel envoyé', accept: 'acceptée', lose: 'perdue', pay: 'payée' }[action];
    warnings.push(...await ghlEffects(r, f.to, `Soumission ${st.estimate.prefix}${r.number} ${label} (${money(r.total)}) — par ${user.display}${action === 'send' ? `\nPDF: ${pdfLink(r.id)}` : ''}`));
    await logEvent({ actor: user.name, action: `estimate.${f.to}`, target_type: 'estimate', target_id: r.id, title: titleOf(st, r), owner: r.seller, details: { sent, warnings } });
    // Pagada → solicitud de reseña automática si está activada en Ajustes
    if (action === 'pay' && st.review.auto && r.review_status === 'none') {
      const rr = await act(user, r.id, 'review_request', { channels: st.review.channels });
      warnings.push(...rr.warnings);
      r = await one('select * from ec_estimates where id=$1', [r.id]);
    }
    return { estimate: r, warnings, sent };
  }

  if (action === 'review_request') {
    if (r.status !== 'paid') throw err(409, 'La soumission doit être payée');
    const m = await messageClient(r, 'review', { channels, sellerName });
    if (!m.sent.length) throw Object.assign(err(400, m.warnings.includes('no_review_link') ? 'Ajoutez le lien d’avis dans les Réglages' : 'Rien n’a été envoyé: vérifiez le courriel et le téléphone du client'), { detail: m.warnings });
    r = await one(`update ec_estimates set review_status='requested', review_requested_at=now(), updated_at=now() where id=$1 returning *`, [r.id]);
    if (r.ghl_contact_id) { try { await addTags(r.ghl_contact_id, [TAGS.review]); } catch { m.warnings.push('tags'); } }
    await logEvent({ actor: user.name, action: 'review.requested', target_type: 'estimate', target_id: r.id, title: titleOf(st, r), owner: r.seller, details: { sent: m.sent } });
    return { estimate: r, warnings: m.warnings, sent: m.sent };
  }

  if (action === 'review_done' || action === 'review_failed') {
    if (r.status !== 'paid') throw err(409, 'La soumission doit être payée');
    const v = action === 'review_done' ? 'completed' : 'not_completed';
    r = await one('update ec_estimates set review_status=$2, review_done_at=now(), updated_at=now() where id=$1 returning *', [r.id, v]);
    if (v === 'completed' && r.ghl_contact_id) { try { await addTags(r.ghl_contact_id, [TAGS.reviewed]); } catch { warnings.push('tags'); } }
    await logEvent({ actor: user.name, action: `review.${v}`, target_type: 'estimate', target_id: r.id, title: titleOf(st, r), owner: r.seller, details: { note: s(body.note, 300) || undefined } });
    return { estimate: r, warnings };
  }

  // Corrección manual (admin): cualquier estado
  if (action === 'set_status') {
    if (!isAdmin(user)) throw forbidden();
    const to = String(body.status || '');
    if (!STATUSES.includes(to)) throw bad('État invalide');
    r = await one(`update ec_estimates set status=$2${STAMP[to] ? `, ${STAMP[to]}=coalesce(${STAMP[to]}, now())` : ''}, updated_at=now() where id=$1 returning *`, [r.id, to]);
    if (to !== 'draft') warnings = await ghlEffects(r, to, null);
    await logEvent({ actor: user.name, action: 'estimate.status_set', target_type: 'estimate', target_id: r.id, title: titleOf(st, r), owner: r.seller, details: { status: to } });
    return { estimate: r, warnings };
  }

  if (action === 'duplicate') {
    const items = r.lines.map((l) => (l.kind === 'equipment'
      ? { type: 'product', productId: l.productId, qty: l.qty, base: l.base, commission: l.commissionUnit, directeur: l.directeurUnit, special: l.special }
      : { type: 'addon', addonId: l.addonId, qty: l.qty, price: l.price }));
    const copy = await createEstimate(user, { contact: r.contact, seller: r.seller, lang: r.lang, items, notes: r.notes }, r.lines);
    return { estimate: copy, warnings };
  }

  if (action === 'delete') {
    if (r.status !== 'draft' && !isAdmin(user)) throw err(409, 'Seuls les brouillons peuvent être supprimés');
    await q('delete from ec_estimates where id=$1', [r.id]);
    await logEvent({ actor: user.name, action: 'estimate.deleted', target_type: 'estimate', target_id: r.id, title: titleOf(st, r), owner: r.seller });
    return { estimate: null, warnings };
  }

  throw bad('Action invalide');
}

/* ---------- Lista, filtros, totales por estado, CSV ---------- */
export async function listEstimates(user, f = {}) {
  const where = [];
  const p = [];
  const add = (sql, v) => { p.push(v); where.push(sql.replace('?', `$${p.length}`)); };
  if (!seesAll(user)) { p.push(user.name); where.push(`(seller = $${p.length} or created_by = $${p.length})`); }
  if (f.seller) add('seller = ?', String(f.seller));
  if (f.from) add('created_at >= ?::date', String(f.from));
  if (f.to) add(`created_at < (?::date + interval '1 day')`, String(f.to));
  if (f.q) {
    p.push(`%${String(f.q).slice(0, 80)}%`);
    const a = p.length;
    p.push(String(f.q).replace(/\D/g, '') || '-1');
    where.push(`(contact->>'name' ilike $${a} or contact->>'email' ilike $${a} or contact->>'phone' ilike $${a} or number::text = $${p.length})`);
  }
  const base = where.length ? `where ${where.join(' and ')}` : '';
  // el filtro de estado no afecta los totales por estado (así se ven todos los montos)
  const statsP = [...p];
  const stats = await q(`select status, count(*)::int as n, coalesce(sum(total),0) as total, coalesce(sum(commission),0) as commission from ec_estimates ${base} group by status`, statsP);
  const p2 = [...statsP];
  let w2 = base;
  if (f.status && STATUSES.includes(f.status)) { p2.push(f.status); w2 += `${w2 ? ' and' : 'where'} status = $${p2.length}`; }
  if (f.review) { p2.push(f.review); w2 += `${w2 ? ' and' : 'where'} status = 'paid' and review_status = any(string_to_array($${p2.length}, ','))`; }
  const limit = Math.min(Number(f.limit) || 50, 2000);
  const offset = Math.max(Number(f.offset) || 0, 0);
  p2.push(limit, offset);
  const rows = await q(`select *, count(*) over()::int as _n from ec_estimates ${w2} order by created_at desc, id desc limit $${p2.length - 1} offset $${p2.length}`, p2);
  return {
    estimates: rows.map((r) => view(r, { internal: true })),
    total: rows[0]?._n || 0,
    stats: Object.fromEntries(STATUSES.map((k) => {
      const x = stats.find((r) => r.status === k);
      return [k, { n: x?.n || 0, total: num(x?.total) || 0, ...(seesAll(user) ? { commission: num(x?.commission) || 0 } : {}) }];
    })),
  };
}

export async function csvExport(user, f) {
  const st = await getSettings();
  const { estimates } = await listEstimates(user, { ...f, limit: 2000 });
  const names = new Map((await listUsers({ all: true })).map((u) => [u.name, u.display]));
  const cols = ['Numéro', 'Date', 'État', 'Client', 'Téléphone', 'Courriel', 'Vendeur', 'Sous-total', 'TPS', 'TVQ', 'Total', ...(seesAll(user) ? ['Commission', 'Directeur des ventes'] : []), 'Envoyée', 'Acceptée', 'Payée', 'Avis'];
  const cell = (v) => { const x = String(v ?? ''); return /[",\n;]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
  const d = (x) => (x ? x.slice(0, 10) : '');
  const rows = estimates.map((e) => [
    `${st.estimate.prefix}${e.number}`, d(e.createdAt), e.status, e.contact?.name, e.contact?.phone, e.contact?.email, names.get(e.seller) || e.seller,
    e.subtotal, e.tps, e.tvq, e.total, ...(seesAll(user) ? [e.commission, e.directeur] : []), d(e.sentAt), d(e.acceptedAt), d(e.paidAt), e.reviewStatus,
  ]);
  return '﻿' + [cols, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

export { REVIEW };
