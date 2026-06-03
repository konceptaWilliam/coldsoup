-- =============================================================
-- Realtime for polls. Votes and added options change poll_votes /
-- poll_options, not the messages table, so the thread-detail channel must
-- listen to them directly. They must be in the supabase_realtime publication
-- or the channel's whole postgres_changes subscription is rejected.
-- =============================================================

alter publication supabase_realtime add table poll_votes;
alter publication supabase_realtime add table poll_options;

-- REPLICA IDENTITY FULL so DELETE events (un-voting) carry the row's columns,
-- not just the primary key — needed to react to vote removals.
alter table poll_votes replica identity full;

-- To verify:
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime';
