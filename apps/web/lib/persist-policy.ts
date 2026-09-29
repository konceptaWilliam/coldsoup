// Which React Query entries survive a reload (localStorage). Only what an
// instant cold open needs; one-off keys (per-navigation unread counts, link
// unfurls, read receipts) would otherwise pile up.
export const PERSISTED_PATHS = new Set([
  "messages.list",
  "threads.list",
  "groups.list",
  "groups.unread",
  "messages.groupMembers",
  "profile.blobs",
  "profile.get",
  "notifications.prefs",
]);

export function shouldPersistQuery(queryKey: unknown, status: string): boolean {
  if (status !== "success" || !Array.isArray(queryKey)) return false;
  const path = queryKey[0];
  if (!Array.isArray(path) || path.length === 0 || !path.every((p) => typeof p === "string")) return false;
  return PERSISTED_PATHS.has(path.join("."));
}
