import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/lib/theme";
import * as haptics from "@/lib/haptics";
import type { SystemEvent } from "@coldsoup/core";

function formatDue(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Centered grey thread-event notice (no author bubble).
export function SystemMessage({ event }: { event: SystemEvent }) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const base = { fontSize: 11, color: c.muted, textAlign: "center" as const, lineHeight: 16 };

  if (event.kind === "smeter_done") {
    return (
      <Pressable
        onPress={() => {
          haptics.selection();
          router.push({ pathname: "/(app)/smeter/[smeterId]", params: { smeterId: event.smeterId } });
        }}
        style={({ pressed }) => ({ alignItems: "center", paddingVertical: 10, paddingHorizontal: 24, opacity: pressed ? 0.6 : 1 })}
      >
        <Text style={base}>
          {t("system.smeterDone", { name: event.smeterTitle ?? t("smeter.defaultTitle") })}{" "}
          <Text style={{ color: c.ink, textDecorationLine: "underline" }}>{t("system.tapResults")}</Text>
        </Text>
      </Pressable>
    );
  }

  let text = "";
  if (event.kind === "status") text = t("system.status", { name: event.actorName, from: event.from, to: event.to });
  else if (event.kind === "due_date")
    text = event.dueDate
      ? t("system.dueSet", { name: event.actorName, date: formatDue(event.dueDate) })
      : t("system.dueCleared", { name: event.actorName });
  else if (event.kind === "thread_created") text = t("system.created", { name: event.actorName });

  return (
    <View style={{ alignItems: "center", paddingVertical: 10, paddingHorizontal: 24 }}>
      <Text style={base}>{text}</Text>
    </View>
  );
}
