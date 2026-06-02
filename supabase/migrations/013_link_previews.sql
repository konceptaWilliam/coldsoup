-- =============================================================
-- Link preview cache — one fetched OpenGraph snapshot per URL,
-- shared across all users. Populated server-side by links.unfurl.
-- =============================================================

create table if not exists link_previews (
  url         text primary key,
  title       text,
  description text,
  image_url   text,
  ok          boolean not null default false,
  fetched_at  timestamptz not null default now()
);

alter table link_previews enable row level security;

-- Read-only to authenticated users; writes happen via the service role only.
create policy "link_previews: read" on link_previews
  for select using (auth.uid() is not null);
