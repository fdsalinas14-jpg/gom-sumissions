// Enrutador, barra superior, entrada, lista/tablero, detalle, avis, historial y cuenta.
import {
  S, store, t, m, h, fill, alertBox, api, errText, isSession, go, flash, setRender, fmtDate, refreshUser, quoteNo, warnText,
  loadCatalog, loadSellers, sellerName, page, backLink, loadingBox, statusChip, reviewChip, field, input, select, checkRow, busyBtn, confirmBtn,
} from './core.js';
import { richText } from './preview.js';
import { viewWizard, startNew, startEdit, resetDraft, hasDraft } from './quote.js';
import { viewCatalog, viewProductEdit, viewAddonEdit, viewSellers, viewSellerEdit, viewSettings } from './backoffice.js';

const root = document.getElementById('app');
const STATUSES = ['draft', 'sent', 'reminder', 'accepted', 'lost', 'paid'];

/* ================= Navegación ================= */
async function boot() {
  document.documentElement.lang = S.lang;
  await refreshUser();
  render();
}

function route() {
  const [a, b, c] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const adm = S.user.isAdmin;
  const all = S.user.seesAll; // admin complet ou « Admin View » (lecture seule)
  if (a === 'new') return { tab: 'quotes', view: viewWizard(b) };
  if (a === 'q' && b) {
    if (c === 'edit') { startEdit(b).catch((e) => { if (!isSession(e)) { flash(errText(e), 'err'); go(`q/${b}`); } }); return { tab: 'quotes', view: page(loadingBox()) }; }
    return { tab: 'quotes', view: viewQuote(b) };
  }
  if (a === 'reviews') return { tab: 'reviews', view: viewReviews() };
  if (a === 'history') return { tab: all ? 'more' : 'history', view: viewHistory() };
  if (a === 'account') return { tab: all ? 'more' : 'account', view: viewAccount() };
  if (all && !adm) {
    if (a === 'more') return { tab: 'more', view: viewMore() };
    if (a === 'sellers') return { tab: 'more', view: viewSellers({ readOnly: true }) };
  }
  if (adm) {
    if (a === 'more') return { tab: 'more', view: viewMore() };
    if (a === 'catalog' && b === 'p') return { tab: 'catalog', view: viewProductEdit(c) };
    if (a === 'catalog' && b === 'o') return { tab: 'catalog', view: viewAddonEdit(c) };
    if (a === 'catalog') return { tab: 'catalog', view: viewCatalog(b) };
    if (a === 'sellers' && b) return { tab: 'more', view: viewSellerEdit(b) };
    if (a === 'sellers') return { tab: 'more', view: viewSellers() };
    if (a === 'settings') return { tab: 'more', view: viewSettings() };
  }
  return { tab: 'quotes', view: viewHome() };
}

function render(msg) {
  fill(root);
  if (!S.user) return root.append(viewLogin(msg));
  const { tab, view } = route();
  const note = S.flash ? h('div', { class: 'flash' }, alertBox(S.flash.text, S.flash.kind)) : null;
  S.flash = null;
  root.append(topBar(), navBar(tab), note || '', view);
  window.scrollTo(0, 0);
}
setRender(render);
window.addEventListener('hashchange', () => render());

function topBar() {
  const langBtn = (code, label) => h('button', {
    class: 'pill', type: 'button', 'aria-pressed': String(S.lang === code),
    onclick: () => { S.lang = code; store.set('ec_lang', code); document.documentElement.lang = code; render(); },
  }, label);
  return h('header', { class: 'top' },
    h('a', { class: 'brand', href: '#/home', 'aria-label': 'Climatisation GOM' }, h('img', { src: '/logo-gom.png', alt: 'Climatisation G.O.M.' })),
    h('div', { class: 'top-tools' },
      h('span', { class: 'who' }, S.user.display),
      langBtn('fr', 'FR'), langBtn('en', 'EN'),
      h('button', {
        class: 'pill', type: 'button',
        onclick: async () => {
          try { await api('DELETE', 'session'); } catch {}
          S.user = null; S.cat = null; S.sellers = null; resetDraft(); location.hash = '#/home'; render();
        },
      }, t('signOut'))));
}

function navBar(active) {
  const tabs = S.user.isAdmin
    ? [['quotes', 'home', t('navQuotes')], ['reviews', 'reviews', t('navReviews')], ['catalog', 'catalog', t('navCatalog')], ['more', 'more', t('navMore')]]
    : S.user.seesAll ? [['quotes', 'home', t('navQuotes')], ['reviews', 'reviews', t('navReviews')], ['more', 'more', t('navMore')]]
    : [['quotes', 'home', t('navQuotes')], ['reviews', 'reviews', t('navReviews')], ['history', 'history', t('navHistory')], ['account', 'account', t('account')]];
  return h('nav', { class: 'tabs', 'aria-label': 'Menu' },
    h('div', { class: 'tabs-in', style: `grid-template-columns: repeat(${tabs.length}, 1fr)` },
      tabs.map(([key, href, label]) => h('a', { class: key === active ? 'tab on' : 'tab', href: `#/${href}`, 'aria-current': key === active ? 'page' : null }, label))));
}

/* ================= Entrada ================= */
function viewLogin(msg) {
  const user = input({ autocomplete: 'username', autocapitalize: 'none', spellcheck: false, value: store.get('ec_last_user') || '' });
  const pass = input({ type: 'password', autocomplete: 'current-password' });
  const err = h('div', {}, msg ? alertBox(msg, 'info') : null);
  const btn = h('button', { class: 'btn big hi', type: 'submit' }, t('signIn'));
  const form = h('form', {
    class: 'login',
    onsubmit: async (e) => {
      e.preventDefault();
      btn.disabled = true;
      fill(err);
      try {
        const r = await api('POST', 'session', { user: user.value.trim().toLowerCase(), password: pass.value });
        store.set('ec_last_user', user.value.trim().toLowerCase());
        S.user = r.user;
        render();
      } catch (x) {
        fill(err, alertBox(x.status === 401 ? t('badLogin') : t('error')));
        btn.disabled = false;
      }
    },
  },
  h('div', { class: 'brand-lg' }, h('img', { src: '/logo-gom.png', alt: 'Climatisation G.O.M.' })),
  h('h1', {}, 'Soumissions'),
  h('p', { class: 'lead' }, t('loginHint')),
  field(t('user'), user), field(t('password'), pass), err, btn,
  h('div', { class: 'login-lang' }, ['fr', 'en'].map((code) => h('button', {
    class: S.lang === code ? 'seg on' : 'seg', type: 'button',
    onclick: () => { S.lang = code; store.set('ec_lang', code); document.documentElement.lang = code; render(); },
  }, code === 'fr' ? 'Français' : 'English'))));
  setTimeout(() => (user.value ? pass : user).focus(), 30);
  return form;
}

/* ================= Lista / tablero ================= */
const F = { status: '', seller: '', from: '', to: '', q: '' };
const qs = (o) => Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

function viewHome() {
  const adm = S.user.seesAll;
  const statsBox = h('div', { class: 'stats' });
  const listBox = h('div', {}, loadingBox());
  const countBox = h('p', { class: 'muted' });
  let offset = 0;

  const load = async (more = false) => {
    if (!more) { offset = 0; fill(listBox, loadingBox()); }
    try {
      await loadCatalog();
      const r = await api('GET', `estimates?${qs({ ...F, limit: 30, offset })}`);
      S.sellers = r.sellers;
      paintStats(r.stats);
      fill(countBox, t('countOf', r.total));
      const items = r.estimates.map(quoteCard);
      const ul = more ? listBox.querySelector('ul') : h('ul', { class: 'quotes' });
      ul.append(...items);
      offset += r.estimates.length;
      const moreBtn = offset < r.total ? h('button', { class: 'btn more', type: 'button', onclick: () => load(true) }, t('showMore')) : null;
      fill(listBox, r.total ? [ul, moreBtn] : h('p', { class: 'empty' }, t('emptyList')));
    } catch (e) { if (!isSession(e)) fill(listBox, alertBox(errText(e))); }
  };

  const paintStats = (stats) => fill(statsBox, STATUSES.map((s) => h('button', {
    class: `stat st-${s}${F.status === s ? ' on' : ''}`, type: 'button', 'aria-pressed': String(F.status === s),
    onclick: () => { F.status = F.status === s ? '' : s; load(); },
  }, h('span', { class: 'stat-label' }, t(`status_${s}`)), h('span', { class: 'stat-n' }, stats[s].n), h('span', { class: 'stat-amt' }, m(stats[s].total)),
  adm && stats[s].commission ? h('span', { class: 'stat-comm' }, `${t('commissionInt')}: ${m(stats[s].commission)}`) : null)));

  // Filtros
  const search = input({ type: 'search', value: F.q, placeholder: t('filterSearch'), 'aria-label': t('filterSearch') });
  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { F.q = search.value.trim(); load(); }, 400); });
  const from = input({ type: 'date', value: F.from });
  const to = input({ type: 'date', value: F.to });
  from.addEventListener('change', () => { F.from = from.value; load(); });
  to.addEventListener('change', () => { F.to = to.value; load(); });
  const sellerSel = h('div');
  if (adm) {
    loadSellers().then((list) => {
      const el = select([['', t('everyone')], ...list.map((s) => [s.name, s.display])], F.seller);
      el.addEventListener('change', () => { F.seller = el.value; load(); });
      fill(sellerSel, field(t('filterSeller'), el));
    }).catch(() => {});
  }
  const csv = h('a', { class: 'btn', href: '#', download: '' }, t('exportCsv'));
  csv.addEventListener('click', () => { csv.href = `/api/estimates?${qs({ ...F, format: 'csv' })}`; });
  const anyFilter = F.from || F.to || F.seller;

  load();
  return h('main', { class: 'page wide-list' },
    h('div', { class: 'home-actions' },
      h('button', { class: 'btn big hi', type: 'button', onclick: () => startNew() }, t('newQuote')),
      hasDraft() ? h('button', { class: 'btn big', type: 'button', onclick: () => go('new/1') }, t('continueDraft')) : null),
    h('h1', { class: 'h-list' }, adm ? t('quotes') : t('myQuotes')),
    h('p', { class: 'muted small' }, t('totalsByStatus')),
    statsBox,
    field(t('search'), search),
    h('details', { class: 'card fold', open: !!anyFilter },
      h('summary', { class: 'h3' }, t('filters')),
      sellerSel,
      h('div', { class: 'two-col' }, field(t('filterFrom'), from), field(t('filterTo'), to)),
      h('div', { class: 'tools' }, csv,
        anyFilter || F.status || F.q ? h('button', { class: 'link', type: 'button', onclick: () => { Object.assign(F, { status: '', seller: '', from: '', to: '', q: '' }); render(); } }, t('clearFilters')) : null)),
    countBox, listBox);
}

function quoteCard(e) {
  const adm = S.user.seesAll;
  return h('li', {}, h('a', { class: 'quote link-card', href: `#/q/${e.id}` },
    h('div', {},
      h('div', { class: 'q-who' }, e.contact?.name || '—'),
      h('div', { class: 'q-what' }, [quoteNo(e.number), fmtDate(e.createdAt, false), adm || e.seller !== S.user.name ? sellerName(e.seller) : null].filter(Boolean).join(' · '))),
    h('div', { class: 'q-amt' }, m(e.total)),
    h('div', { class: 'q-chips' }, statusChip(e.status), e.status === 'paid' && e.reviewStatus !== 'none' ? reviewChip(e.reviewStatus) : null)));
}

/* ================= Detalle ================= */
function viewQuote(id) {
  const main = page(backLink('home'), loadingBox());
  const load = async () => {
    try {
      await loadCatalog();
      await loadSellers();
      const r = await api('GET', `estimates?id=${encodeURIComponent(id)}`);
      fill(main, backLink('home'), detail(r, load));
    } catch (e) { if (!isSession(e)) fill(main, backLink('home'), alertBox(errText(e))); }
  };
  load();
  return main;
}

function detail({ estimate: e, pdf, sign, events }, reload) {
  const adm = S.user.isAdmin;
  // « Admin View »: voit tout, mais ne change que ses propres soumissions
  const canWrite = adm || e.seller === S.user.name || e.createdBy === S.user.name;
  const c = e.contact || {};
  const err = h('div');
  const panel = h('div');
  const editable = canWrite && (['draft', 'sent', 'reminder'].includes(e.status) || adm);

  const run = async (action, body = {}) => {
    fill(err);
    const x = await api('POST', `estimates?id=${e.id}&action=${action}`, body);
    if (action === 'delete') { flash(t('done')); go('home'); return; }
    if (action === 'duplicate') { flash(t('done')); go(`q/${x.estimate.id}`); return; }
    const ws = warnText(x.warnings);
    const sentTxt = x.sent?.length ? t('sentTo', x.sent.map((s) => (s === 'email' ? t('byEmail') : t('bySms'))).join(' + ')) : t('done');
    flash([sentTxt, ...ws].join(' '), ws.length ? 'warn' : 'ok');
    render();
  };
  const act = (label, cls, action, body) => busyBtn(label, cls, () => run(action, typeof body === 'function' ? body() : body), err);

  // Panel para elegir canales (enviar, rappel, avis)
  const channelPanel = (action, label) => {
    const ch = { email: !!c.email, sms: !!c.phone };
    fill(panel, h('div', { class: 'card send-panel' },
      h('p', { class: 'h3' }, t('sendBy')),
      checkRow(`${t('byEmail')}${c.email ? ` — ${c.email}` : ''}`, ch.email, (v) => { ch.email = v; }, { disabled: !c.email }),
      checkRow(`${t('bySms')}${c.phone ? ` — ${c.phone}` : ''}`, ch.sms, (v) => { ch.sms = v; }, { disabled: !c.phone }),
      h('div', { class: 'final-btns' },
        busyBtn(label, 'big hi', async () => {
          const channels = Object.entries(ch).filter(([, v]) => v).map(([k]) => k);
          if (!channels.length) { fill(err, alertBox(t('pickChannel'))); return; }
          await run(action, { channels });
        }, err),
        h('button', { class: 'btn big', type: 'button', onclick: () => fill(panel) }, t('cancel')))));
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const openBtn = (label, cls, action, btnLabel = label) => h('button', { class: `btn ${cls}`, type: 'button', disabled: !c.email && !c.phone, onclick: () => channelPanel(action, btnLabel) }, label);

  const S_ = e.status;
  const actions = [];
  if (!canWrite) { /* lecture seule */ } else {
  if (S_ === 'draft') actions.push(openBtn(t('actSend'), 'big hi', 'send'));
  if (S_ === 'sent' || S_ === 'reminder') actions.push(openBtn(t('actRemind'), 'big hi', 'remind'));
  if (['draft', 'sent', 'reminder', 'lost'].includes(S_)) actions.push(act(t('actAccept'), 'big ok', 'accept'));
  if (['sent', 'reminder', 'accepted'].includes(S_)) actions.push(act(t('actPay'), 'big ok', 'pay'));
  if (S_ === 'paid') {
    if (e.reviewStatus === 'none' || e.reviewStatus === 'not_completed') actions.push(openBtn(t('actReview'), 'big hi', 'review_request'));
    if (e.reviewStatus !== 'completed') actions.push(act(t('actReviewDone'), 'big ok', 'review_done'));
    if (e.reviewStatus === 'requested') actions.push(act(t('actReviewFailed'), 'big', 'review_failed'));
  }
  if (editable) actions.push(h('button', { class: 'btn big', type: 'button', onclick: () => go(`q/${e.id}/edit`) }, t('edit')));
  if (S_ === 'sent' || S_ === 'reminder') actions.push(openBtn(t('actResend'), 'big', 'send'));
  if (['draft', 'sent', 'reminder', 'accepted'].includes(S_)) actions.push(act(t('actLose'), 'big danger-outline', 'lose'));
  }

  const statusFix = adm ? (() => {
    const sel = select(STATUSES.map((s) => [s, t(`status_${s}`)]), S_);
    return h('details', { class: 'card fold' }, h('summary', { class: 'h3' }, t('setStatus')),
      sel, h('div', { class: 'tools top-gap' }, act(t('apply'), '', 'set_status', () => ({ status: sel.value }))));
  })() : null;

  const copyBtn = h('button', { class: 'btn', type: 'button' }, t('copyLink'));
  copyBtn.addEventListener('click', async () => {
    const link = sign || pdf; // página del cliente: ver, descargar y firmar
    try { await navigator.clipboard.writeText(link); copyBtn.textContent = t('linkCopied'); } catch { window.prompt?.('', link); }
  });

  const dates = [['sentAt', 'status_sent'], ['reminderAt', 'status_reminder'], ['acceptedAt', 'status_accepted'], ['lostAt', 'status_lost'], ['paidAt', 'status_paid']]
    .filter(([k]) => e[k]).map(([k, l]) => h('li', {}, h('span', {}, t(l)), h('span', {}, fmtDate(e[k]))));

  return [
    h('p', { class: 'step-of' }, quoteNo(e.number), ' ', statusChip(S_), S_ === 'paid' ? reviewChip(e.reviewStatus) : null),
    h('h1', {}, c.name || '—'),
    h('p', { class: 'pick-sub' }, c.phone ? h('a', { href: `tel:${c.phone}` }, c.phone) : null, c.phone && c.email ? ' · ' : '', c.email || ''),
    h('div', { class: 'card' },
      h('div', { class: 'grand first' }, h('span', {}, t('total')), h('strong', {}, m(e.total))),
      h('p', { class: 'muted' }, `${t('seller')}: ${sellerName(e.seller)} · ${fmtDate(e.createdAt, false)}`),
      e.commission > 0 ? h('p', { class: 'muted small' }, `${t('commissionInt')}: ${m(e.commission)}`) : null,
      e.directeur > 0 ? h('p', { class: 'muted small' }, `${t('directeurInt')}: ${m(e.directeur)}`) : null,
      !canWrite ? h('p', { class: 'chip' }, t('readOnly')) : null,
      h('div', { class: 'tools' }, h('a', { class: 'btn primary', href: pdf, target: '_blank', rel: 'noopener' }, t('viewPdf')), copyBtn)),
    // Firma electrónica del cliente
    e.signedAt ? h('div', { class: 'card signed-box' },
      h('p', { class: 'h3' }, `✍ ${t('signedOnline', e.signedName, fmtDate(e.signedAt))}`),
      e.signature ? h('img', { class: 'sig-img', src: e.signature, alt: t('signature') }) : null)
      : ['sent', 'reminder'].includes(S_) ? h('p', { class: 'muted small' }, t('waitingSignature')) : null,
    err, panel,
    h('div', { class: 'final-btns actions' }, actions),
    h('div', { class: 'card' },
      h('p', { class: 'h3' }, t('lines')),
      h('ul', { class: 'summary' }, e.lines.map((l) => h('li', {},
        h('span', {}, `${l.qty}${l.unit === 'ft' ? ` ${t('ftShort')}` : ' ×'} ${l.name}`,
          l.kind === 'equipment' && S.user.seesAll && l.base != null ? h('span', { class: 'muted small block' },
            `${l.special ? `${t('special')} · ` : ''}${t('basePrice')} ${m(l.base)} + ${t('commissionShort')} ${m(l.commissionUnit ?? (l.price - l.base - (l.directeurUnit || 0)))}${l.directeurUnit ? ` + ${t('directeurShort')} ${m(l.directeurUnit)}` : ''} → ${t('clientPrice')} ${m(l.price)}`) : null,
          l.description ? h('details', { class: 'fold' }, h('summary', { class: 'link' }, t('seeDescription')), richText(l.description, 'rt line-desc')) : null),
        h('span', {}, m(l.amount))))),
      h('ul', { class: 'summary' },
        h('li', {}, h('span', {}, t('subtotal')), h('span', {}, m(e.subtotal))),
        h('li', {}, h('span', {}, 'TPS'), h('span', {}, m(e.tps))),
        h('li', {}, h('span', {}, 'TVQ'), h('span', {}, m(e.tvq))))),
    e.notes ? h('div', { class: 'card' }, h('p', { class: 'h3' }, t('notes')), h('p', { class: 'pre' }, e.notes)) : null,
    e.internalNote ? h('div', { class: 'card internal' }, h('p', { class: 'h3' }, t('internalNote')), h('p', { class: 'pre' }, e.internalNote)) : null,
    dates.length ? h('div', { class: 'card' }, h('ul', { class: 'summary' }, dates)) : null,
    statusFix,
    canWrite ? h('div', { class: 'tools' },
      act(t('actDuplicate'), '', 'duplicate'),
      S_ === 'draft' || adm ? confirmBtn(t('actDelete'), t('confirmDelete'), () => run('delete').catch((x) => fill(err, alertBox(errText(x))))) : null) : null,
    events?.length ? [h('p', { class: 'h2' }, t('timeline')), eventList(events)] : null,
  ];
}

/* ================= Avis ================= */
function viewReviews() {
  const box = h('div', {}, loadingBox());
  (async () => {
    try {
      await loadSellers();
      const r = await api('GET', 'estimates?status=paid&review=none,requested,not_completed&limit=200');
      if (!r.estimates.length) return fill(box, h('p', { class: 'empty' }, t('noReviews')));
      const err = h('div');
      const groups = ['requested', 'none', 'not_completed'].map((k) => [k, r.estimates.filter((e) => e.reviewStatus === k)]).filter(([, l]) => l.length);
      fill(box, err, groups.map(([k, list]) => [h('p', { class: 'h2' }, t(`review_${k}`), ` (${list.length})`),
        h('ul', { class: 'quotes' }, list.map((e) => h('li', { class: 'card review-card' },
          h('a', { class: 'q-who', href: `#/q/${e.id}` }, e.contact?.name || '—'),
          h('div', { class: 'q-what' }, [quoteNo(e.number), m(e.total), sellerName(e.seller)].join(' · ')),
          h('div', { class: 'q-what' }, t('paidOn', fmtDate(e.paidAt, false)), e.reviewRequestedAt ? ` · ${t('requestedOn', fmtDate(e.reviewRequestedAt, false))}` : ''),
          e.contact?.phone ? h('a', { class: 'btn call', href: `tel:${e.contact.phone}` }, `☎ ${e.contact.phone}`) : null,
          // « Admin View »: consultation seulement pour les soumissions des autres
          !(S.user.isAdmin || e.seller === S.user.name || e.createdBy === S.user.name) ? null : h('div', { class: 'tools' },
            k !== 'requested' ? busyBtn(t('actReview'), 'hi', async () => { const x = await api('POST', `estimates?id=${e.id}&action=review_request`, {}); flash([t('done'), ...warnText(x.warnings)].join(' ')); render(); }, err) : null,
            busyBtn(t('actReviewDone'), 'ok', async () => { await api('POST', `estimates?id=${e.id}&action=review_done`, {}); flash(t('done')); render(); }, err),
            k === 'requested' ? busyBtn(t('actReviewFailed'), '', async () => { await api('POST', `estimates?id=${e.id}&action=review_failed`, {}); flash(t('done')); render(); }, err) : null))))]));
    } catch (e) { if (!isSession(e)) fill(box, alertBox(errText(e))); }
  })();
  return page(h('h1', {}, t('reviews')), h('p', { class: 'lead' }, t('reviewsHelp')), box);
}

/* ================= Historial ================= */
const evLabel = (ev) => {
  const a = t('act')[ev.action];
  if (a) return a;
  if (String(ev.action).startsWith('catalog.')) return t('actCatalog');
  return ev.action;
};
function eventList(events) {
  return h('ul', { class: 'events' }, events.map((ev) => {
    const link = ev.target_type === 'estimate' && ev.action !== 'estimate.deleted' && /^\d+$/.test(ev.target_id || '') ? `#/q/${ev.target_id}` : null;
    const inner = [h('div', { class: 'ev-when' }, fmtDate(ev.at)),
      h('div', { class: 'ev-what' }, h('strong', {}, ev.actor === 'client' ? t('theClient') : ev.actorName || sellerName(ev.actor) || ev.actor), ' ', evLabel(ev), ev.title ? ` — ${ev.title}` : '')];
    return h('li', { class: 'ev' }, link ? h('a', { href: link }, inner) : h('div', {}, inner));
  }));
}
function viewHistory() {
  const box = h('div', {}, loadingBox());
  const who = h('div');
  const load = async (person = '') => {
    try {
      const r = await api('GET', `history?limit=200${person ? `&who=${encodeURIComponent(person)}` : ''}`);
      if (r.people && !who.firstChild) {
        const sel = select([['', t('everyone')], ...r.people.map((p) => [p.name, p.display])], person);
        sel.addEventListener('change', () => load(sel.value));
        fill(who, field(t('whoFilter'), sel));
      }
      fill(box, r.events.length ? eventList(r.events) : h('p', { class: 'empty' }, t('noHistory')));
    } catch (e) { if (!isSession(e)) fill(box, alertBox(errText(e))); }
  };
  load();
  return page(S.user.seesAll ? backLink('more') : null, h('h1', {}, t('history')), who, box);
}

/* ================= Cuenta ================= */
function viewAccount() {
  const cur = input({ type: 'password', autocomplete: 'current-password' });
  const pw = input({ type: 'password', autocomplete: 'new-password', minLength: 8 });
  const err = h('div');
  return page(S.user.seesAll ? backLink('more') : null,
    h('h1', {}, t('account')),
    h('div', { class: 'card' }, h('p', { class: 'client-name' }, S.user.display), h('p', { class: 'muted' }, `${t('user')}: ${S.user.name} · ${t(`role_${S.user.role}`)}`)),
    h('div', { class: 'card' },
      h('p', { class: 'h3' }, t('changePw')),
      field(t('currentPw'), cur), field(t('newPw'), pw), err,
      h('div', { class: 'final-btns' }, busyBtn(t('changePw'), 'big primary', async () => {
        await api('PUT', 'session', { current: cur.value, password: pw.value });
        cur.value = ''; pw.value = '';
        fill(err, alertBox(t('pwChanged'), 'ok'));
      }, err))));
}

/* ================= Más (admin) ================= */
function viewMore() {
  const link = (href, label, sub) => h('li', {}, h('a', { class: 'pick', href: `#/${href}` }, h('span', { class: 'pick-name' }, label), sub ? h('span', { class: 'pick-sub' }, sub) : null));
  return page(h('h1', {}, t('navMore')),
    h('ul', { class: 'pick-list' },
      link('sellers', t('sellers'), S.user.isAdmin ? t('moreSellers') : t('moreSellersView')),
      S.user.isAdmin ? link('settings', t('settings'), t('moreSettings')) : null,
      link('history', t('history')),
      link('account', t('account'))));
}

boot();
