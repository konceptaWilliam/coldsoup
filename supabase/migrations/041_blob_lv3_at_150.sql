-- =============================================================
-- Blobatar Lv3 now at 150 XP (was 200). Same function as 040 with the
-- threshold moved; see 036 for why it is one UPDATE.
-- =============================================================

create or replace function public.bump_blob_xp(p_user uuid, p_shiny2 boolean, p_shiny3 boolean)
returns table(level smallint, leveled_up boolean, shiny2 boolean, shiny3 boolean)
language sql
security definer
set search_path = public
as $$
  update profiles p set
    blob_xp = p.blob_xp + 1,
    blob_level = greatest(p.blob_level,
      case when p.blob_xp + 1 >= 150 then 3 when p.blob_xp + 1 >= 50 then 2 else 1 end)::smallint,
    blob_shiny2 = case when p.blob_xp + 1 = 50 then p_shiny2 else p.blob_shiny2 end,
    blob_shiny3 = case when p.blob_xp + 1 = 150 then (p.blob_shiny2 or p_shiny3) else p.blob_shiny3 end,
    blob_lv3_shape = case when p.blob_xp + 1 = 150 then null else p.blob_lv3_shape end,
    blob_reroll_xp = case when p.blob_xp + 1 = 150 then 150 else p.blob_reroll_xp end
  where p.id = p_user
  returning p.blob_level, (p.blob_xp in (50, 150)), p.blob_shiny2, p.blob_shiny3;
$$;

-- Users already past 150 but below Lv3 skipped the new threshold: promote them
-- with the same roll bump_blob_xp would have made (shiny2 carries, else 1 in 4).
update profiles set
  blob_level = 3,
  blob_shiny3 = blob_shiny2 or random() < 0.25,
  blob_lv3_shape = null,
  blob_reroll_xp = 150
where blob_xp >= 150 and blob_level < 3;
