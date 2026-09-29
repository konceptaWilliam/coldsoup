-- =============================================================
-- Blobatar evolution. Everyone starts at Lv1 (their existing blob) with 0 XP;
-- no backfill. XP = messages sent after release, bumped by bump_blob_xp from
-- messages.send. Rolls (shiny2 / shiny3) are made server-side in TS and passed
-- in; the function keeps only the one that applies.
-- =============================================================

alter table profiles
  add column if not exists blob_xp int not null default 0,
  add column if not exists blob_level smallint not null default 1,
  add column if not exists blob_form smallint not null default 1,
  add column if not exists blob_shiny2 boolean not null default false,
  add column if not exists blob_shiny3 boolean not null default false,
  add column if not exists blob_lv3_shape text,
  add column if not exists blob_pending_shape text,
  add column if not exists blob_reroll_xp int not null default 0;

alter table profiles drop constraint if exists profiles_blob_level_check;
alter table profiles add constraint profiles_blob_level_check check (blob_level between 1 and 3);
alter table profiles drop constraint if exists profiles_blob_form_check;
alter table profiles add constraint profiles_blob_form_check check (blob_form between 1 and blob_level);

-- One UPDATE, so concurrent sends serialize on the row lock. XP moves by
-- exactly 1 per call, so exactly one call lands on 50 and one on 500:
-- leveled_up is derived from the new XP, not from a racy read of the old level.
-- All SET expressions see the pre-update row.
create or replace function public.bump_blob_xp(p_user uuid, p_shiny2 boolean, p_shiny3 boolean)
returns table(level smallint, leveled_up boolean, shiny2 boolean, shiny3 boolean)
language sql
security definer
set search_path = public
as $$
  update profiles p set
    blob_xp = p.blob_xp + 1,
    blob_level = greatest(p.blob_level,
      case when p.blob_xp + 1 >= 500 then 3 when p.blob_xp + 1 >= 50 then 2 else 1 end)::smallint,
    blob_shiny2 = case when p.blob_xp + 1 = 50 then p_shiny2 else p.blob_shiny2 end,
    blob_shiny3 = case when p.blob_xp + 1 = 500 then (p.blob_shiny2 or p_shiny3) else p.blob_shiny3 end,
    blob_lv3_shape = case when p.blob_xp + 1 = 500 then null else p.blob_lv3_shape end,
    blob_reroll_xp = case when p.blob_xp + 1 = 500 then 500 else p.blob_reroll_xp end
  where p.id = p_user
  returning p.blob_level, (p.blob_xp in (50, 500)), p.blob_shiny2, p.blob_shiny3;
$$;

revoke all on function public.bump_blob_xp(uuid, boolean, boolean) from public;
revoke all on function public.bump_blob_xp(uuid, boolean, boolean) from anon;
revoke all on function public.bump_blob_xp(uuid, boolean, boolean) from authenticated;
grant execute on function public.bump_blob_xp(uuid, boolean, boolean) to service_role;
