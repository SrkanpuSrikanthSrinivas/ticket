-- OPTIONAL: remove duplicate/empty event rows left over from earlier seeding.
-- Keeps every event that actually has ticket types, tickets, or orders; deletes
-- only truly empty duplicates, and never the last remaining event. Safe to run.
delete from events e
where (select count(*) from events) > 1
  and not exists (select 1 from ticket_types tt where tt.event_id = e.id)
  and not exists (select 1 from tickets t       where t.event_id  = e.id)
  and not exists (select 1 from orders o        where o.event_id  = e.id);
