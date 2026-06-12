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
