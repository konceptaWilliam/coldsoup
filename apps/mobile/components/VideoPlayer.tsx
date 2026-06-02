import { View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { useTheme } from "@/lib/theme";

interface Props {
  url: string;
}

export function VideoPlayer({ url }: Props) {
  const { c } = useTheme();
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });

  return (
    <View style={{ width: 220, aspectRatio: 16 / 9, borderWidth: 1, borderColor: c.border, backgroundColor: "#000" }}>
      <VideoView
        player={player}
        style={{ width: "100%", height: "100%" }}
        contentFit="contain"
        nativeControls
      />
    </View>
  );
}
