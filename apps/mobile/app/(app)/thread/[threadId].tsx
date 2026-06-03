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
import { useLocalSearchParams, router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Clipboard from "expo-clipboard";
import { trpc } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";
import { uploadAttachment, type PickedAsset } from "@/lib/attachments";
import { useUnread } from "@/lib/unread";
import { getDraft, setDraft, clearDraft } from "@/lib/drafts";
import { getOutbox, setOutbox, type OutboxEntry } from "@/lib/outbox";
import { StatusControl } from "@/components/StatusControl";
import { Avatar } from "@/components/Avatar";
import { MessageBubble } from "@/components/MessageBubble";
import { PollCard } from "@/components/PollCard";
import { PollCreateModal } from "@/components/PollCreateModal";
import { AttachMenu } from "@/components/AttachMenu";
import { VoiceRecordModal } from "@/components/VoiceRecordModal";
import { MessageActionSheet, type ActionTarget } from "@/components/MessageActionSheet";
import { ProfileSheet, type ProfileTarget } from "@/components/ProfileSheet";
import { ThreadDetailsSheet } from "@/components/ThreadDetailsSheet";
import { MessagesSkeleton } from "@/components/Skeleton";
import { useTheme } from "@/lib/theme";
import { useTranslation } from "react-i18next";
import * as haptics from "@/lib/haptics";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc/router";
import type { ThreadStatus, MessageAttachment, ReactionType } from "@coldsoup/core";

type ListMessage = inferRouterOutputs<AppRouter>["messages"]["list"]["messages"][number];

const MENTION_SPECIALS = ["everyone", "here"];

type FailedEntry = OutboxEntry;

export default function ThreadScreen() {
  const { c } = useTheme();
  const { t } = useTranslation();
  const { threadId, title, status: statusParam, groupId } = useLocalSearchParams<{ threadId: string; title: string; status?: string; groupId?: string }>();
  const flatListRef = useRef<FlatList>(null);
  const [body, setBody] = useState("");
  const [showPollCreate, setShowPollCreate] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showVoiceRecord, setShowVoiceRecord] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [pendingAssets, setPendingAssets] = useState<PickedAsset[]>([]);
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: string; author: string; body: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [profileTarget, setProfileTarget] = useState<ProfileTarget | null>(null);
  const [failed, setFailed] = useState<FailedEntry[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const cursorRef = useRef(0);
  const presenceRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outboxLoadedRef = useRef(false);
  const utils = trpc.useUtils();
  const { markRead } = useUnread();
  const { data: me } = trpc.profile.get.useQuery();
  const { data: reads } = trpc.threads.reads.useQuery({ threadId }, { enabled: !!threadId });
  const markReadServer = trpc.threads.markRead.useMutation();
  const { data: threadMeta } = trpc.threads.get.useQuery({ threadId }, { enabled: !!threadId });
  // `title` param is lost on reload — fall back to the fetched thread title.
  const threadTitle = title || (threadMeta as { title?: string } | undefined)?.title || "";
  const { data: members } = trpc.messages.groupMembers.useQuery(
    { groupId: groupId ?? "" },
    { enabled: !!groupId }
  );
  const memberNames = (members ?? []).map((m) => m.display_name);
  const mentionTokens = [...memberNames, ...MENTION_SPECIALS];
  const specialSuggestions =
    mentionQuery !== null
      ? MENTION_SPECIALS.filter((s) => s.includes(mentionQuery.toLowerCase()))
      : [];
  const mentionSuggestions =
    mentionQuery !== null
      ? (members ?? []).filter((m) => m.display_name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
      : [];

  // Optimistic-cache helpers for the message list.
  const snapshotMessages = () => utils.messages.list.getInfiniteData({ threadId, limit: 50 });
  const restoreMessages = (data: ReturnType<typeof snapshotMessages>) => {
    if (data) utils.messages.list.setInfiniteData({ threadId, limit: 50 }, data);
  };
  const patchMessage = (messageId: string, fn: (m: ListMessage) => ListMessage) => {
    utils.messages.list.setInfiniteData({ threadId, limit: 50 }, (old) =>
      old
        ? { ...old, pages: old.pages.map((pg) => ({ ...pg, messages: pg.messages.map((m) => (m.id === messageId ? fn(m) : m)) })) }
        : old
    );
  };

  const toggleReaction = trpc.messages.toggleReaction.useMutation({
    onMutate: async ({ messageId, type }) => {
      await utils.messages.list.cancel({ threadId });
      const prev = snapshotMessages();
      patchMessage(messageId, (m) => ({
        ...m,
        reactions: (m.reactions ?? []).map((r) =>
          r.type === type ? { ...r, userReacted: !r.userReacted, count: r.userReacted ? r.count - 1 : r.count + 1 } : r
        ),
      }));
      return { prev };
    },
    onError: (_e, _v, ctx) => restoreMessages(ctx?.prev),
    onSettled: () => utils.messages.list.invalidate({ threadId }),
  });
  const editMessage = trpc.messages.edit.useMutation({
    onMutate: async ({ messageId, body }) => {
      await utils.messages.list.cancel({ threadId });
      const prev = snapshotMessages();
      patchMessage(messageId, (m) => ({ ...m, body, edited_at: new Date().toISOString() }));
      return { prev };
    },
    onError: (_e, _v, ctx) => restoreMessages(ctx?.prev),
    onSettled: () => utils.messages.list.invalidate({ threadId }),
  });
  const deleteMessage = trpc.messages.deleteMessage.useMutation({
    onMutate: async ({ messageId }) => {
      await utils.messages.list.cancel({ threadId });
      const prev = snapshotMessages();
      patchMessage(messageId, (m) => ({ ...m, is_deleted: true }));
      return { prev };
    },
    onError: (_e, _v, ctx) => restoreMessages(ctx?.prev),
    onSettled: () => utils.messages.list.invalidate({ threadId }),
  });

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
        user_id: me?.id ?? "me",
        attachments: attachments ?? [],
        reply_to_id: null,
        poll_id: null,
        reply_to: null,
        poll: null,
        reactions: [],
        profiles: me
          ? { id: me.id, display_name: me.display_name, avatar_url: me.avatar_url }
          : { id: "me", display_name: "", avatar_url: null },
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
    onError: (_err, variables) => {
      setFailed((prev) => [
        ...prev,
        {
          failId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          body: variables.body ?? "",
          attachments: variables.attachments ?? [],
          replyToId: variables.replyToId,
          created_at: new Date().toISOString(),
        },
      ]);
    },
    onSettled: () => {
      utils.messages.list.invalidate({ threadId });
      // Refresh the group's thread list so its last-message preview updates.
      utils.threads.list.invalidate();
    },
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

  // Failed sends live in local state (the server never accepted them). Render
  // them at the very bottom (front of the inverted list), newest failure first.
  const failedItems = [...failed].reverse().map((f) => ({
    id: `failed-${f.failId}`,
    body: f.body,
    created_at: f.created_at,
    edited_at: null,
    is_deleted: false,
    thread_id: threadId,
    user_id: me?.id ?? "me",
    attachments: f.attachments,
    reply_to_id: f.replyToId ?? null,
    poll_id: null,
    reply_to: null,
    poll: null,
    reactions: [],
    profiles: me
      ? { id: me.id, display_name: me.display_name, avatar_url: me.avatar_url }
      : { id: "me", display_name: "You", avatar_url: null },
  }));
  const listData = [...failedItems, ...allMessages] as typeof allMessages;

  // Read receipts: the most recent of my messages that at least one other member
  // has read, plus the avatars of those readers. allMessages is newest-first.
  let seenMsgId: string | null = null;
  let seenReaders: { id: string; name: string; avatarUrl: string | null }[] = [];
  if (me && reads && reads.length > 0) {
    for (const m of allMessages) {
      if (m.user_id !== me.id) continue;
      const msgTime = new Date(m.created_at).getTime();
      const readers = reads.filter((r) => r.user_id !== me.id && new Date(r.last_read_at).getTime() >= msgTime);
      if (readers.length > 0) {
        seenMsgId = m.id;
        seenReaders = readers.map((r) => ({ id: r.user_id, name: r.display_name, avatarUrl: r.avatar_url }));
        break;
      }
    }
  }

  // Keep this thread marked read while it's open (covers open + incoming messages).
  // Local marker drives unread dots; server marker drives read receipts for others.
  useEffect(() => {
    markRead(threadId);
    markReadServer.mutate({ threadId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, allMessages.length, markRead]);

  // Restore the persisted outbox (failed sends) for this thread.
  useEffect(() => {
    outboxLoadedRef.current = false;
    getOutbox(threadId).then((entries) => {
      setFailed(entries);
      outboxLoadedRef.current = true;
    });
  }, [threadId]);

  // Persist the outbox whenever it changes (after the initial load).
  useEffect(() => {
    if (!outboxLoadedRef.current) return;
    setOutbox(threadId, failed);
  }, [failed, threadId]);

  // Restore any saved draft when the thread opens.
  useEffect(() => {
    let active = true;
    getDraft(threadId).then((d) => {
      if (active && d) setBody(d);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  // Persist the compose draft (debounced). Skip while editing an existing message.
  useEffect(() => {
    if (editingId) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      if (body.trim().length > 0) setDraft(threadId, body);
      else clearDraft(threadId);
    }, 400);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [body, editingId, threadId]);

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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "thread_reads", filter: `thread_id=eq.${threadId}` },
        () => utils.threads.reads.invalidate({ threadId })
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
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (!result.canceled) addAssets(result.assets);
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t("thread.cameraNeededTitle"), t("thread.cameraNeededBody"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) addAssets(result.assets);
  }

  async function pickDocument() {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
      type: [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain",
        "text/csv",
        "application/zip",
      ],
    });
    if (result.canceled) return;
    setPendingAssets((prev) => [
      ...prev,
      ...result.assets.map((a) => ({ uri: a.uri, fileName: a.name, mimeType: a.mimeType })),
    ]);
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
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      clearDraft(threadId);
      haptics.tapLight();
      sendMessage.mutate({ threadId, body: trimmed, attachments, replyToId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("thread.sendFailed");
      if (Platform.OS === "web") { if (typeof window !== "undefined") window.alert(msg); }
      else Alert.alert(t("thread.sendFailedTitle"), msg);
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
      if (typeof window !== "undefined" && window.confirm(t("thread.deleteMessageConfirmWeb"))) doDelete();
    } else {
      Alert.alert(t("thread.deleteMessageTitle"), t("thread.deleteMessageBody"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.delete"), style: "destructive", onPress: doDelete },
      ]);
    }
  }

  function handleCopy() {
    if (!actionTarget) return;
    Clipboard.setStringAsync(actionTarget.body).catch(() => {});
    haptics.tapLight();
  }

  function retryFailed(entry: FailedEntry) {
    setFailed((prev) => prev.filter((f) => f.failId !== entry.failId));
    haptics.tapLight();
    sendMessage.mutate({ threadId, body: entry.body, attachments: entry.attachments, replyToId: entry.replyToId });
  }

  function dismissFailed(failId: string) {
    setFailed((prev) => prev.filter((f) => f.failId !== failId));
  }

  function jumpToMessage(messageId: string) {
    const index = listData.findIndex((m) => m.id === messageId);
    if (index < 0) {
      // Target lives in an older page not loaded yet — pull more; user can tap again.
      if (hasNextPage && !isFetchingNextPage) fetchNextPage();
      return;
    }
    haptics.selection();
    flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    setHighlightId(messageId);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightId(null), 1300);
  }

  function handleStatusChange(newStatus: ThreadStatus) {
    const prev = status;
    if (newStatus === "DONE") haptics.success();
    else if (newStatus === "URGENT") haptics.warning();
    else haptics.selection();
    setStatus(newStatus); // optimistic
    updateStatus.mutate(
      { threadId, status: newStatus },
      {
        onError: (err) => {
          setStatus(prev); // roll back
          const msg = err instanceof Error ? err.message : t("thread.statusUpdateFailed");
          if (Platform.OS === "web") { if (typeof window !== "undefined") window.alert(msg); }
          else Alert.alert(t("thread.statusUpdateFailedTitle"), msg);
        },
      }
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.surface }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back();
            else if (groupId) router.replace({ pathname: "/(app)/group/[groupId]", params: { groupId } });
            else router.replace("/(app)");
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
        >
          <Feather name="chevron-left" size={24} color={c.ink} />
        </Pressable>
        <Pressable
          onPress={() => setShowDetails(true)}
          accessibilityRole="button"
          accessibilityLabel={t("a11y.threadDetails")}
          style={({ pressed }) => ({ flex: 1, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ fontFamily: "monospace", fontSize: 16, fontWeight: "600", color: c.ink, flex: 1 }} numberOfLines={1}>
            # {threadTitle.toLowerCase()}
          </Text>
          <Feather name="chevron-down" size={16} color={c.muted} />
        </Pressable>
      </View>

      <StatusControl status={status} onChange={handleStatusChange} />

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <MessagesSkeleton />
        </View>
      ) : (
      <FlatList
        ref={flatListRef}
        data={listData}
        keyExtractor={(item) => item.id}
        inverted
        contentContainerStyle={listData.length === 0 ? { flexGrow: 1, justifyContent: "center" } : { paddingVertical: 12 }}
        onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
        onEndReachedThreshold={0.3}
        onScrollToIndexFailed={(info) => {
          flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
          setTimeout(() => {
            if (info.index < listData.length) {
              flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
            }
          }, 300);
        }}
        ListHeaderComponent={
          isFetchingNextPage ? <ActivityIndicator color={c.muted2} style={{ padding: 12 }} /> : null
        }
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingVertical: 48, transform: [{ scaleY: -1 }] }}>
            <Text style={{ color: c.muted, fontSize: 14 }}>{t("thread.empty")}</Text>
          </View>
        }
        renderItem={({ item }) => {
          if (item.poll) {
            return <PollCard poll={item.poll} messageId={item.id} />;
          }
          const profile = item.profiles as { id: string; display_name: string; avatar_url: string | null } | null;
          const isMine = !!me && item.user_id === me.id;
          const isPending = item.id.startsWith("temp-");
          const failId = item.id.startsWith("failed-") ? item.id.slice("failed-".length) : null;
          const deliveryStatus = failId ? "failed" : isPending ? "sending" : undefined;
          const interactive = !isPending && !failId;
          return (
            <MessageBubble
              message={item}
              displayName={profile?.display_name ?? "Unknown"}
              avatarUrl={profile?.avatar_url ?? null}
              mentionNames={mentionTokens}
              highlighted={highlightId === item.id}
              onReplyPress={item.reply_to ? () => jumpToMessage(item.reply_to!.id) : undefined}
              onAvatarPress={() => setProfileTarget({ id: item.user_id, name: profile?.display_name ?? "Unknown", avatarUrl: profile?.avatar_url ?? null })}
              seenBy={item.id === seenMsgId ? seenReaders : undefined}
              deliveryStatus={deliveryStatus}
              onRetry={failId ? () => { const e = failed.find((f) => f.failId === failId); if (e) retryFailed(e); } : undefined}
              onDismiss={failId ? () => dismissFailed(failId) : undefined}
              onReactionPress={interactive ? (type) => { haptics.selection(); toggleReaction.mutate({ messageId: item.id, type }); } : undefined}
              onLongPress={interactive ? () => { haptics.tapMedium(); setActionTarget({
                id: item.id,
                body: item.body,
                author: profile?.display_name ?? "Unknown",
                isMine,
                isDeleted: !!item.is_deleted,
                reactions: item.reactions,
              }); } : undefined}
            />
          );
        }}
      />
      )}

      {status === "DONE" ? (
        <View style={{ paddingVertical: 14, alignItems: "center", borderTopWidth: 1, borderTopColor: c.doneBorder, backgroundColor: c.doneBg }}>
          <Text style={{ fontFamily: "monospace", fontSize: 11, color: c.doneText, letterSpacing: 1, textTransform: "uppercase" }}>
            {t("thread.closed")}
          </Text>
        </View>
      ) : (
      <>
      {typingUsers.length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 4, backgroundColor: c.surface }}>
          <Text style={{ fontSize: 11, color: c.muted, fontStyle: "italic" }}>
            {typingUsers.length === 1
              ? t("thread.typingOne", { name: typingUsers[0] })
              : t("thread.typingMany", { names: typingUsers.slice(0, -1).join(", "), last: typingUsers[typingUsers.length - 1] })}
          </Text>
        </View>
      )}

      <View style={{ borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface }}>
        {(replyingTo || editingId) && (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingTop: 10, gap: 8 }}>
            <View style={{ flex: 1, borderLeftWidth: 2, borderLeftColor: c.urgentBorder, paddingLeft: 8 }}>
              <Text style={{ fontFamily: "monospace", fontSize: 10, color: c.muted, letterSpacing: 1, textTransform: "uppercase" }}>
                {editingId ? t("thread.editing") : t("thread.replyingTo", { author: replyingTo?.author })}
              </Text>
              {!editingId && (
                <Text style={{ fontSize: 11, color: c.muted }} numberOfLines={1}>{replyingTo?.body}</Text>
              )}
            </View>
            <Pressable
              onPress={() => { setReplyingTo(null); setEditingId(null); setBody(""); }}
              accessibilityRole="button"
              accessibilityLabel={editingId ? t("a11y.cancelEdit") : t("a11y.cancelReply")}
              style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ fontFamily: "monospace", fontSize: 16, color: c.muted }}>×</Text>
            </Pressable>
          </View>
        )}
        {pendingAssets.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 12, paddingTop: 10 }}>
            {pendingAssets.map((a, i) => {
              const isImg = (a.mimeType ?? "").startsWith("image/");
              const ext = (a.fileName?.split(".").pop() ?? "").toUpperCase().slice(0, 4);
              return (
                <View key={`${a.uri}-${i}`} style={{ width: 56, height: 56 }}>
                  {isImg ? (
                    <Image source={{ uri: a.uri }} style={{ width: 56, height: 56, borderWidth: 1, borderColor: c.border }} />
                  ) : (
                    <View style={{ width: 56, height: 56, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 }}>
                      <Text style={{ fontFamily: "monospace", fontSize: 11, fontWeight: "600", color: c.ink }}>{ext || "FILE"}</Text>
                    </View>
                  )}
                  <Pressable
                    onPress={() => setPendingAssets((prev) => prev.filter((_, idx) => idx !== i))}
                    accessibilityRole="button"
                    accessibilityLabel={t("a11y.removeAttachment")}
                    style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, backgroundColor: c.ink, alignItems: "center", justifyContent: "center" }}
                  >
                    <Text style={{ color: c.surface, fontSize: 12, fontFamily: "monospace" }}>×</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}

        {(specialSuggestions.length + mentionSuggestions.length) > 0 && (
          <View style={{ borderTopWidth: 1, borderTopColor: c.border }}>
            {specialSuggestions.map((s) => (
              <Pressable
                key={s}
                onPress={() => insertMention(s)}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}
              >
                <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center", backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border }}>
                  <Text style={{ fontFamily: "monospace", fontSize: 13, color: c.ink }}>@</Text>
                </View>
                <Text style={{ fontSize: 13, color: c.ink }}>{s}</Text>
              </Pressable>
            ))}
            {mentionSuggestions.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => insertMention(m.display_name)}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}
              >
                <Avatar name={m.display_name} avatarUrl={m.avatar_url} size={24} fontSize={9} />
                <Text style={{ fontSize: 13, color: c.ink }}>{m.display_name}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={{ paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
          <Pressable
            onPress={() => setShowAttachMenu(true)}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel={t("a11y.addAttachment")}
            style={({ pressed }) => ({ width: 44, height: 44, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center", opacity: pressed || sending ? 0.4 : 1 })}
          >
            <Text style={{ fontFamily: "monospace", color: c.ink, fontSize: 20, fontWeight: "600" }}>+</Text>
          </Pressable>
          <TextInput
            style={{ flex: 1, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: c.ink, maxHeight: 120 }}
            placeholder={t("thread.messagePlaceholder")}
            placeholderTextColor={c.muted}
            value={body}
            onChangeText={handleBodyChange}
            onSelectionChange={(e) => { cursorRef.current = e.nativeEvent.selection.start; }}
            multiline
            returnKeyType="default"
          />
          <Pressable
            onPress={handleSend}
            disabled={(!body.trim() && pendingAssets.length === 0) || sending}
            accessibilityRole="button"
            accessibilityLabel={editingId ? t("a11y.saveEdit") : t("a11y.sendMessage")}
            style={({ pressed }) => ({ width: 44, height: 44, backgroundColor: c.ink, alignItems: "center", justifyContent: "center", opacity: pressed || ((!body.trim() && pendingAssets.length === 0) || sending) ? 0.4 : 1 })}
          >
            {sending ? <ActivityIndicator color={c.surface} size="small" /> : <Text style={{ color: c.surface, fontSize: 18, fontWeight: "600" }}>↑</Text>}
          </Pressable>
        </View>
      </View>
      </>
      )}

      <AttachMenu
        visible={showAttachMenu}
        onClose={() => setShowAttachMenu(false)}
        onPhoto={pickImages}
        onFile={pickDocument}
        onVoice={() => setShowVoiceRecord(true)}
        onPoll={() => setShowPollCreate(true)}
        onCamera={Platform.OS !== "web" ? takePhoto : undefined}
      />

      <VoiceRecordModal
        visible={showVoiceRecord}
        onClose={() => setShowVoiceRecord(false)}
        onComplete={(asset) => setPendingAssets((prev) => [...prev, asset])}
      />

      <ProfileSheet target={profileTarget} onClose={() => setProfileTarget(null)} />

      <ThreadDetailsSheet visible={showDetails} threadId={threadId} onClose={() => setShowDetails(false)} />

      <MessageActionSheet
        target={actionTarget}
        onClose={() => setActionTarget(null)}
        onReact={(type) => { if (actionTarget) { haptics.selection(); toggleReaction.mutate({ messageId: actionTarget.id, type }); } }}
        onCopy={handleCopy}
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
