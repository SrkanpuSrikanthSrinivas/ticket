-- Collapse to a SINGLE event: keep the most recent, delete the duplicates.
-- Safe pre-launch. Run once against your Neon database.
delete from ticket_coupon_allotments where ticket_type_id in (
  select id from ticket_types where event_id <> (select id from events order by created_at desc limit 1));
delete from coupons where ticket_id in (
  select id from tickets where event_id <> (select id from events order by created_at desc limit 1));
delete from tickets      where event_id <> (select id from events order by created_at desc limit 1);
delete from orders       where event_id <> (select id from events order by created_at desc limit 1);
delete from ticket_types where event_id <> (select id from events order by created_at desc limit 1);
delete from coupon_types where event_id <> (select id from events order by created_at desc limit 1);
delete from events       where id       <> (select id from events order by created_at desc limit 1);

-- verify: should print 1
select count(*) as events_left from events;
