// Mention parsing shared by message rendering and incoming-message alerts.
// Pure: no React, no imports.

export const MENTION_SPECIALS = ["everyone", "here"];

export type MentionMember = { id: string; display_name: string };
export type MentionMatcher = { regex: RegExp | null; byName: Map<string, MentionMember> };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One global regex for the whole member list (longest names first) plus a name lookup. */
export function buildMentionMatcher(members: MentionMember[], specials: string[]): MentionMatcher {
  const sorted = [...members].sort((a, b) => b.display_name.length - a.display_name.length);
  const alternatives = [...sorted.map((m) => escapeRe(m.display_name)), ...specials.map(escapeRe)];
  const byName = new Map<string, MentionMember>();
  for (const m of members) byName.set(m.display_name.toLowerCase(), m);
  return {
    regex: alternatives.length > 0 ? new RegExp(`@(${alternatives.join("|")})`, "g") : null,
    byName,
  };
}

// True when `body` mentions this user by name, or via @everyone / @here.
export function mentionsUser(body: string, displayName: string): boolean {
  if (!body) return false;
  if (new RegExp(`@(${MENTION_SPECIALS.join("|")})(?!\\w)`).test(body)) return true;
  return new RegExp(`@${escapeRe(displayName)}(?!\\w)`).test(body);
}
