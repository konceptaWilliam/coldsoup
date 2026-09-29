-- Server tail: one-round-trip access checks, atomic toggles and set-based
-- unread counts. All functions are service-role only (called from tRPC with
-- the admin client) and return zero rows when the user has no access.

-- ---- access ------------------------------------------------------------------

create or replace function public.poll_access(p_poll uuid, p_user uuid)
returns table (poll_id uuid, thread_id uuid, group_id uuid)
language sql stable set search_path = public as $$
  select p.id, t.id, t.group_id
  from polls p
  join threads t on t.id = p.thread_id
  join group_memberships gm on gm.group_id = t.group_id and gm.user_id = p_user
  where p.id = p_poll;
$$;

create or replace function public.smeter_access(p_smeter uuid, p_user uuid)
returns table (smeter_id uuid, thread_id uuid, group_id uuid)
language sql stable set search_path = public as $$
  select s.id, t.id, t.group_id
  from smeters s
  join threads t on t.id = s.thread_id
  join group_memberships gm on gm.group_id = t.group_id and gm.user_id = p_user
  where s.id = p_smeter;
$$;

-- ---- toggles (atomic: unique indexes make double taps harmless) ---------------

create or replace function public.vote_toggle(p_option uuid, p_user uuid)
returns table (poll_id uuid, voted boolean)
language plpgsql set search_path = public as $$
declare
  v_poll uuid;
  v_deleted int;
begin
  select o.poll_id into v_poll
  from poll_options o
  join polls p on p.id = o.poll_id
  join threads t on t.id = p.thread_id
  join group_memberships gm on gm.group_id = t.group_id and gm.user_id = p_user
  where o.id = p_option;
  if v_poll is null then
    return;
  end if;

  delete from poll_votes pv where pv.poll_option_id = p_option and pv.user_id = p_user;
  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then
    return query select v_poll, false;
  else
    insert into poll_votes (poll_option_id, user_id) values (p_option, p_user)
      on conflict (poll_option_id, user_id) do nothing;
    return query select v_poll, true;
  end if;
end $$;

create or replace function public.reaction_toggle(p_message uuid, p_user uuid, p_type text)
returns table (reacted boolean)
language plpgsql set search_path = public as $$
declare
  v_ok boolean;
  v_deleted int;
begin
  select true into v_ok
  from messages m
  join threads t on t.id = m.thread_id
  join group_memberships gm on gm.group_id = t.group_id and gm.user_id = p_user
  where m.id = p_message;
  if v_ok is null then
    return;
  end if;

  delete from message_reactions mr
  where mr.message_id = p_message and mr.user_id = p_user and mr.type = p_type;
  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then
    return query select false;
  else
    insert into message_reactions (message_id, user_id, type) values (p_message, p_user, p_type)
      on conflict (message_id, user_id, type) do nothing;
    return query select true;
  end if;
end $$;

-- ---- unread ------------------------------------------------------------------

-- Same definition as the old JS: a thread is unread when updated_at is newer
-- than the caller's thread_reads marker (or there is no marker).
create or replace function public.groups_unread(p_user uuid)
returns table (group_id uuid, unread int, urgent int)
language sql stable set search_path = public as $$
  select t.group_id,
         count(*)::int,
         (count(*) filter (where t.status = 'URGENT'))::int
  from threads t
  join group_memberships gm on gm.group_id = t.group_id and gm.user_id = p_user
  left join thread_reads r on r.thread_id = t.id and r.user_id = p_user
  where t.updated_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
  group by t.group_id;
$$;

-- Push badge counts for many recipients at once. Users with zero unread
-- threads return no row (callers default to 0).
create or replace function public.unread_thread_counts_for(p_users uuid[])
returns table (user_id uuid, unread int)
language sql stable set search_path = public as $$
  select gm.user_id, count(t.id)::int
  from group_memberships gm
  join threads t on t.group_id = gm.group_id
  left join thread_reads r on r.thread_id = t.id and r.user_id = gm.user_id
  where gm.user_id = any(p_users)
    and t.updated_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
  group by gm.user_id;
$$;

-- Rewrite of 024: identical signature and result, but each thread's bound is
-- known before its messages are scanned, so idx_messages_thread
-- (thread_id, created_at) can range-scan instead of filtering every message.
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
  select t.id, c.cnt
  from threads t
  cross join lateral (
    select count(*)::bigint as cnt
    from messages m
    where m.thread_id = t.id
      and m.created_at > to_timestamp(
        coalesce(
          (p_since ->> t.id::text)::double precision,
          extract(epoch from now()) * 1000
        ) / 1000.0
      )
      and m.user_id <> p_user
      and coalesce(m.is_deleted, false) = false
  ) c
  where t.group_id = p_group
    and c.cnt > 0;
$$;

revoke all on function public.thread_unread_counts(uuid, uuid, jsonb) from public;
revoke all on function public.thread_unread_counts(uuid, uuid, jsonb) from anon;
revoke all on function public.thread_unread_counts(uuid, uuid, jsonb) from authenticated;
grant execute on function public.thread_unread_counts(uuid, uuid, jsonb) to service_role;

-- ---- privileges --------------------------------------------------------------

revoke execute on function public.poll_access(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.smeter_access(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.vote_toggle(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.reaction_toggle(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.groups_unread(uuid) from public, anon, authenticated;
revoke execute on function public.unread_thread_counts_for(uuid[]) from public, anon, authenticated;
grant execute on function public.poll_access(uuid, uuid) to service_role;
grant execute on function public.smeter_access(uuid, uuid) to service_role;
grant execute on function public.vote_toggle(uuid, uuid) to service_role;
grant execute on function public.reaction_toggle(uuid, uuid, text) to service_role;
grant execute on function public.groups_unread(uuid) to service_role;
grant execute on function public.unread_thread_counts_for(uuid[]) to service_role;

-- ---- verification (run manually with a real user / group id) ------------------
-- select * from groups_unread('<user-uuid>');
--   → should match the unread dots in the sidebar.
-- select * from unread_thread_counts_for(array['<user-uuid>']::uuid[]);
--   → unread = sum of groups_unread(...).unread for that user.
-- explain select * from thread_unread_counts('<user-uuid>', '<group-uuid>', '{}'::jsonb);
--   → plan shows an Index (Only) Scan using idx_messages_thread.
