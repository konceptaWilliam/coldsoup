-- Per-user ordering of groups in the sidebar. Stored on the membership row so
-- each member can arrange their own group list independently. Null sorts last
-- (newly joined / never-reordered groups fall to the bottom, then by join time).
ALTER TABLE group_memberships
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;
