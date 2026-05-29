import { useState } from "react";
import { View, Image, Pressable } from "react-native";
import type { MessageAttachment } from "@coldsoup/core";
import { Lightbox } from "./Lightbox";
import { AudioPlayer } from "./AudioPlayer";

interface Props {
  attachments: MessageAttachment[];
}

export function AttachmentGrid({ attachments }: Props) {
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  if (!attachments?.length) return null;

  const images = attachments.filter((a) => a.type === "image");
  const audio = attachments.filter((a) => a.type === "audio");

  return (
    <View style={{ marginTop: 6, gap: 6 }}>
      {images.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
          {images.map((att) => (
            <Pressable
              key={att.url}
              onPress={() => setLightboxUri(att.url)}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Image
                source={{ uri: att.url }}
                style={{ width: 140, height: 140, borderWidth: 1, borderColor: "#E2DDD2", backgroundColor: "#F7F4ED" }}
                resizeMode="cover"
              />
            </Pressable>
          ))}
        </View>
      )}

      {audio.map((att) => (
        <AudioPlayer key={att.url} url={att.url} name={att.name} />
      ))}

      <Lightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
    </View>
  );
}
