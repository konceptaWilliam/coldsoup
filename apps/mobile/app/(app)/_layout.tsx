import { useEffect, useState } from "react";
import { router, Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { UnreadProvider } from "@/lib/unread";
import { PresenceProvider } from "@/lib/presence";
import { AppLockProvider } from "@/lib/appLock";
import { useTheme } from "@/lib/theme";

export default function AppLayout() {
  const { c } = useTheme();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/(auth)/login");
      }
      setChecked(true);
    });
  }, []);

  if (!checked) return null;

  const headerBase = {
    headerStyle: { backgroundColor: c.surface },
    headerShadowVisible: false,
    headerTintColor: c.ink,
    headerBackTitleVisible: false,
    headerTitleStyle: { fontFamily: "monospace", fontSize: 14, fontWeight: "500" as const, color: c.ink },
    contentStyle: { backgroundColor: c.surface },
  };

  return (
    <UnreadProvider>
      <PresenceProvider>
      <AppLockProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.surface } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="group/[groupId]" options={{ headerShown: false }} />
        <Stack.Screen name="members/[groupId]" options={{ headerShown: true, title: "", ...headerBase }} />
        <Stack.Screen name="thread/[threadId]" options={{ headerShown: false }} />
      </Stack>
      </AppLockProvider>
      </PresenceProvider>
    </UnreadProvider>
  );
}
