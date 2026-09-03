-- ============================================================================
-- RESET PURCHASES — clean start for production
-- Deletes ALL buyers, tickets, check-ins, and coupons.
-- KEEPS your event, ticket types, coupon denominations, and allotments (setup).
-- Irreversible. Run once on your PRODUCTION Neon database when you're ready.
-- ============================================================================
begin;

-- child rows first (coupons reference tickets)
delete from coupons;
delete from tickets;
delete from orders;

commit;

-- sanity check — all three should be 0
select
  (select count(*) from orders)  as orders,
  (select count(*) from tickets) as tickets,
  (select count(*) from coupons) as coupons;
