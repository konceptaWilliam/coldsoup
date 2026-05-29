import { useState } from "react";
import { View, Text, TextInput, FlatList, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { trpc } from "@/lib/trpc";
import { StatusBadge } from "@/components/StatusBadge";

export default function SearchTab() {
  const [query, setQuery] = useState("");

  const { data, isFetching } = trpc.search.query.useQuery(
    { q: query },
    { enabled: query.trim().length >= 2 }
  );

  const threads = data?.threads ?? [];
  const messages = data?.messages ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: "#F2EFE8" }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "#E2DDD2" }}>
        <Text style={{ fontFamily: "monospace", fontSize: 20, fontWeight: "600", color: "#1A1A18", letterSpacing: -0.3, marginBottom: 12 }}>
          search
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#E2DDD2", backgroundColor: "#F7F4ED", paddingHorizontal: 12 }}>
          <Text style={{ fontFamily: "monospace", fontSize: 11, color: "#6B6A65", letterSpacing: 1, marginRight: 8 }}>Q</Text>
          <TextInput
            style={{ flex: 1, paddingVertical: 10, fontSize: 16, color: "#1A1A18" }}
            placeholder="Search threads and messages..."
            placeholderTextColor="#6B6A65"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {isFetching && <ActivityIndicator color="#6B6A65" size="small" />}
        </View>
      </View>

      <FlatList
        data={[
          ...(threads.length > 0 ? [{ type: "header", label: "Threads", id: "h-threads" }] : []),
          ...threads.map((t) => ({ type: "thread", ...t, id: `t-${t.id}` })),
          ...(messages.length > 0 ? [{ type: "header", label: "Messages", id: "h-messages" }] : []),
          ...messages.map((m: { id: string }) => ({ type: "message", ...m, id: `m-${m.id}` })),
        ]}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          query.trim().length >= 2 && !isFetching ? (
            <View style={{ alignItems: "center", paddingVertical: 64 }}>
              <Text style={{ color: "#6B6A65", fontSize: 14 }}>No results for "{query}"</Text>
            </View>
          ) : query.trim().length < 2 ? (
            <View style={{ alignItems: "center", paddingVertical: 64 }}>
              <Text style={{ color: "#6B6A65", fontSize: 14 }}>Type at least 2 characters to search</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          if (item.type === "header") {
            return (
              <View style={{ paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#E2DDD2", backgroundColor: "#F2EFE8" }}>
                <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "500", color: "#6B6A65", letterSpacing: 1.5, textTransform: "uppercase" }}>
                  {(item as { label: string }).label}
                </Text>
              </View>
            );
          }
          if (item.type === "thread") {
            const t = item as unknown as { id: string; title: string; status: string; groupId: string; groupName: string };
            return (
              <Pressable
                onPress={() => router.push({ pathname: "/(app)/thread/[threadId]", params: { threadId: t.id, title: t.title, status: t.status, groupId: t.groupId } })}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.6 : 1,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: "#E2DDD2",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                })}
              >
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "500", color: "#1A1A18" }} numberOfLines={1}>
                    {t.title.toLowerCase()}
                  </Text>
                  <Text style={{ fontSize: 11, color: "#6B6A65", marginTop: 2 }}>{t.groupName.toLowerCase()}</Text>
                </View>
                <StatusBadge status={t.status as "OPEN" | "URGENT" | "DONE"} />
              </Pressable>
            );
          }
          if (item.type === "message") {
            const m = item as unknown as { id: string; body: string; threadId: string; threadTitle: string; groupName: string };
            return (
              <Pressable
                onPress={() => router.push({ pathname: "/(app)/thread/[threadId]", params: { threadId: m.threadId, title: m.threadTitle } })}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.6 : 1,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: "#E2DDD2",
                })}
              >
                <Text style={{ fontFamily: "monospace", fontSize: 10, color: "#6B6A65", letterSpacing: 0.5, marginBottom: 4 }}>
                  {m.groupName.toLowerCase()} › {m.threadTitle.toLowerCase()}
                </Text>
                <Text style={{ fontSize: 13, color: "#1A1A18", lineHeight: 18 }} numberOfLines={2}>{m.body}</Text>
              </Pressable>
            );
          }
          return null;
        }}
      />
    </View>
  );
}
