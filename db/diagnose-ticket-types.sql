-- ============================================================================
-- DIAGNOSE report mismatch — READ ONLY. Shows duplicate ticket types (from
-- delete-then-recreate) and which ones actually hold purchased tickets.
-- ============================================================================

-- 1) All ticket types, whether active, and how many tickets/guests/revenue each holds.
select tt.id, tt.name, tt.category, tt.active, tt.admits, tt.price_cents,
       coalesce(sum(t.qty) filter (where t.status <> 'void'), 0)::int as sold_qty,
       coalesce(sum(t.qty * tt.admits) filter (where t.status <> 'void'), 0)::int as guests,
       coalesce(sum(t.qty * tt.price_cents) filter (where t.status <> 'void'), 0)::int as revenue_cents
from ticket_types tt
left join tickets t on t.ticket_type_id = tt.id
group by tt.id
order by tt.name, tt.active desc;

-- 2) Names that appear more than once (the duplicates from delete + recreate).
select name, count(*) as copies
from ticket_types
group by name
having count(*) > 1
order by name;

-- 3) Truth totals straight from orders/tickets (what the headline numbers should be).
select
  (select count(*) from orders where status = 'paid')::int                                as paid_orders,
  (select coalesce(sum(amount_cents),0) from orders where status = 'paid')::int            as revenue_cents,
  (select coalesce(sum(t.qty * tt.admits),0)
     from tickets t join ticket_types tt on tt.id = t.ticket_type_id
     where t.status <> 'void')::int                                                        as total_guests;
