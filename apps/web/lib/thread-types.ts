import type { SMeterSummary } from "@/components/smeter";
import type { SystemEvent } from "@/lib/system-event";

export type ThreadStatus = "OPEN" | "URGENT" | "DONE";

export type Attachment = {
  url: string;
  type: "image" | "audio" | "video" | "file";
  name: string;
};

export type Reaction = {
  type: string;
  count: number;
  userReacted: boolean;
  users: string[];
};

export type ReactionType = "👍" | "👎" | "❤️" | "🎉" | "😂" | "❓";
export const REACTION_TYPES: ReactionType[] = ["👍", "👎", "❤️", "🎉", "😂", "❓"];

export const REACTION_DEFAULTS: Reaction[] = REACTION_TYPES.map((type) => ({
  type,
  count: 0,
  userReacted: false,
  users: [],
}));

export type ReplyTo = {
  id: string;
  body: string;
  author_name: string;
  // Specific image of the replied-to message, when the reply was started from
  // an image. Null for text replies / non-image messages.
  image_url: string | null;
};

export type PollVoter = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

export type PollOption = {
  id: string;
  text: string;
  vote_count: number;
  user_voted: boolean;
  voters: PollVoter[];
};

export type PollData = {
  id: string;
  question: string;
  options: PollOption[];
};

export type Message = {
  id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  is_deleted: boolean;
  user_id: string | null;
  thread_id: string;
  client_id?: string | null;
  poll_id: string | null;
  poll: PollData | null;
  smeter_id: string | null;
  smeter: SMeterSummary | null;
  system_event: SystemEvent | null;
  attachments: Attachment[];
  reactions: Reaction[];
  reply_to_id: string | null;
  reply_to: ReplyTo | null;
  profiles: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  // Local-only fields (pending sends). Never present on server rows.
  delivery_status?: "sending" | "failed";
  fail_id?: string;
  upload_progress?: number;
  missing_files?: string[];
};

export type Me = { id: string; display_name: string; avatar_url: string | null };
