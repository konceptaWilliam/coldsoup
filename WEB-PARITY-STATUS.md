# Web ↔ Mobile parity — status & remaining work

_Last updated: this session. Web app brought up to feature-parity with the mobile app._

## ✅ Done — web ports complete

All 19 portable mobile features now exist on web. Both `apps/web` and `apps/mobile` typecheck clean; web also passes `next lint` (warnings only).

| Feature | Where | Notes |
|---------|-------|-------|
| Send documents + video | `lib/file-utils.ts`, `thread-detail.tsx` | 25 MB / 100 MB limits, type auto-detect |
| Account deletion | `app/settings/page.tsx` | type-`DELETE`-to-confirm → `profile.deleteAccount` |
| Link preview cards | `thread-detail.tsx` (`LinkPreview`) | first URL, OG card, `links.unfurl` |
| @everyone / @here | `thread-detail.tsx` (`renderBody`, mention list) | highlight + suggestion entries |
| Read-receipt seen-by | `thread-detail.tsx` (`seenReceipt`) | avatar stack on latest seen msg |
| Due date + assignee on rows | `thread-list.tsx`, `new-thread-dialog.tsx` | creator avatar + due chip (red if overdue) |
| Thread filter bar | `thread-list.tsx` | All / Open / Urgent / Done |
| Thread-details panel | `thread-detail.tsx` (`threads.get`/`setMeta`/`delete`) | due / mute / delete |
| Persisted drafts | `thread-detail.tsx` (`readDraft`/`writeDraft`) | per-thread localStorage, debounced |
| Copy message | `thread-detail.tsx` | `navigator.clipboard` |
| Delivery / failed + retry | `thread-detail.tsx` (`failedSends`, outbox) | persisted outbox, retry/dismiss |
| Online presence | `lib/presence-context.tsx` | `presence:online` channel, dots |
| Profile card on avatar | `thread-detail.tsx` (`profileTarget`) | name / avatar / role |
| Dark mode | `lib/theme-context.tsx`, `globals.css`, `tailwind.config.ts` | CSS vars via `html[data-theme]` |
| Mute + notification prefs | `thread-detail.tsx`, `thread-list.tsx`, `settings/page.tsx` | per-thread/group + pause-all |

## 🔧 Operational — must do before this works at runtime

- [ ] Run Supabase migrations: `010_thread_reads`, `011_mutes`, `012_thread_meta`, `013_link_previews` (mobile reported 010–012 run; confirm 013).
- [ ] Enable Realtime on `thread_reads` (Dashboard → Database → Replication) for live seen-by.
- [ ] **Restart the web/Next.js server** — server router changed (links, notifications, threads, profile, messages).
- [ ] **Native rebuild** the mobile dev client (`npx expo run:android` / EAS iOS) for: dark-mode `automatic`, mic/voice, video, Face ID, date picker.

## 🔍 Verify on web (runtime smoke test)

- [ ] Dark mode: toggle in Settings → all screens (sidebar, thread list, chat, modals) legible; no white flashes.
- [ ] Seen-by: 2 accounts — avatars appear under your last message after the other reads.
- [ ] Mute: bell on thread/group → muted users get no push; pause-all in Settings.
- [ ] Send a PDF + a video → render + open correctly.
- [ ] Link card renders for a public URL (e.g. youtube/github).
- [ ] Draft persists across thread switch + reload.
- [ ] Failed send (offline) shows retry; persists across reload.
- [ ] Presence dots; profile card on avatar click; due date + assignee on thread rows; filter bar.

## 🟡 Known minor (non-blocking)

- `<img>` lint warnings across web components — pre-existing codebase style (not `next/image`). Cosmetic/perf only.
- One `react-hooks/exhaustive-deps` warning in `search-dialog.tsx` — pre-existing.

## ⏸️ Deferred by design (not bugs)

- True "last seen" timestamps (only online/offline presence).
- Online-only `@here` filtering (notifies all members).
- Exact background app-badge counts (mobile; needs server unread in push payload).
- Fixed label palette (labels were removed from thread metadata).
- i18n on web (web is English-hardcoded; mobile is localized).
