import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, Platform, ActivityIndicator, Alert } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import DateTimePicker from "@react-native-community/datetimepicker";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/lib/theme";
import { Avatar } from "./Avatar";
import * as haptics from "@/lib/haptics";

interface Props {
  visible: boolean;
  threadId: string;
  onClose: () => void;
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDue(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

function Label({ children }: { children: string }) {
  const { c } = useTheme();
  return (
    <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "500", color: c.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
      {children}
    </Text>
  );
}

export function ThreadDetailsSheet({ visible, threadId, onClose }: Props) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const utils = trpc.useUtils();

  const { data: meta, isLoading } = trpc.threads.get.useQuery({ threadId }, { enabled: visible });
  const groupId = (meta as { group_id?: string } | undefined)?.group_id;
  const creator = (meta as { creator?: { display_name: string; avatar_url: string | null } } | undefined)?.creator ?? null;

  const [dueDate, setDueDate] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (!meta) return;
    setDueDate((meta as { due_date: string | null }).due_date ?? null);
  }, [meta, visible]);

  const { data: notifPrefs } = trpc.notifications.prefs.useQuery();
  const isMuted = !!notifPrefs?.threadIds.includes(threadId);
  const setMute = trpc.notifications.setMute.useMutation({
    onMutate: async ({ targetType, targetId, muted }) => {
      await utils.notifications.prefs.cancel();
      const prev = utils.notifications.prefs.getData();
      utils.notifications.prefs.setData(undefined, (old) => {
        if (!old) return old;
        const key = targetType === "thread" ? "threadIds" : "groupIds";
        const set = new Set(old[key]);
        if (muted) set.add(targetId); else set.delete(targetId);
        return { ...old, [key]: Array.from(set) };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) utils.notifications.prefs.setData(undefined, ctx.prev); },
    onSettled: () => utils.notifications.prefs.invalidate(),
  });

  const deleteThread = trpc.threads.delete.useMutation({
    onSuccess: () => {
      utils.threads.list.invalidate();
      onClose();
      if (router.canGoBack()) router.back();
      else if (groupId) router.replace({ pathname: "/(app)/group/[groupId]", params: { groupId } });
      else router.replace("/(app)/(tabs)");
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : t("thread.deleteThreadFailed");
      if (Platform.OS === "web") { if (typeof window !== "undefined") window.alert(msg); }
      else Alert.alert(t("thread.deleteThreadFailedTitle"), msg);
    },
  });

  function confirmDelete() {
    const doDelete = () => deleteThread.mutate({ threadId });
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(t("thread.deleteThreadConfirmWeb"))) doDelete();
    } else {
      Alert.alert(t("thread.deleteThreadTitle"), t("thread.deleteThreadBody"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.delete"), style: "destructive", onPress: doDelete },
      ]);
    }
  }

  const setMeta = trpc.threads.setMeta.useMutation({
    onMutate: async (vars) => {
      if (!groupId) return { prev: undefined, groupId: undefined };
      await utils.threads.list.cancel({ groupId });
      const prev = utils.threads.list.getData({ groupId });
      utils.threads.list.setData({ groupId }, (old) =>
        old ? old.map((th) => (th.id === threadId ? { ...th, due_date: vars.dueDate ?? null } : th)) : old
      );
      return { prev, groupId };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev && ctx.groupId) utils.threads.list.setData({ groupId: ctx.groupId }, ctx.prev);
    },
    onSuccess: () => {
      utils.threads.get.invalidate({ threadId });
      utils.threads.list.invalidate();
      haptics.success();
      onClose();
    },
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: c.overlay }} onPress={onClose}>
        <Pressable style={{ backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.border, maxHeight: "85%" }} onPress={() => {}}>
          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontFamily: "monospace", fontSize: 14, fontWeight: "600", color: c.ink, marginBottom: 20 }}>
              {t("threadMeta.title")}
            </Text>

            {isLoading ? (
              <ActivityIndicator color={c.ink} style={{ paddingVertical: 24 }} />
            ) : (
              <>
                {/* Assignee — always the thread's creator, read-only */}
                <Label>{t("threadMeta.owner")}</Label>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 24 }}>
                  {creator ? (
                    <>
                      <Avatar name={creator.display_name} avatarUrl={creator.avatar_url} size={28} fontSize={11} />
                      <Text style={{ fontSize: 14, color: c.ink }}>{creator.display_name}</Text>
                    </>
                  ) : (
                    <Text style={{ fontSize: 14, color: c.muted }}>—</Text>
                  )}
                </View>

                {/* Due date — optional */}
                <Label>{t("threadMeta.dueDate")}</Label>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 24 }}>
                  <Text style={{ flex: 1, fontSize: 14, color: dueDate ? c.ink : c.muted }}>
                    {dueDate ? formatDue(dueDate) : t("threadMeta.noDueDate")}
                  </Text>
                  <Pressable onPress={() => setShowPicker(true)} style={({ pressed }) => ({ borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 12, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
                    <Text style={{ fontFamily: "monospace", fontSize: 12, color: c.ink }}>{t("threadMeta.setDueDate")}</Text>
                  </Pressable>
                  {dueDate && (
                    <Pressable onPress={() => setDueDate(null)} style={({ pressed }) => ({ paddingHorizontal: 8, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
                      <Text style={{ fontFamily: "monospace", fontSize: 12, color: c.muted }}>{t("threadMeta.clear")}</Text>
                    </Pressable>
                  )}
                </View>
                {showPicker && (
                  <DateTimePicker
                    value={dueDate ? new Date(`${dueDate}T00:00:00`) : new Date()}
                    mode="date"
                    onChange={(e, d) => {
                      setShowPicker(Platform.OS === "ios");
                      if (e.type === "set" && d) setDueDate(toYMD(d));
                    }}
                  />
                )}

                <Pressable
                  onPress={() => setMeta.mutate({ threadId, dueDate })}
                  disabled={setMeta.isPending}
                  style={({ pressed }) => ({ backgroundColor: c.ink, paddingVertical: 12, alignItems: "center", opacity: pressed || setMeta.isPending ? 0.4 : 1 })}
                >
                  {setMeta.isPending
                    ? <ActivityIndicator color={c.surface} />
                    : <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "500", color: c.surface }}>{t("common.save")}</Text>}
                </Pressable>

                <View style={{ borderTopWidth: 1, borderTopColor: c.border, marginTop: 24, paddingTop: 16, gap: 10 }}>
                  <Pressable
                    onPress={() => { haptics.selection(); setMute.mutate({ targetType: "thread", targetId: threadId, muted: !isMuted }); }}
                    accessibilityRole="button"
                    accessibilityLabel={isMuted ? t("a11y.unmuteThread") : t("a11y.muteThread")}
                    style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}
                  >
                    <Feather name={isMuted ? "bell-off" : "bell"} size={14} color={c.ink} />
                    <Text style={{ fontFamily: "monospace", fontSize: 12, color: c.ink, letterSpacing: 0.5 }}>
                      {isMuted ? t("a11y.unmuteThread") : t("a11y.muteThread")}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={confirmDelete}
                    disabled={deleteThread.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={t("a11y.deleteThread")}
                    style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: c.urgentBorder, paddingVertical: 12, opacity: pressed || deleteThread.isPending ? 0.5 : 1 })}
                  >
                    <Feather name="trash-2" size={14} color={c.urgentText} />
                    <Text style={{ fontFamily: "monospace", fontSize: 12, color: c.urgentText, letterSpacing: 0.5 }}>{t("a11y.deleteThread")}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
