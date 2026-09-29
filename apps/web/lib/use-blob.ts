"use client";

import { trpc } from "@/lib/trpc/client";
import { DEFAULT_BLOB, type BlobState } from "@/lib/blob-evolution";

// Everyone's blob state comes from one cached query. Until it loads, or for
// users outside your groups, the answer is Lv1, which is exactly the blob
// they had before evolution existed.
export function useBlob(userId: string | null | undefined): BlobState {
  const { data } = trpc.profile.blobs.useQuery(undefined, {
    staleTime: 5 * 60_000,
    retry: false,
  });
  return (userId && data?.[userId]) || DEFAULT_BLOB;
}
