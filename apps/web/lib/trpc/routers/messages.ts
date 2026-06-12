import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { createAdminClient } from "@/lib/supabase/admin";

// Run background work after the response flushes without Vercel freezing the
// function mid-flight. Mirrors @vercel/functions' waitUntil by reading Vercel's
// request-context symbol; off-Vercel (dev / self-host) the Node process is
// long-lived, so a plain fire-and-forget is safe.
function waitUntil(promise: Promise<unknown>) {
  const ctx = (globalThis as Record<symbol, unknown>)[
    Symbol.for("@vercel/request-context")
  ] as { get?: () => { waitUntil?: (p: Promise<unknown>) => void } } | undefined;
  const fn = ctx?.get?.()?.waitUntil;
  if (fn) fn(promise);
  else void promise.catch(() => {});
}

const ALLOWED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp",
  "mp3", "wav", "ogg", "m4a", "aac", "flac",
  "mp4", "mov", "m4v", "webm",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "zip",
]);

// Matches: /storage/v1/object/public/attachments/<uuid>/<filename>.<ext>
const ATTACHMENT_PATH_RE = new RegExp(
  `^/storage/v1/object/public/attachments/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+\\.([a-z0-9]+)$`,
  "i"
);

function validateAttachmentUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    const supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname;
    if (hostname !== supabaseHost) return false;
    const match = ATTACHMENT_PATH_RE.exec(pathname);
    if (!match) return false;
    const ext = match[1].toLowerCase();
    return ALLOWED_EXTENSIONS.has(ext);
  } catch {
    return false;
  }
}

const REACTION_TYPES = ["👍", "👎", "❤️", "🎉", "😂", "❓"] as const;

// Describe a body-less message for notification/preview text by its first
// attachment, matching the thread-list media labels.
function describeAttachments(atts: { type: string; name?: string }[]): string {
  const a = atts[0];
  if (!a) return "New message";
  switch (a.type) {
    case "image":
      return atts.length > 1 ? `${atts.length} photos` : "Photo";
    case "video":
      return "Video";
    case "audio":
      return "Voice message";
    default:
      return a.name || "Attachment";
  }
}

export const messagesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        threadId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { supabase, profile } = ctx;

      const { data: thread } = await supabase
        .from("threads")
        .select("group_id")
        .eq("id", input.threadId)
        .single();

      if (!thread) throw new TRPCError({ code: "NOT_FOUND" });

      const { data: membership } = await supabase
        .from("group_memberships")
        .select("id")
        .eq("group_id", thread.group_id)
        .eq("user_id", profile.id)
        .single();

      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      const admin = createAdminClient();
      let query = admin
        .from("messages")
        .select("id, body, created_at, edited_at, is_deleted, thread_id, user_id, client_id, attachments, reply_to_id, poll_id, smeter_id, system_event, profiles(id, display_name, avatar_url)")
        .eq("thread_id", input.threadId)
        .order("created_at", { ascending: false })
        .limit(input.limit);

      if (input.cursor) {
        query = query.lt("created_at", input.cursor);
      }

      const { data, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      const rows = data ?? [];
      const messageIds = rows.map((m) => m.id);

      const reactionRows =
        messageIds.length > 0
          ? ((await admin
              .from("message_reactions")
              .select("message_id, user_id, type, profiles(display_name)")
              .in("message_id", messageIds)).data ?? [])
          : [];

      // Fetch reply_to info for messages that are replies
      const replyToIdSet = new Set(rows.filter((m) => m.reply_to_id).map((m) => m.reply_to_id!));
      const replyToIds = Array.from(replyToIdSet);
      const replyToData =
        replyToIds.length > 0
          ? ((await admin
              .from("messages")
              .select("id, body, profiles(display_name)")
              .in("id", replyToIds)).data ?? [])
          : [];

      const replyToMap = new Map(
        replyToData.map((m) => [
          m.id,
          {
            id: m.id,
            body: (m.body as string).slice(0, 120),
            author_name:
              (m.profiles as unknown as { display_name: string } | null)?.display_name ?? "Unknown",
          },
        ])
      );

      // Fetch poll data for any poll messages
      const pollIds = Array.from(new Set(rows.filter((m) => m.poll_id).map((m) => m.poll_id!)));
      type VoterInfo = { id: string; display_name: string; avatar_url: string | null };
      const pollDataMap = new Map<string, { id: string; question: string; options: { id: string; text: string; vote_count: number; user_voted: boolean; voters: VoterInfo[] }[] }>();

      if (pollIds.length > 0) {
        const [{ data: pollRows }, { data: optionRows }] = await Promise.all([
          admin.from("polls").select("id, question").in("id", pollIds),
          admin.from("poll_options").select("id, poll_id, text").in("poll_id", pollIds).order("created_at"),
        ]);
        const optionIds = (optionRows ?? []).map((o) => o.id);
        const { data: voteRows } = optionIds.length > 0
          ? await admin.from("poll_votes").select("poll_option_id, user_id, profiles(id, display_name, avatar_url)").in("poll_option_id", optionIds)
          : { data: [] as { poll_option_id: string; user_id: string; profiles: unknown }[] };

        for (const poll of (pollRows ?? [])) {
          const options = (optionRows ?? [])
            .filter((o) => o.poll_id === poll.id)
            .map((o) => {
              const votes = (voteRows ?? []).filter((v) => v.poll_option_id === o.id);
              return {
                id: o.id,
                text: o.text,
                vote_count: votes.length,
                user_voted: votes.some((v) => v.user_id === profile.id),
                voters: votes.map((v) => {
                  const p = v.profiles as { id: string; display_name: string; avatar_url: string | null } | null;
                  return { id: v.user_id, display_name: p?.display_name ?? "Unknown", avatar_url: p?.avatar_url ?? null };
                }),
              };
            });
          pollDataMap.set(poll.id, { id: poll.id, question: poll.question, options });
        }
      }

      // Fetch a lightweight summary for any S-meter messages. Aggregate scores
      // stay out of the list — they unlock only via smeters.get once everyone
      // has voted. Every message here is in the same thread, hence same group.
      const smeterIds = Array.from(new Set(rows.filter((m) => m.smeter_id).map((m) => m.smeter_id!)));
      type SMeterSummary = {
        id: string;
        mode: "weekly" | "dates";
        title: string | null;
        customDates: string[] | null;
        votedCount: number;
        memberCount: number;
        allVoted: boolean;
        isParticipant: boolean;
      };
      const smeterDataMap = new Map<string, SMeterSummary>();

      if (smeterIds.length > 0) {
        const [{ data: groupMemberRows }, { data: smeterRows }, { data: smeterResponseRows }] = await Promise.all([
          admin.from("group_memberships").select("user_id").eq("group_id", thread.group_id),
          admin.from("smeters").select("id, mode, custom_dates, title, participant_ids").in("id", smeterIds),
          admin.from("smeter_responses").select("smeter_id, user_id").in("smeter_id", smeterIds),
        ]);
        const allMemberIds = (groupMemberRows ?? []).map((m) => m.user_id as string);
        for (const s of smeterRows ?? []) {
          // null participant_ids = everyone in the group.
          const participants = (s.participant_ids as string[] | null) ?? allMemberIds;
          const participantSet = new Set(participants);
          const voters = new Set(
            (smeterResponseRows ?? [])
              .filter((r) => r.smeter_id === s.id && participantSet.has(r.user_id as string))
              .map((r) => r.user_id as string)
          );
          const members = participants.length;
          smeterDataMap.set(s.id as string, {
            id: s.id as string,
            mode: (s.mode as "weekly" | "dates") ?? "weekly",
            title: (s.title as string | null) ?? null,
            customDates: (s.custom_dates as string[] | null) ?? null,
            votedCount: voters.size,
            memberCount: members,
            allVoted: members > 0 && voters.size === members,
            isParticipant: participantSet.has(profile.id),
          });
        }
      }

      const messages = [...rows].reverse().map((m) => ({
        ...m,
        reply_to: m.reply_to_id ? (replyToMap.get(m.reply_to_id) ?? null) : null,
        poll: (m.poll_id ? (pollDataMap.get(m.poll_id) ?? null) : null),
        smeter: (m.smeter_id ? (smeterDataMap.get(m.smeter_id) ?? null) : null),
        system_event: (m.system_event as unknown ?? null),
        reactions: REACTION_TYPES.map((type) => {
          const users = reactionRows.filter((r) => r.message_id === m.id && r.type === type);
          return {
            type,
            count: users.length,
            userReacted: users.some((r) => r.user_id === profile.id),
            users: users.map((r) => (r.profiles as unknown as { display_name: string } | null)?.display_name ?? "Unknown"),
          };
        }),
      }));

      return { messages, hasMore: rows.length === input.limit };
    }),

  send: protectedProcedure
    .input(
      z
        .object({
          threadId: z.string().uuid(),
          body: z.string().max(10000).default(""),
          attachments: z
            .array(
              z.object({
                url: z.string().url(),
                type: z.enum(["image", "audio", "video", "file"]),
                name: z.string(),
              })
            )
            .default([]),
          replyToId: z.string().uuid().optional(),
          clientId: z.string().max(64).optional(),
        })
        .refine((d) => d.body.trim().length > 0 || d.attachments.length > 0, {
          message: "Message must have text or attachments",
        })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, profile } = ctx;
      const admin = createAdminClient();

      const { data: thread } = await supabase
        .from("threads")
        .select("group_id")
        .eq("id", input.threadId)
        .single();

      if (!thread) throw new TRPCError({ code: "NOT_FOUND" });

      const { data: membership } = await supabase
        .from("group_memberships")
        .select("id")
        .eq("group_id", thread.group_id)
        .eq("user_id", profile.id)
        .single();

      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      // Idempotent retry: if this client_id already landed (response lost,
      // client resent), return the existing row instead of inserting a dupe.
      if (input.clientId) {
        const { data: existing } = await admin
          .from("messages")
          .select("id, body, created_at, edited_at, is_deleted, thread_id, user_id, client_id, attachments, reply_to_id, poll_id, smeter_id, system_event, profiles(id, display_name, avatar_url)")
          .eq("thread_id", input.threadId)
          .eq("client_id", input.clientId)
          .eq("user_id", profile.id)
          .maybeSingle();
        if (existing) {
          return {
            ...existing,
            reply_to: null,
            poll: null,
            smeter: null,
            system_event: null,
            reactions: REACTION_TYPES.map((type) => ({ type, count: 0, userReacted: false, users: [] })),
          };
        }
      }

      for (const att of input.attachments) {
        if (!validateAttachmentUrl(att.url)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid attachment URL: ${att.name}` });
        }
      }

      const [{ data, error }] = await Promise.all([
        admin
          .from("messages")
          .insert({
            thread_id: input.threadId,
            user_id: profile.id,
            body: input.body,
            attachments: input.attachments,
            reply_to_id: input.replyToId ?? null,
            client_id: input.clientId ?? null,
          })
          .select("id, body, created_at, edited_at, is_deleted, thread_id, user_id, client_id, attachments, reply_to_id, poll_id, smeter_id, system_event, profiles(id, display_name, avatar_url)")
          .single(),
        admin
          .from("threads")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", input.threadId),
      ]);

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      let reply_to = null;
      if (input.replyToId) {
        const { data: replyMsg } = await admin
          .from("messages")
          .select("id, body, profiles(display_name)")
          .eq("id", input.replyToId)
          .single();
        if (replyMsg) {
          reply_to = {
            id: replyMsg.id,
            body: (replyMsg.body as string).slice(0, 120),
            author_name:
              (replyMsg.profiles as unknown as { display_name: string } | null)?.display_name ?? "Unknown",
          };
        }
      }

      // Send push notifications to other group members. Recipient rules:
      //   - notifications_paused: never notify
      //   - group level NONE: never notify (hard mute)
      //   - group level MENTIONS: notify only when mentioned
      //   - group level ALL (default): notify, except thread-muted — and a
      //     mention bypasses the thread mute.
      // "Mentioned" = @<display name>, @everyone or @here in the body.
      const senderName = (data?.profiles as unknown as { display_name: string } | null)?.display_name ?? "Someone";
      // Defer the entire push fan-out (member/mute/level queries + Expo + Web
      // Push) to after the response flushes — send latency no longer scales
      // with group size.
      if (thread) waitUntil((async () => {
        const { data: members } = await admin
          .from("group_memberships")
          .select("user_id, profiles(display_name, push_token, notifications_paused)")
          .eq("group_id", thread.group_id)
          .neq("user_id", profile.id);

        const memberIds = (members ?? []).map((m) => m.user_id as string);
        const [{ data: muteRows }, { data: levelRows }] = memberIds.length > 0
          ? await Promise.all([
              admin
                .from("mutes")
                .select("user_id, target_id")
                .in("user_id", memberIds)
                .in("target_id", [input.threadId, thread.group_id]),
              admin
                .from("group_notification_prefs")
                .select("user_id, level")
                .in("user_id", memberIds)
                .eq("group_id", thread.group_id),
            ])
          : [{ data: [] as { user_id: string; target_id: string }[] }, { data: [] as { user_id: string; level: string }[] }];

        const threadMutedIds = new Set(
          (muteRows ?? []).filter((m) => m.target_id === input.threadId).map((m) => m.user_id as string)
        );
        // Legacy group-mute rows (pre-migration) count as level NONE.
        const legacyGroupMutedIds = new Set(
          (muteRows ?? []).filter((m) => m.target_id === thread.group_id).map((m) => m.user_id as string)
        );
        const levelByUser = new Map((levelRows ?? []).map((r) => [r.user_id as string, r.level as string]));

        const bodyLower = input.body.toLowerCase();
        const mentionsAll = bodyLower.includes("@everyone") || bodyLower.includes("@here");

        type Recipient = { user_id: string; push_token: string | null; mentioned: boolean };
        const recipients: Recipient[] = [];
        for (const m of members ?? []) {
          const uid = m.user_id as string;
          const prof = m.profiles as unknown as {
            display_name: string;
            push_token: string | null;
            notifications_paused: boolean;
          } | null;
          if (prof?.notifications_paused) continue;

          const mentioned =
            mentionsAll || (!!prof?.display_name && bodyLower.includes(`@${prof.display_name.toLowerCase()}`));
          const level = levelByUser.get(uid) ?? (legacyGroupMutedIds.has(uid) ? "NONE" : "ALL");

          if (level === "NONE") continue;
          if (level === "MENTIONS" && !mentioned) continue;
          if (threadMutedIds.has(uid) && !mentioned) continue;

          recipients.push({ user_id: uid, push_token: prof?.push_token ?? null, mentioned });
        }
        const eligibleUserIds = recipients.map((r) => r.user_id);
        const mentionedUserIds = new Set(recipients.filter((r) => r.mentioned).map((r) => r.user_id));

        const previewBody = input.body.slice(0, 100) || describeAttachments(input.attachments);

        // Location line: ".group#thread" so recipients see where it came from.
        const { data: meta } = await admin
          .from("threads")
          .select("title, groups(name)")
          .eq("id", input.threadId)
          .single();
        const groupName = (meta?.groups as unknown as { name: string } | null)?.name ?? "";
        const threadTitle = (meta?.title as string | null) ?? "";
        const location = `.${groupName}#${threadTitle}`;

        // --- Expo push (mobile app) ---
        // Mentions get a distinct title so they stand out on the lock screen.
        const pushMessages = recipients
          .filter((r) => r.push_token)
          .map((r) => ({
            to: r.push_token as string,
            title: r.mentioned ? `@ ${senderName} mentioned you` : senderName,
            subtitle: location,
            body: previewBody,
            priority: r.mentioned ? ("high" as const) : ("default" as const),
            data: { threadId: input.threadId, groupId: thread.group_id },
          }));

        if (pushMessages.length > 0) {
          fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pushMessages),
          }).catch(() => null);
        }

        // --- Web Push (PWA) ---
        // Inside waitUntil(): runs post-response but stays alive on Vercel.
        if (eligibleUserIds.length > 0) {
          try {
            const { data: subs } = await admin
              .from("push_subscriptions")
              .select("user_id, endpoint, p256dh, auth")
              .in("user_id", eligibleUserIds);
            if (subs && subs.length > 0) {
              const { sendWebPush } = await import("@/lib/web-push");
              // Collapse on the thread (not the message id): multiple messages
              // in the same thread replace into ONE OS notification showing the
              // latest, instead of stacking N notifications.
              const payloadFor = (userId: string) => ({
                title: mentionedUserIds.has(userId) ? `@ ${senderName} mentioned you` : senderName,
                body: `${location}\n${previewBody}`,
                tag: `thread-${input.threadId}`,
                data: { threadId: input.threadId, groupId: thread.group_id },
              });
              const results = await Promise.all(
                subs.map((s) =>
                  sendWebPush(
                    { endpoint: s.endpoint as string, p256dh: s.p256dh as string, auth: s.auth as string },
                    payloadFor(s.user_id as string)
                  ).then((r) => ({ endpoint: s.endpoint as string, r }))
                )
              );
              const dead = results.filter((x) => x.r === "gone").map((x) => x.endpoint);
              if (dead.length > 0) {
                await admin.from("push_subscriptions").delete().in("endpoint", dead);
              }
            }
          } catch {
            // best-effort; never block message send
          }
        }
      })());

      return {
        ...data,
        reply_to,
        poll: null,
        smeter: null,
        system_event: null,
        reactions: REACTION_TYPES.map((type) => ({ type, count: 0, userReacted: false, users: [] })),
      };
    }),

  edit: protectedProcedure
    .input(
      z.object({
        messageId: z.string().uuid(),
        body: z.string().min(1).max(10000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { profile } = ctx;
      const admin = createAdminClient();

      const { data: message } = await admin
        .from("messages")
        .select("id, user_id")
        .eq("id", input.messageId)
        .single();

      if (!message) throw new TRPCError({ code: "NOT_FOUND" });
      if (message.user_id !== profile.id) throw new TRPCError({ code: "FORBIDDEN" });

      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("messages")
        .update({ body: input.body, edited_at: now })
        .eq("id", input.messageId)
        .select("id, body, edited_at")
        .single();

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data as { id: string; body: string; edited_at: string };
    }),

  toggleReaction: protectedProcedure
    .input(
      z.object({
        messageId: z.string().uuid(),
        type: z.enum(["👍", "👎", "❤️", "🎉", "😂", "❓"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, profile } = ctx;
      const admin = createAdminClient();

      const { data: message } = await supabase
        .from("messages")
        .select("id")
        .eq("id", input.messageId)
        .single();

      if (!message) throw new TRPCError({ code: "NOT_FOUND" });

      const { data: existing } = await admin
        .from("message_reactions")
        .select("id")
        .eq("message_id", input.messageId)
        .eq("user_id", profile.id)
        .eq("type", input.type)
        .maybeSingle();

      if (existing) {
        await admin.from("message_reactions").delete().eq("id", existing.id);
      } else {
        await admin.from("message_reactions").insert({
          message_id: input.messageId,
          user_id: profile.id,
          type: input.type,
        });
      }

      return { success: true };
    }),

  deleteMessage: protectedProcedure
    .input(z.object({ messageId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { profile } = ctx;
      const admin = createAdminClient();

      const { data: message } = await admin
        .from("messages")
        .select("id, user_id")
        .eq("id", input.messageId)
        .single();

      if (!message) throw new TRPCError({ code: "NOT_FOUND" });
      if (message.user_id !== profile.id) throw new TRPCError({ code: "FORBIDDEN" });

      const { error } = await admin
        .from("messages")
        .update({ is_deleted: true })
        .eq("id", input.messageId);

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  groupMembers: protectedProcedure
    .input(z.object({ groupId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const admin = createAdminClient();

      const { data: membership } = await supabase
        .from("group_memberships")
        .select("id")
        .eq("group_id", input.groupId)
        .eq("user_id", ctx.profile.id)
        .single();

      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      const { data } = await admin
        .from("group_memberships")
        .select("role, profiles(id, display_name, avatar_url)")
        .eq("group_id", input.groupId);

      return ((data ?? [])
        .map((row) => {
          const p = row.profiles as unknown as { id: string; display_name: string; avatar_url: string | null } | null;
          if (!p) return null;
          return { ...p, role: row.role as string };
        })
        .filter(Boolean) as { id: string; display_name: string; avatar_url: string | null; role: string }[])
        .sort((a, b) => a.display_name.localeCompare(b.display_name));
    }),
});
