"use client";

import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, loggerLink } from "@trpc/client";
import superjson from "superjson";
import { trpc } from "@/lib/trpc/client";
import { createClient, setRealtimeAuth } from "@/lib/supabase/client";
import { PresenceProvider } from "@/lib/presence-context";
import { ThemeProvider } from "@/lib/theme-context";
import { PwaManager } from "@/components/pwa-manager";

function getBaseUrl() {
  if (typeof window !== "undefined") return "";
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return "http://localhost:3000";
}

// Singleton browser client — keeps the token refreshed for the lifetime of the tab.
const supabase = createClient();

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Keep the realtime socket's auth token in sync with the session so
    // postgres_changes RLS evaluates as the logged-in user (not anon).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setRealtimeAuth(supabase, data.session.access_token);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setRealtimeAuth(supabase, session?.access_token ?? null);
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        loggerLink({
          enabled: (opts) =>
            process.env.NODE_ENV === "development" ||
            (opts.direction === "down" && opts.result instanceof Error),
        }),
        httpBatchLink({
          transformer: superjson,
          url: `${getBaseUrl()}/api/trpc`,
          headers() {
            return {
              "x-trpc-source": "react",
            };
          },
        }),
      ],
    })
  );

  return (
    <ThemeProvider>
      <PresenceProvider>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            {children}
            <PwaManager />
          </QueryClientProvider>
        </trpc.Provider>
      </PresenceProvider>
    </ThemeProvider>
  );
}
