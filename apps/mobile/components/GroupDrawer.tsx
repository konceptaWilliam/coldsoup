import { useEffect, useRef, useState } from "react";
import { Modal, View, Text, Pressable, FlatList, Animated, Dimensions } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/lib/theme";
import { useUnread } from "@/lib/unread";

interface Props {
  visible: boolean;
  onClose: () => void;
  currentGroupId: string;
}

export function GroupDrawer({ visible, onClose, currentGroupId }: Props) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const { isUnread } = useUnread();
  const { data: me } = trpc.profile.get.useQuery();
  const { data: groups } = trpc.groups.list.useQuery();

  // One query per group to detect unread threads (groups are few).
  const threadQueries = trpc.useQueries((q) =>
    (groups ?? []).map((g) => q.threads.list({ groupId: g.id })),
  );
  const unreadByGroup: Record<string, boolean> = {};
  (groups ?? []).forEach((g, i) => {
    const threads = threadQueries[i]?.data ?? [];
    unreadByGroup[g.id] = threads.some((th) => {
      const lastMsg = (th.messages as { created_at?: string; user_id?: string }[] | undefined)?.[0];
      const ts = lastMsg?.created_at ? new Date(lastMsg.created_at).getTime() : 0;
      const lastIsMine = !!me && lastMsg?.user_id === me.id;
      return !lastIsMine && ts > 0 && isUnread(th.id, ts);
    });
  });

  const W = Math.min(320, Dimensions.get("window").width * 0.82);
  const tx = useRef(new Animated.Value(-W)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(tx, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(tx, { toValue: -W, duration: 180, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, mounted, tx, W]);

  function switchTo(groupId: string, name: string) {
    onClose();
    if (groupId === currentGroupId) return;
    router.replace({ pathname: "/(app)/group/[groupId]", params: { groupId, name } });
  }

  function go(pathname: "/(app)/(tabs)" | "/(app)/(tabs)/search" | "/(app)/(tabs)/settings") {
    onClose();
    router.push(pathname);
  }

  return (
    <Modal visible={mounted} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: c.overlay }} onPress={onClose}>
        <Animated.View
          style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: W, backgroundColor: c.surface, borderRightWidth: 1, borderRightColor: c.border, transform: [{ translateX: tx }] }}
        >
          <Pressable style={{ flex: 1 }} onPress={() => {}}>
            <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ fontFamily: "monospace", fontSize: 20, fontWeight: "600", color: c.ink, letterSpacing: -0.3 }}>
                {t("tabs.groups").toLowerCase()}
              </Text>
            </View>
            <FlatList
              data={groups ?? []}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const active = item.id === currentGroupId;
                const unread = unreadByGroup[item.id];
                return (
                  <Pressable
                    onPress={() => switchTo(item.id, item.name)}
                    accessibilityRole="button"
                    accessibilityLabel={t("a11y.openGroup", { name: item.name })}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      borderBottomWidth: 1,
                      borderBottomColor: c.border,
                      backgroundColor: pressed || active ? c.highlight : c.surface,
                    })}
                  >
                    <View style={{ width: 7, height: 7, marginRight: 10, transform: [{ rotate: "45deg" }], backgroundColor: unread ? c.urgentText : c.muted2 }} />
                    <Text style={{ fontFamily: "monospace", fontSize: 14, color: c.ink, fontWeight: active || unread ? "700" : "500" }} numberOfLines={1}>
                      {item.name.toLowerCase()}
                    </Text>
                  </Pressable>
                );
              }}
            />
            <View style={{ borderTopWidth: 1, borderTopColor: c.border, paddingVertical: 6 }}>
              <Pressable
                onPress={() => go("/(app)/(tabs)/search")}
                accessibilityRole="button"
                accessibilityLabel={t("tabs.search")}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, opacity: pressed ? 0.6 : 1 })}
              >
                <Feather name="search" size={16} color={c.muted} />
                <Text style={{ fontFamily: "monospace", fontSize: 13, color: c.ink }}>{t("tabs.search").toLowerCase()}</Text>
              </Pressable>
              <Pressable
                onPress={() => go("/(app)/(tabs)/settings")}
                accessibilityRole="button"
                accessibilityLabel={t("tabs.settings")}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, opacity: pressed ? 0.6 : 1 })}
              >
                <Feather name="settings" size={16} color={c.muted} />
                <Text style={{ fontFamily: "monospace", fontSize: 13, color: c.ink }}>{t("tabs.settings").toLowerCase()}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
