// GHL simulado, con plantillas parecidas a las reales de EcoAir.
import http from 'node:http';
import fs from 'node:fs';

// Formato real de GHL (visto en la cuenta EcoAir): calculation 'exclusive' en el impuesto y
// taxInclusive en la línea cuando el precio ya incluye las taxes.
const TPS = { _id: 'tax_tps', name: 'TPS', rate: 5, calculation: 'exclusive', description: 'TPS (5 %)', taxId: '817516875RT0001' };
const TVQ = { _id: 'tax_tvq', name: 'TVQ', rate: 9.975, calculation: 'exclusive', description: 'TVQ (9.975%)', taxId: '1211935304TQ0001' };

export const TEMPLATES = [
  {
    _id: 'tpl_maxi2t',
    name: 'MaxiCentral 2T',
    currency: 'CAD',
    title: 'ESTIMATE',
    businessDetails: { name: 'Le Groupe Eco Air', phoneNo: '(450) 361-3000' },
    discount: { value: 0, type: 'percentage' },
    termsNotes: '<p>Un acompte de 40 % est exigible à la commande.</p>',
    attachments: [{ name: 'MaxiAir spec.pdf', url: 'https://example.test/spec.pdf' }],
    items: [
      { _id: 'i1', name: 'MaxiAirCentral 2T', description: '<p>❄️ Équipement inclus</p><p>🔹 Unité extérieure – MAXS2430 MaxiAir Signature – 2 tonnes</p>', amount: 8700, qty: 1, currency: 'CAD', taxes: [TVQ, TPS], taxInclusive: false, type: 'one_time', attachments: [], productId: 'prod_1' },
      { _id: 'i2', name: 'Garantie Cornerstone MaxiVent', description: '10 ans Mural et central', amount: 475, qty: 1, currency: 'CAD', taxes: [TPS, TVQ], taxInclusive: true, type: 'one_time', attachments: [], productId: 'prod_2', priceId: 'price_2' },
    ],
    total: 10477.83,
  },
  {
    _id: 'tpl_hitachi4t',
    name: 'Hitachi Central 4T',
    currency: 'CAD',
    termsNotes: '<p>Hitachi</p>',
    items: [
      { _id: 'i3', name: 'Hitachi Central 4T', description: 'Unité Hitachi 4 tonnes', amount: 12838.06, qty: 1, taxes: [TPS, TVQ], automaticTaxCategoryId: '' },
      { _id: 'i3b', name: 'module wifi hitachi airgo', description: '', amount: 0, qty: 1, taxes: [], taxInclusive: true, automaticTaxCategoryId: null },
    ],
    total: 14760.56,
  },
  {
    _id: 'tpl_moovair',
    name: 'Moovair Addon3T',
    currency: 'CAD',
    items: [{ _id: 'i4', name: 'Moovair Addon 3T', amount: 0, qty: 1, taxes: [] }],
    total: 0,
  },
];

const VALID_ESTIMATE = (body) => {
  // Validaciones vistas en el GHL real (422)
  const errs = [];
  if (!body.name || body.name.length > 40) errs.push('name must be shorter than or equal to 40 characters');
  if (!body.frequencySettings) errs.push('frequencySettings should not be empty');
  if (typeof body.contactDetails?.email !== 'string' || typeof body.contactDetails?.phoneNo !== 'string') errs.push('contactDetails email/phoneNo must be a string');
  for (const i of body.items || []) for (const [k, v] of Object.entries(i)) if (v === null) errs.push(`items.${k} must not be null`);
  const nulls = (o, path) => { for (const [k, v] of Object.entries(o || {})) { if (v === null) errs.push(`${path}.${k} must not be null`); else if (v && typeof v === 'object' && !Array.isArray(v)) nulls(v, `${path}.${k}`); } };
  nulls(body.contactDetails, 'contactDetails');
  return errs;
};
// total "oficial" como lo haría GHL: impuestos añadidos solo si la línea no los incluye
export const ghlTotal = (items) => {
  let total = 0;
  for (const i of items) {
    const base = i.amount * i.qty;
    total += base + (i.taxInclusive ? [] : i.taxes || []).filter((t) => t.calculation !== 'inclusive').reduce((s, t) => s + Math.round((base * t.rate / 100 + Number.EPSILON) * 100) / 100, 0);
  }
  return Math.round(total * 100) / 100;
};

export function startMockGhl({ failSend = false, failOpp = false } = {}) {
  const calls = [];
  const estimates = [];
  // MOCK_TEMPLATES=archivo.json: usar una copia de las plantillas reales (pruebas de navegador)
  const src = process.env.MOCK_TEMPLATES ? JSON.parse(fs.readFileSync(process.env.MOCK_TEMPLATES, 'utf8')) : TEMPLATES;
  const templates = JSON.parse(JSON.stringify(src)).map((t, i) => ({ updatedAt: `2026-08-0${(i % 9) + 1}T00:00:00.000Z`, updatedBy: 'ghl_nico', ...t }));
  let seq = 110;
  let clock = Date.parse('2026-10-27T12:00:00Z');
  const stamp = () => new Date((clock += 1000)).toISOString();
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    const body = raw ? JSON.parse(raw) : undefined;
    const url = new URL(req.url, 'http://x');
    calls.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body, auth: req.headers.authorization, version: req.headers.version });
    const send = (code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
    const p = url.pathname;
    const m = req.method;
    if (m === 'GET' && p === '/contacts/')
      return send(200, { contacts: [{ id: 'cont_abc123', contactName: 'Marie Tremblay', firstName: 'Marie', lastName: 'Tremblay', email: 'marie@example.com', phone: '+15145550101', city: 'Brossard' }] });
    if (m === 'POST' && p === '/contacts/upsert')
      return send(200, { contact: { id: body.email?.includes('ecoair.test') ? 'cont_staff01' : 'cont_new456', firstName: body.firstName, lastName: body.lastName, email: body.email, phone: body.phone } });

    // Plantillas
    if (m === 'GET' && p === '/invoices/estimate/template') return send(200, { data: templates, totalCount: templates.length });
    if (m === 'POST' && p === '/invoices/estimate/template') {
      if (!body.name || !body.businessDetails || !Array.isArray(body.items)) return send(422, { message: ['name/businessDetails/items required'] });
      const t = { ...body, _id: `tpl_new${++seq}`, total: ghlTotal(body.items), updatedAt: stamp(), updatedBy: 'api' };
      templates.push(t);
      return send(201, t);
    }
    let mm = p.match(/^\/invoices\/estimate\/template\/([^/]+)$/);
    if (mm && m === 'PUT') {
      const t = templates.find((x) => x._id === mm[1]);
      if (!t) return send(404, { message: 'not found' });
      Object.assign(t, body, { total: ghlTotal(body.items), updatedAt: stamp(), updatedBy: 'api' });
      return send(200, t);
    }
    if (mm && m === 'DELETE') {
      const i = templates.findIndex((x) => x._id === mm[1]);
      if (i < 0) return send(404, { message: 'not found' });
      templates.splice(i, 1);
      return send(200, { success: true });
    }

    // Estimates
    if (m === 'POST' && p === '/invoices/estimate') {
      const errs = VALID_ESTIMATE(body);
      if (errs.length) return send(422, { statusCode: 422, message: errs });
      const id = seq === 110 ? 'est_000111' : `est_000${seq + 1}`;
      seq++;
      const e = { ...body, _id: id, estimateNumber: 890 + seq, estimateStatus: 'draft', total: ghlTotal(body.items), updatedAt: stamp(), updatedBy: body.userId || 'api', sentBy: body.userId || 'api' };
      estimates.unshift(e);
      return send(201, e);
    }
    mm = p.match(/^\/invoices\/estimate\/([^/]+)\/send$/);
    if (mm && m === 'POST') {
      if (failSend) return send(422, { message: 'sender not verified' });
      const e = estimates.find((x) => x._id === mm[1]);
      if (e) Object.assign(e, { estimateStatus: 'sent', updatedAt: stamp(), sentBy: body.userId });
      return send(200, { ok: true });
    }
    mm = p.match(/^\/invoices\/estimate\/([^/]+)$/);
    if (mm && m === 'PUT' && mm[1] !== 'template') {
      const e = estimates.find((x) => x._id === mm[1]);
      if (!e) return send(404, { message: 'not found' });
      const errs = VALID_ESTIMATE(body);
      if (errs.length) return send(422, { statusCode: 422, message: errs });
      Object.assign(e, body, { total: ghlTotal(body.items), updatedAt: stamp(), updatedBy: body.userId || 'api' });
      return send(200, e);
    }
    if (m === 'GET' && p === '/invoices/estimate/list') {
      const off = Number(url.searchParams.get('offset')) || 0;
      const lim = Number(url.searchParams.get('limit')) || 100;
      return send(200, { estimates: estimates.slice(off, off + lim), total: estimates.length });
    }

    if (m === 'POST' && p === '/opportunities/') return failOpp ? send(400, { message: 'bad stage' }) : send(201, { opportunity: { id: `opp_${++seq}` } });
    if (m === 'PUT' && /^\/opportunities\/[^/]+$/.test(p)) return failOpp ? send(400, { message: 'bad stage' }) : send(200, { opportunity: { id: p.split('/')[2] } });
    if (m === 'POST' && /^\/contacts\/[^/]+\/tags$/.test(p)) return send(201, { tags: body.tags });
    if (m === 'POST' && /^\/contacts\/[^/]+\/notes$/.test(p)) return send(201, { note: { id: 'note_1' } });
    if (m === 'POST' && p === '/conversations/messages') {
      if (failSend) return send(422, { message: 'sender not verified' });
      if (!body.contactId || !['Email', 'SMS'].includes(body.type)) return send(422, { message: ['type/contactId'] });
      if (body.type === 'Email' && (!body.subject || !body.html)) return send(422, { message: ['subject/html'] });
      if (body.type === 'SMS' && !body.message) return send(422, { message: ['message'] });
      return send(200, { messageId: `msg_${++seq}` });
    }
    return send(404, { message: 'not found' });
  });
  // Simula que alguien cambia algo directamente en GHL
  const touchTemplate = (id, by = 'ghl_jean') => { const t = templates.find((x) => x._id === id); Object.assign(t, { updatedAt: stamp(), updatedBy: by }); };
  const touchEstimate = (id, by = 'ghl_other') => { const e = estimates.find((x) => x._id === id); Object.assign(e, { updatedAt: stamp(), updatedBy: by }); };
  return new Promise((resolve) => server.listen(0, () => resolve({ server, calls, estimates, templates, touchTemplate, touchEstimate, port: server.address().port })));
}
