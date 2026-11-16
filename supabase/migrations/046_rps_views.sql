-- =============================================================
-- Rock, paper, scissors: no replays. Each person watches a finished
-- game's animation exactly once; a row here means they have. After
-- that the card only states the result and won't reopen the game.
-- Server-only like rps_moves: RLS on, no policies.
-- =============================================================

create table rps_views (
  game_id uuid references rps_games(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  seen_at timestamptz default now(),
  primary key (game_id, user_id)
);

alter table rps_views enable row level security;
