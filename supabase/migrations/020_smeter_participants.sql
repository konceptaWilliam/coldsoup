-- =============================================================
-- S-meter participants. By default everyone in the thread's group is included;
-- the creator may drop people at create time. The stats gate then unlocks once
-- every *participant* has voted (not every group member).
--
-- NULL participant_ids = "all current group members" (back-compat for any
-- S-meter created before this column existed).
-- =============================================================

alter table smeters add column if not exists participant_ids uuid[] default null;
