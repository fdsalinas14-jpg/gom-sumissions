import { ghlConfig } from './config.js';

const VERSION = '2021-07-28';

async function call(method, path, { query, body } = {}) {
  const c = ghlConfig();
  if (!c.token || !c.locationId) {
    const e = new Error('GHL_TOKEN y GHL_LOCATION_ID no están configurados');
    e.status = 500;
    throw e;
  }
  const url = new URL(c.base + path);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${c.token}`,
      Version: VERSION,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 500) };
  }
  if (!r.ok) {
    const e = new Error(`GHL ${method} ${path} → ${r.status}`);
    e.status = r.status === 401 || r.status === 403 ? 502 : r.status >= 500 ? 502 : r.status;
    e.detail = data;
    throw e;
  }
  return data;
}

export const searchContacts = async (q) => {
  const { locationId } = ghlConfig();
  const d = await call('GET', '/contacts/', { query: { locationId, query: q, limit: 20 } });
  return (d.contacts || []).map(slimContact);
};

export const slimContact = (c) => ({
  id: c.id,
  name: c.contactName || [c.firstName, c.lastName].filter(Boolean).join(' ') || c.companyName || c.email || '',
  firstName: c.firstName || '',
  lastName: c.lastName || '',
  email: c.email || '',
  phone: c.phone || '',
  companyName: c.companyName || '',
  address1: c.address1 || '',
  city: c.city || '',
  postalCode: c.postalCode || '',
});

export const upsertContact = async (p) => {
  const { locationId } = ghlConfig();
  const d = await call('POST', '/contacts/upsert', {
    body: {
      locationId,
      firstName: p.firstName,
      lastName: p.lastName || undefined,
      email: p.email || undefined,
      phone: p.phone || undefined,
      companyName: p.companyName || undefined,
      address1: p.address1 || undefined,
      city: p.city || undefined,
      postalCode: p.postalCode || undefined,
      country: 'CA',
      source: 'App Soumission',
      tags: ['soumission'],
    },
  });
  return slimContact(d.contact || d);
};

// ---------- Plantillas de estimate ----------
// Se cachean unos minutos por instancia: cambian poco y GHL tiene límite de peticiones.
let tplCache = { at: 0, list: null };
const TPL_TTL = 5 * 60 * 1000;

// Una línea corta para la tarjeta: la primera que tenga un número (modelo, tonelaje), sin emojis.
const firstLine = (html) => {
  const lines = String(html || '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .split('\n')
    .map((s) => s.replace(/^[^\p{L}\p{N}]+/u, '').trim())
    .filter((s) => s.length > 3);
  return (lines.find((s) => /\d/.test(s)) || lines[0] || '').slice(0, 120);
};

export const normalizeTemplate = (t) => {
  const items = (t.items || []).map((i) => ({
    name: i.name || '',
    description: i.description || '',
    amount: Number(i.amount) || 0,
    qty: Number(i.qty) || 1,
    taxes: Array.isArray(i.taxes) ? i.taxes : [],
    // En GHL real, "impuesto incluido en el precio" es un flag de la línea, no del impuesto.
    taxInclusive: i.taxInclusive === true,
  }));
  return {
    id: t._id || t.id,
    name: t.name || items[0]?.name || '',
    total: Number(t.total ?? t.amountDue ?? 0) || 0,
    summary: items.map((i) => i.name).filter(Boolean).join(' + '),
    hint: firstLine(items[0]?.description),
    items,
    updatedAt: t.updatedAt || '',
    updatedBy: t.updatedBy || '',
    raw: t,
  };
};

export async function listTemplates({ fresh = false } = {}) {
  if (!fresh && tplCache.list && Date.now() - tplCache.at < TPL_TTL) return tplCache.list;
  const { locationId } = ghlConfig();
  const all = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const d = await call('GET', '/invoices/estimate/template', {
      query: { altId: locationId, altType: 'location', limit: 100, offset },
    });
    const page = d.data || d.templates || d.estimateTemplates || [];
    all.push(...page.filter((x) => x && typeof x === 'object'));
    const total = Number(d.totalCount ?? d.total ?? 0);
    if (page.length < 100 || (total && all.length >= total)) break;
  }
  tplCache = { at: Date.now(), list: all.map(normalizeTemplate).filter((t) => t.id) };
  return tplCache.list;
}

// ---------- Oportunidades (estadísticas y pipeline en GHL) ----------
export async function createOpportunity({ pipelineId, stageId, name, contactId, value, assignedTo, status = 'open' }) {
  const { locationId } = ghlConfig();
  const d = await call('POST', '/opportunities/', {
    body: {
      locationId, pipelineId, pipelineStageId: stageId, status, name, contactId, monetaryValue: value,
      ...(assignedTo ? { assignedTo } : {}),
    },
  });
  return (d.opportunity || d).id;
}

export const updateOpportunity = (id, { pipelineId, stageId, status, value, name }) =>
  call('PUT', `/opportunities/${encodeURIComponent(id)}`, {
    body: {
      ...(pipelineId ? { pipelineId } : {}),
      ...(stageId ? { pipelineStageId: stageId } : {}),
      ...(status ? { status } : {}),
      ...(value != null ? { monetaryValue: value } : {}),
      ...(name ? { name } : {}),
    },
  });

// ---------- Contacto: notas y etiquetas (disparan automatizaciones y reportes de GHL) ----------
export const addNote = (contactId, body) =>
  call('POST', `/contacts/${encodeURIComponent(contactId)}/notes`, { body: { body } });

export const addTags = (contactId, tags) =>
  call('POST', `/contacts/${encodeURIComponent(contactId)}/tags`, { body: { tags } });

// ---------- Mensajes por GHL (correo y SMS salen del número/correo de la cuenta) ----------
export function sendEmail(contactId, { subject, html, emailTo }) {
  const c = ghlConfig();
  return call('POST', '/conversations/messages', {
    body: { type: 'Email', contactId, subject, html, ...(emailTo ? { emailTo } : {}), ...(c.fromEmail ? { emailFrom: c.fromEmail } : {}) },
  });
}
export const sendSms = (contactId, message) =>
  call('POST', '/conversations/messages', { body: { type: 'SMS', contactId, message } });

// Contacto para avisos internos (ej. al admin)
const contactIds = new Map();
export async function staffContact(email, name) {
  if (contactIds.has(email)) return contactIds.get(email);
  const c = ghlConfig();
  const d = await call('POST', '/contacts/upsert', { body: { locationId: c.locationId, email, firstName: name || email, tags: ['app-soumissions-equipe'], source: 'App Soumission' } });
  const id = (d.contact || d).id;
  contactIds.set(email, id);
  return id;
}
