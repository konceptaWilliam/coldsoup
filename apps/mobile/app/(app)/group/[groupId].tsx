import { useRef, useState, useEffect } from "react";
import { View, Text, FlatList, Pressable, RefreshControl, TextInput, ActivityIndicator, Platform } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { Feather } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { StatusBadge } from "@/components/StatusBadge";
import { Avatar } from "@/components/Avatar";
import { GroupDrawer } from "@/components/GroupDrawer";
import { ThreadListSkeleton } from "@/components/Skeleton";
import { useUnread } from "@/lib/unread";
import { useTheme } from "@/lib/theme";
import { setLastGroup } from "@/lib/lastGroup";
import type { ThreadStatus } from "@coldsoup/core";

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(dateStr).toLocaleDateString("en", { month: "short", day: "numeric" });
}

type Thread = {
  id: string;
  title: string;
  status: ThreadStatus;
  updated_at: string;
  due_date?: string | null;
  creator?: { id: string; display_name: string; avatar_url: string | null } | null;
  messages?: { body: string; is_deleted: boolean; created_at?: string; user_id?: string }[];
};

function isOverdue(ymd: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${ymd}T00:00:00`) < today;
}

function formatDue(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("en", { month: "short", day: "numeric" });
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sortThreads(threads: Thread[]): Thread[] {
  return [...threads].sort((a, b) => {
    const aDone = a.status === "DONE" ? 1 : 0;
    const bDone = b.status === "DONE" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

export default function GroupScreen() {
  const { c } = useTheme();
  const { t } = useTranslation();
  const { groupId, name } = useLocalSearchParams<{ groupId: string; name: string }>();
  const { isUnread } = useUnread();
  const { data: allGroups } = trpc.groups.list.useQuery();
  // The `name` param is lost on reload — fall back to looking it up by id.
  const groupName = name || allGroups?.find((g) => g.id === groupId)?.name || "";

  // Remember this group so the app can reopen straight into it.
  useEffect(() => {
    if (groupId && groupName) setLastGroup({ id: groupId, name: groupName });
  }, [groupId, groupName]);
  const { data: me } = trpc.profile.get.useQuery();
  const { data: threads, isLoading, refetch, isRefetching } = trpc.threads.list.useQuery({ groupId });
  const { data: notifPrefs } = trpc.notifications.prefs.useQuery();
  const createThread = trpc.threads.create.useMutation({
    onSuccess: () => {
      refetch();
      bottomSheetRef.current?.close();
      setNewTitle("");
      setNewDueDate(null);
    },
  });

  const bottomSheetRef = useRef<BottomSheet>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDueDate, setNewDueDate] = useState<string | null>(null);
  const [showCreatePicker, setShowCreatePicker] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [filter, setFilter] = useState<"ALL" | ThreadStatus>("ALL");

  function submitNewThread() {
    if (!newTitle.trim() || createThread.isPending) return;
    createThread.mutate({ groupId, title: newTitle.trim(), dueDate: newDueDate });
  }
  const sortedAll = threads ? sortThreads(threads as unknown as Thread[]) : [];
  const sorted = filter === "ALL" ? sortedAll : sortedAll.filter((th) => th.status === filter);

  const filterOptions: { key: "ALL" | ThreadStatus; label: string }[] = [
    { key: "ALL", label: t("group.filterAll") },
    { key: "OPEN", label: t("group.filterOpen") },
    { key: "URGENT", label: t("group.filterUrgent") },
    { key: "DONE", label: t("group.filterDone") },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable
          onPress={() => setShowDrawer(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("a11y.switchGroup")}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
        >
          <Feather name="menu" size={22} color={c.ink} />
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: "/(app)/members/[groupId]", params: { groupId, name: groupName } })}
          accessibilityRole="button"
          accessibilityLabel={t("a11y.groupOptions", { name: groupName })}
          style={({ pressed }) => ({ flex: 1, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ fontFamily: "monospace", fontSize: 20, fontWeight: "600", color: c.ink, letterSpacing: -0.3 }} numberOfLines={1}>
            {groupName.toLowerCase()}
          </Text>
          <Feather name="chevron-down" size={16} color={c.muted} />
        </Pressable>
      </View>

      <Pressable
        onPress={() => bottomSheetRef.current?.expand()}
        accessibilityRole="button"
        accessibilityLabel={t("a11y.newThread")}
        style={({ pressed }) => ({
          position: "absolute", bottom: 24, right: 20, zIndex: 10,
          width: 44, height: 44, backgroundColor: c.ink,
          alignItems: "center", justifyContent: "center",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text style={{ color: c.surface, fontSize: 22, lineHeight: 24 }}>+</Text>
      </Pressable>

      <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: c.border }}>
        {filterOptions.map((opt) => {
          const active = filter === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => setFilter(opt.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 32,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 1,
                borderColor: active ? c.ink : c.border,
                backgroundColor: active ? c.ink : c.surface2,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: active ? c.surface : c.muted }}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <ThreadListSkeleton />
      ) : (
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 88, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.ink} />}
        ListEmptyComponent={
          <View style={{ alignItems: "center", padding: 32 }}>
            <Text style={{ color: c.muted, fontSize: 14 }}>{filter === "ALL" ? t("group.empty") : t("group.emptyFiltered")}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const lastMsg = item.messages?.[0];
          const preview = lastMsg && !lastMsg.is_deleted ? lastMsg.body : "";
          const isDone = item.status === "DONE";
          const isUrgent = item.status === "URGENT";
          const activityTs = lastMsg?.created_at ? new Date(lastMsg.created_at).getTime() : 0;
          const lastIsMine = !!me && lastMsg?.user_id === me.id;
          const unread = !lastIsMine && activityTs > 0 && isUnread(item.id, activityTs);
          return (
            <Pressable
              onPress={() => router.push({
                pathname: "/(app)/thread/[threadId]",
                params: { threadId: item.id, title: item.title, status: item.status, groupId },
              })}
              accessibilityRole="button"
              accessibilityLabel={t("a11y.openThread", { title: item.title })}
              style={({ pressed }) => ({
                opacity: pressed ? 0.6 : isDone ? 0.4 : 1,
                borderLeftWidth: isUrgent ? 2 : 0,
                borderLeftColor: c.urgentBorder,
                borderBottomWidth: 1,
                borderBottomColor: c.border,
                backgroundColor: c.surface,
                paddingHorizontal: 16,
                paddingVertical: 12,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1, marginRight: 8 }}>
                  {unread && <View style={{ width: 7, height: 7, backgroundColor: c.urgentBorder, marginRight: 8, transform: [{ rotate: "45deg" }] }} />}
                  <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: unread ? "700" : "500", color: c.ink, flex: 1 }} numberOfLines={1}>
                    # {item.title.toLowerCase()}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  {notifPrefs?.threadIds.includes(item.id) && <Feather name="bell-off" size={12} color={c.muted2} />}
                  <Text style={{ fontSize: 11, color: unread ? c.ink : c.muted }}>{formatRelative(item.updated_at)}</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 12, color: c.muted, flex: 1, marginRight: 8 }} numberOfLines={1}>
                  {preview || " "}
                </Text>
                <StatusBadge status={item.status} />
              </View>
              {(item.creator || item.due_date) && (
                <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {item.creator && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Avatar name={item.creator.display_name} avatarUrl={item.creator.avatar_url} size={16} fontSize={7} />
                      <Text style={{ fontFamily: "monospace", fontSize: 10, color: c.muted }}>{item.creator.display_name}</Text>
                    </View>
                  )}
                  {item.due_date && (
                    <View style={{ borderWidth: 1, borderColor: isOverdue(item.due_date) ? c.urgentBorder : c.border, backgroundColor: isOverdue(item.due_date) ? c.urgentBg : c.surface2, paddingHorizontal: 5, paddingVertical: 1 }}>
                      <Text style={{ fontFamily: "monospace", fontSize: 9, color: isOverdue(item.due_date) ? c.urgentText : c.muted, letterSpacing: 0.3 }}>
                        {formatDue(item.due_date)}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </Pressable>
          );
        }}
      />
      )}

      <GroupDrawer visible={showDrawer} onClose={() => setShowDrawer(false)} currentGroupId={groupId} />

      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={["52%"]}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: c.surface, borderRadius: 0 }}
        handleIndicatorStyle={{ backgroundColor: c.border }}
      >
        <BottomSheetView style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 }}>
          <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "600", color: c.ink, marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>
            {t("group.newThread")}
          </Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: c.ink, marginBottom: 12 }}
            placeholder={t("group.threadTitlePlaceholder")}
            placeholderTextColor={c.muted}
            value={newTitle}
            onChangeText={(v) => setNewTitle(v.replace(/ /g, "_"))}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submitNewThread}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <Text style={{ flex: 1, fontSize: 14, color: newDueDate ? c.ink : c.muted }}>
              {newDueDate ? formatDue(newDueDate) : t("threadMeta.noDueDate")}
            </Text>
            <Pressable onPress={() => setShowCreatePicker(true)} style={({ pressed }) => ({ borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 12, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ fontFamily: "monospace", fontSize: 12, color: c.ink }}>{t("threadMeta.setDueDate")}</Text>
            </Pressable>
            {newDueDate && (
              <Pressable onPress={() => setNewDueDate(null)} style={({ pressed }) => ({ paddingHorizontal: 8, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
                <Text style={{ fontFamily: "monospace", fontSize: 12, color: c.muted }}>{t("threadMeta.clear")}</Text>
              </Pressable>
            )}
          </View>
          {showCreatePicker && (
            <DateTimePicker
              value={newDueDate ? new Date(`${newDueDate}T00:00:00`) : new Date()}
              mode="date"
              onChange={(e, d) => {
                setShowCreatePicker(Platform.OS === "ios");
                if (e.type === "set" && d) setNewDueDate(toYMD(d));
              }}
            />
          )}
          <Pressable
            onPress={submitNewThread}
            disabled={!newTitle.trim() || createThread.isPending}
            style={({ pressed }) => ({
              backgroundColor: c.ink,
              paddingVertical: 12,
              alignItems: "center",
              opacity: pressed || !newTitle.trim() || createThread.isPending ? 0.4 : 1,
            })}
          >
            {createThread.isPending
              ? <ActivityIndicator color={c.surface} />
              : <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "500", color: c.surface }}>{t("common.create")}</Text>
            }
          </Pressable>
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}
