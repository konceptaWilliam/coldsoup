-- =============================================================
-- Notification mutes — per-user mute of a thread or a whole group,
-- plus a global "pause all notifications" flag on the profile.
-- =============================================================

create table if not exists mutes (
  user_id     uuid references profiles on delete cascade not null,
  target_type text not null check (target_type in ('thread', 'group')),
  target_id   uuid not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

create index if not exists idx_mutes_user on mutes (user_id);

alter table mutes enable row level security;

-- A user can only see and manage their own mutes
create policy "mutes: read own"   on mutes for select using (user_id = auth.uid());
create policy "mutes: insert own" on mutes for insert with check (user_id = auth.uid());
create policy "mutes: delete own" on mutes for delete using (user_id = auth.uid());

-- Global do-not-disturb switch
alter table profiles add column if not exists notifications_paused boolean not null default false;
