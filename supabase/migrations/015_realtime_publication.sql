-- =============================================================
-- Realtime publication membership.
-- The thread-detail messages channel binds postgres_changes on BOTH
-- `messages` and `thread_reads`. If any bound table is missing from the
-- supabase_realtime publication, the server rejects the channel's entire
-- changes subscription — it reports SUBSCRIBED but delivers no events for
-- ANY binding (including messages). Ensure every table the client listens
-- to is published.
-- =============================================================

alter publication supabase_realtime add table thread_reads;

-- threads and messages are expected to already be in the publication.
-- Re-adding a table that's already present errors, so add thread_reads only.
-- To verify membership:
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime';
