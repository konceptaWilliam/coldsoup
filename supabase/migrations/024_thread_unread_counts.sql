-- =============================================================
-- Per-thread unread MESSAGE counts for the thread list badge.
-- Counts messages in a group's threads that are:
--   * newer than the caller's per-thread "since" baseline (epoch ms),
--   * not authored by the caller,
--   * not soft-deleted.
-- The baseline is supplied by the client (its persisted lastSeen marker) as a
-- jsonb map { "<thread_id>": <epoch_ms> }. Threads missing from the map default
-- to now() → 0, so a thread the user has never seen never floods with history.
-- SECURITY DEFINER + service_role only (called via the tRPC admin client).
-- =============================================================

create or replace function public.thread_unread_counts(
  p_user uuid,
  p_group uuid,
  p_since jsonb
)
returns table(thread_id uuid, cnt bigint)
language sql
security definer
set search_path = public
as $$
  select m.thread_id, count(*)::bigint
  from messages m
  join threads t on t.id = m.thread_id
  where t.group_id = p_group
    and m.user_id <> p_user
    and coalesce(m.is_deleted, false) = false
    and m.created_at > to_timestamp(
      coalesce(
        (p_since ->> m.thread_id::text)::double precision,
        extract(epoch from now()) * 1000
      ) / 1000.0
    )
  group by m.thread_id;
$$;

revoke all on function public.thread_unread_counts(uuid, uuid, jsonb) from public;
revoke all on function public.thread_unread_counts(uuid, uuid, jsonb) from anon;
revoke all on function public.thread_unread_counts(uuid, uuid, jsonb) from authenticated;
grant execute on function public.thread_unread_counts(uuid, uuid, jsonb) to service_role;
