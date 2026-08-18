-- Example MKANT event so you can test end-to-end immediately.
with e as (
  insert into events (name, event_date, venue, tagline)
  values ('MKANT Event 2026', 'Sat, TBD', 'McKinney, TX', 'Namaskara — welcome!')
  returning id
),
cpn as (
  insert into coupon_types (event_id, name, value_cents, sort)
  select e.id, x.name, x.val, x.sort from e,
    (values ('$2 coupon',200,1),('$5 coupon',500,2),('$8 coupon',800,3),('$10 coupon',1000,4)) as x(name,val,sort)
  returning id, name
),
tt as (
  insert into ticket_types (event_id, name, description, price_cents, admits, max_qty, is_comp, sort)
  select e.id, x.name, x.descr, x.price, x.admits, x.cap, x.comp, x.sort from e,
    (values
      ('Adult','Entry + lunch + beverage', 2500, 1, 500, false, 1),
      ('Child (under 12)','Entry + lunch', 1000, 1, 200, false, 2),
      ('Family (up to 4)','Group entry for the family', 8000, 4, 150, false, 3),
      ('Volunteer / Performer','Comp entry with meal', 0, 1, 100, true, 4)
    ) as x(name,descr,price,admits,cap,comp,sort)
  returning id, name
)
insert into ticket_coupon_allotments (ticket_type_id, coupon_type_id, qty_per_guest)
select tt.id, cpn.id,
  case
    when tt.name='Family (up to 4)' and cpn.name in ('Lunch','Beverage') then 4
    when tt.name='Child (under 12)' and cpn.name='Lunch' then 1
    when tt.name in ('Adult','Volunteer / Performer') and cpn.name in ('Lunch','Beverage') then 1
    else 0
  end
from tt, cpn
where case
    when tt.name='Family (up to 4)' and cpn.name in ('Lunch','Beverage') then 4
    when tt.name='Child (under 12)' and cpn.name='Lunch' then 1
    when tt.name in ('Adult','Volunteer / Performer') and cpn.name in ('Lunch','Beverage') then 1
    else 0
  end > 0;
