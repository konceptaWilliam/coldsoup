import { Modal, View, Image, Pressable, Text, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";

interface Props {
  uri: string | null;
  onClose: () => void;
}

export function Lightbox({ uri, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const { t } = useTranslation();

  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(26,26,24,0.92)", alignItems: "center", justifyContent: "center" }}>
        {uri && (
          <Image source={{ uri }} style={{ width, height: height * 0.8 }} resizeMode="contain" />
        )}
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t("a11y.closeImage")} style={{ position: "absolute", top: 56, right: 16, width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#F2EFE8", fontSize: 24, fontFamily: "monospace" }}>×</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
