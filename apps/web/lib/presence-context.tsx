"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

const CHANNEL = "presence:online";

type PresenceContextType = {
  onlineIds: Set<string>;
  isOnline: (userId: string | null | undefined) => boolean;
};

const PresenceContext = createContext<PresenceContextType>({
  onlineIds: new Set(),
  isOnline: () => false,
});

export function PresenceProvider({ children }: { children: ReactNode }) {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();

    function trackVisible() {
      const channel = channelRef.current;
      if (!channel || !userIdRef.current) return;
      if (document.visibilityState === "visible") {
        channel.track({ online_at: Date.now() });
      } else {
        channel.untrack();
      }
    }

    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid || !mounted) return;
      userIdRef.current = uid;

      const channel = supabase.channel(CHANNEL, {
        config: { presence: { key: uid } },
      });
      channel
        .on("presence", { event: "sync" }, () => {
          setOnlineIds(new Set(Object.keys(channel.presenceState())));
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") trackVisible();
        });

      channelRef.current = channel;
    });

    document.addEventListener("visibilitychange", trackVisible);
    window.addEventListener("focus", trackVisible);
    window.addEventListener("blur", trackVisible);

    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", trackVisible);
      window.removeEventListener("focus", trackVisible);
      window.removeEventListener("blur", trackVisible);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  return (
    <PresenceContext.Provider
      value={{ onlineIds, isOnline: (id) => !!id && onlineIds.has(id) }}
    >
      {children}
    </PresenceContext.Provider>
  );
}

export function useOnline() {
  return useContext(PresenceContext);
}
