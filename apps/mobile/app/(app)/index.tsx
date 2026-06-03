import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/lib/theme";
import { GroupDrawer } from "@/components/GroupDrawer";
import { EdgeSwipeArea } from "@/components/EdgeSwipeArea";
import { GroupListSkeleton } from "@/components/Skeleton";
import { getLastGroup } from "@/lib/lastGroup";

export default function AppIndex() {
  const { c } = useTheme();
  const { t } = useTranslation();
  const { data: groups, isLoading } = trpc.groups.list.useQuery();
  const [showDrawer, setShowDrawer] = useState(false);
  const redirected = useRef(false);

  // Land straight in a group (last opened if still a member, else the first one).
  useEffect(() => {
    if (redirected.current || !groups || groups.length === 0) return;
    redirected.current = true;
    getLastGroup().then((last) => {
      const target = last && groups.some((g) => g.id === last.id)
        ? last
        : { id: groups[0].id, name: groups[0].name };
      router.replace({ pathname: "/(app)/group/[groupId]", params: { groupId: target.id, name: target.name } });
    });
  }, [groups]);

  const header = (
    <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Pressable
        onPress={() => setShowDrawer(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t("a11y.switchGroup")}
        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
      >
        <Feather name="menu" size={22} color={c.ink} />
      </Pressable>
      <Text style={{ fontFamily: "monospace", fontSize: 20, fontWeight: "600", color: c.ink, letterSpacing: -0.3 }}>coldsoup</Text>
    </View>
  );

  // Loading, or groups exist and we're about to redirect — show a brief skeleton.
  if (isLoading || (groups && groups.length > 0)) {
    return (
      <View style={{ flex: 1, backgroundColor: c.surface }}>
        {header}
        <GroupListSkeleton />
      </View>
    );
  }

  // No groups — empty home, drawer is the only nav.
  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      {header}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Text style={{ color: c.muted, textAlign: "center", fontSize: 14 }}>{t("groups.empty")}</Text>
      </View>
      <GroupDrawer visible={showDrawer} onClose={() => setShowDrawer(false)} currentGroupId="" />
      <EdgeSwipeArea onOpen={() => setShowDrawer(true)} />
    </View>
  );
}
