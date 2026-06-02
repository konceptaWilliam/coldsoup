import { Tabs } from "expo-router";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/lib/theme";

export default function TabsLayout() {
  const { c } = useTheme();
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border, borderTopWidth: 1 },
        tabBarActiveTintColor: c.ink,
        tabBarInactiveTintColor: c.muted,
        sceneStyle: { backgroundColor: c.surface },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.groups"),
          tabBarLabel: ({ color }) => <Text style={{ color, fontSize: 10, fontFamily: "monospace" }}>{t("tabs.groups")}</Text>,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t("tabs.search"),
          tabBarLabel: ({ color }) => <Text style={{ color, fontSize: 10, fontFamily: "monospace" }}>{t("tabs.search")}</Text>,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("tabs.settings"),
          tabBarLabel: ({ color }) => <Text style={{ color, fontSize: 10, fontFamily: "monospace" }}>{t("tabs.settings")}</Text>,
        }}
      />
    </Tabs>
  );
}
