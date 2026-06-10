import { useState } from "react";
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/lib/theme";

const MIN_LENGTH = 8;

export default function SetPasswordScreen() {
  const { c } = useTheme();
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (loading) return;
    if (password.length < MIN_LENGTH) {
      setError(t("setPassword.tooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("setPassword.mismatch"));
      return;
    }
    setLoading(true);
    setError(null);
    const { error: updErr } = await supabase.auth.updateUser({ password });
    if (updErr) {
      setLoading(false);
      setError(updErr.message);
      return;
    }
    await utils.onboarding.needsPasswordSetup.invalidate();
    router.replace("/(app)");
  }

  const valid = password.length >= MIN_LENGTH && confirm.length > 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.surface }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24, gap: 20 }}>
        <View>
          <Text style={{ fontFamily: "monospace", fontSize: 22, fontWeight: "600", color: c.ink, letterSpacing: -0.4 }}>
            {t("setPassword.title")}
          </Text>
          <Text style={{ fontSize: 14, color: c.muted, marginTop: 6 }}>{t("setPassword.subtitle")}</Text>
        </View>

        <View>
          <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "500", color: c.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
            {t("setPassword.password")}
          </Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: c.ink }}
            placeholder={t("setPassword.placeholder")}
            placeholderTextColor={c.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="next"
          />
        </View>

        <View>
          <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "500", color: c.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
            {t("setPassword.confirm")}
          </Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: c.ink }}
            placeholder={t("setPassword.confirmPlaceholder")}
            placeholderTextColor={c.muted}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        </View>

        {error && (
          <View style={{ borderWidth: 1, borderColor: c.errorBorder, backgroundColor: c.errorBg, paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text style={{ fontSize: 13, color: c.errorText }}>{error}</Text>
          </View>
        )}

        <Pressable
          onPress={submit}
          disabled={!valid || loading}
          style={({ pressed }) => ({ backgroundColor: c.ink, paddingVertical: 12, alignItems: "center", opacity: pressed || !valid || loading ? 0.4 : 1 })}
        >
          {loading
            ? <ActivityIndicator color={c.surface} />
            : <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "500", color: c.surface }}>{t("setPassword.submit")}</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
