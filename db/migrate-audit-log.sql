create table if not exists audit_log (
  id bigserial primary key,
  txn_ref text,
  order_id uuid,
  event_name text,
  items text,
  guests int not null default 0,
  amount_cents int not null default 0,
  fee_cents int not null default 0,
  braintree_txn_id text,
  status text,
  created_at timestamptz default now()
);
