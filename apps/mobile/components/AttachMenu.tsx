import { Modal, View, Text, Pressable } from "react-native";

interface Props {
  visible: boolean;
  onClose: () => void;
  onPhoto: () => void;
  onPoll: () => void;
  onCamera?: () => void;
}

const OPTIONS_BOTTOM = 70; // sits just above the composer row

export function AttachMenu({ visible, onClose, onPhoto, onPoll, onCamera }: Props) {
  function choose(fn: () => void) {
    onClose();
    fn();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1 }} onPress={onClose}>
        <View style={{ position: "absolute", left: 12, bottom: OPTIONS_BOTTOM, borderWidth: 1, borderColor: "#E2DDD2", backgroundColor: "#F2EFE8", minWidth: 160 }}>
          {onCamera && (
            <Pressable
              onPress={() => choose(onCamera)}
              style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#E2DDD2", opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ fontFamily: "monospace", fontSize: 12, color: "#1A1A18", letterSpacing: 0.5 }}>Take Photo</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => choose(onPhoto)}
            style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#E2DDD2", opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ fontFamily: "monospace", fontSize: 12, color: "#1A1A18", letterSpacing: 0.5 }}>Photo Library</Text>
          </Pressable>
          <Pressable
            onPress={() => choose(onPoll)}
            style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 14, opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ fontFamily: "monospace", fontSize: 12, color: "#1A1A18", letterSpacing: 0.5 }}>Poll</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
