-- =============================================================
-- S-meter custom statements. Adds a third card type alongside the
-- weekday grid and custom dates: arbitrary text statements, each a
-- votable 1–6 card. Voting stays index-based (smeter_responses.day_index),
-- so only the card *labels* change — stored in custom_labels, the
-- statements analogue of custom_dates.
-- =============================================================

alter table smeters drop constraint if exists smeters_mode_check;
alter table smeters add constraint smeters_mode_check
  check (mode in ('weekly', 'dates', 'statements'));

alter table smeters add column if not exists custom_labels text[] default null;
