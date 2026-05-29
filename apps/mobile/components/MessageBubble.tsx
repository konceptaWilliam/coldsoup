import type { ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import { Avatar } from "./Avatar";
import { AttachmentGrid } from "./AttachmentGrid";
import type { MessageAttachment, ReactionType } from "@coldsoup/core";

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
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Highlight @DisplayName tokens (longest names first to avoid partial matches).
function renderBody(body: string, names: string[]) {
  if (!names.length || !body) return body;
  const escaped = [...names].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`@(${escaped.join("|")})`, "g");
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(body)) !== null) {
    if (m.index > last) parts.push(body.slice(last, m.index));
    parts.push(
      <Text key={key++} style={{ fontWeight: "600", color: "#1A1A18", backgroundColor: "#ECE8DF" }}>@{m[1]}</Text>
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts.length ? parts : body;
}

export function MessageBubble({ message, displayName, avatarUrl, mentionNames, onLongPress, onReactionPress }: Props) {
  const isDeleted = message.is_deleted;
  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={250}
      style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: pressed && onLongPress ? "#ECE8DF" : "#F2EFE8" })}
    >
      <Avatar name={displayName} avatarUrl={avatarUrl} size={28} fontSize={9} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#1A1A18" }}>{displayName}</Text>
          <Text style={{ fontSize: 11, color: "#9A988F" }}>{formatTime(message.created_at)}</Text>
          {message.edited_at && <Text style={{ fontSize: 11, color: "#9A988F" }}>(edited)</Text>}
        </View>
        {message.reply_to && (
          <View style={{ borderLeftWidth: 2, borderLeftColor: "#E2DDD2", paddingLeft: 8, marginBottom: 6 }}>
            <Text style={{ fontSize: 11, color: "#6B6A65", fontWeight: "600" }}>{message.reply_to.author_name}</Text>
            <Text style={{ fontSize: 11, color: "#6B6A65" }} numberOfLines={1}>{message.reply_to.body}</Text>
          </View>
        )}
        {(isDeleted || message.body.length > 0) && (
          <Text
            style={{ fontSize: 14, color: isDeleted ? "#9A988F" : "#1A1A18", fontStyle: isDeleted ? "italic" : "normal", lineHeight: 20 }}
            selectable
          >
            {isDeleted ? "This message was deleted." : (mentionNames && mentionNames.length ? renderBody(message.body, mentionNames) : message.body)}
          </Text>
        )}
        {!isDeleted && message.attachments && message.attachments.length > 0 && (
          <AttachmentGrid attachments={message.attachments} />
        )}
        {!isDeleted && message.reactions && message.reactions.some((r) => r.count > 0) && (
          <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
            {message.reactions.filter((r) => r.count > 0).map((r) => (
              <Pressable
                key={r.type}
                onPress={() => onReactionPress?.(r.type as ReactionType)}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2,
                  borderWidth: 1, borderColor: r.userReacted ? "#C79B6A" : "#E2DDD2",
                  backgroundColor: r.userReacted ? "#F6E6D4" : "#F7F4ED",
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text style={{ fontSize: 12 }}>{r.type}</Text>
                <Text style={{ fontSize: 11, color: "#6B6A65" }}>{r.count}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}
