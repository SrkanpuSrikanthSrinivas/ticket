-- ============================================================================
-- Clean up ONLY the empty duplicate ticket types (0 tickets sold) left behind
-- by delete-then-recreate. KEEPS every type that has real purchases, including
-- the old "Group Tickets" row that still holds 2 sold tickets.
-- Safe: deletes a ticket type only if it has ZERO tickets. Allotments cascade.
-- Review the SELECT first, then run the DELETE.
-- ============================================================================

-- STEP 1 — preview exactly what will be removed (should be the 4 empty duplicates)
select tt.id, tt.name, tt.category, tt.active, tt.price_cents
from ticket_types tt
where not exists (select 1 from tickets t where t.ticket_type_id = tt.id)
  and tt.active = false;

-- STEP 2 — remove them (only inactive types with no tickets at all)
delete from ticket_types tt
where tt.active = false
  and not exists (select 1 from tickets t where t.ticket_type_id = tt.id);

-- STEP 3 — verify the remaining types (no more empty duplicates)
select name, category, active, admits, price_cents,
       (select coalesce(sum(t.qty),0) from tickets t where t.ticket_type_id = tt.id and t.status <> 'void')::int as sold
from ticket_types tt order by name, active desc;
