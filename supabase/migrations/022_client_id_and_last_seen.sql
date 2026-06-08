-- =============================================================
-- Message dedup id + presence last-seen.
--
-- 1. messages.client_id: a client-generated id sent with the optimistic
--    insert. The realtime INSERT echo carries it back so the sender can
--    replace its pending temp deterministically instead of fuzzy-matching on
--    body+user (which collided on duplicate rapid messages).
--
-- 2. profiles.last_seen_at: presence is ephemeral, so persist a heartbeat
--    timestamp to show "last seen X" when a user is offline.
-- =============================================================

alter table messages  add column if not exists client_id    text;
alter table profiles  add column if not exists last_seen_at  timestamptz;

-- Lookup the sender's own pending message fast when reconciling the echo.
create index if not exists idx_messages_client_id
  on messages (thread_id, client_id)
  where client_id is not null;
