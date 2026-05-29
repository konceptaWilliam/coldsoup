import { useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import type { ThreadStatus } from "@coldsoup/core";

const options: { status: ThreadStatus; label: string }[] = [
  { status: "OPEN", label: "OPEN" },
  { status: "URGENT", label: "URGENT" },
  { status: "DONE", label: "DONE" },
];

const activeStyles: Record<ThreadStatus, { bg: string; text: string; border: string }> = {
  OPEN:   { bg: "#EAF5EF", text: "#2F5A43", border: "#8FBFA3" },
  URGENT: { bg: "#F6E6D4", text: "#8A4B1F", border: "#C79B6A" },
  DONE:   { bg: "#ECEBE4", text: "#5A5954", border: "#C7C5BC" },
};

interface Props {
  status: ThreadStatus;
  onChange: (s: ThreadStatus) => void;
}

export function StatusControl({ status, onChange }: Props) {
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
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: "#E2DDD2", backgroundColor: "#F2EFE8" }}>
        <Text style={{ flex: 1, fontFamily: "monospace", fontSize: 11, color: "#6B6A65", letterSpacing: 1, textTransform: "uppercase" }}>
          Reopen thread?
        </Text>
        <Pressable
          onPress={confirmReopen}
          style={({ pressed }) => ({ minHeight: 36, paddingHorizontal: 14, justifyContent: "center", borderWidth: 1, borderColor: "#E2DDD2", backgroundColor: "#F7F4ED", opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ fontFamily: "monospace", fontSize: 11, color: "#1A1A18", letterSpacing: 1, textTransform: "uppercase" }}>Yes</Text>
        </Pressable>
        <Pressable
          onPress={() => setConfirm(null)}
          style={({ pressed }) => ({ minHeight: 36, paddingHorizontal: 14, justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ fontFamily: "monospace", fontSize: 11, color: "#6B6A65", letterSpacing: 1, textTransform: "uppercase" }}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: "#E2DDD2", backgroundColor: "#F2EFE8" }}>
      {options.map((opt) => {
        const active = status === opt.status;
        const s = active ? activeStyles[opt.status] : null;
        return (
          <Pressable
            key={opt.status}
            onPress={() => handlePress(opt.status)}
            style={{
              flex: 1,
              minHeight: 44,
              justifyContent: "center",
              alignItems: "center",
              borderRadius: 0,
              borderWidth: 1,
              borderColor: s?.border ?? "#E2DDD2",
              backgroundColor: s?.bg ?? "#F7F4ED",
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: "600", color: s?.text ?? "#6B6A65", letterSpacing: 1.2, fontFamily: "monospace" }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
