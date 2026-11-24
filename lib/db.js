// Base de datos de la app (v3): usuarios, catálogo, soumissions, ajustes e historial.
// Producción: Neon (DATABASE_URL). Local y pruebas: PGlite (Postgres real en memoria).
const SCHEMA = [
  `create table if not exists ec_users (
     name text primary key,
     display text not null,
     role text not null default 'seller',          -- admin | viewer (Admin View, lecture) | seller
     pass_hash text not null,
     session_v int not null default 1,              -- sube al cambiar la clave: cierra sesiones viejas
     commission_pct numeric(6,3) not null default 0, -- comisión oculta del vendedor (%)
     ghl_user_id text,
     email text,
     phone text,
     active boolean not null default true,
     created_at timestamptz not null default now())`,

  `create table if not exists ec_categories (
     id serial primary key,
     code text unique not null,
     name_fr text not null,
     name_en text not null,
     unit text not null default 'none',             -- ton | btu | none
     sort int not null default 0,
     active boolean not null default true)`,

  `create table if not exists ec_brands (
     id serial primary key,
     category_id int not null references ec_categories(id) on delete cascade,
     name text not null,
     sort int not null default 0,
     active boolean not null default true,
     unique (category_id, name))`,

  `create table if not exists ec_capacities (
     id serial primary key,
     brand_id int not null references ec_brands(id) on delete cascade,
     value numeric(10,2) not null,                  -- toneladas o BTU
     active boolean not null default true,
     unique (brand_id, value))`,

  `create table if not exists ec_products (
     id serial primary key,
     category_id int not null references ec_categories(id),
     brand_id int references ec_brands(id),
     capacity_id int references ec_capacities(id),
     name text not null,
     model text not null default '',
     description_fr text not null default '',
     description_en text not null default '',
     base_price numeric(12,2) not null default 0,
     heads int,                                     -- multi-split: número de cabezas
     attachments jsonb not null default '[]',       -- [{name,url}] fichas técnicas
     default_addons jsonb not null default '[]',    -- [{addonId, price}] opciones que se agregan solas
     source_template_id text unique,                -- plantilla GHL de origen (importación)
     active boolean not null default true,
     sort int not null default 0,
     updated_at timestamptz not null default now())`,

  `create table if not exists ec_addons (
     id serial primary key,
     kind text not null,                            -- warranty | lineset | electrical | accessory | credit
     name text not null,
     model text not null default '',
     description_fr text not null default '',
     description_en text not null default '',
     price numeric(12,2) not null default 0,
     price_mode text not null default 'fixed',      -- fixed | per_head | per_foot
     tax text not null default 'added',             -- added | included | none
     editable boolean not null default false,       -- el vendedor puede cambiar el precio
     category_ids int[] not null default '{}',      -- vacío = todas
     brand_ids int[] not null default '{}',
     active boolean not null default true,
     sort int not null default 0,
     unique (kind, name))`,

  `create table if not exists ec_estimates (
     id serial primary key,
     number int unique not null,
     status text not null default 'draft',          -- draft | sent | reminder | accepted | lost | paid
     lang text not null default 'fr',
     contact jsonb not null,
     ghl_contact_id text,
     ghl_opportunity_id text,
     seller text not null,
     created_by text not null,
     lines jsonb not null,
     subtotal numeric(12,2) not null,
     tps numeric(12,2) not null,
     tvq numeric(12,2) not null,
     total numeric(12,2) not null,
     commission numeric(12,2) not null default 0,  -- interno, nunca va al cliente
     notes text not null default '',               -- notas para el cliente (salen en el PDF)
     internal_note text not null default '',
     valid_days int not null default 30,
     issue_date date not null default ((now() at time zone 'America/Toronto')::date),
     sent_at timestamptz, reminder_at timestamptz, accepted_at timestamptz, lost_at timestamptz, paid_at timestamptz,
     review_status text not null default 'none',   -- none | requested | completed | not_completed
     review_requested_at timestamptz, review_done_at timestamptz,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now())`,
  `create index if not exists ec_estimates_status on ec_estimates (status, created_at desc)`,
  `create index if not exists ec_estimates_seller on ec_estimates (seller, created_at desc)`,
  `create sequence if not exists ec_estimate_number start 1001`,

  `create table if not exists ec_settings (key text primary key, value jsonb not null)`,

  `create table if not exists ec_events (
     id bigserial primary key,
     at timestamptz not null default now(),
     actor text not null,
     action text not null,
     target_type text,
     target_id text,
     title text,
     owner text,
     details jsonb)`,
  `create index if not exists ec_events_at on ec_events (at desc)`,
  `create index if not exists ec_events_target on ec_events (target_id)`,
  // Lista de precios ECOAIR (Excel): precio mínimo al cliente, n° AHRI y subvención estimada
  `alter table ec_products add column if not exists min_price numeric(12,2) not null default 0`,
  `alter table ec_products add column if not exists ahri text not null default ''`,
  `alter table ec_products add column if not exists subsidy numeric(12,2) not null default 0`,
  // clave estable del producto cargado desde la lista de precios (para actualizar sin duplicar)
  `alter table ec_products add column if not exists source_key text unique`,
  // sub-sección: «Multi-split» dentro de «Murale»
  `alter table ec_categories add column if not exists parent_id int references ec_categories(id) on delete set null`,
  // firma electrónica del cliente (página /signer.html)
  `alter table ec_estimates add column if not exists signed_at timestamptz`,
  `alter table ec_estimates add column if not exists signed_name text`,
  `alter table ec_estimates add column if not exists signature text`,
  `alter table ec_estimates add column if not exists signed_ip text`,
  `alter table ec_estimates add column if not exists signed_ua text`,
];

let exec = null;
let ready = null;

async function connect() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  if (url) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    return (text, params) => sql.query(text, params);
  }
  if (process.env.VERCEL) throw Object.assign(new Error('DATABASE_URL no está configurada'), { status: 500 });
  // Local / pruebas: Postgres en memoria
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite();
  return async (text, params) => (await pg.query(text, params)).rows;
}

export async function q(text, params = []) {
  if (!exec) exec = await connect();
  if (!ready) {
    ready = (async () => {
      for (const s of SCHEMA) await exec(s, []);
      const { seed } = await import('./seed.js');
      await seed(exec);
    })().catch((e) => { ready = null; throw e; });
  }
  await ready;
  return exec(text, params);
}
export const one = async (text, params) => (await q(text, params))[0] || null;

// Pruebas: base nueva
export function _reset() { exec = null; ready = null; }

export const num = (v) => (v == null ? v : Number(v));
export const iso = (v) => (v ? new Date(v).toISOString() : null);
