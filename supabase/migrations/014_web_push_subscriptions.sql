-- =============================================================
-- Web Push (VAPID) subscriptions — one row per browser/device.
-- Separate from profiles.push_token (Expo mobile push); a user may
-- have many web push endpoints across devices.
-- =============================================================

create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references profiles on delete cascade not null,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

-- A user can only see and manage their own subscriptions.
-- (Server fan-out uses the service-role client, which bypasses RLS.)
create policy "push_subscriptions: read own"   on push_subscriptions for select using (user_id = auth.uid());
create policy "push_subscriptions: insert own" on push_subscriptions for insert with check (user_id = auth.uid());
create policy "push_subscriptions: delete own" on push_subscriptions for delete using (user_id = auth.uid());
