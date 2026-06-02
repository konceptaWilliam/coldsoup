import { useEffect, useRef, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, Animated, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/lib/theme";

interface Props {
  visible: boolean;
  isPending: boolean;
  onSubmit: (question: string, options: string[]) => void;
  onClose: () => void;
}

export function PollCreateModal({ visible, isPending, onSubmit, onClose }: Props) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>([""]);

  // Keep the modal mounted through the exit animation. Backdrop fades, panel slides.
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== "web" }).start();
    } else if (mounted) {
      Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: Platform.OS !== "web" }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, mounted, progress]);

  function reset() {
    setQuestion("");
    setOptions([""]);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit() {
    if (!question.trim() || isPending) return;
    onSubmit(question.trim(), options.map((o) => o.trim()).filter(Boolean));
    reset();
  }

  const panelTranslate = progress.interpolate({ inputRange: [0, 1], outputRange: [600, 0] });

  return (
    <Modal visible={mounted} animationType="none" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        <Animated.View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: c.overlay, opacity: progress, pointerEvents: "none" }} />
        <Pressable style={{ flex: 1 }} onPress={handleClose} />
        <Animated.View style={{ backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.border, maxHeight: "85%", transform: [{ translateY: panelTranslate }] }}>
          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontFamily: "monospace", fontSize: 14, fontWeight: "600", color: c.ink, marginBottom: 16 }}>
              {t("poll.create")}
            </Text>

            <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "500", color: c.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>
              {t("poll.question")}
            </Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: c.ink, marginBottom: 20 }}
              value={question}
              onChangeText={setQuestion}
              placeholder={t("poll.questionPlaceholder")}
              placeholderTextColor={c.muted}
              maxLength={500}
              autoFocus
            />

            <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "500", color: c.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>
              {t("poll.options")} <Text style={{ color: c.muted2, textTransform: "none", letterSpacing: 0 }}>{t("poll.optionsHint")}</Text>
            </Text>
            <View style={{ gap: 8 }}>
              {options.map((opt, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 6 }}>
                  <TextInput
                    style={{ flex: 1, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, color: c.ink }}
                    value={opt}
                    onChangeText={(val) => setOptions((prev) => prev.map((o, idx) => (idx === i ? val : o)))}
                    placeholder={t("poll.optionPlaceholder", { index: i + 1 })}
                    placeholderTextColor={c.muted}
                    maxLength={200}
                  />
                  {options.length > 1 && (
                    <Pressable onPress={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))} style={{ paddingHorizontal: 8, justifyContent: "center" }}>
                      <Text style={{ fontFamily: "monospace", fontSize: 16, color: c.muted }}>×</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
            <Pressable onPress={() => setOptions((prev) => [...prev, ""])} style={({ pressed }) => ({ marginTop: 8, opacity: pressed ? 0.6 : 1, minHeight: 32, justifyContent: "center" })}>
              <Text style={{ fontFamily: "monospace", fontSize: 11, color: c.muted }}>{t("poll.addOption")}</Text>
            </Pressable>

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
              <Pressable onPress={handleClose} style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}>
                <Text style={{ fontFamily: "monospace", fontSize: 13, color: c.muted }}>{t("common.cancel")}</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={!question.trim() || isPending}
                style={({ pressed }) => ({ backgroundColor: c.ink, paddingHorizontal: 16, paddingVertical: 12, opacity: pressed || !question.trim() || isPending ? 0.4 : 1 })}
              >
                <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "500", color: c.surface }}>
                  {isPending ? t("poll.sending") : t("poll.sendPoll")}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
