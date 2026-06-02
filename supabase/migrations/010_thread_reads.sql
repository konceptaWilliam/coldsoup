-- =============================================================
-- Read receipts — per-thread last-read marker (one row per user/thread)
-- "Seen" for a message = readers whose last_read_at >= message.created_at
-- =============================================================

create table if not exists thread_reads (
  thread_id    uuid references threads on delete cascade not null,
  user_id      uuid references profiles on delete cascade not null,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create index if not exists idx_thread_reads_thread on thread_reads (thread_id);
create index if not exists idx_thread_reads_user   on thread_reads (user_id);

alter table thread_reads enable row level security;

-- Group members can read receipts for threads in their groups
create policy "thread_reads: read if group member" on thread_reads
  for select using (
    exists (
      select 1 from threads t
      where t.id = thread_reads.thread_id
        and is_group_member(t.group_id)
    )
  );

-- A user may write only their own read marker (tRPC uses the service role;
-- these policies are defense-in-depth for any direct client access)
create policy "thread_reads: insert own" on thread_reads
  for insert with check (user_id = auth.uid());

create policy "thread_reads: update own" on thread_reads
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Enable realtime so other clients see "seen" updates live
-- (run in Supabase dashboard → Database → Replication, or here via CLI):
-- alter publication supabase_realtime add table thread_reads;
