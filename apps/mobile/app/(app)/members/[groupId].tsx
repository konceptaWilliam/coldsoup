import { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, Modal, Alert, Platform, ActivityIndicator, TextInput, KeyboardAvoidingView } from "react-native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/lib/theme";
import { Avatar } from "@/components/Avatar";
import { ProfileSheet, type ProfileTarget } from "@/components/ProfileSheet";
import { MemberListSkeleton } from "@/components/Skeleton";
import { useOnline } from "@/lib/presence";
import * as haptics from "@/lib/haptics";

type Member = { id: string; display_name: string; avatar_url: string | null; role: string };

export default function MembersScreen() {
  const { c } = useTheme();
  const { t } = useTranslation();
  const { isOnline } = useOnline();
  const { groupId, name } = useLocalSearchParams<{ groupId: string; name: string }>();
  const navigation = useNavigation();
  const utils = trpc.useUtils();

  const { data: me } = trpc.profile.get.useQuery();
  const { data: members, isLoading } = trpc.messages.groupMembers.useQuery({ groupId });
  const [target, setTarget] = useState<Member | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [profileTarget, setProfileTarget] = useState<ProfileTarget | null>(null);

  const myRole = (members ?? []).find((m) => m.id === me?.id)?.role;
  const amAdmin = myRole === "ADMIN";

  const { data: invites } = trpc.invites.list.useQuery({ groupId }, { enabled: amAdmin });
  const { data: notifPrefs } = trpc.notifications.prefs.useQuery();
  const isGroupMuted = !!notifPrefs?.groupIds.includes(groupId);
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

  const sendInvite = trpc.invites.send.useMutation({
    onSuccess: (_data, vars) => {
      utils.invites.list.invalidate({ groupId });
      setShowInvite(false);
      setEmail("");
      haptics.success();
      if (Platform.OS === "web") { if (typeof window !== "undefined") window.alert(t("invite.sentBody", { email: vars.email })); }
      else Alert.alert(t("invite.sentTitle"), t("invite.sentBody", { email: vars.email }));
    },
    onError: (err) => notifyError(err, t("invite.failed")),
  });
  const revokeInvite = trpc.invites.revoke.useMutation({
    onSuccess: () => utils.invites.list.invalidate({ groupId }),
    onError: (err) => notifyError(err),
  });
  const renameGroup = trpc.groups.rename.useMutation({
    onSuccess: () => {
      utils.groups.list.invalidate();
      setShowRename(false);
      haptics.success();
    },
    onError: (err) => notifyError(err, t("groupSettings.renameFailed")),
  });
  const leaveGroup = trpc.groups.leave.useMutation({
    onSuccess: () => {
      utils.groups.list.invalidate();
      haptics.warning();
      router.replace("/(app)");
    },
    onError: (err) => notifyError(err, t("groupSettings.leaveFailed")),
  });

  useEffect(() => {
    navigation.setOptions({
      title: name ? `${name.toLowerCase()} · ${t("members.title").toLowerCase()}` : t("members.title"),
      headerRight: amAdmin
        ? () => (
            <Pressable
              onPress={() => { setEmail(""); setShowInvite(true); }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("a11y.invite")}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, paddingHorizontal: 4 })}
            >
              <Feather name="user-plus" size={18} color={c.ink} />
            </Pressable>
          )
        : undefined,
    });
  }, [name, navigation, t, amAdmin, c]);

  const removeMember = trpc.groups.removeMember.useMutation({
    onSuccess: () => utils.messages.groupMembers.invalidate({ groupId }),
    onError: (err) => notifyError(err),
  });
  const transferAdmin = trpc.groups.transferAdmin.useMutation({
    onSuccess: () => utils.messages.groupMembers.invalidate({ groupId }),
    onError: (err) => notifyError(err),
  });

  function notifyError(err: unknown, fallback = "Action failed") {
    const msg = err instanceof Error ? err.message : fallback;
    if (Platform.OS === "web") { if (typeof window !== "undefined") window.alert(msg); }
    else Alert.alert(fallback, msg);
  }

  function submitInvite() {
    const e = email.trim();
    if (!e || sendInvite.isPending) return;
    sendInvite.mutate({ email: e, groupId });
  }

  function handleRevoke(inviteId: string, inviteEmail: string) {
    confirm(t("invite.revokeTitle"), t("invite.revokeBody", { email: inviteEmail }), () => {
      haptics.warning();
      revokeInvite.mutate({ inviteId });
    }, true);
  }

  function submitRename() {
    const v = renameValue.trim();
    if (!v || renameGroup.isPending) return;
    renameGroup.mutate({ groupId, name: v });
  }

  function handleLeave() {
    confirm(t("groupSettings.leaveTitle"), t("groupSettings.leaveBody", { name: name ?? "" }), () => {
      leaveGroup.mutate({ groupId });
    }, true);
  }

  function confirm(title: string, body: string, onConfirm: () => void, destructive?: boolean) {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`${title}\n\n${body}`)) onConfirm();
      return;
    }
    Alert.alert(title, body, [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.yes"), style: destructive ? "destructive" : "default", onPress: onConfirm },
    ]);
  }

  function handleRemove(m: Member) {
    setTarget(null);
    confirm(t("members.removeTitle"), t("members.removeBody", { name: m.display_name }), () => {
      haptics.warning();
      removeMember.mutate({ groupId, userId: m.id });
    }, true);
  }

  function handleMakeAdmin(m: Member) {
    setTarget(null);
    confirm(t("members.makeAdminTitle"), t("members.makeAdminBody", { name: m.display_name }), () => {
      haptics.success();
      transferAdmin.mutate({ groupId, newAdminId: m.id });
    });
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.surface }}>
        <MemberListSkeleton />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <FlatList
        data={(members ?? []) as Member[]}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          amAdmin && (invites?.length ?? 0) > 0 ? (
            <View style={{ borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "500", color: c.muted, letterSpacing: 1.5, textTransform: "uppercase", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
                {t("invite.pending")}
              </Text>
              {(invites ?? []).map((inv) => {
                const row = inv as { id: string; email: string };
                return (
                  <View key={row.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
                    <Text style={{ flex: 1, fontSize: 13, color: c.muted }} numberOfLines={1}>{row.email}</Text>
                    <Pressable
                      onPress={() => handleRevoke(row.id, row.email)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t("a11y.revokeInvite", { email: row.email })}
                      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, width: 28, height: 28, alignItems: "center", justifyContent: "center" })}
                    >
                      <Text style={{ fontFamily: "monospace", fontSize: 16, color: c.muted }}>×</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={{ alignItems: "center", padding: 32 }}>
            <Text style={{ color: c.muted, fontSize: 14 }}>{t("members.empty")}</Text>
          </View>
        }
        ListFooterComponent={
          <View style={{ paddingHorizontal: 16, paddingTop: 24, gap: 10 }}>
            <Pressable
              onPress={() => { haptics.selection(); setMute.mutate({ targetType: "group", targetId: groupId, muted: !isGroupMuted }); }}
              accessibilityRole="button"
              accessibilityLabel={isGroupMuted ? t("a11y.unmuteGroup") : t("a11y.muteGroup")}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}
            >
              <Feather name={isGroupMuted ? "bell-off" : "bell"} size={14} color={c.ink} />
              <Text style={{ fontFamily: "monospace", fontSize: 12, color: c.ink, letterSpacing: 0.5 }}>
                {isGroupMuted ? t("a11y.unmuteGroup") : t("a11y.muteGroup")}
              </Text>
            </Pressable>
            {amAdmin && (
              <Pressable
                onPress={() => { setRenameValue(name ?? ""); setShowRename(true); }}
                style={({ pressed }) => ({ borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingVertical: 12, alignItems: "center", opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={{ fontFamily: "monospace", fontSize: 12, color: c.ink, letterSpacing: 0.5 }}>{t("groupSettings.rename")}</Text>
              </Pressable>
            )}
            <Pressable
              onPress={handleLeave}
              disabled={leaveGroup.isPending}
              style={({ pressed }) => ({ borderWidth: 1, borderColor: c.urgentBorder, paddingVertical: 12, alignItems: "center", opacity: pressed || leaveGroup.isPending ? 0.5 : 1 })}
            >
              <Text style={{ fontFamily: "monospace", fontSize: 12, color: c.urgentText, letterSpacing: 0.5 }}>{t("groupSettings.leave")}</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => {
          const isSelf = item.id === me?.id;
          const canManage = amAdmin && !isSelf;
          return (
            <Pressable
              onPress={() => {
                if (canManage) { haptics.tapMedium(); setTarget(item); }
                else setProfileTarget({ id: item.id, name: item.display_name, avatarUrl: item.avatar_url, role: item.role });
              }}
              accessibilityRole="button"
              accessibilityLabel={canManage ? t("a11y.memberActions", { name: item.display_name }) : t("a11y.openProfile", { name: item.display_name })}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: c.border,
                backgroundColor: pressed ? c.highlight : c.surface,
              })}
            >
              <View>
                <Avatar name={item.display_name} avatarUrl={item.avatar_url} size={36} fontSize={13} />
                {isOnline(item.id) && (
                  <View style={{ position: "absolute", bottom: -1, right: -1, width: 11, height: 11, borderRadius: 6, backgroundColor: c.online, borderWidth: 2, borderColor: c.surface }} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: c.ink }} numberOfLines={1}>
                  {item.display_name}{isSelf ? ` (${t("members.you")})` : ""}
                </Text>
              </View>
              <Text style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: item.role === "ADMIN" ? c.urgentText : c.muted }}>
                {item.role === "ADMIN" ? t("members.admin") : t("members.member")}
              </Text>
            </Pressable>
          );
        }}
      />

      <ProfileSheet target={profileTarget} onClose={() => setProfileTarget(null)} />

      <Modal visible={!!target} transparent animationType="fade" onRequestClose={() => setTarget(null)}>
        <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: c.overlay }} onPress={() => setTarget(null)}>
          <Pressable style={{ backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.border }} onPress={() => {}}>
            {target && (
              <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border }}>
                <Text style={{ fontFamily: "monospace", fontSize: 12, color: c.muted }}>{target.display_name}</Text>
              </View>
            )}
            {target && target.role !== "ADMIN" && (
              <Pressable
                onPress={() => target && handleMakeAdmin(target)}
                style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 16, opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={{ fontFamily: "monospace", fontSize: 13, color: c.ink, letterSpacing: 0.5 }}>{t("members.makeAdmin")}</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => target && handleRemove(target)}
              style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 16, borderTopWidth: 1, borderTopColor: c.border, opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ fontFamily: "monospace", fontSize: 13, color: c.urgentText, letterSpacing: 0.5 }}>{t("members.remove")}</Text>
            </Pressable>
            <Pressable
              onPress={() => setTarget(null)}
              style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 16, borderTopWidth: 1, borderTopColor: c.border, opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ fontFamily: "monospace", fontSize: 13, color: c.muted, letterSpacing: 0.5 }}>{t("common.cancel")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showInvite} transparent animationType="fade" onRequestClose={() => setShowInvite(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: c.overlay }} onPress={() => setShowInvite(false)}>
            <Pressable style={{ backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.border, padding: 16, paddingBottom: 32 }} onPress={() => {}}>
              <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "600", color: c.ink, marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>
                {t("invite.title")}
              </Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: c.ink, marginBottom: 12 }}
                placeholder={t("invite.emailPlaceholder")}
                placeholderTextColor={c.muted}
                value={email}
                onChangeText={setEmail}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="done"
                onSubmitEditing={submitInvite}
              />
              <Pressable
                onPress={submitInvite}
                disabled={!email.trim() || sendInvite.isPending}
                style={({ pressed }) => ({ backgroundColor: c.ink, paddingVertical: 12, alignItems: "center", opacity: pressed || !email.trim() || sendInvite.isPending ? 0.4 : 1 })}
              >
                {sendInvite.isPending
                  ? <ActivityIndicator color={c.surface} />
                  : <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "500", color: c.surface }}>{t("invite.send")}</Text>}
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showRename} transparent animationType="fade" onRequestClose={() => setShowRename(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: c.overlay }} onPress={() => setShowRename(false)}>
            <Pressable style={{ backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.border, padding: 16, paddingBottom: 32 }} onPress={() => {}}>
              <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "600", color: c.ink, marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>
                {t("groupSettings.renameTitle")}
              </Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: c.ink, marginBottom: 12 }}
                placeholder={t("groups.namePlaceholder")}
                placeholderTextColor={c.muted}
                value={renameValue}
                onChangeText={setRenameValue}
                autoFocus
                maxLength={80}
                returnKeyType="done"
                onSubmitEditing={submitRename}
              />
              <Pressable
                onPress={submitRename}
                disabled={!renameValue.trim() || renameGroup.isPending}
                style={({ pressed }) => ({ backgroundColor: c.ink, paddingVertical: 12, alignItems: "center", opacity: pressed || !renameValue.trim() || renameGroup.isPending ? 0.4 : 1 })}
              >
                {renameGroup.isPending
                  ? <ActivityIndicator color={c.surface} />
                  : <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "500", color: c.surface }}>{t("common.save")}</Text>}
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
