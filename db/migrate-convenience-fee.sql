alter table events add column if not exists convenience_fee_pct numeric not null default 0;
alter table orders add column if not exists fee_cents int not null default 0;
