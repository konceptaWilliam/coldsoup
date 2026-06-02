import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { supabase } from "./supabase";

// Global realtime presence. Every signed-in client tracks itself on one shared
// channel while the app is foregrounded; everyone sees who is currently online.
// Ephemeral — no database involved.
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
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid || !mounted) return;

      const channel = supabase.channel(CHANNEL, { config: { presence: { key: uid } } });
      channel
        .on("presence", { event: "sync" }, () => {
          setOnlineIds(new Set(Object.keys(channel.presenceState())));
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") channel.track({ online_at: Date.now() });
        });
      channelRef.current = channel;
    });

    // Re-announce presence when the app returns to the foreground.
    const sub = AppState.addEventListener("change", (state) => {
      const ch = channelRef.current;
      if (!ch) return;
      if (state === "active") ch.track({ online_at: Date.now() });
      else ch.untrack();
    });

    return () => {
      mounted = false;
      sub.remove();
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  return (
    <PresenceContext.Provider value={{ onlineIds, isOnline: (id) => !!id && onlineIds.has(id) }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function useOnline() {
  return useContext(PresenceContext);
}
