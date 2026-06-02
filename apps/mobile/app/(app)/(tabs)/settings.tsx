import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert, ActivityIndicator, Platform, Switch, Modal, KeyboardAvoidingView } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { Avatar } from "@/components/Avatar";
import { Skeleton } from "@/components/Skeleton";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { useAppLock } from "@/lib/appLock";
import { clearLastGroup } from "@/lib/lastGroup";

function Label({ children }: { children: string }) {
  const { c } = useTheme();
  return (
    <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "500", color: c.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>
      {children}
    </Text>
  );
}

export default function SettingsTab() {
  const { c, mode, setMode } = useTheme();
  const { t } = useTranslation();
  const { enabled: lockEnabled, setEnabled: setLockEnabled } = useAppLock();
  const utils = trpc.useUtils();
  const { data: notifPrefs } = trpc.notifications.prefs.useQuery();
  const { data: groups } = trpc.groups.list.useQuery();
  const setPaused = trpc.notifications.setPaused.useMutation({ onSuccess: () => utils.notifications.prefs.invalidate() });
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
  const mutedGroups = (groups ?? []).filter((g) => notifPrefs?.groupIds.includes(g.id));

  async function toggleLock(value: boolean) {
    const ok = await setLockEnabled(value);
    if (!ok) {
      if (Platform.OS === "web") { if (typeof window !== "undefined") window.alert(t("appLock.unavailableBody")); }
      else Alert.alert(t("appLock.unavailableTitle"), t("appLock.unavailableBody"));
    }
  }
  const { data: profile, isLoading } = trpc.profile.get.useQuery();
  const updateProfile = trpc.profile.update.useMutation({ onSuccess: () => utils.profile.get.invalidate() });
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const deleteAccount = trpc.profile.deleteAccount.useMutation({
    onSuccess: async () => {
      await supabase.auth.signOut();
      router.replace("/(auth)/login");
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : t("account.failed");
      if (Platform.OS === "web") { if (typeof window !== "undefined") window.alert(msg); }
      else Alert.alert(t("account.failed"), msg);
    },
  });

  function startEdit() { setName(profile?.display_name ?? ""); setEditingName(true); }
  function saveName() { if (name.trim()) updateProfile.mutate({ displayName: name.trim() }); setEditingName(false); }

  async function pickAvatar() {
    if (!profile) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    try {
      const uri = result.assets[0].uri;
      const arrayBuffer = await (await fetch(uri)).arrayBuffer();
      const path = `${profile.id}/avatar.jpg`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, arrayBuffer, { upsert: true, contentType: "image/jpeg" });
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      await updateProfile.mutateAsync({ avatarUrl: `${publicUrl}?t=${Date.now()}` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("settings.uploadFailed");
      if (Platform.OS === "web") { if (typeof window !== "undefined") window.alert(msg); }
      else Alert.alert(t("settings.uploadFailed"), msg);
    } finally {
      setUploading(false);
    }
  }

  async function handleSignOut() {
    clearLastGroup();
    await supabase.auth.signOut();
    router.replace("/(auth)/login");
  }

  // Alert.alert is a no-op on react-native-web — confirm via window.confirm there.
  function confirmSignOut() {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(t("settings.signOutConfirmWeb"))) handleSignOut();
      return;
    }
    Alert.alert(t("settings.signOutTitle"), t("settings.signOutBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("settings.signOut"), style: "destructive", onPress: handleSignOut },
    ]);
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.surface }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <Skeleton style={{ height: 20, width: 120 }} />
        </View>
        <View style={{ padding: 16, gap: 24 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Skeleton style={{ width: 56, height: 56 }} />
            <Skeleton style={{ height: 14, width: 140 }} />
          </View>
          <Skeleton style={{ height: 14, width: "60%" }} />
          <Skeleton style={{ height: 14, width: "40%" }} />
          <Skeleton style={{ height: 44, width: "100%" }} />
        </View>
      </View>
    );
  }

  const themeOptions: { mode: ThemeMode; label: string }[] = [
    { mode: "system", label: t("settings.system") },
    { mode: "light", label: t("settings.light") },
    { mode: "dark", label: t("settings.dark") },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable
          onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/(app)/(tabs)"); }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
        >
          <Feather name="chevron-left" size={24} color={c.ink} />
        </Pressable>
        <Text style={{ fontFamily: "monospace", fontSize: 20, fontWeight: "600", color: c.ink }}>{t("settings.title")}</Text>
      </View>

      <View style={{ padding: 16, gap: 24 }}>
        <View>
          <Label>{t("settings.photo")}</Label>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Avatar name={profile?.display_name ?? "?"} avatarUrl={profile?.avatar_url} size={56} fontSize={18} />
            <Pressable
              onPress={pickAvatar}
              disabled={uploading}
              accessibilityRole="button"
              accessibilityLabel={t("a11y.changePhoto")}
              style={({ pressed }) => ({ borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 14, paddingVertical: 10, opacity: pressed || uploading ? 0.4 : 1 })}
            >
              <Text style={{ fontFamily: "monospace", fontSize: 12, color: c.ink }}>
                {uploading ? t("settings.uploading") : t("settings.changePhoto")}
              </Text>
            </Pressable>
          </View>
        </View>

        <View>
          <Label>{t("settings.displayName")}</Label>
          {editingName ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                style={{ flex: 1, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: c.ink }}
                value={name}
                onChangeText={setName}
                autoFocus
                maxLength={20}
                onBlur={saveName}
                onSubmitEditing={saveName}
                returnKeyType="done"
              />
              <Pressable onPress={saveName} style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.ink, justifyContent: "center" }}>
                <Text style={{ fontFamily: "monospace", fontSize: 12, color: c.surface }}>{t("common.save")}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={startEdit}>
              <Text style={{ fontSize: 14, color: c.ink }}>{profile?.display_name ?? "—"}</Text>
              <Text style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>{t("settings.tapToEdit")}</Text>
            </Pressable>
          )}
        </View>

        <View>
          <Label>{t("settings.email")}</Label>
          <Text style={{ fontSize: 14, color: c.ink }}>{profile?.email ?? "—"}</Text>
        </View>

        <View>
          <Label>{t("settings.appearance")}</Label>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {themeOptions.map((opt) => {
              const active = mode === opt.mode;
              return (
                <Pressable
                  key={opt.mode}
                  onPress={() => setMode(opt.mode)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t("a11y.themeOption", { mode: opt.label })}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 44,
                    justifyContent: "center",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: active ? c.ink : c.border,
                    backgroundColor: active ? c.ink : c.surface2,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Text style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: active ? c.surface : c.muted }}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Label>{t("notifications.title")}</Label>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <Text style={{ flex: 1, fontSize: 12, color: c.muted }}>{t("notifications.pauseAll")}</Text>
            <Switch
              value={!!notifPrefs?.paused}
              onValueChange={(v) => setPaused.mutate({ paused: v })}
              trackColor={{ false: c.border, true: c.ink }}
              thumbColor={c.surface}
              ios_backgroundColor={c.border}
            />
          </View>
          {mutedGroups.length > 0 && (
            <View style={{ marginTop: 14 }}>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: c.muted2, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>{t("notifications.mutedGroups")}</Text>
              {mutedGroups.map((g) => (
                <View key={g.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}>
                  <Text style={{ flex: 1, fontFamily: "monospace", fontSize: 13, color: c.ink }} numberOfLines={1}>{g.name.toLowerCase()}</Text>
                  <Pressable
                    onPress={() => setMute.mutate({ targetType: "group", targetId: g.id, muted: false })}
                    accessibilityRole="button"
                    accessibilityLabel={t("a11y.unmuteGroup")}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingHorizontal: 8, paddingVertical: 4 })}
                  >
                    <Text style={{ fontFamily: "monospace", fontSize: 12, color: c.accent }}>{t("notifications.unmute")}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        <View>
          <Label>{t("appLock.setting")}</Label>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <Text style={{ flex: 1, fontSize: 12, color: c.muted }}>{t("appLock.settingHint")}</Text>
            <Switch
              value={lockEnabled}
              onValueChange={toggleLock}
              trackColor={{ false: c.border, true: c.ink }}
              thumbColor={c.surface}
              ios_backgroundColor={c.border}
            />
          </View>
        </View>

        <View style={{ borderTopWidth: 1, borderTopColor: c.border, paddingTop: 24 }}>
          <Pressable
            onPress={confirmSignOut}
            style={({ pressed }) => ({ backgroundColor: c.ink, paddingVertical: 12, alignItems: "center", opacity: pressed ? 0.7 : 1 })}
          >
            <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "500", color: c.surface }}>{t("settings.signOut")}</Text>
          </Pressable>

          <Pressable
            onPress={() => { setConfirmText(""); setShowDelete(true); }}
            style={({ pressed }) => ({ marginTop: 12, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: c.urgentBorder, opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "500", color: c.urgentText }}>{t("account.delete")}</Text>
          </Pressable>
        </View>

        <Text style={{ fontFamily: "monospace", fontSize: 11, color: c.muted2, textAlign: "center" }}>
          v{Constants.expoConfig?.version ?? "1.0.0"}
        </Text>
      </View>

      <Modal visible={showDelete} transparent animationType="fade" onRequestClose={() => setShowDelete(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: c.overlay }} onPress={() => setShowDelete(false)}>
            <Pressable style={{ backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.border, padding: 16, paddingBottom: 32 }} onPress={() => {}}>
              <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "600", color: c.urgentText, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
                {t("account.confirmTitle")}
              </Text>
              <Text style={{ fontSize: 13, color: c.muted, lineHeight: 19, marginBottom: 16 }}>{t("account.confirmBody")}</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: c.ink, marginBottom: 12 }}
                placeholder={t("account.confirmPlaceholder")}
                placeholderTextColor={c.muted}
                value={confirmText}
                onChangeText={setConfirmText}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <Pressable
                onPress={() => deleteAccount.mutate()}
                disabled={confirmText !== t("account.confirmWord") || deleteAccount.isPending}
                style={({ pressed }) => ({ backgroundColor: c.urgentText, paddingVertical: 12, alignItems: "center", opacity: pressed || confirmText !== t("account.confirmWord") || deleteAccount.isPending ? 0.4 : 1 })}
              >
                {deleteAccount.isPending
                  ? <ActivityIndicator color={c.surface} />
                  : <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "500", color: c.surface }}>{t("account.delete")}</Text>}
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}
