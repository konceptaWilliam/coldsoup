"use client";

import { useEffect, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc/client";
import { UnreadProvider } from "@/lib/unread-context";
import { MobileSidebarProvider } from "@/lib/mobile-sidebar-context";
import { setShellMounted } from "@/lib/shell-route";
import { useShellRoute } from "@/lib/use-shell-route";
import type { GroupListItem } from "@/lib/group-list";
import { Sidebar } from "./sidebar";
import { ThreadList } from "./thread-list";
import { ThreadPane } from "./thread-pane";
import { ShellStack } from "./shell-stack";
import { IntroOverlay } from "./intro-overlay";
import { NotificationNudge } from "./notification-nudge";

export type ShellProfile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  intro_seen: boolean;
};

function Centered({ text }: { text: string }) {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <p className="font-mono text-sm text-muted">{text}</p>
    </div>
  );
}

export function AppShell({
  profile,
  initialGroups,
  children,
}: {
  profile: ShellProfile;
  initialGroups: GroupListItem[];
  children: ReactNode;
}) {
  const utils = trpc.useUtils();
  const { data: groups = initialGroups, isFetching } = trpc.groups.list.useQuery(undefined, {
    initialData: initialGroups,
  });

  // The server list is fresher than anything persisted from a previous session.
  useEffect(() => {
    utils.groups.list.setData(undefined, initialGroups);
    // The page may have come from the service-worker cache, so its groups can
    // be stale; refresh once in the background.
    void utils.groups.list.invalidate();
  }, [utils, initialGroups]);

  useEffect(() => {
    setShellMounted(true);
    return () => setShellMounted(false);
  }, []);

  const { groupId, threadId, highlight } = useShellRoute();
  const group = groupId ? groups.find((g) => g.id === groupId) ?? null : null;

  // Unknown group: maybe just invited — refetch once before declaring it missing.
  const [refetchedFor, setRefetchedFor] = useState<string | null>(null);
  useEffect(() => {
    if (groupId && !group && refetchedFor !== groupId) {
      setRefetchedFor(groupId);
      void utils.groups.list.invalidate();
    }
  }, [groupId, group, refetchedFor, utils]);
  const groupMissing = !!groupId && !group && refetchedFor === groupId && !isFetching;

  const list = group ? (
    <ThreadList key={group.id} groupId={group.id} groupName={group.name} />
  ) : groupMissing ? (
    <Centered text="Group not found" />
  ) : (
    <div className="w-full md:w-[336px] border-r border-border p-4 space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-[80px] bg-border/40 animate-pulse" />
      ))}
    </div>
  );

  return (
    <UnreadProvider>
      <MobileSidebarProvider>
        <div className="h-screen-dynamic flex overflow-hidden bg-surface">
          <Sidebar groups={groups} userId={profile.id} userDisplayName={profile.display_name} />
          <ShellStack
            groupId={groupId}
            threadId={group ? threadId : null}
            list={list}
            empty={<div className="hidden md:flex flex-1"><Centered text="Select a thread to read it" /></div>}
            renderPane={(tid) =>
              groupId ? (
                <ThreadPane
                  key={tid}
                  threadId={tid}
                  groupId={groupId}
                  highlight={highlight}
                  profile={profile}
                />
              ) : null
            }
          />
        </div>
        <IntroOverlay seen={profile.intro_seen} />
        <NotificationNudge />
        {children}
      </MobileSidebarProvider>
    </UnreadProvider>
  );
}
