// Pure orphan rule for the daily attachment sweep (see attachment-sweep.ts).
// No runtime imports, so it unit-tests with `node --test`.

export type StoredObject = { path: string; sizeBytes: number; createdAt: string };

// Uploads happen at send time, and a pending send can sit in the outbox with
// its files already uploaded. A day of grace keeps those safe.
export const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;

// `referenced`: object paths used by live (not deleted) messages. An object
// with an unparseable createdAt is kept (NaN comparisons are false).
export function findOrphans(
  objects: StoredObject[],
  referenced: Set<string>,
  now: number,
): StoredObject[] {
  return objects.filter(
    (o) => !referenced.has(o.path) && now - Date.parse(o.createdAt) > ORPHAN_MIN_AGE_MS,
  );
}
