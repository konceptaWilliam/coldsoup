import { z } from "zod";

// Avatars are always blobatars generated from the user id, so profile photos
// can no longer be set. `.strict()` makes stale clients that still send
// `avatarUrl` fail loudly instead of silently no-op'ing.
export const profileUpdateInput = z
  .object({
    displayName: z.string().min(1).max(20).optional(),
  })
  .strict();
