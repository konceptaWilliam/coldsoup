import { useEffect, useRef } from "react";
import { Modal, View, Text, Pressable } from "react-native";
import type { ReactionType } from "@coldsoup/core";

const REACTIONS: ReactionType[] = ["👍", "👎", "❓"];

export interface ActionTarget {
  id: string;
  body: string;
  author: string;
  isMine: boolean;
  isDeleted: boolean;
  reactions?: { type: string; userReacted: boolean }[];
}

interface Props {
  target: ActionTarget | null;
  onClose: () => void;
  onReact: (type: ReactionType) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function MessageActionSheet({ target, onClose, onReact, onReply, onEdit, onDelete }: Props) {
  // Ignore backdrop taps briefly after opening — the long-press finger release
  // otherwise lands on the just-mounted backdrop and closes it instantly.
  const readyAt = useRef(0);
  useEffect(() => {
    if (target) readyAt.current = Date.now() + 400;
  }, [target]);

  const ready = () => Date.now() >= readyAt.current;

  function handleBackdrop() {
    if (!ready()) return;
    onClose();
  }

  function Row({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
    return (
      <Pressable
        onPress={() => { if (!ready()) return; onClose(); onPress(); }}
        style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 16, borderTopWidth: 1, borderTopColor: "#E2DDD2", opacity: pressed ? 0.6 : 1 })}
      >
        <Text style={{ fontFamily: "monospace", fontSize: 13, color: danger ? "#8A4B1F" : "#1A1A18", letterSpacing: 0.5 }}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <Modal visible={!!target} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(26,26,24,0.2)" }} onPress={handleBackdrop}>
        <Pressable style={{ backgroundColor: "#F2EFE8", borderTopWidth: 1, borderColor: "#E2DDD2" }} onPress={() => {}}>
          {target && !target.isDeleted && (
            <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 14 }}>
              {REACTIONS.map((r) => {
                const reacted = target.reactions?.some((x) => x.type === r && x.userReacted);
                return (
                  <Pressable
                    key={r}
                    onPress={() => { if (!ready()) return; onClose(); onReact(r); }}
                    style={({ pressed }) => ({
                      width: 48, height: 44, alignItems: "center", justifyContent: "center",
                      borderWidth: 1, borderColor: reacted ? "#C79B6A" : "#E2DDD2",
                      backgroundColor: reacted ? "#F6E6D4" : "#F7F4ED",
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <Text style={{ fontSize: 18 }}>{r}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {target && !target.isDeleted && <Row label="Reply" onPress={onReply} />}
          {target && target.isMine && !target.isDeleted && <Row label="Edit" onPress={onEdit} />}
          {target && target.isMine && !target.isDeleted && <Row label="Delete" onPress={onDelete} danger />}
          <Row label="Cancel" onPress={() => {}} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
