import { useEffect, useState } from "react";
import { router, Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { UnreadProvider } from "@/lib/unread";

export default function AppLayout() {
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
    headerStyle: { backgroundColor: "#F2EFE8" },
    headerShadowVisible: false,
    headerTintColor: "#1A1A18",
    headerBackTitleVisible: false,
    headerTitleStyle: { fontFamily: "monospace", fontSize: 14, fontWeight: "500" as const, color: "#1A1A18" },
  };

  return (
    <UnreadProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="group/[groupId]" options={{ headerShown: true, title: "", ...headerBase }} />
        <Stack.Screen name="thread/[threadId]" options={{ headerShown: true, title: "", ...headerBase }} />
      </Stack>
    </UnreadProvider>
  );
}
