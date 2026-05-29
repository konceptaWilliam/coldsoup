import { useEffect, useRef, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, Animated, StyleSheet } from "react-native";

interface Props {
  visible: boolean;
  isPending: boolean;
  onSubmit: (question: string, options: string[]) => void;
  onClose: () => void;
}

export function PollCreateModal({ visible, isPending, onSubmit, onClose }: Props) {
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
        <Animated.View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(26,26,24,0.2)", opacity: progress, pointerEvents: "none" }} />
        <Pressable style={{ flex: 1 }} onPress={handleClose} />
        <Animated.View style={{ backgroundColor: "#F2EFE8", borderTopWidth: 1, borderColor: "#E2DDD2", maxHeight: "85%", transform: [{ translateY: panelTranslate }] }}>
          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontFamily: "monospace", fontSize: 14, fontWeight: "600", color: "#1A1A18", marginBottom: 16 }}>
              Create poll
            </Text>

            <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "500", color: "#6B6A65", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>
              Question
            </Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: "#E2DDD2", backgroundColor: "#F7F4ED", paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: "#1A1A18", marginBottom: 20 }}
              value={question}
              onChangeText={setQuestion}
              placeholder="What do you want to ask?"
              placeholderTextColor="#6B6A65"
              maxLength={500}
              autoFocus
            />

            <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "500", color: "#6B6A65", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>
              Options <Text style={{ color: "#9A988F", textTransform: "none", letterSpacing: 0 }}>(optional — anyone can add more later)</Text>
            </Text>
            <View style={{ gap: 8 }}>
              {options.map((opt, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 6 }}>
                  <TextInput
                    style={{ flex: 1, borderWidth: 1, borderColor: "#E2DDD2", backgroundColor: "#F7F4ED", paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, color: "#1A1A18" }}
                    value={opt}
                    onChangeText={(val) => setOptions((prev) => prev.map((o, idx) => (idx === i ? val : o)))}
                    placeholder={`Option ${i + 1}`}
                    placeholderTextColor="#6B6A65"
                    maxLength={200}
                  />
                  {options.length > 1 && (
                    <Pressable onPress={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))} style={{ paddingHorizontal: 8, justifyContent: "center" }}>
                      <Text style={{ fontFamily: "monospace", fontSize: 16, color: "#6B6A65" }}>×</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
            <Pressable onPress={() => setOptions((prev) => [...prev, ""])} style={({ pressed }) => ({ marginTop: 8, opacity: pressed ? 0.6 : 1, minHeight: 32, justifyContent: "center" })}>
              <Text style={{ fontFamily: "monospace", fontSize: 11, color: "#6B6A65" }}>+ add option</Text>
            </Pressable>

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
              <Pressable onPress={handleClose} style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}>
                <Text style={{ fontFamily: "monospace", fontSize: 13, color: "#6B6A65" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={!question.trim() || isPending}
                style={({ pressed }) => ({ backgroundColor: "#1A1A18", paddingHorizontal: 16, paddingVertical: 12, opacity: pressed || !question.trim() || isPending ? 0.4 : 1 })}
              >
                <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "500", color: "#F2EFE8" }}>
                  {isPending ? "Sending…" : "Send poll"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
