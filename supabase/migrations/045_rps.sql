-- =============================================================
-- Rock, paper, scissors — in-thread 1v1 game. One game per message,
-- carried on messages.rps_id (same shape as smeters / 018).
-- Moves live in rps_moves with RLS on and NO policies: only the
-- service-role client (tRPC) can read them, so the challenger's move
-- never reaches a client query or realtime payload before the game ends.
-- =============================================================

create table rps_games (
  id            uuid primary key default gen_random_uuid(),
  thread_id     uuid references threads(id) on delete cascade not null,
  challenger_id uuid references profiles(id) on delete set null,
  opponent_id   uuid references profiles(id) on delete set null,
  status        text not null default 'pending' check (status in ('pending', 'done')),
  winner_id     uuid references profiles(id) on delete set null, -- null when done = tie
  rematch_of    uuid references rps_games(id) on delete set null,
  created_at    timestamptz default now(),
  completed_at  timestamptz
);

create table rps_moves (
  game_id    uuid references rps_games(id) on delete cascade not null,
  user_id    uuid references profiles(id) on delete cascade not null,
  move       text not null check (move in ('rock', 'paper', 'scissors')),
  created_at timestamptz default now(),
  primary key (game_id, user_id)
);

create index idx_rps_games_thread on rps_games(thread_id);

alter table messages add column if not exists rps_id uuid references rps_games(id) on delete set null;

alter table rps_games enable row level security;
alter table rps_moves enable row level security;

create policy "rps_games: read if group member" on rps_games for select using (
  exists (
    select 1 from threads t where t.id = rps_games.thread_id and is_group_member(t.group_id)
  )
);

-- Cards refresh live when a game finishes (status -> done).
alter publication supabase_realtime add table rps_games;

-- To verify:
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime';
