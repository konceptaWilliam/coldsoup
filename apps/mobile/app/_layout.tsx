import "../global.css";
import { useEffect, useRef, useState } from "react";
import { router, Stack } from "expo-router";
import * as Notifications from "expo-notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { supabase } from "@/lib/supabase";
import { trpc, createTRPCClient } from "@/lib/trpc";
import { registerForPushNotifications } from "@/lib/notifications";

const queryClient = new QueryClient();

export default function RootLayout() {
  const [trpcClient] = useState(() => createTRPCClient());

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        router.replace("/(auth)/login");
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        router.replace("/(app)/(tabs)");
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const notifSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const threadId = response.notification.request.content.data?.threadId as string | undefined;
      if (threadId) router.push(`/(app)/thread/${threadId}`);
    });
    return () => notifSub.remove();
  }, []);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
          </Stack>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
