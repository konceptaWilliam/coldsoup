-- Snappy navigation: one-round-trip thread access check + missing indexes.

-- Returns the thread row (plus the caller's read marker) only when p_user is a
-- member of the thread's group. Zero rows = not found or no access. Called
-- with the service-role client from tRPC; not exposed to end users.
create or replace function public.thread_access(p_thread uuid, p_user uuid)
returns table (
  id uuid,
  group_id uuid,
  title text,
  status text,
  updated_at timestamptz,
  last_read_at timestamptz
)
language sql
stable
as $$
  select t.id, t.group_id, t.title, t.status, t.updated_at, r.last_read_at
  from threads t
  join group_memberships gm
    on gm.group_id = t.group_id and gm.user_id = p_user
  left join thread_reads r
    on r.thread_id = t.id and r.user_id = p_user
  where t.id = p_thread;
$$;

revoke execute on function public.thread_access(uuid, uuid) from public, anon, authenticated;

create index if not exists idx_poll_options_poll on poll_options (poll_id);
create index if not exists idx_polls_thread on polls (thread_id);
create index if not exists idx_threads_group_updated on threads (group_id, updated_at desc);
