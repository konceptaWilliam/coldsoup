import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { NeoBox } from "./NeoBox";
import { PainFace } from "./PainFace";
import { NB, PAIN_LABEL_KEYS } from "./constants";

// One day at a time: the question + a 3×2 grid of pain faces + the selected
// label. Ported from the planner's VotingCard.
interface VotingCardProps {
  title: string;
  selectedScore: number | null;
  onSelect: (score: number) => void;
}

export function VotingCard({ title, selectedScore, onSelect }: VotingCardProps) {
  const { t } = useTranslation();
  return (
    <NeoBox bg={NB.white}>
      <View style={{ padding: 16 }}>
        <Text style={{ fontFamily: "monospace", fontSize: 16, fontWeight: "700", color: NB.black, textAlign: "center", marginBottom: 16 }}>
          {title}
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 }}>
          {[1, 2, 3, 4, 5, 6].map((score) => (
            <View key={score} style={{ width: "30%", alignItems: "center", gap: 2 }}>
              <PainFace value={score} size="lg" selected={selectedScore === score} onPress={() => onSelect(score)} />
              <Text style={{ fontFamily: "monospace", fontSize: 11, fontWeight: "700", color: NB.black }}>{score}</Text>
            </View>
          ))}
        </View>

        {selectedScore ? (
          <View style={{ marginTop: 16, borderWidth: 2, borderColor: NB.black, backgroundColor: NB.yellowSoft, padding: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <PainFace value={selectedScore} size="md" selected />
            <Text style={{ flex: 1, fontFamily: "monospace", fontSize: 13, fontWeight: "700", color: NB.black }}>
              {t(PAIN_LABEL_KEYS[selectedScore - 1])}
            </Text>
          </View>
        ) : null}
      </View>
    </NeoBox>
  );
}
