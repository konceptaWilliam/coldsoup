import { useState } from "react";
import { Modal, View, Text, Pressable, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import { useTheme } from "@/lib/theme";
import * as haptics from "@/lib/haptics";
import type { PickedAsset } from "@/lib/attachments";

interface Props {
  visible: boolean;
  onClose: () => void;
  onComplete: (asset: PickedAsset) => void;
}

function fmt(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VoiceRecordModal({ visible, onClose, onComplete }: Props) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [recordedMs, setRecordedMs] = useState(0);

  async function start() {
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      Alert.alert(t("voice.permissionTitle"), t("voice.permissionBody"));
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    haptics.tapMedium();
  }

  async function stop() {
    setRecordedMs(state.durationMillis);
    await recorder.stop();
    setRecordedUri(recorder.uri);
    haptics.tapLight();
  }

  function reset() {
    setRecordedUri(null);
    setRecordedMs(0);
  }

  function attach() {
    if (!recordedUri) return;
    onComplete({ uri: recordedUri, fileName: `voice-${Date.now()}.m4a`, mimeType: "audio/mp4" });
    reset();
    onClose();
  }

  function handleClose() {
    if (state.isRecording) recorder.stop().catch(() => {});
    reset();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: c.overlay }} onPress={handleClose}>
        <Pressable style={{ backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.border, padding: 24 }} onPress={() => {}}>
          <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "600", color: c.ink, textTransform: "uppercase", letterSpacing: 1, marginBottom: 20, textAlign: "center" }}>
            {t("voice.title")}
          </Text>

          <Text style={{ fontFamily: "monospace", fontSize: 32, color: c.ink, textAlign: "center", marginBottom: 20 }}>
            {fmt(recordedUri ? recordedMs : state.durationMillis)}
          </Text>

          {!recordedUri ? (
            <View style={{ alignItems: "center", gap: 12 }}>
              <Pressable
                onPress={state.isRecording ? stop : start}
                accessibilityRole="button"
                accessibilityLabel={state.isRecording ? t("a11y.stopRecording") : t("a11y.startRecording")}
                style={({ pressed }) => ({
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  backgroundColor: state.isRecording ? c.urgentText : c.ink,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <View style={state.isRecording
                  ? { width: 22, height: 22, backgroundColor: c.surface }
                  : { width: 26, height: 26, borderRadius: 13, backgroundColor: c.surface }} />
              </Pressable>
              <Text style={{ fontFamily: "monospace", fontSize: 11, color: c.muted, letterSpacing: 0.5 }}>
                {state.isRecording ? t("voice.recording") : t("voice.tapToRecord")}
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={reset}
                style={({ pressed }) => ({ flex: 1, minHeight: 44, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={{ fontFamily: "monospace", fontSize: 12, color: c.ink }}>{t("voice.rerecord")}</Text>
              </Pressable>
              <Pressable
                onPress={attach}
                style={({ pressed }) => ({ flex: 1, minHeight: 44, justifyContent: "center", alignItems: "center", backgroundColor: c.ink, opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "500", color: c.surface }}>{t("voice.attach")}</Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
