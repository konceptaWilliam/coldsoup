"use client";

import { useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { navigateBack } from "@/lib/shell-route";
import { ThreadDetail } from "./thread-detail";
import type { ShellProfile } from "./app-shell";

type ThreadStatus = "OPEN" | "URGENT" | "DONE";

function isAccessError(err: unknown): boolean {
  const code = (err as { data?: { code?: string } } | null)?.data?.code;
  return code === "NOT_FOUND" || code === "FORBIDDEN";
}

export function ThreadPane({
  threadId,
  groupId,
  highlight,
  profile,
}: {
  threadId: string;
  groupId: string;
  highlight?: string;
  profile: ShellProfile;
}) {
  const utils = trpc.useUtils();
  const { error } = trpc.threads.get.useQuery(
    { threadId },
    { retry: (count, err) => !isAccessError(err) && count < 3 }
  );
  const denied = isAccessError(error);

  // Removed from the group / thread deleted: drop the stale list entry.
  useEffect(() => {
    if (denied) void utils.threads.list.invalidate({ groupId });
  }, [denied, groupId, utils]);

  if (denied) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 h-full bg-surface">
        <p className="font-mono text-sm text-muted">Thread not found</p>
        <button
          onClick={() => navigateBack(`/g/${groupId}`)}
          className="font-mono text-[11px] text-ink border border-border px-3 py-2 active:bg-border/50"
        >
          ← back to threads
        </button>
      </div>
    );
  }

  // Instant header from the thread-list cache; ThreadDetail refines it.
  const cached = (
    utils.threads.list.getData({ groupId }) as unknown as
      | Array<{ id: string; title: string; status: ThreadStatus }>
      | undefined
  )?.find((t) => t.id === threadId);

  return (
    <ThreadDetail
      threadId={threadId}
      groupId={groupId}
      initialTitle={cached?.title ?? ""}
      initialStatus={cached?.status ?? "OPEN"}
      highlightMessageId={highlight}
      me={{ id: profile.id, display_name: profile.display_name, avatar_url: profile.avatar_url }}
    />
  );
}
