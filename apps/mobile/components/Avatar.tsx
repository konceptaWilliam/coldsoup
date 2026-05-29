import { useState } from "react";
import { View, Text, Image } from "react-native";

// Deterministic warm hue from name — mirrors the web app's avatar color logic.
const AVATAR_PALETTE = [
  "#D4C5A9", "#C9B99A", "#BFB48A", "#D9C4A8", "#C4B49A",
  "#B8A88A", "#CDB99A", "#D2BFA0", "#C8B598", "#BDB090",
  "#D6C8A8", "#CAB99C", "#C0B08A", "#D4C2A0", "#CBB898",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

interface Props {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  fontSize?: number;
}

export function Avatar({ name, avatarUrl, size = 28, fontSize }: Props) {
  const [imgError, setImgError] = useState(false);
  const fs = fontSize ?? Math.max(8, Math.round(size * 0.32));

  if (avatarUrl && !imgError) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        onError={() => setImgError(true)}
        style={{ width: size, height: size, flexShrink: 0 }}
      />
    );
  }

  return (
    <View style={{ width: size, height: size, backgroundColor: avatarColor(name), alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Text style={{ fontFamily: "monospace", fontSize: fs, fontWeight: "600", color: "#1A1A18" }}>
        {initials(name)}
      </Text>
    </View>
  );
}
