-- =============================================================
-- Realtime for S-meters. Votes land in smeter_responses, not messages,
-- so the smeter route's channel must listen to that table directly.
-- It must be in the supabase_realtime publication or the channel's
-- whole postgres_changes subscription is rejected.
-- =============================================================

alter publication supabase_realtime add table smeter_responses;

-- REPLICA IDENTITY FULL so events carry the row's columns (incl. smeter_id
-- for filtering), not just the primary key.
alter table smeter_responses replica identity full;

-- To verify:
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime';
