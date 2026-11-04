-- Local-only stand-ins for what Neon provides (roles + pg_session_jwt's auth.user_id()).
-- NEVER run this on Neon. Tests set the "JWT subject" with: set test.user_id = 'user-a';
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anonymous') then
    create role anonymous nologin;
  end if;
end $$;
create schema if not exists auth;
create or replace function auth.user_id() returns text language sql stable as
  $$ select nullif(current_setting('test.user_id', true), '') $$;
grant usage on schema auth to authenticated;
grant execute on function auth.user_id() to authenticated;
