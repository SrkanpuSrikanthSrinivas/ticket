-- ============================================================================
-- FULL WIPE — purchases AND setup. Use ONLY if you also want to rebuild the
-- event, ticket types, and coupons from scratch in /admin afterwards.
-- Irreversible.
-- ============================================================================
begin;

delete from coupons;
delete from tickets;
delete from orders;
delete from ticket_coupon_allotments;
delete from ticket_types;
delete from coupon_types;
delete from events;

commit;

select
  (select count(*) from orders)       as orders,
  (select count(*) from ticket_types) as ticket_types,
  (select count(*) from coupon_types) as coupon_types,
  (select count(*) from events)       as events;
