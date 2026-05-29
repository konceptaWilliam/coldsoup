import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert, ActivityIndicator, Platform } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { Avatar } from "@/components/Avatar";

function Label({ children }: { children: string }) {
  return (
    <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "500", color: "#6B6A65", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>
      {children}
    </Text>
  );
}

export default function SettingsTab() {
  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.profile.get.useQuery();
  const updateProfile = trpc.profile.update.useMutation({ onSuccess: () => utils.profile.get.invalidate() });
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);

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
      const msg = e instanceof Error ? e.message : "Upload failed";
      if (Platform.OS === "web") { if (typeof window !== "undefined") window.alert(msg); }
      else Alert.alert("Upload failed", msg);
    } finally {
      setUploading(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/(auth)/login");
  }

  // Alert.alert is a no-op on react-native-web — confirm via window.confirm there.
  function confirmSignOut() {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Sign out?")) handleSignOut();
      return;
    }
    Alert.alert("Sign out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: handleSignOut },
    ]);
  }

  if (isLoading) {
    return <View style={{ flex: 1, backgroundColor: "#F2EFE8", alignItems: "center", justifyContent: "center" }}><ActivityIndicator color="#1A1A18" /></View>;
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#F2EFE8" }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "#E2DDD2" }}>
        <Text style={{ fontFamily: "monospace", fontSize: 20, fontWeight: "600", color: "#1A1A18" }}>Settings</Text>
      </View>

      <View style={{ padding: 16, gap: 24 }}>
        <View>
          <Label>Photo</Label>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Avatar name={profile?.display_name ?? "?"} avatarUrl={profile?.avatar_url} size={56} fontSize={18} />
            <Pressable
              onPress={pickAvatar}
              disabled={uploading}
              style={({ pressed }) => ({ borderWidth: 1, borderColor: "#E2DDD2", backgroundColor: "#F7F4ED", paddingHorizontal: 14, paddingVertical: 10, opacity: pressed || uploading ? 0.4 : 1 })}
            >
              <Text style={{ fontFamily: "monospace", fontSize: 12, color: "#1A1A18" }}>
                {uploading ? "Uploading…" : "Change photo"}
              </Text>
            </Pressable>
          </View>
        </View>

        <View>
          <Label>Display name</Label>
          {editingName ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                style={{ flex: 1, borderWidth: 1, borderColor: "#E2DDD2", backgroundColor: "#F7F4ED", paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: "#1A1A18" }}
                value={name}
                onChangeText={setName}
                autoFocus
                onBlur={saveName}
                onSubmitEditing={saveName}
                returnKeyType="done"
              />
              <Pressable onPress={saveName} style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#1A1A18", justifyContent: "center" }}>
                <Text style={{ fontFamily: "monospace", fontSize: 12, color: "#F2EFE8" }}>Save</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={startEdit}>
              <Text style={{ fontSize: 14, color: "#1A1A18" }}>{profile?.display_name ?? "—"}</Text>
              <Text style={{ fontSize: 11, color: "#6B6A65", marginTop: 2 }}>Tap to edit</Text>
            </Pressable>
          )}
        </View>

        <View>
          <Label>Email</Label>
          <Text style={{ fontSize: 14, color: "#1A1A18" }}>{profile?.email ?? "—"}</Text>
        </View>

        <View style={{ borderTopWidth: 1, borderTopColor: "#E2DDD2", paddingTop: 24 }}>
          <Pressable
            onPress={confirmSignOut}
            style={({ pressed }) => ({ backgroundColor: "#1A1A18", paddingVertical: 12, alignItems: "center", opacity: pressed ? 0.7 : 1 })}
          >
            <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "500", color: "#F2EFE8" }}>Sign out</Text>
          </Pressable>
        </View>

        <Text style={{ fontFamily: "monospace", fontSize: 11, color: "#9A988F", textAlign: "center" }}>
          v{Constants.expoConfig?.version ?? "1.0.0"}
        </Text>
      </View>
    </ScrollView>
  );
}
