"use client";

import { useSyncExternalStore } from "react";
import { trpc } from "@/lib/trpc/client";
import { DEFAULT_BLOB, type BlobState } from "@/lib/blob-evolution";

const noSubscribe = () => () => {};

/**
 * False while React is hydrating server HTML, true for every other render.
 * Client-only mounts get true straight away, so they pay no extra render.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}

// Everyone's blob state comes from one cached query. Until it loads, or for
// users outside your groups, the answer is Lv1, which is exactly the blob
// they had before evolution existed.
//
// The server always renders Lv1, so hydration must too: if the persisted
// cache is already restored when a subtree hydrates, a Lv2 first render would
// leave the server's Lv1 markup in place for good (React 18 doesn't patch
// mismatched attributes or innerHTML, and the memoised props never change).
export function useBlob(userId: string | null | undefined): BlobState {
  const hydrated = useHydrated();
  const { data } = trpc.profile.blobs.useQuery(undefined, {
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (!hydrated) return DEFAULT_BLOB;
  return (userId && data?.[userId]) || DEFAULT_BLOB;
}
