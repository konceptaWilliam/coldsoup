import "../global.css";
import "@/lib/i18n";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { supabase } from "@/lib/supabase";
import { trpc, createTRPCClient } from "@/lib/trpc";
import { registerForPushNotifications } from "@/lib/notifications";
import { ThemeProvider, useTheme } from "@/lib/theme";

const queryClient = new QueryClient();

function RootNavigator() {
  const { c, scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.surface } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [trpcClient] = useState(() => createTRPCClient());

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        router.replace("/(auth)/login");
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        router.replace("/(app)");
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // expo-notifications is native-only; its web build throws on these calls.
    if (Platform.OS === "web") return;

    // Tap while the app is running/backgrounded.
    const notifSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const threadId = response.notification.request.content.data?.threadId as string | undefined;
      if (threadId) router.push(`/(app)/thread/${threadId}`);
    });

    // Cold start: app was launched by tapping a notification while killed.
    let handled = false;
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (handled || !response) return;
      handled = true;
      const threadId = response.notification.request.content.data?.threadId as string | undefined;
      // Defer so the initial auth routing settles before we push the thread.
      if (threadId) setTimeout(() => router.push(`/(app)/thread/${threadId}`), 600);
    }).catch(() => {});

    return () => notifSub.remove();
  }, []);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <ThemeProvider>
            <RootNavigator />
          </ThemeProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
