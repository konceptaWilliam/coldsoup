# Coldsoup

A web-based team messenger built on **radical simplicity** — threads inside groups, each with a visible **OPEN / URGENT / DONE** status. No DMs. No channels. No endless feed. Just the work.

Installable as a PWA with push notifications, real-time messaging, and an offline cache.

---

## Features

- **Groups & threads** — conversations live in topic threads inside groups; no DMs or channels.
- **Status workflow** — every thread is OPEN, URGENT, or DONE, visible at a glance.
- **Real-time** — messages, status changes, typing indicators, read receipts, and polls update live (Supabase Realtime).
- **Rich messages** — replies, reactions, image/audio/video/file attachments (client-side compressed), inline link previews, and polls.
- **Passwordless invites** — admins invite by email; a single magic link signs the user in and adds them to the group.
- **PWA** — installable, fullscreen, offline-capable (persisted query cache + cached media), with **web push notifications** and home-screen **badges**.
- **Search** — across thread titles and message bodies, scoped to your groups.

---

## Tech stack

- **Next.js 14** (App Router, TypeScript strict)
- **tRPC v11** + React Query v5 (with localStorage cache persistence) + superjson
- **Supabase** — Postgres, Auth (passwordless magic link), Realtime, Storage, Row-Level Security
- **Tailwind CSS** — custom design tokens
- **Resend** — transactional email (invites, account notices)
- **web-push (VAPID)** — PWA push notifications
- **Expo / React Native** — companion mobile app (`apps/mobile`)

---

## Monorepo layout

```
apps/
  web/      Next.js web app + PWA (primary)
  mobile/   Expo / React Native app
supabase/
  migrations/   SQL schema, RLS policies, realtime publication
```

### Key web files

| Path | Purpose |
| --- | --- |
| `apps/web/lib/trpc/` | tRPC routers, context, auth procedures |
| `apps/web/lib/supabase/` | browser / server / admin (service-role) clients |
| `apps/web/middleware.ts` | session refresh + auth guard |
| `apps/web/app/api/trpc/[trpc]/route.ts` | tRPC HTTP handler + CORS |
| `apps/web/components/thread-detail.tsx` | real-time chat view |
| `apps/web/public/sw.js` | service worker (push + media cache) |
| `supabase/migrations/` | full schema, RLS, realtime publication |

---

## Getting started

### Prerequisites

- Node 20+
- A Supabase project
- A Resend account (for invite email)

### 1. Install

```bash
cd apps/web
npm install
```

### 2. Environment

Create `.env.local` at the repo root (loaded by the web app):

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server-only — never expose to the client

RESEND_API_KEY=
RESEND_FROM=Coldsoup <hello@yourdomain.com>   # must be a verified Resend domain

NEXT_PUBLIC_APP_URL=http://localhost:3000

# Web push (generate with: npx web-push generate-vapid-keys)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@yourdomain.com
NEXT_PUBLIC_VAPID_PUBLIC_KEY=        # same value as VAPID_PUBLIC_KEY
```

### 3. Supabase setup

1. Run every file in `supabase/migrations/` (in order) in the Supabase SQL editor.
2. Enable **Realtime** replication for `messages`, `threads`, `thread_reads`, `poll_votes`, `poll_options` (the migrations add these to the `supabase_realtime` publication).
3. Create **public** Storage buckets named `attachments` and `avatars` with the storage policies from the migrations.
4. (Email) Verify your sending domain in Resend and set `RESEND_FROM`. Optionally point Supabase Auth → SMTP at Resend so password-reset / magic-link emails use your domain.
5. Add your app origin to Supabase Auth → URL Configuration → Redirect URLs (e.g. `https://yourapp.com/auth/callback`).

### 4. Run

```bash
cd apps/web
npm run dev
```

Open http://localhost:3000.

---

## Architecture notes

- **All tRPC mutations use the service-role admin client** to write, but every procedure first verifies the caller's identity (`protectedProcedure`) and authorization (group membership / admin role) — tRPC is the authorization boundary.
- **RLS** is enabled on every table and gates Supabase **Realtime** delivery (a client only receives changes for rows it may read).
- **Invites** are passwordless: a server-generated magic link signs the user in and accepts the invite in `/auth/callback` — one email, no separate sign-up.
- **PWA push** fan-out runs on message send (awaited so serverless doesn't drop it); dead endpoints are pruned on `410`.

---

## Deployment

The web app deploys to **Vercel**. Set all environment variables above in the Vercel project (Production scope) and redeploy after any change. HTTPS is required for PWA + push.

The mobile app builds via **Expo / EAS** (`apps/mobile`); native icon changes require a fresh build.
