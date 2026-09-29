-- RLS performance: same access rules, evaluated once per statement instead of
-- once per row. Helpers are security definer so they read memberships without
-- recursing into group_memberships' own policy. auth.uid() is wrapped in
-- (select …) so Postgres treats it as an init-plan constant.

create or replace function public.my_group_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select group_id from group_memberships where user_id = auth.uid();
$$;

create or replace function public.my_thread_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select t.id
  from threads t
  join group_memberships gm on gm.group_id = t.group_id and gm.user_id = auth.uid();
$$;

grant execute on function public.my_group_ids() to authenticated;
grant execute on function public.my_thread_ids() to authenticated;

-- ---- group-scoped reads ---------------------------------------------------------

drop policy if exists "groups: read if member" on groups;
create policy "groups: read if member"
  on groups for select
  using (id in (select my_group_ids()));

drop policy if exists "group_memberships: read own groups" on group_memberships;
create policy "group_memberships: read own groups"
  on group_memberships for select
  using (group_id in (select my_group_ids()));

drop policy if exists "threads: read if group member" on threads;
create policy "threads: read if group member"
  on threads for select
  using (group_id in (select my_group_ids()));

drop policy if exists "threads: insert if group member" on threads;
create policy "threads: insert if group member"
  on threads for insert
  with check (group_id in (select my_group_ids()));

drop policy if exists "threads: update if group member" on threads;
create policy "threads: update if group member"
  on threads for update
  using (group_id in (select my_group_ids()));

drop policy if exists "calendar_events: read if group member" on calendar_events;
create policy "calendar_events: read if group member" on calendar_events
  for select using (group_id in (select my_group_ids()));

-- ---- thread-scoped reads --------------------------------------------------------

drop policy if exists "messages: read if group member" on messages;
create policy "messages: read if group member"
  on messages for select
  using (thread_id in (select my_thread_ids()));

drop policy if exists "messages: insert if group member" on messages;
create policy "messages: insert if group member"
  on messages for insert
  with check (thread_id in (select my_thread_ids()));

drop policy if exists "polls: read if group member" on polls;
create policy "polls: read if group member" on polls
  for select using (thread_id in (select my_thread_ids()));

drop policy if exists "smeters: read if group member" on smeters;
create policy "smeters: read if group member" on smeters
  for select using (thread_id in (select my_thread_ids()));

drop policy if exists "thread_reads: read if group member" on thread_reads;
create policy "thread_reads: read if group member" on thread_reads
  for select using (thread_id in (select my_thread_ids()));

drop policy if exists "reactions: read if group member" on message_reactions;
create policy "reactions: read if group member" on message_reactions
  for select using (
    message_id in (select m.id from messages m where m.thread_id in (select my_thread_ids()))
  );

drop policy if exists "poll_options: read if group member" on poll_options;
create policy "poll_options: read if group member" on poll_options
  for select using (
    poll_id in (select p.id from polls p where p.thread_id in (select my_thread_ids()))
  );

drop policy if exists "poll_votes: read if group member" on poll_votes;
create policy "poll_votes: read if group member" on poll_votes
  for select using (
    poll_option_id in (
      select o.id from poll_options o
      join polls p on p.id = o.poll_id
      where p.thread_id in (select my_thread_ids())
    )
  );

drop policy if exists "smeter_responses: read if group member" on smeter_responses;
create policy "smeter_responses: read if group member" on smeter_responses
  for select using (
    smeter_id in (select s.id from smeters s where s.thread_id in (select my_thread_ids()))
  );

-- ---- own-row policies: (select auth.uid()) ------------------------------------------

drop policy if exists "profiles: read all" on profiles;
create policy "profiles: read all"
  on profiles for select
  using ((select auth.uid()) is not null);

drop policy if exists "profiles: insert own" on profiles;
create policy "profiles: insert own"
  on profiles for insert
  with check (id = (select auth.uid()));

drop policy if exists "profiles: update own" on profiles;
create policy "profiles: update own"
  on profiles for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "groups: insert if authenticated" on groups;
create policy "groups: insert if authenticated"
  on groups for insert
  with check ((select auth.uid()) is not null);

drop policy if exists "group_memberships: insert self" on group_memberships;
create policy "group_memberships: insert self"
  on group_memberships for insert
  with check (user_id = (select auth.uid()));

drop policy if exists "invites: authenticated read" on invites;
create policy "invites: authenticated read"
  on invites for select
  using ((select auth.uid()) is not null);

drop policy if exists "invites: accept own" on invites;
create policy "invites: accept own"
  on invites for update
  using (email = (select email from profiles where id = (select auth.uid())));

drop policy if exists "reactions: insert own" on message_reactions;
create policy "reactions: insert own" on message_reactions
  for insert with check (user_id = (select auth.uid()));

drop policy if exists "reactions: delete own" on message_reactions;
create policy "reactions: delete own" on message_reactions
  for delete using (user_id = (select auth.uid()));

drop policy if exists "poll_votes: own" on poll_votes;
create policy "poll_votes: own" on poll_votes
  for all using (user_id = (select auth.uid()));

drop policy if exists "thread_reads: insert own" on thread_reads;
create policy "thread_reads: insert own" on thread_reads
  for insert with check (user_id = (select auth.uid()));

drop policy if exists "thread_reads: update own" on thread_reads;
create policy "thread_reads: update own" on thread_reads
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "mutes: read own" on mutes;
create policy "mutes: read own" on mutes for select using (user_id = (select auth.uid()));
drop policy if exists "mutes: insert own" on mutes;
create policy "mutes: insert own" on mutes for insert with check (user_id = (select auth.uid()));
drop policy if exists "mutes: delete own" on mutes;
create policy "mutes: delete own" on mutes for delete using (user_id = (select auth.uid()));

drop policy if exists "link_previews: read" on link_previews;
create policy "link_previews: read" on link_previews
  for select using ((select auth.uid()) is not null);

drop policy if exists "push_subscriptions: read own" on push_subscriptions;
create policy "push_subscriptions: read own" on push_subscriptions for select using (user_id = (select auth.uid()));
drop policy if exists "push_subscriptions: insert own" on push_subscriptions;
create policy "push_subscriptions: insert own" on push_subscriptions for insert with check (user_id = (select auth.uid()));
drop policy if exists "push_subscriptions: delete own" on push_subscriptions;
create policy "push_subscriptions: delete own" on push_subscriptions for delete using (user_id = (select auth.uid()));

drop policy if exists "smeter_responses: own" on smeter_responses;
create policy "smeter_responses: own" on smeter_responses for all using (user_id = (select auth.uid()));

drop policy if exists "notif prefs: own read" on group_notification_prefs;
create policy "notif prefs: own read"
  on group_notification_prefs for select
  using (user_id = (select auth.uid()));
drop policy if exists "notif prefs: own write" on group_notification_prefs;
create policy "notif prefs: own write"
  on group_notification_prefs for insert
  with check (user_id = (select auth.uid()));
drop policy if exists "notif prefs: own update" on group_notification_prefs;
create policy "notif prefs: own update"
  on group_notification_prefs for update
  using (user_id = (select auth.uid()));
drop policy if exists "notif prefs: own delete" on group_notification_prefs;
create policy "notif prefs: own delete"
  on group_notification_prefs for delete
  using (user_id = (select auth.uid()));

-- ---- verification (SQL editor) ----------------------------------------------------
-- begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<member-uuid>","role":"authenticated"}';
--   select count(*) from messages;          -- only messages in that user's groups
--   select count(*) from poll_votes;        -- only votes in that user's groups
--   select count(*) from threads;           -- only threads in that user's groups
-- rollback;
-- Repeat with a user from a different group; counts must differ accordingly.

-- ---- rollback ------------------------------------------------------------------------
-- Recreate the pre-039 expressions:
--   groups/group_memberships/threads/calendar_events: is_group_member(<group column>)
--   messages/polls/smeters/thread_reads: exists (select 1 from threads t
--       where t.id = <table>.thread_id and is_group_member(t.group_id))
--   message_reactions: exists (select 1 from messages m join threads t on t.id = m.thread_id
--       where m.id = message_reactions.message_id and is_group_member(t.group_id))
--   poll_options: exists (select 1 from polls p join threads t on t.id = p.thread_id
--       where p.id = poll_options.poll_id and is_group_member(t.group_id))
--   poll_votes: exists (select 1 from poll_options po join polls p on p.id = po.poll_id
--       join threads t on t.id = p.thread_id
--       where po.id = poll_votes.poll_option_id and is_group_member(t.group_id))
--   smeter_responses: exists (select 1 from smeters s join threads t on t.id = s.thread_id
--       where s.id = smeter_responses.smeter_id and is_group_member(t.group_id))
--   own-row policies: auth.uid() instead of (select auth.uid())
