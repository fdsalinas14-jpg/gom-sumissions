// Precios de una soumission (lo usan el navegador y el servidor: mismo cálculo en los dos lados).
//
// Línea: { kind: 'equipment'|'addon', name, model, description, qty, base, price, tax, unit }
//   equipment: el vendedor escribe `base` (sin comisión) y su comisión por unidad (`commissionUnit`, en $);
//              si no la escribe, se usa el % del vendedor. `directeurUnit`: línea interna « Directeur des ventes »
//              (si está activada en Réglages). `price` = base + comisión + directeur.
//              El cliente solo ve `price`: la comisión y el directeur nunca aparecen en el PDF.
//   addon:     `price` viene del catálogo (o del vendedor si la opción es editable).
//   tax: 'added' (TPS+TVQ en plus) | 'included' (precio con taxes) | 'none' (sin taxes, ej. subvención)
export const TPS_RATE = 5;
export const TVQ_RATE = 9.975;

export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const clientPrice = (base, pct) => r2((Number(base) || 0) * (1 + (Number(pct) || 0) / 100));

// Comisión por unidad: la que eligió el vendedor, o el % del vendedor sobre su precio
export const commissionOf = (l, pct) => (l.commissionUnit != null && l.commissionUnit !== '' && Number.isFinite(Number(l.commissionUnit))
  ? r2(Number(l.commissionUnit)) : r2((Number(l.base) || 0) * (Number(pct) || 0) / 100));

export function priceLines(lines, commissionPct) {
  return lines.map((l) => {
    const qty = Number(l.qty) || 0;
    if (l.kind === 'equipment') {
      const commissionUnit = commissionOf(l, commissionPct);
      const directeurUnit = r2(Number(l.directeurUnit) || 0);
      const price = r2((Number(l.base) || 0) + commissionUnit + directeurUnit);
      return { ...l, qty, commissionUnit, directeurUnit, price, amount: r2(price * qty), commission: r2(commissionUnit * qty), directeur: r2(directeurUnit * qty) };
    }
    const price = r2(l.price);
    return { ...l, qty, price, amount: r2(price * qty), commission: 0, directeur: 0 };
  });
}

export function totals(priced) {
  const subtotal = r2(priced.reduce((s, l) => s + l.amount, 0));
  const taxable = r2(priced.filter((l) => l.tax === 'added').reduce((s, l) => s + l.amount, 0));
  const tps = r2(taxable * TPS_RATE / 100);
  const tvq = r2(taxable * TVQ_RATE / 100);
  const commission = r2(priced.reduce((s, l) => s + (l.commission || 0), 0));
  const directeur = r2(priced.reduce((s, l) => s + (l.directeur || 0), 0));
  return { subtotal, taxable, tps, tvq, total: r2(subtotal + tps + tvq), commission, directeur };
}

// Aide financière (AHRI + subvention estimée) al final de la descripción del equipo
export function withRebate(desc, p, lang = 'fr') {
  if (!p?.ahri && !(Number(p?.subsidy) > 0)) return desc || '';
  const fr = lang !== 'en';
  const out = [String(desc || '').trim(), fr ? '# Aide financière – Hydro-Québec' : '# Financial aid – Hydro-Québec'];
  if (p.ahri) out.push(`• AHRI: ${p.ahri}`);
  if (Number(p.subsidy) > 0) out.push(`• ${fr ? 'Subvention estimée' : 'Estimated rebate'}: ${money(p.subsidy, lang)}`);
  return out.filter(Boolean).join('\n');
}

export const money = (n, lang = 'fr') =>
  new Intl.NumberFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD' }).format(Number(n) || 0);

// Capacidad legible: 2.5 → "2,5 T" ; 12000 → "12 000 BTU"
export function capLabel(value, unit, lang = 'fr') {
  const v = Number(value);
  if (unit === 'ton') return `${String(v).replace('.', lang === 'fr' ? ',' : '.')} ${lang === 'fr' ? 'T' : 'Ton'}`;
  if (unit === 'btu') return `${new Intl.NumberFormat(lang === 'fr' ? 'fr-CA' : 'en-CA').format(v)} BTU`;
  return String(v);
}

/* ---------- Règles officielles ECOAIR (document « Price Calculation Logic », 14 nov. 2026) ----------
 * Prix de base ECOAIR (sans commission) = équipement (prix de liste × multiplicateur du fabricant)
 *   + quincaillerie + main-d’œuvre + profit ECOAIR.
 * Le « Directeur des ventes » ne fait pas partie du prix de base: c’est une ligne interne, comme la commission.
 * Quand le document ne dit rien (ex. quincaillerie Steffes, main-d’œuvre add-on), on garde le montant du Excel. */
export const MULTIPLIERS = { York: 0.35, Vanee: 0.38, Steffes: 0.5, Hitachi: 0.36, Elios: 0.36, 'Direct Air': 0.375 };

export const PRICE_RULES = {
  central: { quinc: (t) => (t <= 2 ? 1200 : t <= 4 ? 1500 : 2200), labour: () => 1500, profit: 3000, special: 2500 },
  steffes: { quinc: (t) => (t <= 3 ? 1500 : 2000), labour: (t) => (t <= 3 ? 3000 : 4000), profit: 5000, special: 4000 },
  addon: { quinc: () => 800, labour: (t) => (t >= 4 ? 1200 : 1000), profit: 1800 },
  wall: { quinc: () => 600, labour: () => 800, profit: 800 },
  multi: { quinc: () => 1500, labour: () => 1000, profit: 1500 },
  // gainable branché sur un condenseur multizone = « Multisplit gainable + 1–3 zones »
  gainable: { quinc: () => 1500, labour: () => 1500, profit: 3000 },
  console: { quinc: () => 1500, labour: () => 1000, profit: 1500 },
  floorceiling: { quinc: () => 1500, labour: () => 1000, profit: 1500 },
};
// Prix MINIMUM = base ECOAIR + 1 000 $ (centrales, Steffes, add-on…) ou + 500 $ (murales)
export const minMargin = (category) => (category === 'wall' ? 500 : 1000);
// « Spécial » (volume): seulement l’admin complet, sur une ligne centrale ou Steffes
export const SPECIAL_DISCOUNT = { central: 500, steffes: 1000 };
export const specialOf = (category) => SPECIAL_DISCOUNT[category] || 0;

// equipment = coût des pièces déjà multiplié; tons pour les règles par tonnage
export function ecoBase(category, { equipment = 0, tons = 0, quinc, labour, profit } = {}) {
  const r = PRICE_RULES[category];
  if (!r) return null;
  const q = quinc ?? r.quinc(tons);
  const mo = labour ?? r.labour(tons);
  const pr = profit ?? r.profit;
  const base = r2(Number(equipment) + q + mo + pr);
  return { equipment: r2(equipment), quinc: q, labour: mo, profit: pr, base, min: r2(base + minMargin(category)) };
}
