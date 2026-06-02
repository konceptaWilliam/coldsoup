import { useState } from "react";
import { View, Image, Pressable, Text, Linking } from "react-native";
import type { MessageAttachment } from "@coldsoup/core";
import { Lightbox } from "./Lightbox";
import { AudioPlayer } from "./AudioPlayer";
import { VideoPlayer } from "./VideoPlayer";
import { useTheme } from "@/lib/theme";

interface Props {
  attachments: MessageAttachment[];
}

export function AttachmentGrid({ attachments }: Props) {
  const { c } = useTheme();
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  if (!attachments?.length) return null;

  const images = attachments.filter((a) => a.type === "image");
  const audio = attachments.filter((a) => a.type === "audio");
  const videos = attachments.filter((a) => a.type === "video");
  const files = attachments.filter((a) => a.type === "file");

  return (
    <View style={{ marginTop: 6, gap: 6 }}>
      {images.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, paddingVertical: 6 }}>
          {images.map((att) => {
            return (
              <Pressable
                key={att.url}
                onPress={() => setLightboxUri(att.url)}
                accessibilityRole="button"
                accessibilityLabel={att.name}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              >
                <View
                  style={{
                    backgroundColor: c.surface2,
                    borderWidth: 1,
                    borderColor: c.border,
                    padding: 6,
                    paddingBottom: 20,
                    shadowColor: "#000",
                    shadowOpacity: 0.18,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 3 },
                    elevation: 4,
                  }}
                >
                  <Image source={{ uri: att.url }} style={{ width: 128, height: 128 }} resizeMode="cover" />
                  <Text numberOfLines={1} style={{ position: "absolute", bottom: 5, left: 6, right: 6, fontFamily: "monospace", fontSize: 9, color: c.muted2 }}>
                    {att.name}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {videos.map((att) => (
        <VideoPlayer key={att.url} url={att.url} />
      ))}

      {audio.map((att) => (
        <AudioPlayer key={att.url} url={att.url} name={att.name} />
      ))}

      {files.map((att) => {
        const ext = (att.name.split(".").pop() ?? "").toUpperCase().slice(0, 4);
        return (
          <Pressable
            key={att.url}
            onPress={() => Linking.openURL(att.url).catch(() => {})}
            accessibilityRole="button"
            accessibilityLabel={att.name}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 10, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}
          >
            <View style={{ width: 32, height: 32, backgroundColor: c.ink, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: "monospace", fontSize: 9, fontWeight: "600", color: c.surface }}>{ext || "FILE"}</Text>
            </View>
            <Text style={{ flex: 1, fontFamily: "monospace", fontSize: 12, color: c.ink }} numberOfLines={1}>{att.name}</Text>
          </Pressable>
        );
      })}

      <Lightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
    </View>
  );
}
