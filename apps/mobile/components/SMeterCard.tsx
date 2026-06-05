import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { NeoBox } from "./smeter/NeoBox";
import { PainFace } from "./smeter/PainFace";
import { NB } from "./smeter/constants";
import * as haptics from "@/lib/haptics";
import type { SMeterSummary } from "@coldsoup/core";

// Inline thread card (sibling of PollCard). Shows the S-meter's title, mode,
// vote progress and a face strip; tapping opens the full-screen route to vote
// or — once everyone has voted — see the gated results.
export function SMeterCard({ smeter }: { smeter: SMeterSummary; messageId: string }) {
  const { t } = useTranslation();

  const open = () => {
    haptics.selection();
    router.push({ pathname: "/(app)/smeter/[smeterId]", params: { smeterId: smeter.id } });
  };

  const cta = smeter.allVoted
    ? t("smeter.viewResults")
    : smeter.isParticipant
      ? t("smeter.tapToVote")
      : t("smeter.cantVote");
  const ctaBg = smeter.allVoted ? NB.green : smeter.isParticipant ? NB.yellow : "#E5E5E5";

  return (
    <View style={{ marginHorizontal: 16, marginVertical: 6 }}>
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={cta}>
        <NeoBox bg={NB.white}>
          <View style={{ padding: 14, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "700", color: NB.black, letterSpacing: 1.5 }}>
                S-METER
              </Text>
              <View style={{ borderWidth: 2, borderColor: NB.black, backgroundColor: NB.yellow, paddingHorizontal: 6, paddingVertical: 1 }}>
                <Text style={{ fontFamily: "monospace", fontSize: 9, fontWeight: "700", color: NB.black, letterSpacing: 1 }}>
                  {t(`smeter.mode.${smeter.mode}`).toUpperCase()}
                </Text>
              </View>
            </View>

            <Text style={{ fontFamily: "monospace", fontSize: 15, fontWeight: "800", color: NB.black }}>
              {smeter.title || t("smeter.defaultTitle")}
            </Text>

            <View style={{ flexDirection: "row", gap: 4 }}>
              {[1, 2, 3, 4, 5, 6].map((v) => <PainFace key={v} value={v} size="sm" />)}
            </View>

            {/* Vote progress (counts only — scores stay hidden until allVoted) */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontFamily: "monospace", fontSize: 11, fontWeight: "700", color: NB.muted, letterSpacing: 0.5 }}>
                {t("smeter.votedOf", { voted: smeter.votedCount, total: smeter.memberCount })}
              </Text>
              <View style={{ flexDirection: "row", gap: 3 }}>
                {Array.from({ length: Math.max(1, smeter.memberCount) }).map((_, i) => (
                  <View
                    key={i}
                    style={{ flex: 1, height: 10, borderWidth: 2, borderColor: NB.black, backgroundColor: i < smeter.votedCount ? NB.yellow : NB.white }}
                  />
                ))}
              </View>
            </View>

            <View style={{ borderWidth: 2, borderColor: NB.black, backgroundColor: ctaBg, paddingVertical: 8, alignItems: "center" }}>
              <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "800", color: NB.black }}>{cta}</Text>
            </View>
          </View>
        </NeoBox>
      </Pressable>
    </View>
  );
}
