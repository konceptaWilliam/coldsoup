import { useState, useEffect } from "react";
import { View, Text, FlatList, Pressable, RefreshControl, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useUnread } from "@/lib/unread";
import { useTheme } from "@/lib/theme";
import { GroupListSkeleton } from "@/components/Skeleton";
import { getLastGroup } from "@/lib/lastGroup";
import * as haptics from "@/lib/haptics";

// Once per app launch: jump into the last-opened group (if still a member).
let didRestoreLastGroup = false;

export default function GroupsTab() {
  const { c } = useTheme();
  const { t } = useTranslation();
  const { isUnread } = useUnread();
  const utils = trpc.useUtils();
  const { data: groups, isLoading, refetch, isRefetching } = trpc.groups.list.useQuery();
  const { data: me } = trpc.profile.get.useQuery();
  const { data: notifPrefs } = trpc.notifications.prefs.useQuery();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  const createGroup = trpc.groups.create.useMutation({
    onSuccess: (group) => {
      utils.groups.list.invalidate();
      setShowCreate(false);
      setNewName("");
      haptics.success();
      router.push({ pathname: "/(app)/group/[groupId]", params: { groupId: group.id, name: group.name } });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : t("groups.createFailed");
      if (Platform.OS === "web") { if (typeof window !== "undefined") window.alert(msg); }
      else Alert.alert(t("groups.createFailed"), msg);
    },
  });

  function submitCreate() {
    const name = newName.trim();
    if (!name || createGroup.isPending) return;
    createGroup.mutate({ name });
  }

  // One query per group to detect unread threads (groups are few).
  const threadQueries = trpc.useQueries((t) =>
    (groups ?? []).map((g) => t.threads.list({ groupId: g.id }))
  );
  const unreadByGroup: Record<string, boolean> = {};
  let totalUnread = 0;
  (groups ?? []).forEach((g, i) => {
    const threads = threadQueries[i]?.data ?? [];
    const unreadCount = threads.filter((th) => {
      const lastMsg = (th.messages as { created_at?: string; user_id?: string }[] | undefined)?.[0];
      const ts = lastMsg?.created_at ? new Date(lastMsg.created_at).getTime() : 0;
      const lastIsMine = !!me && lastMsg?.user_id === me.id;
      return !lastIsMine && ts > 0 && isUnread(th.id, ts);
    }).length;
    unreadByGroup[g.id] = unreadCount > 0;
    totalUnread += unreadCount;
  });

  // Keep the app-icon badge in sync with total unread threads while this tab is mounted.
  useEffect(() => {
    if (Platform.OS === "web") return;
    Notifications.setBadgeCountAsync(totalUnread).catch(() => {});
  }, [totalUnread]);

  // On cold start, reopen the last group the user was in (if still a member).
  useEffect(() => {
    if (didRestoreLastGroup || !groups) return;
    getLastGroup().then((last) => {
      if (didRestoreLastGroup) return;
      didRestoreLastGroup = true;
      if (last && groups.some((g) => g.id === last.id)) {
        router.push({ pathname: "/(app)/group/[groupId]", params: { groupId: last.id, name: last.name } });
      }
    });
  }, [groups]);

  const header = (
    <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text style={{ fontFamily: "monospace", fontSize: 20, fontWeight: "600", color: c.ink, letterSpacing: -0.3 }}>coldsoup</Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.surface }}>
        {header}
        <GroupListSkeleton />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: "monospace", fontSize: 20, fontWeight: "600", color: c.ink, letterSpacing: -0.3 }}>
          coldsoup
        </Text>
        <Pressable
          onPress={() => { setNewName(""); setShowCreate(true); }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("a11y.newGroup")}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, width: 32, height: 32, alignItems: "center", justifyContent: "center" })}
        >
          <Feather name="plus" size={20} color={c.ink} />
        </Pressable>
      </View>

      <FlatList
        data={groups ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.ink} />}
        contentContainerStyle={(groups?.length ?? 0) === 0 ? { flex: 1 } : undefined}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
            <Text style={{ color: c.muted, textAlign: "center", fontSize: 14 }}>
              {t("groups.empty")}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: "/(app)/group/[groupId]", params: { groupId: item.id, name: item.name } })}
            accessibilityRole="button"
            accessibilityLabel={t("a11y.openGroup", { name: item.name })}
            style={({ pressed }) => ({
              opacity: pressed ? 0.6 : 1,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: c.border,
              backgroundColor: c.surface,
            })}
          >
            <View style={{ width: 7, height: 7, marginRight: 10, transform: [{ rotate: "45deg" }], backgroundColor: unreadByGroup[item.id] ? c.urgentText : c.muted2 }} />
            <Text style={{ fontFamily: "monospace", fontSize: 14, color: c.ink, fontWeight: unreadByGroup[item.id] ? "700" : "500", flex: 1 }} numberOfLines={1}>
              {item.name.toLowerCase()}
            </Text>
            {notifPrefs?.groupIds.includes(item.id) && (
              <Feather name="bell-off" size={14} color={c.muted2} style={{ marginLeft: 8 }} />
            )}
          </Pressable>
        )}
      />

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
    </View>
  );
}
