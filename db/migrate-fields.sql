-- Run once to store the new registration fields.
alter table orders add column if not exists buyer_country text;
alter table orders add column if not exists buyer_zip text;
