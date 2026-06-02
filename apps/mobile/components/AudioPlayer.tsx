import { useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/lib/theme";

interface Props {
  url: string;
  name: string;
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ url, name }: Props) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);

  const duration = status.duration ?? 0;
  const current = status.currentTime ?? 0;
  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;

  // Reset to start once playback finishes.
  useEffect(() => {
    if (status.didJustFinish) player.seekTo(0);
  }, [status.didJustFinish, player]);

  function toggle() {
    if (status.playing) {
      player.pause();
    } else {
      if (duration > 0 && current >= duration - 0.1) player.seekTo(0);
      player.play();
    }
  }

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 10, paddingVertical: 8 }}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? t("a11y.pauseAudio") : t("a11y.playAudio")}
        style={({ pressed }) => ({ width: 32, height: 32, alignItems: "center", justifyContent: "center", backgroundColor: c.ink, opacity: pressed ? 0.6 : 1 })}
      >
        <Text style={{ color: c.surface, fontSize: 13, fontFamily: "monospace" }}>{status.playing ? "❚❚" : "▶"}</Text>
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: "monospace", fontSize: 11, color: c.ink, marginBottom: 4 }} numberOfLines={1}>{name}</Text>
        <View style={{ height: 4, backgroundColor: c.border }}>
          <View style={{ width: `${pct}%`, height: "100%", backgroundColor: c.ink }} />
        </View>
      </View>
      <Text style={{ fontFamily: "monospace", fontSize: 10, color: c.muted }}>
        {fmt(current)} / {fmt(duration)}
      </Text>
    </View>
  );
}
