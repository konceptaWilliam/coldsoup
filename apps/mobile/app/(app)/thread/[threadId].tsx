import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { useLocalSearchParams, useNavigation, router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { trpc } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";
import { uploadAttachment, type PickedAsset } from "@/lib/attachments";
import { useUnread } from "@/lib/unread";
import { StatusControl } from "@/components/StatusControl";
import { Avatar } from "@/components/Avatar";
import { MessageBubble } from "@/components/MessageBubble";
import { PollCard } from "@/components/PollCard";
import { PollCreateModal } from "@/components/PollCreateModal";
import { AttachMenu } from "@/components/AttachMenu";
import { MessageActionSheet, type ActionTarget } from "@/components/MessageActionSheet";
import type { ThreadStatus, MessageAttachment, ReactionType } from "@coldsoup/core";

export default function ThreadScreen() {
  const { threadId, title, status: statusParam, groupId } = useLocalSearchParams<{ threadId: string; title: string; status?: string; groupId?: string }>();
  const navigation = useNavigation();
  const flatListRef = useRef<FlatList>(null);
  const [body, setBody] = useState("");
  const [showPollCreate, setShowPollCreate] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [pendingAssets, setPendingAssets] = useState<PickedAsset[]>([]);
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: string; author: string; body: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const cursorRef = useRef(0);
  const presenceRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utils = trpc.useUtils();
  const { markRead } = useUnread();
  const { data: me } = trpc.profile.get.useQuery();
  const { data: members } = trpc.messages.groupMembers.useQuery(
    { groupId: groupId ?? "" },
    { enabled: !!groupId }
  );
  const memberNames = (members ?? []).map((m) => m.display_name);
  const mentionSuggestions =
    mentionQuery !== null
      ? (members ?? []).filter((m) => m.display_name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
      : [];

  const toggleReaction = trpc.messages.toggleReaction.useMutation({
    onSettled: () => utils.messages.list.invalidate({ threadId }),
  });
  const editMessage = trpc.messages.edit.useMutation({
    onSettled: () => utils.messages.list.invalidate({ threadId }),
  });
  const deleteMessage = trpc.messages.deleteMessage.useMutation({
    onSettled: () => utils.messages.list.invalidate({ threadId }),
  });
  const deleteThread = trpc.threads.delete.useMutation({
    onSuccess: () => {
      utils.threads.list.invalidate();
      router.back();
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Could not delete thread";
      if (Platform.OS === "web") { if (typeof window !== "undefined") window.alert(msg); }
      else Alert.alert("Delete failed", msg);
    },
  });

  function confirmDeleteThread() {
    const doDelete = () => deleteThread.mutate({ threadId });
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Delete this thread and all its messages?")) doDelete();
    } else {
      Alert.alert("Delete thread", "This deletes the thread and all its messages. Can't be undone.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  }

  useEffect(() => {
    navigation.setOptions({
      title: title ? title.toLowerCase() : "",
      headerRight: () => (
        <Pressable onPress={confirmDeleteThread} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, paddingHorizontal: 4 })}>
          <Text style={{ fontFamily: "monospace", fontSize: 11, color: "#8A4B1F", letterSpacing: 1, textTransform: "uppercase" }}>Delete</Text>
        </Pressable>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, navigation, threadId]);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.messages.list.useInfiniteQuery(
      { threadId, limit: 50 },
      {
        getNextPageParam: (lastPage) =>
          lastPage.hasMore ? lastPage.messages[0]?.created_at : undefined,
        initialCursor: undefined,
      }
    );

  const sendMessage = trpc.messages.send.useMutation({
    onMutate: async ({ body: msgBody, attachments }) => {
      const tempMsg = {
        id: `temp-${Date.now()}`,
        body: msgBody,
        created_at: new Date().toISOString(),
        edited_at: null,
        is_deleted: false,
        thread_id: threadId,
        user_id: "me",
        attachments: attachments ?? [],
        reply_to_id: null,
        poll_id: null,
        reply_to: null,
        poll: null,
        reactions: [],
        profiles: { id: "me", display_name: "You", avatar_url: null },
      };
      utils.messages.list.setInfiniteData({ threadId, limit: 50 }, (old) => {
        if (!old) return old;
        const newPages = [...old.pages];
        newPages[0] = {
          ...newPages[0],
          messages: [...newPages[0].messages, tempMsg as unknown as (typeof newPages)[0]["messages"][number]],
        };
        return { ...old, pages: newPages };
      });
    },
    onSettled: () => utils.messages.list.invalidate({ threadId }),
  });

  const updateStatus = trpc.threads.updateStatus.useMutation({
    onSettled: () => utils.threads.list.invalidate(),
  });
  const createPoll = trpc.polls.create.useMutation({
    onSuccess: () => {
      setShowPollCreate(false);
      utils.messages.list.invalidate({ threadId });
    },
  });
  const [status, setStatus] = useState<ThreadStatus>(
    statusParam === "URGENT" || statusParam === "DONE" ? statusParam : "OPEN"
  );

  // Server returns each page oldest→newest; the inverted FlatList renders
  // index 0 at the bottom, so flip each page to newest→oldest.
  const allMessages = data?.pages.flatMap((p) => [...p.messages].reverse()) ?? [];

  // Keep this thread marked read while it's open (covers open + incoming messages).
  useEffect(() => {
    markRead(threadId);
  }, [threadId, allMessages.length, markRead]);

  useEffect(() => {
    const channel = supabase
      .channel(`thread-${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` },
        () => utils.messages.list.invalidate({ threadId })
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "threads", filter: `id=eq.${threadId}` },
        (payload) => {
          if (payload.new.status) setStatus(payload.new.status as ThreadStatus);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [threadId]);

  // Typing presence
  useEffect(() => {
    if (!me) return;
    const channel = supabase.channel(`typing:${threadId}`, { config: { presence: { key: me.id } } });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, { display_name: string; typing: boolean }[]>;
        const names = Object.entries(state)
          .filter(([uid, pres]) => uid !== me.id && pres[0]?.typing)
          .map(([, pres]) => pres[0].display_name);
        setTypingUsers(names);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel.track({ display_name: me.display_name, typing: false });
      });
    presenceRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      presenceRef.current = null;
    };
  }, [threadId, me]);

  function markTyping() {
    if (!presenceRef.current || !me) return;
    presenceRef.current.track({ display_name: me.display_name, typing: true });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(stopTyping, 3000);
  }

  function stopTyping() {
    if (typingTimeoutRef.current) { clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = null; }
    if (presenceRef.current && me) presenceRef.current.track({ display_name: me.display_name, typing: false });
  }

  function addAssets(assets: ImagePicker.ImagePickerAsset[]) {
    setPendingAssets((prev) => [
      ...prev,
      ...assets.map((a) => ({ uri: a.uri, fileName: a.fileName, mimeType: a.mimeType })),
    ]);
  }

  async function pickImages() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (!result.canceled) addAssets(result.assets);
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera access needed", "Enable camera access in Settings to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) addAssets(result.assets);
  }

  async function handleSend() {
    const trimmed = body.trim();

    // Edit mode: save the edit instead of sending a new message.
    if (editingId) {
      if (!trimmed) return;
      editMessage.mutate({ messageId: editingId, body: trimmed });
      setEditingId(null);
      setBody("");
      return;
    }

    if ((!trimmed && pendingAssets.length === 0) || sending) return;

    const assets = pendingAssets;
    const replyToId = replyingTo?.id;
    setSending(true);
    try {
      let attachments: MessageAttachment[] = [];
      if (assets.length > 0) {
        attachments = await Promise.all(assets.map(uploadAttachment));
      }
      setBody("");
      setPendingAssets([]);
      setReplyingTo(null);
      stopTyping();
      sendMessage.mutate({ threadId, body: trimmed, attachments, replyToId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Send failed";
      if (Platform.OS === "web") { if (typeof window !== "undefined") window.alert(msg); }
      else Alert.alert("Send failed", msg);
    } finally {
      setSending(false);
    }
  }

  function handleBodyChange(val: string) {
    setBody(val);
    markTyping();
    const cursor = cursorRef.current || val.length;
    const before = val.slice(0, cursor);
    const lastAt = before.lastIndexOf("@");
    if (lastAt >= 0) {
      const partial = before.slice(lastAt + 1);
      if (partial.length <= 40 && !partial.includes("\n") && !partial.includes("@") && !partial.includes(" ")) {
        setMentionQuery(partial);
        return;
      }
    }
    setMentionQuery(null);
  }

  function insertMention(name: string) {
    const cursor = cursorRef.current || body.length;
    const before = body.slice(0, cursor);
    const lastAt = before.lastIndexOf("@");
    const newBody = body.slice(0, lastAt) + "@" + name + " " + body.slice(cursor);
    setBody(newBody);
    setMentionQuery(null);
    cursorRef.current = lastAt + name.length + 2;
  }

  function startEdit(messageId: string, currentBody: string) {
    setReplyingTo(null);
    setEditingId(messageId);
    setBody(currentBody);
  }

  function confirmDelete(messageId: string) {
    const doDelete = () => deleteMessage.mutate({ messageId });
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Delete this message?")) doDelete();
    } else {
      Alert.alert("Delete message", "This can't be undone.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  }

  function handleStatusChange(newStatus: ThreadStatus) {
    const prev = status;
    setStatus(newStatus); // optimistic
    updateStatus.mutate(
      { threadId, status: newStatus },
      {
        onError: (err) => {
          setStatus(prev); // roll back
          const msg = err instanceof Error ? err.message : "Could not update status";
          if (Platform.OS === "web") { if (typeof window !== "undefined") window.alert(msg); }
          else Alert.alert("Update failed", msg);
        },
      }
    );
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F2EFE8", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#1A1A18" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#F2EFE8" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <StatusControl status={status} onChange={handleStatusChange} />

      <FlatList
        ref={flatListRef}
        data={allMessages}
        keyExtractor={(item) => item.id}
        inverted
        contentContainerStyle={{ paddingVertical: 12 }}
        onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={
          isFetchingNextPage ? <ActivityIndicator color="#888780" style={{ padding: 12 }} /> : null
        }
        renderItem={({ item }) => {
          if (item.poll) {
            return <PollCard poll={item.poll} messageId={item.id} />;
          }
          const profile = item.profiles as { id: string; display_name: string; avatar_url: string | null } | null;
          const isMine = !!me && item.user_id === me.id;
          return (
            <MessageBubble
              message={item}
              displayName={profile?.display_name ?? "Unknown"}
              avatarUrl={profile?.avatar_url ?? null}
              mentionNames={memberNames}
              onReactionPress={(type) => toggleReaction.mutate({ messageId: item.id, type })}
              onLongPress={() => setActionTarget({
                id: item.id,
                body: item.body,
                author: profile?.display_name ?? "Unknown",
                isMine,
                isDeleted: !!item.is_deleted,
                reactions: item.reactions,
              })}
            />
          );
        }}
      />

      {status === "DONE" ? (
        <View style={{ paddingVertical: 14, alignItems: "center", borderTopWidth: 1, borderTopColor: "#C7C5BC", backgroundColor: "#ECEBE4" }}>
          <Text style={{ fontFamily: "monospace", fontSize: 11, color: "#5A5954", letterSpacing: 1, textTransform: "uppercase" }}>
            Thread closed — reopen to send messages
          </Text>
        </View>
      ) : (
      <>
      {typingUsers.length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 4, backgroundColor: "#F2EFE8" }}>
          <Text style={{ fontSize: 11, color: "#6B6A65", fontStyle: "italic" }}>
            {typingUsers.length === 1
              ? `${typingUsers[0]} is typing…`
              : `${typingUsers.slice(0, -1).join(", ")} and ${typingUsers[typingUsers.length - 1]} are typing…`}
          </Text>
        </View>
      )}

      <View style={{ borderTopWidth: 1, borderTopColor: "#E2DDD2", backgroundColor: "#F2EFE8" }}>
        {(replyingTo || editingId) && (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingTop: 10, gap: 8 }}>
            <View style={{ flex: 1, borderLeftWidth: 2, borderLeftColor: "#C79B6A", paddingLeft: 8 }}>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: "#6B6A65", letterSpacing: 1, textTransform: "uppercase" }}>
                {editingId ? "Editing" : `Replying to ${replyingTo?.author}`}
              </Text>
              {!editingId && (
                <Text style={{ fontSize: 11, color: "#6B6A65" }} numberOfLines={1}>{replyingTo?.body}</Text>
              )}
            </View>
            <Pressable
              onPress={() => { setReplyingTo(null); setEditingId(null); setBody(""); }}
              style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ fontFamily: "monospace", fontSize: 16, color: "#6B6A65" }}>×</Text>
            </Pressable>
          </View>
        )}
        {pendingAssets.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 12, paddingTop: 10 }}>
            {pendingAssets.map((a, i) => (
              <View key={`${a.uri}-${i}`} style={{ width: 56, height: 56 }}>
                <Image source={{ uri: a.uri }} style={{ width: 56, height: 56, borderWidth: 1, borderColor: "#E2DDD2" }} />
                <Pressable
                  onPress={() => setPendingAssets((prev) => prev.filter((_, idx) => idx !== i))}
                  style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, backgroundColor: "#1A1A18", alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ color: "#F2EFE8", fontSize: 12, fontFamily: "monospace" }}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {mentionSuggestions.length > 0 && (
          <View style={{ borderTopWidth: 1, borderTopColor: "#E2DDD2" }}>
            {mentionSuggestions.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => insertMention(m.display_name)}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}
              >
                <Avatar name={m.display_name} avatarUrl={m.avatar_url} size={24} fontSize={9} />
                <Text style={{ fontSize: 13, color: "#1A1A18" }}>{m.display_name}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={{ paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
          <Pressable
            onPress={() => setShowAttachMenu(true)}
            disabled={sending}
            style={({ pressed }) => ({ width: 44, height: 44, borderWidth: 1, borderColor: "#E2DDD2", backgroundColor: "#F7F4ED", alignItems: "center", justifyContent: "center", opacity: pressed || sending ? 0.4 : 1 })}
          >
            <Text style={{ fontFamily: "monospace", color: "#1A1A18", fontSize: 20, fontWeight: "600" }}>+</Text>
          </Pressable>
          <TextInput
            style={{ flex: 1, borderWidth: 1, borderColor: "#E2DDD2", backgroundColor: "#F7F4ED", paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: "#1A1A18", maxHeight: 120 }}
            placeholder="Message..."
            placeholderTextColor="#6B6A65"
            value={body}
            onChangeText={handleBodyChange}
            onSelectionChange={(e) => { cursorRef.current = e.nativeEvent.selection.start; }}
            multiline
            returnKeyType="default"
          />
          <Pressable
            onPress={handleSend}
            disabled={(!body.trim() && pendingAssets.length === 0) || sending}
            style={({ pressed }) => ({ width: 44, height: 44, backgroundColor: "#1A1A18", alignItems: "center", justifyContent: "center", opacity: pressed || ((!body.trim() && pendingAssets.length === 0) || sending) ? 0.4 : 1 })}
          >
            {sending ? <ActivityIndicator color="#F2EFE8" size="small" /> : <Text style={{ color: "#F2EFE8", fontSize: 18, fontWeight: "600" }}>↑</Text>}
          </Pressable>
        </View>
      </View>
      </>
      )}

      <AttachMenu
        visible={showAttachMenu}
        onClose={() => setShowAttachMenu(false)}
        onPhoto={pickImages}
        onPoll={() => setShowPollCreate(true)}
        onCamera={Platform.OS !== "web" ? takePhoto : undefined}
      />

      <MessageActionSheet
        target={actionTarget}
        onClose={() => setActionTarget(null)}
        onReact={(type) => actionTarget && toggleReaction.mutate({ messageId: actionTarget.id, type })}
        onReply={() => actionTarget && setReplyingTo({
          id: actionTarget.id,
          author: actionTarget.author,
          body: actionTarget.body,
        })}
        onEdit={() => actionTarget && startEdit(actionTarget.id, actionTarget.body)}
        onDelete={() => actionTarget && confirmDelete(actionTarget.id)}
      />

      <PollCreateModal
        visible={showPollCreate}
        isPending={createPoll.isPending}
        onSubmit={(question, options) => createPoll.mutate({ threadId, question, options })}
        onClose={() => setShowPollCreate(false)}
      />
    </KeyboardAvoidingView>
  );
}
