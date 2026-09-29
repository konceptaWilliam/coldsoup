"use client";

import { useState, useEffect } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider, removeOldestQuery } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { httpBatchStreamLink, httpLink, loggerLink, splitLink } from "@trpc/client";
import { getQueryKey } from "@trpc/react-query";
import superjson from "superjson";

// Bump to invalidate all persisted caches (e.g. after a data-shape change).
// "2": messages.list became an infinite query (old persisted shape dropped).
const CACHE_BUSTER = "2";
const WEEK = 1000 * 60 * 60 * 24 * 7;
import { trpc } from "@/lib/trpc/client";
import { createClient, setRealtimeAuth } from "@/lib/supabase/client";
import { diagnosticFetch } from "@/lib/response-diagnostics";
import { PresenceProvider } from "@/lib/presence-context";
import { ThemeProvider } from "@/lib/theme-context";
import { PwaManager } from "@/components/pwa-manager";
import { trimPersistedMessages } from "@/lib/thread-cache";
import { shouldPersistQuery } from "@/lib/persist-policy";

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
      (() => {
        const client = new QueryClient({
          defaultOptions: {
            queries: {
              // Messages/threads keep the short default so reopening a thread
              // refetches and catches up on anything missed while it was closed.
              staleTime: 30_000,
              // Keep cached data around for a week so it survives in memory and
              // can be persisted/restored after days away.
              gcTime: WEEK,
              refetchOnWindowFocus: false,
            },
          },
        });
        // Rarely-changing data: longer freshness window to cut redundant
        // refetches (and egress). Mutations still invalidate these explicitly.
        const MIN = 60_000;
        client.setQueryDefaults(getQueryKey(trpc.groups.list), { staleTime: 10 * MIN });
        client.setQueryDefaults(getQueryKey(trpc.messages.groupMembers), { staleTime: 10 * MIN });
        client.setQueryDefaults(getQueryKey(trpc.notifications.prefs), { staleTime: 5 * MIN });
        return client;
      })()
  );

  // Persist the query cache to localStorage so reopening a thread / relaunching
  // the PWA shows messages instantly, then revalidates in the background.
  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      key: "coldsoup-query-cache",
      // Writes stringify the whole cache on the main thread; batch them.
      throttleTime: 3000,
      // Only the newest page of each thread is persisted; older pages scrolled
      // into view stay in memory for the session.
      serialize: (client) =>
        JSON.stringify(
          trimPersistedMessages(client as unknown as Parameters<typeof trimPersistedMessages>[0]),
        ),
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
        // links.unfurl can take seconds (remote fetch); keep it out of the
        // batch. Everything else streams, so each procedure's result lands as
        // soon as it's ready instead of waiting for the slowest one.
        splitLink({
          condition: (op) => op.path === "links.unfurl",
          true: httpLink({
            transformer: superjson,
            url: `${getBaseUrl()}/api/trpc`,
            fetch: diagnosticFetch,
            headers() {
              return { "x-trpc-source": "react" };
            },
          }),
          false: httpBatchStreamLink({
            transformer: superjson,
            url: `${getBaseUrl()}/api/trpc`,
            // The streaming link reads res.body directly, so diagnosticFetch's
            // res.json() override is inert here (harmless to keep).
            fetch: diagnosticFetch,
            headers() {
              return { "x-trpc-source": "react" };
            },
          }),
        }),
      ],
    })
  );

  return (
    <ThemeProvider>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: WEEK,
            buster: CACHE_BUSTER,
            dehydrateOptions: {
              shouldDehydrateQuery: (q) => shouldPersistQuery(q.queryKey, q.state.status),
            },
          }}
        >
          {/* Inside trpc.Provider: PresenceProvider calls profile.heartbeat. */}
          <PresenceProvider>
            {children}
            <PwaManager />
          </PresenceProvider>
        </PersistQueryClientProvider>
      </trpc.Provider>
    </ThemeProvider>
  );
}
