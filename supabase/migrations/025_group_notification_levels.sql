-- =============================================================
-- Per-group notification levels + mention-priority push.
--
-- Replaces the binary group mute with three levels:
--   ALL      — every message notifies (default; no row stored)
--   MENTIONS — only @you / @everyone / @here notify
--   NONE     — nothing notifies (hard mute)
--
-- Thread mutes stay in `mutes` and are now BYPASSED by mentions.
-- Existing group mutes are migrated to level NONE and removed from `mutes`.
-- =============================================================

create table if not exists group_notification_prefs (
  user_id    uuid not null references profiles(id) on delete cascade,
  group_id   uuid not null references groups(id) on delete cascade,
  level      text not null default 'ALL' check (level in ('ALL', 'MENTIONS', 'NONE')),
  created_at timestamptz not null default now(),
  primary key (user_id, group_id)
);

alter table group_notification_prefs enable row level security;

create policy "notif prefs: own read"
  on group_notification_prefs for select
  using (user_id = auth.uid());

create policy "notif prefs: own write"
  on group_notification_prefs for insert
  with check (user_id = auth.uid());

create policy "notif prefs: own update"
  on group_notification_prefs for update
  using (user_id = auth.uid());

create policy "notif prefs: own delete"
  on group_notification_prefs for delete
  using (user_id = auth.uid());

-- Migrate existing binary group mutes → level NONE, then drop them.
insert into group_notification_prefs (user_id, group_id, level)
  select user_id, target_id, 'NONE'
  from mutes
  where target_type = 'group'
on conflict (user_id, group_id) do update set level = 'NONE';

delete from mutes where target_type = 'group';
