-- Which specific image of the replied-to message the reply refers to. Stored on
-- the reply row (not derived from the target) so different replies to the same
-- multi-image message can each point at a different image. Nullable: text
-- replies and replies to non-image messages leave it null.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_attachment_url TEXT;
