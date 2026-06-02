import { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Avatar } from "./Avatar";
import type { Poll } from "@coldsoup/core";
import { useTheme } from "@/lib/theme";
import * as haptics from "@/lib/haptics";

interface PollCardProps {
  poll: Poll;
  messageId: string;
}

export function PollCard({ poll: initialPoll }: PollCardProps) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const { data: me } = trpc.profile.get.useQuery();
  const [poll, setPoll] = useState(initialPoll);
  const [showAddOption, setShowAddOption] = useState(false);
  const [newOption, setNewOption] = useState("");

  // Sync local state when server data updates (after invalidation).
  useEffect(() => setPoll(initialPoll), [initialPoll]);

  const vote = trpc.polls.vote.useMutation({
    onMutate: ({ pollOptionId }) => {
      const prev = poll;
      setPoll((p) => ({
        ...p,
        options: p.options.map((o) =>
          o.id !== pollOptionId
            ? o
            : {
                ...o,
                user_voted: !o.user_voted,
                vote_count: o.user_voted ? o.vote_count - 1 : o.vote_count + 1,
                voters: o.user_voted
                  ? o.voters.filter((v) => v.id !== me?.id)
                  : me
                    ? [...o.voters, { id: me.id, display_name: me.display_name, avatar_url: me.avatar_url }]
                    : o.voters,
              }
        ),
      }));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) setPoll(ctx.prev);
    },
    onSuccess: () => utils.messages.list.invalidate(),
  });

  const addOption = trpc.polls.addOption.useMutation({
    onSuccess: () => {
      setNewOption("");
      setShowAddOption(false);
      utils.messages.list.invalidate();
    },
  });

  const totalVotes = poll.options.reduce((sum, o) => sum + o.vote_count, 0);

  return (
    <View style={{ marginHorizontal: 16, marginVertical: 6, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 12 }}>
      <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "600", color: c.ink, marginBottom: 2 }}>
        {poll.question}
      </Text>
      <Text style={{ fontFamily: "monospace", fontSize: 10, color: c.muted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 }}>
        {t("poll.votes", { count: totalVotes })}
      </Text>

      <View style={{ gap: 10 }}>
        {poll.options.map((opt) => {
          const pct = totalVotes > 0 ? Math.round((opt.vote_count / totalVotes) * 100) : 0;
          return (
            <Pressable
              key={opt.id}
              onPress={() => { haptics.selection(); vote.mutate({ pollOptionId: opt.id }); }}
              accessibilityRole="button"
              accessibilityState={{ selected: opt.user_voted }}
              accessibilityLabel={t("a11y.votePoll", { option: opt.text })}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, minHeight: 44, justifyContent: "center" })}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ fontSize: 13, color: c.ink, fontWeight: opt.user_voted ? "600" : "400", flex: 1, marginRight: 8 }} numberOfLines={2}>
                  {opt.text}
                </Text>
                <Text style={{ fontFamily: "monospace", fontSize: 10, color: c.muted }}>{pct}%</Text>
              </View>
              <View style={{ height: 6, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border, marginBottom: 4 }}>
                <View style={{ width: `${pct}%`, height: "100%", backgroundColor: opt.user_voted ? c.fillStrong : c.fillWeak }} />
              </View>
              {opt.voters.length > 0 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                  {opt.voters.map((v) => (
                    <View key={v.id} style={{ flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: c.border, paddingHorizontal: 4, paddingVertical: 2 }}>
                      <Avatar name={v.display_name} avatarUrl={v.avatar_url} size={14} fontSize={8} />
                      <Text style={{ fontFamily: "monospace", fontSize: 10, color: c.ink }}>{v.display_name}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ fontFamily: "monospace", fontSize: 10, color: c.muted2 }}>{t("poll.noVotes")}</Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {showAddOption ? (
        <View style={{ flexDirection: "row", gap: 6, marginTop: 12 }}>
          <TextInput
            style={{ flex: 1, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16, color: c.ink }}
            value={newOption}
            onChangeText={setNewOption}
            placeholder={t("poll.optionText")}
            placeholderTextColor={c.muted}
            autoFocus
            maxLength={200}
            onSubmitEditing={() => newOption.trim() && addOption.mutate({ pollId: poll.id, text: newOption.trim() })}
            returnKeyType="done"
          />
          <Pressable
            onPress={() => newOption.trim() && addOption.mutate({ pollId: poll.id, text: newOption.trim() })}
            disabled={!newOption.trim() || addOption.isPending}
            style={({ pressed }) => ({ backgroundColor: c.ink, paddingHorizontal: 12, justifyContent: "center", opacity: pressed || !newOption.trim() || addOption.isPending ? 0.4 : 1 })}
          >
            <Text style={{ fontFamily: "monospace", fontSize: 11, color: c.surface }}>{t("poll.add")}</Text>
          </Pressable>
          <Pressable onPress={() => { setShowAddOption(false); setNewOption(""); }} style={{ paddingHorizontal: 6, justifyContent: "center" }}>
            <Text style={{ fontFamily: "monospace", fontSize: 16, color: c.muted }}>×</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setShowAddOption(true)} accessibilityRole="button" accessibilityLabel={t("a11y.addOption")} style={({ pressed }) => ({ marginTop: 12, opacity: pressed ? 0.6 : 1, minHeight: 32, justifyContent: "center" })}>
          <Text style={{ fontFamily: "monospace", fontSize: 10, color: c.muted, letterSpacing: 0.5 }}>{t("poll.addOption")}</Text>
        </Pressable>
      )}
    </View>
  );
}
