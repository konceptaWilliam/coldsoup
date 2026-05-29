import { useRef, useState, useEffect } from "react";
import { View, Text, FlatList, Pressable, RefreshControl, TextInput, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { trpc } from "@/lib/trpc";
import { StatusBadge } from "@/components/StatusBadge";
import { useUnread } from "@/lib/unread";
import type { ThreadStatus } from "@coldsoup/core";

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(dateStr).toLocaleDateString("en", { month: "short", day: "numeric" });
}

type Thread = {
  id: string;
  title: string;
  status: ThreadStatus;
  updated_at: string;
  messages?: { body: string; is_deleted: boolean; created_at?: string }[];
};

function sortThreads(threads: Thread[]): Thread[] {
  return [...threads].sort((a, b) => {
    const aDone = a.status === "DONE" ? 1 : 0;
    const bDone = b.status === "DONE" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

export default function GroupScreen() {
  const { groupId, name } = useLocalSearchParams<{ groupId: string; name: string }>();
  const navigation = useNavigation();
  const { isUnread } = useUnread();
  const { data: threads, isLoading, refetch, isRefetching } = trpc.threads.list.useQuery({ groupId });
  const createThread = trpc.threads.create.useMutation({
    onSuccess: () => {
      refetch();
      bottomSheetRef.current?.close();
      setNewTitle("");
    },
  });

  const bottomSheetRef = useRef<BottomSheet>(null);
  const [newTitle, setNewTitle] = useState("");
  const sorted = threads ? sortThreads(threads as Thread[]) : [];

  useEffect(() => {
    if (name) {
      navigation.setOptions({ title: name.toLowerCase() });
    }
  }, [name, navigation]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F2EFE8", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#1A1A18" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#F2EFE8" }}>
      <Pressable
        onPress={() => bottomSheetRef.current?.expand()}
        style={({ pressed }) => ({
          position: "absolute", bottom: 24, right: 20, zIndex: 10,
          width: 44, height: 44, backgroundColor: "#1A1A18",
          alignItems: "center", justifyContent: "center",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text style={{ color: "#F2EFE8", fontSize: 22, lineHeight: 24 }}>+</Text>
      </Pressable>

      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#1A1A18" />}
        ListEmptyComponent={
          <View style={{ alignItems: "center", padding: 32 }}>
            <Text style={{ color: "#6B6A65", fontSize: 14 }}>No threads yet. Tap + to start one.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const lastMsg = item.messages?.[0];
          const preview = lastMsg && !lastMsg.is_deleted ? lastMsg.body : "";
          const isDone = item.status === "DONE";
          const isUrgent = item.status === "URGENT";
          const activityTs = lastMsg?.created_at ? new Date(lastMsg.created_at).getTime() : 0;
          const unread = activityTs > 0 && isUnread(item.id, activityTs);
          return (
            <Pressable
              onPress={() => router.push({
                pathname: "/(app)/thread/[threadId]",
                params: { threadId: item.id, title: item.title, status: item.status, groupId },
              })}
              style={({ pressed }) => ({
                opacity: pressed ? 0.6 : isDone ? 0.4 : 1,
                borderLeftWidth: isUrgent ? 2 : 0,
                borderLeftColor: "#C79B6A",
                borderBottomWidth: 1,
                borderBottomColor: "#E2DDD2",
                backgroundColor: "#F2EFE8",
                paddingHorizontal: 16,
                paddingVertical: 12,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1, marginRight: 8 }}>
                  {unread && <View style={{ width: 6, height: 6, backgroundColor: "#C79B6A", marginRight: 6 }} />}
                  <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: unread ? "700" : "500", color: "#1A1A18", flex: 1 }} numberOfLines={1}>
                    {item.title.toLowerCase()}
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: unread ? "#1A1A18" : "#6B6A65" }}>{formatRelative(item.updated_at)}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 12, color: "#6B6A65", flex: 1, marginRight: 8 }} numberOfLines={1}>
                  {preview || " "}
                </Text>
                <StatusBadge status={item.status} />
              </View>
            </Pressable>
          );
        }}
      />

      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={["40%"]}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: "#F2EFE8", borderRadius: 0 }}
        handleIndicatorStyle={{ backgroundColor: "#E2DDD2" }}
      >
        <BottomSheetView style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 }}>
          <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "600", color: "#1A1A18", marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>
            New thread
          </Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: "#E2DDD2", backgroundColor: "#F7F4ED", paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: "#1A1A18", marginBottom: 12 }}
            placeholder="Thread title"
            placeholderTextColor="#6B6A65"
            value={newTitle}
            onChangeText={setNewTitle}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => { if (newTitle.trim()) createThread.mutate({ groupId, title: newTitle.trim() }); }}
          />
          <Pressable
            onPress={() => { if (newTitle.trim()) createThread.mutate({ groupId, title: newTitle.trim() }); }}
            disabled={!newTitle.trim() || createThread.isPending}
            style={({ pressed }) => ({
              backgroundColor: "#1A1A18",
              paddingVertical: 12,
              alignItems: "center",
              opacity: pressed || !newTitle.trim() || createThread.isPending ? 0.4 : 1,
            })}
          >
            {createThread.isPending
              ? <ActivityIndicator color="#F2EFE8" />
              : <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "500", color: "#F2EFE8" }}>Create</Text>
            }
          </Pressable>
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}
