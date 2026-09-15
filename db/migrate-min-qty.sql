alter table ticket_types add column if not exists min_qty int not null default 1;
