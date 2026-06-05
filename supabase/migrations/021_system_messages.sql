-- =============================================================
-- System messages: thread-event notices not sent by anyone (status changes,
-- S-meter completion, due-date changes, thread creation). Stored as ordinary
-- messages so they interleave in the timeline + flow through realtime, but
-- carry a structured `system_event` (and a plain-text `body` snapshot used for
-- previews / older clients). user_id is null — no author.
-- =============================================================

alter table messages add column if not exists system_event jsonb default null;
