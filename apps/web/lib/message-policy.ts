// Pure, dependency-free message/notification policy helpers.
//
// Kept free of any runtime imports (no supabase, next, env reads) so the
// security-critical decisions here can be unit-tested with `node --test`
// without a database or build step. The tRPC routers wrap these with I/O.

export type NotifLevel = "ALL" | "MENTIONS" | "NONE";

export const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp",
  "mp3", "wav", "ogg", "m4a", "aac", "flac",
  "mp4", "mov", "m4v", "webm",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "zip",
]);

// Matches: /storage/v1/object/public/attachments/<uuid>/<filename>.<ext>
const ATTACHMENT_PATH_RE = new RegExp(
  `^/storage/v1/object/public/attachments/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+\\.([a-z0-9]+)$`,
  "i",
);

// True only for a public attachments URL on our own Supabase host with an
// allowed extension. `supabaseUrl` is injected so this stays env-free.
export function isValidAttachmentUrl(url: string, supabaseUrl: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    const supabaseHost = new URL(supabaseUrl).hostname;
    if (hostname !== supabaseHost) return false;
    const match = ATTACHMENT_PATH_RE.exec(pathname);
    if (!match) return false;
    return ALLOWED_ATTACHMENT_EXTENSIONS.has(match[1].toLowerCase());
  } catch {
    return false;
  }
}

const ATTACHMENT_PREFIX = "/storage/v1/object/public/attachments/";
// What our uploaders actually write: <userId>/<uuid>.<ext>. Anything with
// %-escapes or ".." is refused, so a crafted URL can't name another object.
const SAFE_OBJECT_PATH_RE = /^[0-9a-f-]{36}\/[a-z0-9._-]+$/i;

// Storage object path (`<userId>/<file>`) of a valid attachment URL, or null.
// With `ownerId`, also null unless the file is in that user's folder; callers
// that delete files pass it so a tampered URL can't reach someone else's file.
export function attachmentPathFromUrl(
  url: string,
  supabaseUrl: string,
  ownerId?: string,
): string | null {
  if (!isValidAttachmentUrl(url, supabaseUrl)) return null;
  const path = new URL(url).pathname.slice(ATTACHMENT_PREFIX.length);
  if (!SAFE_OBJECT_PATH_RE.test(path) || path.includes("..")) return null;
  if (ownerId && path.split("/")[0].toLowerCase() !== ownerId.toLowerCase()) return null;
  return path;
}

// Escape LIKE/ILIKE wildcards so a query containing % or _ matches literally
// (backslash is the default Postgres LIKE escape char).
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// @everyone / @here broadcast mentions. `bodyLower` must already be lowercased.
export function mentionsEveryone(bodyLower: string): boolean {
  return bodyLower.includes("@everyone") || bodyLower.includes("@here");
}

// Whether `body` mentions a specific member (or everyone). Case-insensitive.
export function isMentioned(body: string, displayName: string | null | undefined): boolean {
  const lower = body.toLowerCase();
  if (mentionsEveryone(lower)) return true;
  return !!displayName && lower.includes(`@${displayName.toLowerCase()}`);
}

// --- Catch-up / completion-loop -------------------------------------------
// Server-authoritative "what awaits you" summary, driving the login opener. A
// thread is unread when its updated_at (bumped on every new message) is newer
// than the caller's thread_reads marker — the same definition as groups.unread.

export type ThreadStatus = "OPEN" | "URGENT" | "DONE";

export type CatchUpThread = {
  id: string;
  title: string;
  group_id: string;
  group_name: string;
  status: ThreadStatus;
  updated_at: string;
};

export type CatchUpSummary = {
  // URGENT unread threads (count + capped list for deep-linking, newest first).
  urgentTotal: number;
  urgentThreads: CatchUpThread[];
  // All unread threads excluding DONE — a resolved thread shouldn't nag even if
  // it saw late activity.
  unreadTotal: number;
};

// Pure: given the caller's threads and their per-thread last-read epoch ms,
// derive the catch-up summary. Env-free and I/O-free so it unit-tests without a
// database (the tRPC router supplies the data). `readAtMs[threadId]` missing →
// treated as never read (0).
export function buildCatchUp(
  threads: CatchUpThread[],
  readAtMs: Record<string, number>,
  opts?: { urgentLimit?: number },
): CatchUpSummary {
  const urgentLimit = opts?.urgentLimit ?? 10;

  const unread = threads.filter((t) => {
    const updated = new Date(t.updated_at).getTime();
    return updated > (readAtMs[t.id] ?? 0);
  });

  const urgent = unread
    .filter((t) => t.status === "URGENT")
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );

  return {
    urgentTotal: urgent.length,
    urgentThreads: urgent.slice(0, urgentLimit),
    unreadTotal: unread.filter((t) => t.status !== "DONE").length,
  };
}

// Core notification decision. Mentions bypass a thread mute; level NONE and a
// global pause always win.
export function shouldNotify(opts: {
  paused: boolean;
  level: NotifLevel;
  threadMuted: boolean;
  mentioned: boolean;
}): boolean {
  if (opts.paused) return false;
  if (opts.level === "NONE") return false;
  if (opts.level === "MENTIONS" && !opts.mentioned) return false;
  if (opts.threadMuted && !opts.mentioned) return false;
  return true;
}
