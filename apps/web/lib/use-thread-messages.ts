"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { createClient, setRealtimeAuth } from "@/lib/supabase/client";
import { attachmentTypeFor } from "@/lib/file-utils";
import type { SMeterSummary } from "@/components/smeter";
import type { SystemEvent } from "@/lib/system-event";
import {
  applyReaction,
  findPollIdByOption,
  flatten,
  mergeLatest,
  mergePending,
  nextToDispatch,
  patchMessage,
  patchPoll,
  patchSmeter,
  upsertMessage,
  type DispatchStatus,
  type ThreadPage,
  type ThreadPages,
} from "./thread-cache";
import { REACTION_DEFAULTS, type Attachment, type Me, type Message, type ReplyTo } from "./thread-types";
import { readOutbox, writeOutbox, type OutboxEntry } from "./outbox";
import { uploadAttachments } from "./upload-attachments";
import { registerLocalPreview, releaseLocalPreviews } from "./local-previews";

type Member = { id: string; display_name: string; avatar_url: string | null };

export type ThreadCallbacks = {
  onIncoming?: (msg: Message) => void;
  onDelivered?: (msg: Message) => void;
  onLovedMine?: (messageId: string) => void;
  onLevelUp?: (up: { level: 2 | 3; shiny: boolean }) => void;
};

type PendingEntry = {
  key: string; // == clientId
  clientId: string;
  createdAt: string;
  body: string;
  replyTo: ReplyTo | null;
  replyToId?: string;
  replyToAttachmentUrl?: string | null;
  files: File[];
  previews: Record<string, string>; // file name -> object URL
  attachments: Attachment[];
  missingFiles: string[];
  status: DispatchStatus;
  progress: number;
  permanent?: boolean;
};

export type SendInput = {
  body: string;
  files: File[];
  replyTo: ReplyTo | null;
  replyToAttachmentUrl?: string | null;
};

type ReactionType = "👍" | "👎" | "❤️" | "🎉" | "😂" | "❓";

const BACKFILL_AFTER_MS = 30_000;
const ROW_ERROR_MS = 3000;

function withDefaults(m: Partial<Message> & { id: string }): Message {
  return {
    body: "",
    created_at: new Date().toISOString(),
    edited_at: null,
    is_deleted: false,
    user_id: null,
    thread_id: "",
    client_id: null,
    poll_id: null,
    poll: null,
    smeter_id: null,
    smeter: null,
    system_event: null,
    attachments: [],
    reactions: REACTION_DEFAULTS.map((r) => ({ ...r })),
    reply_to_id: null,
    reply_to: null,
    profiles: null,
    ...m,
  } as Message;
}

function fromOutbox(e: OutboxEntry): PendingEntry {
  return {
    key: e.clientId,
    clientId: e.clientId,
    createdAt: e.createdAt,
    body: e.body,
    replyTo: e.replyTo,
    replyToId: e.replyToId,
    replyToAttachmentUrl: e.replyToAttachmentUrl ?? null,
    files: [],
    previews: {},
    attachments: e.attachments,
    missingFiles: e.missingFiles,
    status: "failed",
    progress: 0,
    permanent: e.permanent,
  };
}

function toOutbox(p: PendingEntry): OutboxEntry {
  const uploaded = new Set(p.attachments.map((a) => a.name));
  return {
    clientId: p.clientId,
    createdAt: p.createdAt,
    body: p.body,
    replyTo: p.replyTo,
    replyToId: p.replyToId,
    replyToAttachmentUrl: p.replyToAttachmentUrl ?? null,
    attachments: p.attachments,
    missingFiles: [
      ...p.missingFiles,
      ...p.files.map((f) => f.name).filter((n) => !uploaded.has(n) && !p.missingFiles.includes(n)),
    ],
    permanent: p.permanent,
  };
}

function httpStatusOf(err: unknown): number | undefined {
  return (err as { data?: { httpStatus?: number } } | null)?.data?.httpStatus;
}

export function useThreadMessages({
  threadId,
  groupId,
  me,
  members,
  callbacks,
}: {
  threadId: string;
  groupId: string;
  me: Me;
  members: Member[] | undefined;
  callbacks: ThreadCallbacks;
}) {
  const utils = trpc.useUtils();
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const membersRef = useRef(members);
  membersRef.current = members;
  const meRef = useRef(me);
  meRef.current = me;

  // ---- server cache -------------------------------------------------------

  const query = trpc.messages.list.useInfiniteQuery(
    { threadId },
    {
      getNextPageParam: (last) =>
        last.hasMore ? (last.messages[0]?.created_at as string | undefined) : undefined,
      // Kept current by realtime + backfill; never refetch every loaded page.
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    },
  );
  const data = query.data as unknown as ThreadPages<Message> | undefined;

  const setData = useCallback(
    (fn: (d: ThreadPages<Message>) => ThreadPages<Message>) => {
      utils.messages.list.setInfiniteData({ threadId }, (old) =>
        old ? (fn(old as unknown as ThreadPages<Message>) as unknown as typeof old) : old,
      );
    },
    [utils, threadId],
  );

  const getData = useCallback(
    () => utils.messages.list.getInfiniteData({ threadId }) as unknown as ThreadPages<Message> | undefined,
    [utils, threadId],
  );

  const backfill = useCallback(async () => {
    try {
      const fresh = (await utils.client.messages.list.query({ threadId })) as unknown as ThreadPage<Message>;
      utils.messages.list.setInfiniteData({ threadId }, (old) =>
        mergeLatest(old as unknown as ThreadPages<Message> | undefined, fresh) as unknown as typeof old,
      );
    } catch {
      // Next reconnect / foreground / mount retries.
    }
  }, [utils, threadId]);

  // Mount (or first restore from persistence): catch up if the cache is old.
  const mountBackfillDone = useRef(false);
  useEffect(() => {
    if (mountBackfillDone.current || !query.data) return;
    mountBackfillDone.current = true;
    if (Date.now() - query.dataUpdatedAt > BACKFILL_AFTER_MS) void backfill();
  }, [query.data, query.dataUpdatedAt, backfill]);

  // ---- row hints for failed optimistic actions -----------------------------

  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const flagRow = useCallback((messageId: string, text: string) => {
    setRowErrors((prev) => ({ ...prev, [messageId]: text }));
    setTimeout(() => {
      setRowErrors((prev) => {
        if (prev[messageId] !== text) return prev;
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
    }, ROW_ERROR_MS);
  }, []);

  // ---- pending sends --------------------------------------------------------

  const [pending, setPending] = useState<PendingEntry[]>(() => readOutbox(threadId).map(fromOutbox));
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const updateEntry = useCallback((key: string, patch: Partial<PendingEntry>) => {
    setPending((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }, []);

  // Everything not yet delivered is persisted; after a reload it comes back as failed.
  useEffect(() => {
    writeOutbox(threadId, pending.map(toOutbox));
  }, [pending, threadId]);

  // Revoke object URLs when the thread closes.
  useEffect(
    () => () => releaseLocalPreviews(pendingRef.current.flatMap((p) => Object.values(p.previews))),
    [],
  );

  const startUpload = useCallback(
    (entry: PendingEntry) => {
      const uploadedNames = new Set(entry.attachments.map((a) => a.name));
      const toUpload = entry.files.filter((f) => !uploadedNames.has(f.name));
      if (toUpload.length === 0) {
        updateEntry(entry.key, { status: "ready" });
        return;
      }
      updateEntry(entry.key, { status: "uploading", progress: 0 });
      uploadAttachments(toUpload, (progress) => updateEntry(entry.key, { progress }))
        .then((uploaded) => {
          setPending((prev) =>
            prev.map((p) =>
              p.key === entry.key
                ? { ...p, attachments: [...p.attachments, ...uploaded], status: "ready", progress: 1 }
                : p,
            ),
          );
        })
        .catch(() => updateEntry(entry.key, { status: "failed" }));
    },
    [updateEntry],
  );

  const send = useCallback(
    (input: SendInput) => {
      const clientId = crypto.randomUUID();
      const previews: Record<string, string> = {};
      for (const f of input.files) previews[f.name] = URL.createObjectURL(f);
      const entry: PendingEntry = {
        key: clientId,
        clientId,
        createdAt: new Date().toISOString(),
        body: input.body,
        replyTo: input.replyTo,
        replyToId: input.replyTo?.id,
        replyToAttachmentUrl: input.replyToAttachmentUrl ?? null,
        files: input.files,
        previews,
        attachments: [],
        missingFiles: [],
        status: input.files.length > 0 ? "uploading" : "ready",
        progress: 0,
      };
      setPending((prev) => [...prev, entry]);
      if (input.files.length > 0) startUpload(entry);
      return clientId;
    },
    [startUpload],
  );

  // FIFO dispatch: one messages.send in flight, in submission order.
  const inFlight = useRef<string | null>(null);
  useEffect(() => {
    if (inFlight.current) return;
    const next = nextToDispatch(pending);
    if (!next) return;
    inFlight.current = next.key;
    updateEntry(next.key, { status: "dispatching" });
    utils.client.messages.send
      .mutate({
        threadId,
        body: next.body,
        attachments: next.attachments,
        replyToId: next.replyToId,
        replyToAttachmentUrl: next.replyToAttachmentUrl ?? undefined,
        clientId: next.clientId,
      })
      .then((res) => {
        const server = withDefaults(res as unknown as Message);
        for (const att of server.attachments) {
          const local = next.previews[att.name];
          if (local) registerLocalPreview(att.url, local);
        }
        if (getData()) setData((d) => upsertMessage(d, server));
        else void utils.messages.list.invalidate({ threadId });
        setPending((prev) => prev.filter((p) => p.key !== next.key));
        callbacksRef.current.onDelivered?.(server);
        const up = (res as unknown as { blobLevelUp?: { level: 2 | 3; shiny: boolean } | null }).blobLevelUp;
        if (up) callbacksRef.current.onLevelUp?.(up);
        void utils.threads.list.invalidate({ groupId });
      })
      .catch((err) => {
        const status = httpStatusOf(err);
        updateEntry(next.key, {
          status: "failed",
          permanent: status !== undefined && status >= 400 && status < 500,
        });
      })
      .finally(() => {
        inFlight.current = null;
        // Re-run the dispatcher for the next entry.
        setPending((prev) => [...prev]);
      });
  }, [pending, threadId, groupId, utils, updateEntry, setData, getData]);

  const retry = useCallback(
    (key: string) => {
      const entry = pendingRef.current.find((p) => p.key === key);
      if (!entry || entry.status !== "failed") return;
      const uploadedNames = new Set(entry.attachments.map((a) => a.name));
      const stillMissing = entry.missingFiles.filter((n) => !uploadedNames.has(n));
      const inMemory = new Set(entry.files.map((f) => f.name));
      if (stillMissing.some((n) => !inMemory.has(n))) return; // files lost after reload
      updateEntry(key, { permanent: false, missingFiles: [] });
      if (entry.files.some((f) => !uploadedNames.has(f.name))) startUpload(entry);
      else updateEntry(key, { status: "ready" });
    },
    [startUpload, updateEntry],
  );

  const discard = useCallback((key: string) => {
    const entry = pendingRef.current.find((p) => p.key === key);
    if (entry) releaseLocalPreviews(Object.values(entry.previews));
    setPending((prev) => prev.filter((p) => p.key !== key));
  }, []);

  // Existing behaviour: flush retryable failures when connectivity returns.
  useEffect(() => {
    const onOnline = () => {
      for (const p of pendingRef.current) {
        if (p.status === "failed" && !p.permanent) retry(p.key);
      }
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [retry]);

  const pendingMessages = useMemo<Message[]>(
    () =>
      pending.map((p) => {
        const uploadedNames = new Set(p.attachments.map((a) => a.name));
        const localAttachments: Attachment[] = p.files
          .filter((f) => !uploadedNames.has(f.name))
          .map((f) => ({ url: p.previews[f.name] ?? "", type: attachmentTypeFor(f), name: f.name }));
        const uploadedWithPreview = p.attachments.map((a) =>
          p.previews[a.name] ? { ...a, url: p.previews[a.name] } : a,
        );
        return withDefaults({
          id: `pending-${p.clientId}`,
          body: p.body,
          created_at: p.createdAt,
          user_id: me.id,
          thread_id: threadId,
          client_id: p.clientId,
          attachments: [...uploadedWithPreview, ...localAttachments],
          reply_to_id: p.replyToId ?? null,
          reply_to: p.replyTo,
          profiles: { id: me.id, display_name: me.display_name, avatar_url: me.avatar_url },
          delivery_status: p.status === "failed" ? "failed" : "sending",
          fail_id: p.key,
          upload_progress: p.status === "uploading" ? p.progress : undefined,
          missing_files: p.missingFiles.length > 0 ? p.missingFiles : undefined,
        });
      }),
    [pending, me, threadId],
  );

  const serverMessages = useMemo(() => flatten(data), [data]);
  const messages = useMemo(
    () => mergePending(serverMessages, pendingMessages),
    [serverMessages, pendingMessages],
  );

  // ---- realtime --------------------------------------------------------------

  const messageIdsRef = useRef<Set<string>>(new Set());
  messageIdsRef.current = new Set(serverMessages.map((m) => m.id));

  const pollTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const refreshPoll = useCallback(
    (pollId: string) => {
      const timers = pollTimers.current;
      const existing = timers.get(pollId);
      if (existing) clearTimeout(existing);
      timers.set(
        pollId,
        setTimeout(async () => {
          timers.delete(pollId);
          try {
            const map = await utils.polls.getMany.fetch({ pollIds: [pollId] }, { staleTime: 0 });
            if (map[pollId]) setData((d) => patchPoll(d, pollId, map[pollId] as unknown as Message["poll"]));
          } catch {}
        }, 300),
      );
    },
    [utils, setData],
  );

  const refreshSmeter = useCallback(
    async (smeterId: string) => {
      try {
        const map = await utils.smeters.getMany.fetch({ smeterIds: [smeterId] }, { staleTime: 0 });
        if (map[smeterId]) setData((d) => patchSmeter(d, smeterId, map[smeterId] as unknown as SMeterSummary));
      } catch {}
    },
    [utils, setData],
  );

  const hasSubscribedRef = useRef(false);
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let reactions: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    const timers = pollTimers.current;

    (async () => {
      // The socket must carry the user JWT before joining, otherwise
      // postgres_changes joins as anon and RLS filters every event.
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (token) setRealtimeAuth(supabase, token);
      if (cancelled) return;

      channel = supabase
        .channel(`messages:thread:${threadId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` },
          async (payload) => {
            const row = payload.new as Message & { reply_to_attachment_url: string | null };
            if (row.thread_id !== threadId) return;
            if (row.system_event?.kind === "blob_evolved") void utils.profile.blobs.invalidate();

            let profile: Member | null = membersRef.current?.find((m) => m.id === row.user_id) ?? null;
            if (!profile && row.user_id) {
              const { data: p } = await supabase
                .from("profiles")
                .select("id, display_name, avatar_url")
                .eq("id", row.user_id)
                .single();
              profile = (p as Member | null) ?? null;
            }

            let poll: Message["poll"] = null;
            if (row.poll_id) {
              const map = await utils.polls.getMany.fetch({ pollIds: [row.poll_id] }, { staleTime: 0 });
              poll = (map[row.poll_id] as unknown as Message["poll"]) ?? null;
            }
            let smeter: SMeterSummary | null = null;
            if (row.smeter_id) {
              const map = await utils.smeters.getMany.fetch({ smeterIds: [row.smeter_id] }, { staleTime: 0 });
              smeter = (map[row.smeter_id] as SMeterSummary | undefined) ?? null;
            }

            // Reply quote from the cache when the target is loaded.
            let reply_to: ReplyTo | null = null;
            let needsReplyFetch = false;
            if (row.reply_to_id) {
              const target = flatten(getData()).find((m) => m.id === row.reply_to_id);
              if (target) {
                reply_to = {
                  id: target.id,
                  body: target.is_deleted ? "" : target.body.slice(0, 120),
                  author_name: target.profiles?.display_name ?? "Unknown",
                  image_url: row.reply_to_attachment_url ?? null,
                };
              } else {
                needsReplyFetch = true;
              }
            }

            const message = withDefaults({
              ...row,
              is_deleted: row.is_deleted ?? false,
              poll,
              smeter,
              system_event: (row.system_event ?? null) as SystemEvent | null,
              profiles: profile,
              reply_to,
            });
            const alreadyKnown = messageIdsRef.current.has(message.id);
            setData((d) => upsertMessage(d, message));
            if (!alreadyKnown && row.user_id !== meRef.current.id) callbacksRef.current.onIncoming?.(message);

            if (needsReplyFetch && row.reply_to_id) {
              const { data: target } = await supabase
                .from("messages")
                .select("id, body, profiles(display_name)")
                .eq("id", row.reply_to_id)
                .single();
              if (target) {
                setData((d) =>
                  patchMessage(d, message.id, (m) => ({
                    ...m,
                    reply_to: {
                      id: target.id as string,
                      body: ((target.body as string) ?? "").slice(0, 120),
                      author_name:
                        (target.profiles as unknown as { display_name: string } | null)?.display_name ?? "Unknown",
                      image_url: row.reply_to_attachment_url ?? null,
                    },
                  })),
                );
              }
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` },
          (payload) => {
            const u = payload.new as { id: string; body: string; edited_at: string | null; is_deleted: boolean; thread_id: string };
            if (u.thread_id !== threadId) return;
            setData((d) =>
              patchMessage(d, u.id, (m) => ({
                ...m,
                body: u.body,
                edited_at: u.edited_at ?? null,
                is_deleted: u.is_deleted ?? false,
              })),
            );
          },
        )
        .on("postgres_changes", { event: "*", schema: "public", table: "poll_votes" }, (payload) => {
          const row = (payload.new && "poll_option_id" in payload.new ? payload.new : payload.old) as { poll_option_id?: string } | null;
          const pollId = row?.poll_option_id ? findPollIdByOption(getData(), row.poll_option_id) : null;
          if (pollId) refreshPoll(pollId);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "poll_options" }, (payload) => {
          const row = (payload.new && "poll_id" in payload.new ? payload.new : payload.old) as { poll_id?: string } | null;
          if (row?.poll_id && flatten(getData()).some((m) => m.poll_id === row.poll_id)) refreshPoll(row.poll_id);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "smeter_responses" }, (payload) => {
          const row = (payload.new && "smeter_id" in payload.new ? payload.new : payload.old) as { smeter_id?: string } | null;
          if (row?.smeter_id && flatten(getData()).some((m) => m.smeter_id === row.smeter_id)) void refreshSmeter(row.smeter_id);
        })
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "thread_reads", filter: `thread_id=eq.${threadId}` },
          () => void utils.threads.reads.invalidate({ threadId }),
        )
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          // Reconnect: catch up on anything missed while the socket was down.
          if (hasSubscribedRef.current) {
            void backfill();
            void utils.threads.reads.invalidate({ threadId });
          }
          hasSubscribedRef.current = true;
        });

      reactions = supabase
        .channel(`reactions:${threadId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, (payload) => {
          const row = (payload.new && "message_id" in payload.new ? payload.new : payload.old) as {
            message_id?: string;
            user_id?: string;
            type?: string;
          } | null;
          if (!row?.message_id || !row.user_id || !row.type) return;
          if (!messageIdsRef.current.has(row.message_id)) return;
          const meId = meRef.current.id;
          if (row.user_id === meId) return; // own reactions are optimistic already
          const op = payload.eventType === "DELETE" ? "remove" : "add";
          const userName = membersRef.current?.find((m) => m.id === row.user_id)?.display_name ?? "Someone";
          const messageId = row.message_id;
          const type = row.type;
          const userId = row.user_id;
          setData((d) => applyReaction(d, { messageId, type, userId, userName, op, meId }));
          if (op === "add" && type === "❤️") {
            const target = flatten(getData()).find((m) => m.id === messageId);
            if (target?.user_id === meId) callbacksRef.current.onLovedMine?.(messageId);
          }
        })
        .subscribe();
    })();

    // A backgrounded tab can miss realtime events.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void backfill();
        void utils.threads.reads.invalidate({ threadId });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      hasSubscribedRef.current = false;
      if (channel) supabase.removeChannel(channel);
      if (reactions) supabase.removeChannel(reactions);
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, [threadId, utils, setData, getData, backfill, refreshPoll, refreshSmeter]);

  // ---- optimistic mutations ---------------------------------------------------

  const toggleReaction = useCallback(
    (messageId: string, type: string) => {
      const current = flatten(getData()).find((m) => m.id === messageId);
      const r = current?.reactions.find((x) => x.type === type);
      const op = r?.userReacted ? "remove" : "add";
      const who = { userId: me.id, userName: me.display_name, meId: me.id };
      setData((d) => applyReaction(d, { messageId, type, ...who, op }));
      utils.client.messages.toggleReaction
        .mutate({ messageId, type: type as ReactionType })
        .catch(() => {
          setData((d) => applyReaction(d, { messageId, type, ...who, op: op === "add" ? "remove" : "add" }));
          flagRow(messageId, "couldn't react");
        });
    },
    [getData, setData, utils, me, flagRow],
  );

  const deleteMessage = useCallback(
    (messageId: string) => {
      const snapshot = flatten(getData()).find((m) => m.id === messageId);
      if (!snapshot) return;
      setData((d) => patchMessage(d, messageId, (m) => ({ ...m, is_deleted: true })));
      utils.client.messages.deleteMessage.mutate({ messageId }).catch(() => {
        setData((d) => patchMessage(d, messageId, () => snapshot));
        flagRow(messageId, "couldn't delete");
      });
    },
    [getData, setData, utils, flagRow],
  );

  const editMessage = useCallback(
    (messageId: string, body: string) => {
      const snapshot = flatten(getData()).find((m) => m.id === messageId);
      if (!snapshot) return;
      setData((d) =>
        patchMessage(d, messageId, (m) => ({ ...m, body, edited_at: new Date().toISOString() })),
      );
      utils.client.messages.edit
        .mutate({ messageId, body })
        .then((updated) => setData((d) => patchMessage(d, messageId, (m) => ({ ...m, edited_at: updated.edited_at }))))
        .catch(() => {
          setData((d) => patchMessage(d, messageId, () => snapshot));
          flagRow(messageId, "edit failed");
        });
    },
    [getData, setData, utils, flagRow],
  );

  const addServerMessage = useCallback(
    (msg: Partial<Message> & { id: string }) => {
      if (getData()) setData((d) => upsertMessage(d, withDefaults(msg)));
    },
    [getData, setData],
  );

  return {
    messages,
    isLoading: query.isPending && !query.data,
    hasMore: !!query.hasNextPage,
    isLoadingOlder: query.isFetchingNextPage,
    olderError: query.isFetchNextPageError,
    loadOlder: query.fetchNextPage,
    pageCount: data?.pages.length ?? 0,
    send,
    retry,
    discard,
    toggleReaction,
    deleteMessage,
    editMessage,
    addServerMessage,
    refreshPoll,
    rowErrors,
  };
}
