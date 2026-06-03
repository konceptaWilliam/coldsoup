import { useState } from "react";
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/lib/theme";

export default function OnboardingScreen() {
  const { c } = useTheme();
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [name, setName] = useState("");

  const complete = trpc.onboarding.complete.useMutation({
    onSuccess: async () => {
      await utils.onboarding.status.invalidate();
      await utils.profile.get.invalidate();
      router.replace("/(app)");
    },
  });

  function submit() {
    const v = name.trim();
    if (!v || complete.isPending) return;
    complete.mutate({ displayName: v });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.surface }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24, gap: 20 }}>
        <View>
          <Text style={{ fontFamily: "monospace", fontSize: 22, fontWeight: "600", color: c.ink, letterSpacing: -0.4 }}>
            {t("onboarding.title")}
          </Text>
          <Text style={{ fontSize: 14, color: c.muted, marginTop: 6 }}>{t("onboarding.subtitle")}</Text>
        </View>

        <View>
          <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "500", color: c.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
            {t("onboarding.displayName")}
          </Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: c.ink }}
            placeholder={t("onboarding.placeholder")}
            placeholderTextColor={c.muted}
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={20}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        </View>

        <Pressable
          onPress={submit}
          disabled={!name.trim() || complete.isPending}
          style={({ pressed }) => ({ backgroundColor: c.ink, paddingVertical: 12, alignItems: "center", opacity: pressed || !name.trim() || complete.isPending ? 0.4 : 1 })}
        >
          {complete.isPending
            ? <ActivityIndicator color={c.surface} />
            : <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "500", color: c.surface }}>{t("onboarding.continue")}</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
