-- =============================================================
-- S-meter — in-thread pain-chart scheduler. Members rate each day
-- (or custom date) 1–6; once everyone has voted, aggregate stats unlock.
-- Mirrors the polls feature (006_polls.sql): one smeter per message,
-- carried on messages.smeter_id, scoped to the thread's group.
-- =============================================================

create table smeters (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid references threads(id) on delete cascade not null,
  mode         text not null default 'weekly' check (mode in ('weekly', 'dates')),
  custom_dates text[] default null,
  title        text check (title is null or char_length(title) <= 200),
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz default now()
);

create table smeter_responses (
  id           uuid primary key default gen_random_uuid(),
  smeter_id    uuid references smeters(id) on delete cascade not null,
  user_id      uuid references profiles(id) on delete cascade not null,
  day_index    int not null check (day_index >= 0),
  pain_score   int not null check (pain_score between 1 and 6),
  submitted_at timestamptz default now(),
  unique (smeter_id, user_id, day_index)
);

create index idx_smeters_thread on smeters(thread_id);
create index idx_smeter_responses_smeter on smeter_responses(smeter_id);

alter table messages add column if not exists smeter_id uuid references smeters(id) on delete set null;

-- ─────────────────────────────────────────────────────────────
-- RLS — read scoped to the thread's group, same shape as polls.
-- Mutations run through the service-role client (admin), so only
-- SELECT policies matter for the client; writes are gated in tRPC.
-- ─────────────────────────────────────────────────────────────

alter table smeters enable row level security;
alter table smeter_responses enable row level security;

create policy "smeters: read if group member" on smeters for select using (
  exists (
    select 1 from threads t where t.id = smeters.thread_id and is_group_member(t.group_id)
  )
);

create policy "smeter_responses: read if group member" on smeter_responses for select using (
  exists (
    select 1 from smeters s
    join threads t on t.id = s.thread_id
    where s.id = smeter_responses.smeter_id and is_group_member(t.group_id)
  )
);

create policy "smeter_responses: own" on smeter_responses for all using (user_id = auth.uid());
