// memo comparator for MessageRow. Shallow, except seenReaders, which is
// rebuilt whenever the message list changes and compared by reader ids.

type Reader = { id: string };

export const EMPTY_READERS: never[] = [];

function sameReaders(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if ((a[i] as Reader).id !== (b[i] as Reader).id) return false;
  }
  return true;
}

export function rowPropsEqual(prev: object, next: object): boolean {
  const p = prev as Record<string, unknown>;
  const n = next as Record<string, unknown>;
  const keys = Object.keys(p);
  if (keys.length !== Object.keys(n).length) return false;
  for (const k of keys) {
    if (k === "seenReaders") {
      if (!sameReaders(p[k], n[k])) return false;
    } else if (!Object.is(p[k], n[k])) {
      return false;
    }
  }
  return true;
}
