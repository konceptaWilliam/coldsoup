-- Detect users who can only authenticate via magic link: no password set and
-- no OAuth (google/apple) identity. These are invited users who never chose a
-- password. We force them through a password-setup step so they aren't locked
-- out if magic-link delivery fails.
--
-- SECURITY DEFINER so it can read the auth schema. Execute is restricted to
-- service_role — only the tRPC admin client (and server middleware) calls it,
-- never the client directly, to avoid leaking whether an account has a password.

create or replace function public.needs_password_setup(uid uuid)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select
    not exists (
      select 1 from auth.users
      where id = uid
        and encrypted_password is not null
        and encrypted_password <> ''
    )
    and not exists (
      select 1 from auth.identities
      where user_id = uid
        and provider in ('google', 'apple')
    );
$$;

revoke all on function public.needs_password_setup(uuid) from public;
revoke all on function public.needs_password_setup(uuid) from anon;
revoke all on function public.needs_password_setup(uuid) from authenticated;
grant execute on function public.needs_password_setup(uuid) to service_role;
