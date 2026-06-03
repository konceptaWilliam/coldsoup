import { useEffect, useRef, useState } from "react";
import { Modal, View, Text, Pressable, FlatList, Animated, Dimensions, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/lib/theme";
import { useUnread } from "@/lib/unread";
import * as haptics from "@/lib/haptics";

interface Props {
  visible: boolean;
  onClose: () => void;
  currentGroupId: string;
}

export function GroupDrawer({ visible, onClose, currentGroupId }: Props) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const { isUnread } = useUnread();
  const utils = trpc.useUtils();
  const { data: me } = trpc.profile.get.useQuery();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  const createGroup = trpc.groups.create.useMutation({
    onSuccess: (group) => {
      utils.groups.list.invalidate();
      setShowCreate(false);
      setNewName("");
      haptics.success();
      onClose();
      router.replace({ pathname: "/(app)/group/[groupId]", params: { groupId: group.id, name: group.name } });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Could not create group";
      if (Platform.OS === "web") { if (typeof window !== "undefined") window.alert(msg); }
      else Alert.alert("Could not create group", msg);
    },
  });

  function submitCreate() {
    const v = newName.trim();
    if (!v || createGroup.isPending) return;
    createGroup.mutate({ name: v });
  }
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

  function go(pathname: "/(app)/search" | "/(app)/settings") {
    onClose();
    router.push(pathname);
  }

  return (
    <>
    <Modal visible={mounted} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: c.overlay }} onPress={onClose}>
        <Animated.View
          style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: W, backgroundColor: c.surface, borderRightWidth: 1, borderRightColor: c.border, transform: [{ translateX: tx }] }}
        >
          <Pressable style={{ flex: 1 }} onPress={() => {}}>
            <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: "monospace", fontSize: 20, fontWeight: "600", color: c.ink, letterSpacing: -0.3 }}>
                {t("tabs.groups").toLowerCase()}
              </Text>
              <Pressable
                onPress={() => { setNewName(""); setShowCreate(true); }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t("a11y.newGroup")}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
              >
                <Feather name="plus" size={20} color={c.ink} />
              </Pressable>
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
                onPress={() => go("/(app)/search")}
                accessibilityRole="button"
                accessibilityLabel={t("tabs.search")}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, opacity: pressed ? 0.6 : 1 })}
              >
                <Feather name="search" size={16} color={c.muted} />
                <Text style={{ fontFamily: "monospace", fontSize: 13, color: c.ink }}>{t("tabs.search").toLowerCase()}</Text>
              </Pressable>
              <Pressable
                onPress={() => go("/(app)/settings")}
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

      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: c.overlay }} onPress={() => setShowCreate(false)}>
            <Pressable style={{ backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.border, padding: 16, paddingBottom: 32 }} onPress={() => {}}>
              <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "600", color: c.ink, marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>
                {t("groups.newGroup")}
              </Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: c.ink, marginBottom: 12 }}
                placeholder={t("groups.namePlaceholder")}
                placeholderTextColor={c.muted}
                value={newName}
                onChangeText={setNewName}
                autoFocus
                maxLength={80}
                returnKeyType="done"
                onSubmitEditing={submitCreate}
              />
              <Pressable
                onPress={submitCreate}
                disabled={!newName.trim() || createGroup.isPending}
                style={({ pressed }) => ({ backgroundColor: c.ink, paddingVertical: 12, alignItems: "center", opacity: pressed || !newName.trim() || createGroup.isPending ? 0.4 : 1 })}
              >
                {createGroup.isPending
                  ? <ActivityIndicator color={c.surface} />
                  : <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "500", color: c.surface }}>{t("common.create")}</Text>}
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
