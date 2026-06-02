import { useEffect, useRef } from "react";
import { Modal, View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import type { ReactionType } from "@coldsoup/core";
import { useTheme } from "@/lib/theme";

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
  onCopy: () => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function MessageActionSheet({ target, onClose, onReact, onCopy, onReply, onEdit, onDelete }: Props) {
  const { c } = useTheme();
  const { t } = useTranslation();
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
        style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 16, borderTopWidth: 1, borderTopColor: c.border, opacity: pressed ? 0.6 : 1 })}
      >
        <Text style={{ fontFamily: "monospace", fontSize: 13, color: danger ? c.urgentText : c.ink, letterSpacing: 0.5 }}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <Modal visible={!!target} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: c.overlay }} onPress={handleBackdrop}>
        <Pressable style={{ backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.border }} onPress={() => {}}>
          {target && !target.isDeleted && (
            <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 14 }}>
              {REACTIONS.map((r) => {
                const reacted = target.reactions?.some((x) => x.type === r && x.userReacted);
                return (
                  <Pressable
                    key={r}
                    onPress={() => { if (!ready()) return; onClose(); onReact(r); }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: reacted }}
                    accessibilityLabel={t("a11y.reactWith", { emoji: r })}
                    style={({ pressed }) => ({
                      width: 48, height: 44, alignItems: "center", justifyContent: "center",
                      borderWidth: 1, borderColor: reacted ? c.urgentBorder : c.border,
                      backgroundColor: reacted ? c.urgentBg : c.surface2,
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <Text style={{ fontSize: 18 }}>{r}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {target && !target.isDeleted && target.body.trim().length > 0 && <Row label={t("actions.copy")} onPress={onCopy} />}
          {target && !target.isDeleted && <Row label={t("actions.reply")} onPress={onReply} />}
          {target && target.isMine && !target.isDeleted && <Row label={t("actions.edit")} onPress={onEdit} />}
          {target && target.isMine && !target.isDeleted && <Row label={t("actions.delete")} onPress={onDelete} danger />}
          <Row label={t("common.cancel")} onPress={() => {}} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
