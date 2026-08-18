-- Run once on an existing database to add food-coupon denominations.
alter table coupon_types add column if not exists value_cents int not null default 0;
