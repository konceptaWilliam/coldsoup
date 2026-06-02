import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useTranslation } from "react-i18next";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const { c } = useTheme();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOAuth(provider: "google" | "apple") {
    setError(null);
    const redirectTo = Linking.createURL("auth-callback");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) {
      if (error) setError(error.message);
      return;
    }
    const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (res.type === "success") {
      const code = Linking.parse(res.url).queryParams?.code;
      if (typeof code === "string") {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exErr) setError(exErr.message);
      }
    }
  }

  async function handleLogin() {
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) setError(error.message);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.surface }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ marginBottom: 40 }}>
          <Text style={{ fontFamily: "monospace", fontSize: 24, fontWeight: "600", color: c.ink, letterSpacing: -0.5 }}>
            coldsoup
          </Text>
          <Text style={{ fontSize: 14, color: c.muted, marginTop: 4 }}>
            {t("login.tagline")}
          </Text>
        </View>

        <View style={{ gap: 16 }}>
          <View>
            <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "500", color: c.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
              {t("login.email")}
            </Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: c.ink }}
              placeholder={t("login.emailPlaceholder")}
              placeholderTextColor={c.muted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          <View>
            <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "500", color: c.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
              {t("login.password")}
            </Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: c.ink }}
              placeholder="••••••••"
              placeholderTextColor={c.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
          </View>

          {error && (
            <View style={{ borderWidth: 1, borderColor: c.errorBorder, backgroundColor: c.errorBg, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ fontSize: 13, color: c.errorText }}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={handleLogin}
            disabled={loading || !email.trim() || !password.trim()}
            style={({ pressed }) => ({
              backgroundColor: c.ink,
              paddingVertical: 12,
              alignItems: "center",
              opacity: pressed || loading || !email.trim() || !password.trim() ? 0.4 : 1,
            })}
          >
            {loading ? (
              <ActivityIndicator color={c.surface} />
            ) : (
              <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "500", color: c.surface }}>
                {t("login.signIn")}
              </Text>
            )}
          </Pressable>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
            <Text style={{ fontFamily: "monospace", fontSize: 10, color: c.muted2, letterSpacing: 1, textTransform: "uppercase" }}>{t("login.or")}</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
          </View>

          <Pressable
            onPress={() => handleOAuth("google")}
            style={({ pressed }) => ({ borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingVertical: 12, alignItems: "center", opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ fontFamily: "monospace", fontSize: 13, color: c.ink }}>{t("login.continueGoogle")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
