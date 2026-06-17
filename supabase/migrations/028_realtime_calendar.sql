-- =============================================================
-- Realtime for the group calendar. The calendar overlay binds
-- postgres_changes on `calendar_events` filtered by group_id, so
-- the table must be in the supabase_realtime publication or the
-- channel's whole changes subscription is rejected.
-- =============================================================

alter publication supabase_realtime add table calendar_events;

-- REPLICA IDENTITY FULL so DELETE/UPDATE events carry group_id (the
-- filter column), not just the primary key.
alter table calendar_events replica identity full;

-- To verify:
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime';
