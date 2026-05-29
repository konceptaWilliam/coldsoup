import { View, Text, FlatList, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useUnread } from "@/lib/unread";

export default function GroupsTab() {
  const { isUnread } = useUnread();
  const { data: groups, isLoading, refetch, isRefetching } = trpc.groups.list.useQuery();

  // One query per group to detect unread threads (groups are few).
  const threadQueries = trpc.useQueries((t) =>
    (groups ?? []).map((g) => t.threads.list({ groupId: g.id }))
  );
  const unreadByGroup: Record<string, boolean> = {};
  (groups ?? []).forEach((g, i) => {
    const threads = threadQueries[i]?.data ?? [];
    unreadByGroup[g.id] = threads.some((th) => {
      const lastMsg = (th.messages as { created_at?: string }[] | undefined)?.[0];
      const ts = lastMsg?.created_at ? new Date(lastMsg.created_at).getTime() : 0;
      return ts > 0 && isUnread(th.id, ts);
    });
  });

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F2EFE8", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#1A1A18" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#F2EFE8" }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "#E2DDD2" }}>
        <Text style={{ fontFamily: "monospace", fontSize: 20, fontWeight: "600", color: "#1A1A18", letterSpacing: -0.3 }}>
          coldsoup
        </Text>
      </View>

      <FlatList
        data={groups ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#1A1A18" />}
        contentContainerStyle={(groups?.length ?? 0) === 0 ? { flex: 1 } : undefined}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
            <Text style={{ color: "#6B6A65", textAlign: "center", fontSize: 14 }}>
              No groups yet. Ask your admin to add you to one.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: "/(app)/group/[groupId]", params: { groupId: item.id, name: item.name } })}
            style={({ pressed }) => ({
              opacity: pressed ? 0.6 : 1,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: "#E2DDD2",
              backgroundColor: "#F2EFE8",
            })}
          >
            {unreadByGroup[item.id] && <View style={{ width: 6, height: 6, backgroundColor: "#C79B6A", marginRight: 8 }} />}
            <Text style={{ fontFamily: "monospace", fontSize: 14, color: "#1A1A18", fontWeight: unreadByGroup[item.id] ? "700" : "500" }}>
              {item.name.toLowerCase()}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}
