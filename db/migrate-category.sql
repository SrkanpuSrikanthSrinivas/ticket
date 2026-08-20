alter table ticket_types add column if not exists category text not null default 'entry';
-- values: 'entry' (admission tickets) or 'food' (purchasable food coupons)
