import { Modal, View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/lib/theme";
import { useOnline } from "@/lib/presence";
import { Avatar } from "./Avatar";

export interface ProfileTarget {
  id?: string;
  name: string;
  avatarUrl: string | null;
  role?: string;
}

interface Props {
  target: ProfileTarget | null;
  onClose: () => void;
}

export function ProfileSheet({ target, onClose }: Props) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const { isOnline } = useOnline();
  const online = isOnline(target?.id);

  return (
    <Modal visible={!!target} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.overlay, padding: 32 }} onPress={onClose}>
        <Pressable
          style={{ width: "100%", maxWidth: 320, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", paddingVertical: 32, paddingHorizontal: 24, gap: 14 }}
          onPress={() => {}}
        >
          {target && (
            <>
              <Avatar name={target.name} avatarUrl={target.avatarUrl} size={96} fontSize={32} />
              <Text style={{ fontSize: 17, fontWeight: "600", color: c.ink, textAlign: "center" }} numberOfLines={2}>
                {target.name}
              </Text>
              {target.role && (
                <Text style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: target.role === "ADMIN" ? c.urgentText : c.muted }}>
                  {target.role === "ADMIN" ? t("members.admin") : t("members.member")}
                </Text>
              )}
              {online && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.online }} />
                  <Text style={{ fontFamily: "monospace", fontSize: 11, color: c.online, letterSpacing: 0.5 }}>{t("profile.online")}</Text>
                </View>
              )}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
