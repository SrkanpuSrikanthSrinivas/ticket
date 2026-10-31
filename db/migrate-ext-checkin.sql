-- Separate gate check-in for externally registered events (e.g. Deepavali2026).
-- Additive only: new tables, nothing existing is altered. The app also creates
-- these automatically on first use, so running this file is optional.
create table if not exists ext_events (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists ext_attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references ext_events(id) on delete cascade,
  reg_key text not null,
  member_id text, member_expiry text,
  first_name text, last_name text, email text, city text, state text,
  mobile text, mobile_digits text,
  txn_id text, payment_method text, payment_status text, membership_type text,
  amount_paid numeric(10,2) not null default 0,
  registered_at timestamp,
  reg_status text, comment text,
  adults int not null default 0, children int not null default 0,
  raw jsonb,
  checked_in_at timestamptz, checked_in_by text,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (event_id, reg_key)
);
create index if not exists ext_attendees_event_idx on ext_attendees(event_id);
