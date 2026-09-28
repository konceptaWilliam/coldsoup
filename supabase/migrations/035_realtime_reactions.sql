-- =============================================================
-- Publish message_reactions for realtime.
-- Thread detail listens for reaction inserts/deletes (live counts, and the
-- author's blobatar shows `love` when someone hearts their message). The
-- listener lives on its own channel, so it can never take the messages
-- channel down (see 015) even if this migration hasn't run yet.
-- Guarded: re-adding a table that's already published errors.
-- =============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table message_reactions;
  end if;
end $$;

-- DELETE events only carry the primary key unless the replica identity is
-- full; we need message_id to know which message's counts to refresh.
alter table message_reactions replica identity full;
