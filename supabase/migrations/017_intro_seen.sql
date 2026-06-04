-- First-login introduction: track whether a user has seen the intro carousel.
alter table profiles
  add column if not exists intro_seen boolean not null default false;

-- Existing users are already onboarded — mark them seen so only new signups
-- get the intro. (New rows default to false.)
update profiles set intro_seen = true where intro_seen = false;
