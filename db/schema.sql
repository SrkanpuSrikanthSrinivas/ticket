-- MKANT Ticketing schema (Neon Postgres) --------------------------------------
create extension if not exists pgcrypto;

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date text,
  venue text,
  tagline text,
  email_subject text,
  email_body text,
  created_at timestamptz default now()
);

create table if not exists ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  name text not null,
  description text,
  price_cents int not null default 0,   -- price per unit purchased
  admits int not null default 1,        -- people one ticket admits (group/family > 1)
  max_qty int,                          -- capacity for this tier (null = unlimited)
  is_comp boolean default false,        -- comp/volunteer tiers skip payment
  active boolean default true,
  sort int default 0
);

create table if not exists coupon_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  name text not null,
  value_cents int not null default 0,   -- denomination, e.g. 500 = $5 food coupon
  sort int default 0
);

-- how many of each coupon a ticket unit grants
create table if not exists ticket_coupon_allotments (
  ticket_type_id uuid references ticket_types(id) on delete cascade,
  coupon_type_id uuid references coupon_types(id) on delete cascade,
  qty_per_guest int not null default 1,
  primary key (ticket_type_id, coupon_type_id)
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id),
  buyer_name text not null,
  buyer_email text not null,
  buyer_phone text,
  amount_cents int not null default 0,
  braintree_txn_id text,
  status text not null default 'pending',  -- pending | paid | failed | refunded
  created_at timestamptz default now()
);

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  event_id uuid references events(id),
  ticket_type_id uuid references ticket_types(id),
  code text unique not null,               -- human code for manual lookup
  qty int not null default 1,              -- units on this ticket (family = 1 unit)
  status text not null default 'valid',    -- valid | checked_in | void
  checked_in_at timestamptz,
  checked_in_by text,
  created_at timestamptz default now()
);
create index if not exists tickets_event_idx on tickets(event_id);
create index if not exists tickets_status_idx on tickets(status);

create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references tickets(id) on delete cascade,
  coupon_type_id uuid references coupon_types(id),
  redeemed boolean not null default false,
  redeemed_at timestamptz,
  redeemed_by text
);
create index if not exists coupons_ticket_idx on coupons(ticket_id);
