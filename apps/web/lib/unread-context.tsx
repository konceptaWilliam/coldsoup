"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

const LS_PREFIX = "coldsoup:lastSeen:";

export function getLastSeen(threadId: string): number {
  try {
    return parseInt(localStorage.getItem(LS_PREFIX + threadId) ?? "0", 10);
  } catch {
    return 0;
  }
}

export function setLastSeen(threadId: string, ts: number) {
  try {
    localStorage.setItem(LS_PREFIX + threadId, String(ts));
  } catch {}
}

type UnreadData = {
  // threadId -> unread count
  threadCounts: Record<string, number>;
  // groupId -> total unread count
  groupCounts: Record<string, number>;
  // groupId -> urgent unread count
  groupUrgentCounts: Record<string, number>;
};

type UnreadActions = {
  setThreadCount: (threadId: string, groupId: string, count: number, isUrgent?: boolean) => void;
  markRead: (threadId: string, groupId: string) => void;
};

const UnreadDataContext = createContext<UnreadData>({
  threadCounts: {},
  groupCounts: {},
  groupUrgentCounts: {},
});

const UnreadActionsContext = createContext<UnreadActions>({
  setThreadCount: () => {},
  markRead: () => {},
});

export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const [threadCounts, setThreadCounts] = useState<Record<string, number>>({});
  const [groupCounts, setGroupCounts] = useState<Record<string, number>>({});
  const [groupUrgentCounts, setGroupUrgentCounts] = useState<Record<string, number>>({});
  // Latest per-thread values, readable from stable callbacks.
  const countsRef = useRef<Record<string, number>>({});
  const urgentRef = useRef<Record<string, boolean>>({});

  const setThreadCount = useCallback(
    (threadId: string, groupId: string, count: number, isUrgent = false) => {
      const oldCount = countsRef.current[threadId] ?? 0;
      const wasUrgent = urgentRef.current[threadId] ?? false;
      if (oldCount === count && wasUrgent === isUrgent) return;
      countsRef.current = { ...countsRef.current, [threadId]: count };
      urgentRef.current = { ...urgentRef.current, [threadId]: isUrgent };
      setThreadCounts(countsRef.current);
      const delta = count - oldCount;
      if (delta !== 0) {
        setGroupCounts((prev) => ({ ...prev, [groupId]: Math.max(0, (prev[groupId] ?? 0) + delta) }));
      }
      const urgentDelta = (isUrgent ? count : 0) - (wasUrgent ? oldCount : 0);
      if (urgentDelta !== 0) {
        setGroupUrgentCounts((prev) => ({ ...prev, [groupId]: Math.max(0, (prev[groupId] ?? 0) + urgentDelta) }));
      }
    },
    [],
  );

  const markRead = useCallback((threadId: string, groupId: string) => {
    setLastSeen(threadId, Date.now());
    const count = countsRef.current[threadId] ?? 0;
    if (count === 0) return;
    const wasUrgent = urgentRef.current[threadId] ?? false;
    countsRef.current = { ...countsRef.current, [threadId]: 0 };
    setThreadCounts(countsRef.current);
    setGroupCounts((prev) => ({ ...prev, [groupId]: Math.max(0, (prev[groupId] ?? 0) - count) }));
    if (wasUrgent) {
      setGroupUrgentCounts((prev) => ({ ...prev, [groupId]: Math.max(0, (prev[groupId] ?? 0) - count) }));
    }
  }, []);

  const data = useMemo(
    () => ({ threadCounts, groupCounts, groupUrgentCounts }),
    [threadCounts, groupCounts, groupUrgentCounts],
  );
  const actions = useMemo(() => ({ setThreadCount, markRead }), [setThreadCount, markRead]);

  return (
    <UnreadActionsContext.Provider value={actions}>
      <UnreadDataContext.Provider value={data}>{children}</UnreadDataContext.Provider>
    </UnreadActionsContext.Provider>
  );
}

/** Counts + actions (re-renders on count changes). */
export function useUnread() {
  return { ...useContext(UnreadDataContext), ...useContext(UnreadActionsContext) };
}

/** Actions only — never re-renders on count changes. */
export function useUnreadActions() {
  return useContext(UnreadActionsContext);
}
