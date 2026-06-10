import { useEffect, useState } from "react";
import { router, Stack, usePathname } from "expo-router";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { UnreadProvider } from "@/lib/unread";
import { PresenceProvider } from "@/lib/presence";
import { AppLockProvider } from "@/lib/appLock";
import { useTheme } from "@/lib/theme";

export default function AppLayout() {
  const { c } = useTheme();
  const [checked, setChecked] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/(auth)/login");
      }
      setChecked(true);
    });
  }, []);

  // New (e.g. OAuth) users have no profile yet — send them to onboarding.
  const { data: status } = trpc.onboarding.status.useQuery(undefined, { enabled: checked });
  useEffect(() => {
    if (status?.authed && !status.hasProfile && pathname !== "/onboarding") {
      router.replace("/(app)/onboarding");
    }
  }, [status, pathname]);

  // Invited (magic-link only) users have no password — force them to set one
  // before using the app. Runs after the profile gate so display name comes first.
  const { data: needsPassword } = trpc.onboarding.needsPasswordSetup.useQuery(undefined, {
    enabled: checked && !!status?.hasProfile,
  });
  useEffect(() => {
    if (needsPassword && status?.hasProfile && pathname !== "/set-password") {
      router.replace("/(app)/set-password");
    }
  }, [needsPassword, status, pathname]);

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
        <Stack.Screen name="index" />
        <Stack.Screen name="search" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="set-password" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="group/[groupId]" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="members/[groupId]" options={{ headerShown: true, title: "", ...headerBase }} />
        <Stack.Screen name="thread/[threadId]" options={{ headerShown: false }} />
        <Stack.Screen name="smeter/[smeterId]" options={{ headerShown: false, presentation: "modal", gestureEnabled: true, gestureDirection: "vertical" }} />
      </Stack>
      </AppLockProvider>
      </PresenceProvider>
    </UnreadProvider>
  );
}
