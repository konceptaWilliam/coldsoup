import { View, Text } from "react-native";
import { NB } from "./constants";

// Neo-brutal "Day X of N" segmented progress.
export function ProgressBar({ current, total, label }: { current: number; total: number; label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "700", color: NB.black, textTransform: "uppercase", letterSpacing: 1 }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 12,
              borderWidth: 2,
              borderColor: NB.black,
              backgroundColor: i <= current ? NB.yellow : NB.white,
            }}
          />
        ))}
      </View>
    </View>
  );
}
