import { useEffect, useRef, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, Animated, StyleSheet } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTranslation } from "react-i18next";
import { NeoBox } from "./smeter/NeoBox";
import { NB } from "./smeter/constants";
import { formatCustomDate } from "./smeter/labels";

type SMeterMode = "weekly" | "dates";

interface Props {
  visible: boolean;
  isPending: boolean;
  onSubmit: (mode: SMeterMode, customDates: string[] | undefined, title: string | undefined) => void;
  onClose: () => void;
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Neo-brutal bottom sheet for creating an S-meter — mode toggle (weekly /
// custom dates), optional title, and a date picker that collects chips.
export function SMeterCreateModal({ visible, isPending, onSubmit, onClose }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<SMeterMode>("weekly");
  const [title, setTitle] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);

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
    setMode("weekly");
    setTitle("");
    setDates([]);
    setShowPicker(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function addDate(ymd: string) {
    setDates((prev) => (prev.includes(ymd) ? prev : [...prev, ymd].sort()));
  }

  const canSubmit = !isPending && (mode === "weekly" || dates.length >= 1);

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit(mode, mode === "dates" ? dates : undefined, title.trim() || undefined);
    reset();
  }

  const panelTranslate = progress.interpolate({ inputRange: [0, 1], outputRange: [600, 0] });

  return (
    <Modal visible={mounted} animationType="none" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Animated.View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)", opacity: progress, pointerEvents: "none" }} />
        <Pressable style={{ flex: 1 }} onPress={handleClose} />
        <Animated.View style={{ backgroundColor: NB.surface, borderTopWidth: 2, borderColor: NB.black, maxHeight: "88%", transform: [{ translateY: panelTranslate }] }}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontFamily: "monospace", fontSize: 16, fontWeight: "800", color: NB.black, letterSpacing: 0.5 }}>
              {t("smeter.create")}
            </Text>

            {/* Mode toggle */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "700", color: NB.muted, letterSpacing: 1.5, textTransform: "uppercase" }}>
                {t("smeter.modeLabel")}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["weekly", "dates"] as SMeterMode[]).map((m) => {
                  const active = mode === m;
                  return (
                    <Pressable key={m} onPress={() => setMode(m)} style={{ flex: 1 }}>
                      <NeoBox bg={active ? NB.yellow : NB.white} pressed={active} offset={3}>
                        <View style={{ paddingVertical: 12, alignItems: "center" }}>
                          <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "800", color: NB.black }}>
                            {t(`smeter.mode.${m}`)}
                          </Text>
                        </View>
                      </NeoBox>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Custom dates */}
            {mode === "dates" && (
              <View style={{ gap: 8 }}>
                <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "700", color: NB.muted, letterSpacing: 1.5, textTransform: "uppercase" }}>
                  {t("smeter.datesLabel")}
                </Text>
                <Pressable onPress={() => setShowPicker(true)} style={{ alignSelf: "flex-start" }}>
                  <NeoBox bg={NB.white} offset={3}>
                    <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                      <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "700", color: NB.black }}>{t("smeter.addDate")}</Text>
                    </View>
                  </NeoBox>
                </Pressable>
                {dates.length > 0 && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {dates.map((d) => (
                      <View key={d} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 2, borderColor: NB.black, backgroundColor: NB.white, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "700", color: NB.black }}>{formatCustomDate(d)}</Text>
                        <Pressable onPress={() => setDates((prev) => prev.filter((x) => x !== d))} hitSlop={6}>
                          <Text style={{ fontFamily: "monospace", fontSize: 14, fontWeight: "800", color: NB.black }}>×</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
                {showPicker && (
                  <DateTimePicker
                    value={new Date()}
                    mode="date"
                    onChange={(e, d) => {
                      setShowPicker(Platform.OS === "ios");
                      if (e.type === "set" && d) addDate(toYMD(d));
                    }}
                  />
                )}
              </View>
            )}

            {/* Optional title */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "700", color: NB.muted, letterSpacing: 1.5, textTransform: "uppercase" }}>
                {t("smeter.titleLabel")}
              </Text>
              <TextInput
                style={{ borderWidth: 2, borderColor: NB.black, backgroundColor: NB.white, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: NB.black }}
                value={title}
                onChangeText={setTitle}
                placeholder={t("smeter.titlePlaceholder")}
                placeholderTextColor={NB.muted}
                maxLength={200}
              />
            </View>

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
              <Pressable onPress={handleClose} style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}>
                <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "700", color: NB.muted }}>{t("common.cancel")}</Text>
              </Pressable>
              <Pressable onPress={handleSubmit} disabled={!canSubmit}>
                <NeoBox bg={NB.yellow} offset={4} pressed={!canSubmit}>
                  <View style={{ paddingHorizontal: 18, paddingVertical: 12 }}>
                    <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "800", color: NB.black, opacity: canSubmit ? 1 : 0.4 }}>
                      {isPending ? t("smeter.creating") : t("smeter.createButton")}
                    </Text>
                  </View>
                </NeoBox>
              </Pressable>
            </View>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
