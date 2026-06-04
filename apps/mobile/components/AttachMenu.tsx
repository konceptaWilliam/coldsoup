import { Modal, View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/lib/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
  onPhoto: () => void;
  onFile: () => void;
  onVoice: () => void;
  onPoll: () => void;
  onSMeter: () => void;
  onCamera?: () => void;
}

const OPTIONS_BOTTOM = 70; // sits just above the composer row

export function AttachMenu({ visible, onClose, onPhoto, onFile, onVoice, onPoll, onSMeter, onCamera }: Props) {
  const { c } = useTheme();
  const { t } = useTranslation();
  function choose(fn: () => void) {
    onClose();
    fn();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1 }} onPress={onClose}>
        <View style={{ position: "absolute", left: 12, bottom: OPTIONS_BOTTOM, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, minWidth: 160 }}>
          {onCamera && (
            <Pressable
              onPress={() => choose(onCamera)}
              style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ fontFamily: "monospace", fontSize: 12, color: c.ink, letterSpacing: 0.5 }}>{t("attach.takePhoto")}</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => choose(onPhoto)}
            style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ fontFamily: "monospace", fontSize: 12, color: c.ink, letterSpacing: 0.5 }}>{t("attach.photoLibrary")}</Text>
          </Pressable>
          <Pressable
            onPress={() => choose(onFile)}
            style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ fontFamily: "monospace", fontSize: 12, color: c.ink, letterSpacing: 0.5 }}>{t("attach.file")}</Text>
          </Pressable>
          <Pressable
            onPress={() => choose(onVoice)}
            style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ fontFamily: "monospace", fontSize: 12, color: c.ink, letterSpacing: 0.5 }}>{t("attach.voice")}</Text>
          </Pressable>
          <Pressable
            onPress={() => choose(onPoll)}
            style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ fontFamily: "monospace", fontSize: 12, color: c.ink, letterSpacing: 0.5 }}>{t("attach.poll")}</Text>
          </Pressable>
          <Pressable
            onPress={() => choose(onSMeter)}
            style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 14, opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ fontFamily: "monospace", fontSize: 12, color: c.ink, letterSpacing: 0.5 }}>{t("attach.smeter")}</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
