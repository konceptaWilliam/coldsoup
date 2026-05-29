import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "coldsoup:lastSeen";

type UnreadContextType = {
  loaded: boolean;
  markRead: (threadId: string) => void;
  isUnread: (threadId: string, activityTs: number) => boolean;
};

const UnreadContext = createContext<UnreadContextType>({
  loaded: false,
  markRead: () => {},
  isUnread: () => false,
});

export function UnreadProvider({ children }: { children: ReactNode }) {
  const [lastSeen, setLastSeen] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) {
          try { setLastSeen(JSON.parse(raw)); } catch {}
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  const markRead = useCallback((threadId: string) => {
    setLastSeen((prev) => {
      // Skip a write if the timestamp barely moved (avoids churn on every render).
      if (prev[threadId] && Date.now() - prev[threadId] < 1000) return prev;
      const next = { ...prev, [threadId]: Date.now() };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const isUnread = useCallback(
    (threadId: string, activityTs: number) => activityTs > (lastSeen[threadId] ?? 0),
    [lastSeen]
  );

  return (
    <UnreadContext.Provider value={{ loaded, markRead, isUnread }}>
      {children}
    </UnreadContext.Provider>
  );
}

export function useUnread() {
  return useContext(UnreadContext);
}
