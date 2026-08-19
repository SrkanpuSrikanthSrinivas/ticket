-- Run once to enable the editable confirmation email.
alter table events add column if not exists email_subject text;
alter table events add column if not exists email_body text;
