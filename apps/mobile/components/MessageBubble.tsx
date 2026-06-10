import type { ReactNode } from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { Avatar } from "./Avatar";
import { AttachmentGrid } from "./AttachmentGrid";
import { LinkPreview } from "./LinkPreview";
import type { MessageAttachment, ReactionType } from "@coldsoup/core";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "@/lib/theme";

interface Reaction { type: string; count: number; userReacted: boolean; }
interface ReplyTo { id: string; body: string; author_name: string; }

interface Props {
  message: {
    id: string; body: string; created_at: string;
    edited_at?: string | null; is_deleted?: boolean;
    reactions?: Reaction[]; reply_to?: ReplyTo | null;
    attachments?: MessageAttachment[];
  };
  displayName: string;
  avatarUrl: string | null;
  mentionNames?: string[];
  onLongPress?: () => void;
  onReactionPress?: (type: ReactionType) => void;
  onReplyPress?: () => void;
  onAvatarPress?: () => void;
  highlighted?: boolean;
  deliveryStatus?: "sending" | "failed";
  onRetry?: () => void;
  onDismiss?: () => void;
  seenBy?: { id: string; name: string; avatarUrl: string | null }[];
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Linkify URLs (tappable) and highlight @DisplayName mentions.
function renderBody(body: string, names: string[], c: Palette) {
  if (!body) return body;
  const escaped = names.length
    ? [...names].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    : [];
  const patterns = ["https?:\\/\\/[^\\s]+"];
  if (escaped.length) patterns.push(`@(?:${escaped.join("|")})`);
  const regex = new RegExp(`(${patterns.join("|")})`, "gi");
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(body)) !== null) {
    if (m.index > last) parts.push(body.slice(last, m.index));
    const tok = m[0];
    if (/^https?:\/\//i.test(tok)) {
      parts.push(
        <Text key={key++} onPress={() => Linking.openURL(tok).catch(() => {})} style={{ color: c.accent, textDecorationLine: "underline" }}>{tok}</Text>
      );
    } else {
      parts.push(
        <Text key={key++} style={{ fontWeight: "600", color: c.ink, backgroundColor: c.highlight }}>{tok}</Text>
      );
    }
    last = m.index + tok.length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts.length ? parts : body;
}

export function MessageBubble({ message, displayName, avatarUrl, mentionNames, onLongPress, onReactionPress, onReplyPress, onAvatarPress, highlighted, deliveryStatus, onRetry, onDismiss, seenBy }: Props) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const isDeleted = message.is_deleted;
  const firstUrl = !isDeleted ? message.body.match(/https?:\/\/[^\s]+/i)?.[0] : undefined;
  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={250}
      style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: highlighted || (pressed && onLongPress) ? c.highlight : c.surface })}
    >
      <Pressable
        onPress={onAvatarPress}
        disabled={!onAvatarPress}
        accessibilityRole={onAvatarPress ? "button" : undefined}
        accessibilityLabel={onAvatarPress ? t("a11y.openProfile", { name: displayName }) : undefined}
        style={({ pressed }) => ({ opacity: pressed && onAvatarPress ? 0.6 : 1 })}
      >
        <Avatar name={displayName} avatarUrl={avatarUrl} size={28} fontSize={9} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: c.ink }}>{displayName}</Text>
          <Text style={{ fontSize: 13, color: c.muted2 }}>{formatTime(message.created_at)}</Text>
          {message.edited_at && <Text style={{ fontSize: 13, color: c.muted2 }}>{t("message.edited")}</Text>}
        </View>
        {message.reply_to && (
          <Pressable
            onPress={onReplyPress}
            disabled={!onReplyPress}
            accessibilityRole={onReplyPress ? "button" : undefined}
            accessibilityLabel={onReplyPress ? t("a11y.jumpToReply") : undefined}
            style={({ pressed }) => ({ borderLeftWidth: 2, borderLeftColor: c.border, paddingLeft: 8, marginBottom: 6, opacity: pressed && onReplyPress ? 0.6 : 1 })}
          >
            <Text style={{ fontSize: 13, color: c.muted, fontWeight: "600" }}>{message.reply_to.author_name}</Text>
            <Text style={{ fontSize: 13, color: c.muted }} numberOfLines={1}>{message.reply_to.body}</Text>
          </Pressable>
        )}
        {(isDeleted || message.body.length > 0) && (
          <Text
            style={{ fontSize: 18, color: isDeleted ? c.muted2 : c.ink, fontStyle: isDeleted ? "italic" : "normal", lineHeight: 26 }}
            selectable
          >
            {isDeleted ? t("message.deleted") : renderBody(message.body, mentionNames ?? [], c)}
          </Text>
        )}
        {firstUrl && <LinkPreview url={firstUrl} />}
        {!isDeleted && message.attachments && message.attachments.length > 0 && (
          <AttachmentGrid attachments={message.attachments} />
        )}
        {!isDeleted && message.reactions && message.reactions.some((r) => r.count > 0) && (
          <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
            {message.reactions.filter((r) => r.count > 0).map((r) => (
              <Pressable
                key={r.type}
                onPress={() => onReactionPress?.(r.type as ReactionType)}
                accessibilityRole="button"
                accessibilityState={{ selected: r.userReacted }}
                accessibilityLabel={t("a11y.reactWith", { emoji: r.type })}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2,
                  borderWidth: 1, borderColor: r.userReacted ? c.urgentBorder : c.border,
                  backgroundColor: r.userReacted ? c.urgentBg : c.surface2,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text style={{ fontSize: 12 }}>{r.type}</Text>
                <Text style={{ fontSize: 11, color: c.muted }}>{r.count}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {seenBy && seenBy.length > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 5, alignSelf: "flex-end" }}>
            {seenBy.slice(0, 5).map((r, i) => (
              <View key={r.id} style={{ marginLeft: i === 0 ? 0 : -6 }}>
                <Avatar name={r.name} avatarUrl={r.avatarUrl} size={16} fontSize={7} />
              </View>
            ))}
            {seenBy.length > 5 && (
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: c.muted2, marginLeft: 4 }}>+{seenBy.length - 5}</Text>
            )}
          </View>
        )}
        {deliveryStatus === "sending" && (
          <Text style={{ fontSize: 11, color: c.muted2, marginTop: 4, fontStyle: "italic" }}>{t("delivery.sending")}</Text>
        )}
        {deliveryStatus === "failed" && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 }}>
            <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel={t("a11y.retrySend")} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ fontSize: 11, color: c.errorText, fontWeight: "600" }}>{t("delivery.failed")} · {t("delivery.retry")}</Text>
            </Pressable>
            <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel={t("a11y.dismissFailed")} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ fontSize: 14, color: c.muted, fontFamily: "monospace" }}>×</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Pressable>
  );
}
