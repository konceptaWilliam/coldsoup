-- =============================================================
-- Group shared calendar. Every group member can add events
-- (meetings, deadlines) to the group calendar. Each event has a
-- title, a start/end time (default 1h), an optional location and
-- a color (default signature mint #C8E6D5). Multi-day events span
-- a single row from start_at to end_at on a later date.
--
-- RLS mirrors smeters (018): read is scoped to group members via
-- is_group_member(); all writes run through the service-role
-- (admin) client in tRPC, so only the SELECT policy matters here.
-- =============================================================

create table calendar_events (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid references groups(id) on delete cascade not null,
  title       text not null check (char_length(title) between 1 and 200),
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  all_day     boolean not null default false,
  location    text check (location is null or char_length(location) <= 200),
  color       text not null default '#C8E6D5',
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz default now()
);

create index idx_calendar_events_group on calendar_events(group_id);
create index idx_calendar_events_start on calendar_events(start_at);

alter table calendar_events enable row level security;

create policy "calendar_events: read if group member" on calendar_events
  for select using (is_group_member(group_id));
