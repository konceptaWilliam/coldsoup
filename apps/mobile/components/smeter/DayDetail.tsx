import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { NeoBox } from "./NeoBox";
import { PainFace } from "./PainFace";
import { NB, FACE_COLORS, clampScore } from "./constants";
import type { SMeterDaySummary } from "@coldsoup/core";

// Per-day detail: avg face + mood, a hand-rolled score-distribution bar chart
// (1–6), and the per-member breakdown. Ported from the planner's DayStats
// (Recharts bars → plain Views).
export function DayDetail({ day, title }: { day: SMeterDaySummary; title: string }) {
  const { t } = useTranslation();
  const avgFace = clampScore(day.avg);
  const counts = [1, 2, 3, 4, 5, 6].map((s) => day.scores.filter((x) => x === s).length);
  const maxCount = Math.max(1, ...counts);

  return (
    <NeoBox bg={NB.white}>
      <View style={{ padding: 16, gap: 16 }}>
        <Text style={{ fontFamily: "monospace", fontSize: 16, fontWeight: "700", color: NB.black }}>{title}</Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <PainFace value={avgFace} size="lg" />
          <View>
            <Text style={{ fontFamily: "monospace", fontSize: 30, fontWeight: "800", color: NB.black }}>{day.avg.toFixed(1)}</Text>
            <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "700", color: NB.muted }}>
              {t(`smeter.mood.${day.classification}`)}
            </Text>
          </View>
        </View>

        {/* Distribution: one row per score, bar width ∝ vote count. */}
        <View style={{ gap: 6 }}>
          {counts.map((count, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <PainFace value={i + 1} size="sm" />
              <View style={{ flex: 1, height: 18, borderWidth: 2, borderColor: NB.black, backgroundColor: NB.white }}>
                <View style={{ width: `${(count / maxCount) * 100}%`, height: "100%", backgroundColor: FACE_COLORS[i] }} />
              </View>
              <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "700", color: NB.black, width: 18, textAlign: "right" }}>
                {count}
              </Text>
            </View>
          ))}
        </View>

        {/* Per-member breakdown */}
        <View style={{ gap: 6 }}>
          {day.memberScores.map((ms) => (
            <View key={ms.userId} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: NB.black, paddingHorizontal: 8, paddingVertical: 6 }}>
              <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "700", color: NB.black }} numberOfLines={1}>
                {ms.displayName}
              </Text>
              <PainFace value={ms.score} size="sm" />
            </View>
          ))}
        </View>
      </View>
    </NeoBox>
  );
}
