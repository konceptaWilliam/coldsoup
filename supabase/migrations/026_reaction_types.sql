-- 003 shipped with only 3 allowed reaction emoji; the app since added ❤️ 🎉 😂.
-- Inserts of the new emoji silently failed the CHECK, so those reactions never
-- persisted. Widen the constraint to match the app's REACTION_TYPES.
ALTER TABLE message_reactions
  DROP CONSTRAINT IF EXISTS message_reactions_type_check;

ALTER TABLE message_reactions
  ADD CONSTRAINT message_reactions_type_check
  CHECK (type IN ('👍', '👎', '❤️', '🎉', '😂', '❓'));
