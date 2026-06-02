import { useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import type { ThreadStatus } from "@coldsoup/core";
import { useTheme, type Palette } from "@/lib/theme";

const options: { status: ThreadStatus; label: string }[] = [
  { status: "OPEN", label: "OPEN" },
  { status: "URGENT", label: "URGENT" },
  { status: "DONE", label: "DONE" },
];

function activeStyle(c: Palette, status: ThreadStatus): { bg: string; text: string; border: string } {
  switch (status) {
    case "OPEN": return { bg: c.openBg, text: c.openText, border: c.openBorder };
    case "URGENT": return { bg: c.urgentBg, text: c.urgentText, border: c.urgentBorder };
    case "DONE": return { bg: c.doneBg, text: c.doneText, border: c.doneBorder };
  }
}

interface Props {
  status: ThreadStatus;
  onChange: (s: ThreadStatus) => void;
}

export function StatusControl({ status, onChange }: Props) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState<ThreadStatus | null>(null);
  // Ignore taps briefly after confirming — clicking "yes" swaps the confirm row
  // back to the segmented control under the finger and the same tap would
  // otherwise fall through and re-open the confirm.
  const lockUntil = useRef(0);

  function handlePress(s: ThreadStatus) {
    if (Date.now() < lockUntil.current) return;
    if (s === status) return;
    // Reopening a DONE thread → confirm first.
    if (status === "DONE") {
      setConfirm(s);
      return;
    }
    onChange(s);
  }

  function confirmReopen() {
    if (!confirm) return;
    lockUntil.current = Date.now() + 400;
    const target = confirm;
    setConfirm(null);
    onChange(target);
  }

  if (confirm) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface }}>
        <Text style={{ flex: 1, fontFamily: "monospace", fontSize: 11, color: c.muted, letterSpacing: 1, textTransform: "uppercase" }}>
          {t("status.reopenConfirm")}
        </Text>
        <Pressable
          onPress={confirmReopen}
          style={({ pressed }) => ({ minHeight: 36, paddingHorizontal: 14, justifyContent: "center", borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ fontFamily: "monospace", fontSize: 11, color: c.ink, letterSpacing: 1, textTransform: "uppercase" }}>{t("common.yes")}</Text>
        </Pressable>
        <Pressable
          onPress={() => setConfirm(null)}
          style={({ pressed }) => ({ minHeight: 36, paddingHorizontal: 14, justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ fontFamily: "monospace", fontSize: 11, color: c.muted, letterSpacing: 1, textTransform: "uppercase" }}>{t("common.cancel")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface }}>
      {options.map((opt) => {
        const active = status === opt.status;
        const s = active ? activeStyle(c, opt.status) : null;
        return (
          <Pressable
            key={opt.status}
            onPress={() => handlePress(opt.status)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t("a11y.setStatus", { status: opt.label })}
            style={{
              flex: 1,
              minHeight: 44,
              justifyContent: "center",
              alignItems: "center",
              borderRadius: 0,
              borderWidth: 1,
              borderColor: s?.border ?? c.border,
              backgroundColor: s?.bg ?? c.surface2,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: "600", color: s?.text ?? c.muted, letterSpacing: 1.2, fontFamily: "monospace" }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
