-- Run once on an existing database to enable group/family tickets.
alter table ticket_types add column if not exists admits int not null default 1;
