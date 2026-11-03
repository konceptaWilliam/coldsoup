"use client";

import { useMemo } from "react";
import { trpc } from "@/lib/trpc/client";
import { groupPending } from "@/lib/smeter-reminders";

// Unanswered S-meters for the current user, aggregated per thread and group.
// One shared query (thread list + sidebar read the same cache entry).
export function usePendingSmeters() {
  const { data } = trpc.smeters.pending.useQuery(undefined, {
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  return useMemo(() => groupPending(data ?? []), [data]);
}
