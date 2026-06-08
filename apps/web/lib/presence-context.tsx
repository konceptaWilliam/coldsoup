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
import { trpc } from "@/lib/trpc/client";

const HEARTBEAT_MS = 2 * 60 * 1000;

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
  const heartbeat = trpc.profile.heartbeat.useMutation();
  const heartbeatRef = useRef(heartbeat);
  heartbeatRef.current = heartbeat;

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    function beat() {
      heartbeatRef.current.mutate();
    }

    function trackVisible() {
      const channel = channelRef.current;
      if (!channel || !userIdRef.current) return;
      if (document.visibilityState === "visible") {
        channel.track({ online_at: Date.now() });
        beat();
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
      beat();
      heartbeatTimer = setInterval(() => {
        if (document.visibilityState === "visible") beat();
      }, HEARTBEAT_MS);
    });

    document.addEventListener("visibilitychange", trackVisible);
    window.addEventListener("focus", trackVisible);
    window.addEventListener("blur", trackVisible);

    return () => {
      mounted = false;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
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
