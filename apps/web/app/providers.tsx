"use client";

import { useState, useEffect } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider, removeOldestQuery } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { httpBatchLink, loggerLink } from "@trpc/client";
import superjson from "superjson";

// Bump to invalidate all persisted caches (e.g. after a data-shape change).
const CACHE_BUSTER = "1";
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
            // Keep cached data around for a day so it can be persisted/restored.
            gcTime: 1000 * 60 * 60 * 24,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  // Persist the query cache to localStorage so reopening a thread / relaunching
  // the PWA shows messages instantly, then revalidates in the background.
  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      key: "coldsoup-query-cache",
      // If localStorage fills up, drop the oldest queries instead of failing.
      retry: removeOldestQuery,
    })
  );

  // Clear cached data on sign-out so messages don't linger for the next user.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        queryClient.clear();
        persister.removeClient();
      }
    });
    return () => subscription.unsubscribe();
  }, [queryClient, persister]);

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
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{
              persister,
              maxAge: 1000 * 60 * 60 * 24,
              buster: CACHE_BUSTER,
              dehydrateOptions: {
                shouldDehydrateQuery: (q) => q.state.status === "success",
              },
            }}
          >
            {children}
            <PwaManager />
          </PersistQueryClientProvider>
        </trpc.Provider>
      </PresenceProvider>
    </ThemeProvider>
  );
}
