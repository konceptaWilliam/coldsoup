export type ThreadStatus = "OPEN" | "URGENT" | "DONE";

export type ReactionType = "👍" | "👎" | "❓";

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export interface Group {
  id: string;
  name: string;
  created_at: string;
}

export interface Thread {
  id: string;
  title: string;
  status: ThreadStatus;
  group_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  body: string;
  thread_id: string;
  user_id: string;
  created_at: string;
  edited_at: string | null;
  is_deleted: boolean;
  attachments: MessageAttachment[];
  reply_to_id: string | null;
  poll_id: string | null;
}

export interface MessageAttachment {
  url: string;
  type: "image" | "audio" | "video" | "file";
  name: string;
}

export interface PollOption {
  id: string;
  text: string;
  vote_count: number;
  user_voted: boolean;
  voters: { id: string; display_name: string; avatar_url: string | null }[];
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
}

export interface MessageReaction {
  type: ReactionType;
  count: number;
  userReacted: boolean;
  users: string[];
}
