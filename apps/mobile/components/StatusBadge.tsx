import { useEffect, useRef } from "react";
import { View, Text, Animated } from "react-native";
import type { ThreadStatus } from "@coldsoup/core";
import { useTheme, type Palette } from "@/lib/theme";

function statusStyle(c: Palette, status: ThreadStatus): { bg: string; text: string; border: string; label: string; dot?: boolean } {
  switch (status) {
    case "OPEN": return { bg: c.openBg, text: c.openText, border: c.openBorder, label: "open" };
    case "URGENT": return { bg: c.urgentBg, text: c.urgentText, border: c.urgentBorder, label: "urgent", dot: true };
    case "DONE": return { bg: c.doneBg, text: c.doneText, border: c.doneBorder, label: "done" };
  }
}

function PulseDot({ color }: { color: string }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.5, duration: 700, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, [scale]);

  return (
    <Animated.View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color, transform: [{ scale }] }} />
  );
}

export function StatusBadge({ status }: { status: ThreadStatus }) {
  const { c } = useTheme();
  const s = statusStyle(c, status);
  return (
    <View
      style={{
        backgroundColor: s.bg,
        borderColor: s.border,
        borderWidth: 1,
        paddingHorizontal: 6,
        paddingVertical: 2,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
      }}
    >
      {s.dot && <PulseDot color={s.text} />}
      <Text style={{ color: s.text, fontSize: 10, fontWeight: "600", letterSpacing: 1.2, fontFamily: "monospace" }}>
        {s.label.toUpperCase()}
      </Text>
    </View>
  );
}
