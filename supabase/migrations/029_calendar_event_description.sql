-- =============================================================
-- Add an optional free-text description to calendar events.
-- =============================================================

alter table calendar_events
  add column if not exists description text
    check (description is null or char_length(description) <= 2000);
