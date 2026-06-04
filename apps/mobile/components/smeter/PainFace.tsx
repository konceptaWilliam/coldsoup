import { View, Text, Image, Pressable } from "react-native";
import { FACE_COLORS, FACE_IMAGES, FACE_SIZES } from "./constants";
import { NB } from "./constants";

interface PainFaceProps {
  value: number;
  size?: "sm" | "md" | "lg" | "xl";
  selected?: boolean;
  onPress?: () => void;
  label?: string;
}

export function PainFace({ value, size = "md", selected = false, onPress, label }: PainFaceProps) {
  const idx = Math.max(0, Math.min(5, value - 1));
  const px = FACE_SIZES[size];

  const face = (
    <View style={{ alignItems: "center", gap: 4 }}>
      <View
        style={{
          width: px,
          height: px,
          borderRadius: px / 2,
          borderWidth: selected ? 3 : 2,
          borderColor: NB.black,
          backgroundColor: FACE_COLORS[idx],
          overflow: "hidden",
          transform: [{ scale: selected ? 1.1 : 1 }],
        }}
      >
        <Image source={FACE_IMAGES[idx]} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
      </View>
      {label ? (
        <Text style={{ fontFamily: "monospace", fontSize: 11, fontWeight: "700", color: NB.black, textAlign: "center", maxWidth: 90, lineHeight: 14 }}>
          {label}
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) return face;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={6}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" })}
    >
      {face}
    </Pressable>
  );
}
