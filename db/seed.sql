-- Sample data. SAFE TO RE-RUN: every insert is guarded, so running this more than
-- once will NOT create duplicate events/tickets.

insert into events (name, event_date, venue, tagline)
select 'MKANT Event 2026', 'Sat, TBD', 'McKinney, TX', 'Namaskara — welcome!'
where not exists (select 1 from events);

insert into coupon_types (event_id, name, value_cents, sort)
select e.id, x.name, x.val, x.sort
from (select id from events order by created_at desc limit 1) e,
     (values ('$2 coupon',200,1),('$5 coupon',500,2),('$8 coupon',800,3),('$10 coupon',1000,4)) as x(name,val,sort)
where not exists (select 1 from coupon_types);

insert into ticket_types (event_id, name, description, price_cents, admits, max_qty, is_comp, sort)
select e.id, x.name, x.descr, x.price, x.admits, x.cap, x.comp, x.sort
from (select id from events order by created_at desc limit 1) e,
     (values
       ('Adult','Entry + lunch + beverage', 2500, 1, 500, false, 1),
       ('Child (under 12)','Entry + lunch', 1000, 1, 200, false, 2),
       ('Family (up to 4)','Group entry for the family', 8000, 4, 150, false, 3),
       ('Volunteer / Performer','Comp entry with meal', 0, 1, 100, true, 4)
     ) as x(name,descr,price,admits,cap,comp,sort)
where not exists (select 1 from ticket_types);

insert into ticket_coupon_allotments (ticket_type_id, coupon_type_id, qty_per_guest)
select tt.id, cpn.id,
  case
    when tt.name='Family (up to 4)' and cpn.value_cents in (500,200) then 2
    when tt.name in ('Adult','Volunteer / Performer') and cpn.value_cents=500 then 1
    when tt.name='Child (under 12)' and cpn.value_cents=200 then 1
    else 0
  end
from ticket_types tt, coupon_types cpn
where not exists (select 1 from ticket_coupon_allotments)
  and case
    when tt.name='Family (up to 4)' and cpn.value_cents in (500,200) then 2
    when tt.name in ('Adult','Volunteer / Performer') and cpn.value_cents=500 then 1
    when tt.name='Child (under 12)' and cpn.value_cents=200 then 1
    else 0
  end > 0;
