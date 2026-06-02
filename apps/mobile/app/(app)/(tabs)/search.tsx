import { useState } from "react";
import { View, Text, TextInput, FlatList, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { StatusBadge } from "@/components/StatusBadge";
import { useTheme } from "@/lib/theme";

export default function SearchTab() {
  const { c } = useTheme();
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const { data, isFetching } = trpc.search.query.useQuery(
    { q: query },
    { enabled: query.trim().length >= 2 }
  );

  const threads = data?.threads ?? [];
  const messages = data?.messages ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Text style={{ fontFamily: "monospace", fontSize: 20, fontWeight: "600", color: c.ink, letterSpacing: -0.3, marginBottom: 12 }}>
          {t("search.title")}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 12 }}>
          <Text style={{ fontFamily: "monospace", fontSize: 11, color: c.muted, letterSpacing: 1, marginRight: 8 }}>Q</Text>
          <TextInput
            style={{ flex: 1, paddingVertical: 10, fontSize: 16, color: c.ink }}
            placeholder={t("search.placeholder")}
            placeholderTextColor={c.muted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {isFetching && <ActivityIndicator color={c.muted} size="small" />}
        </View>
      </View>

      <FlatList
        data={[
          ...(threads.length > 0 ? [{ type: "header", label: t("search.threads"), id: "h-threads" }] : []),
          ...threads.map((th) => ({ type: "thread", ...th, id: `t-${th.id}` })),
          ...(messages.length > 0 ? [{ type: "header", label: t("search.messages"), id: "h-messages" }] : []),
          ...messages.map((m: { id: string }) => ({ type: "message", ...m, id: `m-${m.id}` })),
        ]}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          query.trim().length >= 2 && !isFetching ? (
            <View style={{ alignItems: "center", paddingVertical: 64 }}>
              <Text style={{ color: c.muted, fontSize: 14 }}>{t("search.noResults", { query })}</Text>
            </View>
          ) : query.trim().length < 2 ? (
            <View style={{ alignItems: "center", paddingVertical: 64 }}>
              <Text style={{ color: c.muted, fontSize: 14 }}>{t("search.minChars")}</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          if (item.type === "header") {
            return (
              <View style={{ paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface }}>
                <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "500", color: c.muted, letterSpacing: 1.5, textTransform: "uppercase" }}>
                  {(item as { label: string }).label}
                </Text>
              </View>
            );
          }
          if (item.type === "thread") {
            const th = item as unknown as { id: string; title: string; status: string; groupId: string; groupName: string };
            return (
              <Pressable
                onPress={() => router.push({ pathname: "/(app)/thread/[threadId]", params: { threadId: th.id, title: th.title, status: th.status, groupId: th.groupId } })}
                accessibilityRole="button"
                accessibilityLabel={t("a11y.openThread", { title: th.title })}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.6 : 1,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: c.border,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                })}
              >
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "500", color: c.ink }} numberOfLines={1}>
                    # {th.title.toLowerCase()}
                  </Text>
                  <Text style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>• {th.groupName.toLowerCase()}</Text>
                </View>
                <StatusBadge status={th.status as "OPEN" | "URGENT" | "DONE"} />
              </Pressable>
            );
          }
          if (item.type === "message") {
            const m = item as unknown as { id: string; body: string; threadId: string; threadTitle: string; groupName: string };
            return (
              <Pressable
                onPress={() => router.push({ pathname: "/(app)/thread/[threadId]", params: { threadId: m.threadId, title: m.threadTitle } })}
                accessibilityRole="button"
                accessibilityLabel={t("a11y.openMessage", { thread: m.threadTitle })}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.6 : 1,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: c.border,
                })}
              >
                <Text style={{ fontFamily: "monospace", fontSize: 10, color: c.muted, letterSpacing: 0.5, marginBottom: 4 }}>
                  • {m.groupName.toLowerCase()} › # {m.threadTitle.toLowerCase()}
                </Text>
                <Text style={{ fontSize: 13, color: c.ink, lineHeight: 18 }} numberOfLines={2}>{m.body}</Text>
              </Pressable>
            );
          }
          return null;
        }}
      />
    </View>
  );
}
