-- =============================================================
-- Thread metadata — assignee (owner), due date, free-form labels
-- =============================================================

alter table threads add column if not exists owner_id uuid references profiles on delete set null;
alter table threads add column if not exists due_date date;
alter table threads add column if not exists labels   text[] not null default '{}';

create index if not exists idx_threads_owner on threads (owner_id);
