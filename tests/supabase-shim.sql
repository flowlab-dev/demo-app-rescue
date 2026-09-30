-- The parts of Supabase the policies rely on, recreated for a local PostgreSQL:
-- the anon / authenticated / service_role roles and auth.uid() / auth.jwt(), which read the
-- signed-in user's token claims from the request.jwt.claims setting, as PostgREST sets them.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
-- As on Supabase: every table, sequence and function created later in public is granted to all three
-- API roles. That is why a table without row level security is open to anyone with the public key.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
-- Not recreated: PostgREST itself (the HTTP layer) and extensions such as pg_safeupdate.
