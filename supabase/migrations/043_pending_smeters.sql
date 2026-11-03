-- =============================================================
-- Unanswered S-meters, per user. A row means: the user is a participant
-- (participant_ids contains them, or null = every group member), is still a
-- member of the thread's group, has no smeter_responses row (votes are
-- submitted all at once, so any row = answered), and the S-meter's message
-- exists and isn't soft-deleted.
-- p_user set → that user's rows (badge). p_user null → everyone (daily cron).
-- SECURITY DEFINER + service_role only (called via the tRPC/cron admin client).
-- =============================================================

create or replace function public.pending_smeters(p_user uuid default null)
returns table(
  user_id uuid,
  smeter_id uuid,
  thread_id uuid,
  group_id uuid,
  message_id uuid,
  title text,
  thread_title text,
  group_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select gm.user_id, s.id, s.thread_id, t.group_id, m.id, s.title, t.title, g.name
  from smeters s
  join threads t on t.id = s.thread_id
  join groups g on g.id = t.group_id
  join group_memberships gm on gm.group_id = t.group_id
  join lateral (
    select mm.id
    from messages mm
    where mm.smeter_id = s.id and coalesce(mm.is_deleted, false) = false
    order by mm.created_at
    limit 1
  ) m on true
  where (p_user is null or gm.user_id = p_user)
    and (s.participant_ids is null or gm.user_id = any(s.participant_ids))
    and not exists (
      select 1 from smeter_responses r
      where r.smeter_id = s.id and r.user_id = gm.user_id
    );
$$;

revoke all on function public.pending_smeters(uuid) from public;
revoke all on function public.pending_smeters(uuid) from anon;
revoke all on function public.pending_smeters(uuid) from authenticated;
grant execute on function public.pending_smeters(uuid) to service_role;
