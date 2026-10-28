-- The role the model's SQL runs as, and the one door it runs through.
--
-- Upstream ran whatever SQL the model wrote on its own connection, guarded
-- only by a string check (the query starts with "select" and names none of
-- drop, delete, insert, update, alter, truncate, create, grant, revoke). That
-- check stays in app/actions.ts, and it is not enough: a model can be talked
-- into SQL that passes it, and the connection is the tables' owner. So the
-- generated SQL never runs as the owner:
--
--   query_reader                 a role that cannot log in, holding SELECT on
--                                `unicorns` and nothing else: no write on it,
--                                no DDL anywhere, no other table, no other
--                                schema's data (not `_migrations`, not
--                                `app_private`), no sequence.
--   app_private.run_read_only(q) a SECURITY DEFINER function OWNED by
--                                query_reader, so `q` runs with
--                                query_reader's privileges — and inside a
--                                security-definer function Postgres refuses
--                                SET ROLE, RESET ROLE and set_config('role',
--                                …), so `q` cannot step back up to the
--                                connection's role, which a SET ROLE in the
--                                app's own session would not prevent. It runs
--                                `q` as a cursor (one statement; a second is
--                                refused) and returns its rows, in order, as
--                                one JSON array.
--
-- The app (connected as `postgres`) calls only the function, in a READ ONLY
-- transaction with a statement timeout (apps/web/lib/db.ts). The function is
-- in `app_private`, a schema the Data API does not expose, and only the
-- role that applies the migrations — `postgres`, the app's own — may execute
-- it; PUBLIC (and so `anon` and `authenticated`) may not.
--
-- Idempotent: the role, the grants, the policy and the function are created
-- or replaced to the same definitions.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'query_reader') THEN
    CREATE ROLE query_reader NOLOGIN NOINHERIT;
  END IF;
END
$$;

-- Membership lets the role that runs these migrations hand the function to
-- query_reader (ALTER … OWNER TO needs to be able to SET ROLE to it); it
-- grants query_reader nothing. Postgres 16 split membership into options and
-- gives a role's creator ADMIN on it but not SET, so there SET is asked for;
-- Postgres 15 has no options and a grant is SET.
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 160000 THEN
    EXECUTE format('GRANT query_reader TO %I WITH SET TRUE', current_user);
  ELSE
    EXECUTE format('GRANT query_reader TO %I', current_user);
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO query_reader;
GRANT SELECT ON TABLE unicorns TO query_reader;

-- unicorns has row-level security (030); query_reader does not own it, so it
-- reads rows only through a policy. It reads every row, and writes none.
DROP POLICY IF EXISTS unicorns_read_only_queries ON unicorns;
CREATE POLICY unicorns_read_only_queries ON unicorns FOR SELECT TO query_reader USING (true);

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_private.run_read_only(query text)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $fn$
DECLARE
  r record;
  out jsonb := '[]'::jsonb;
BEGIN
  FOR r IN EXECUTE query LOOP
    out := out || jsonb_build_array(to_jsonb(r));
  END LOOP;
  RETURN out;
END
$fn$;

-- A new owner must be able to create in the function's schema; query_reader
-- may for as long as the hand-over takes, and not after.
GRANT CREATE ON SCHEMA app_private TO query_reader;
ALTER FUNCTION app_private.run_read_only(text) OWNER TO query_reader;
REVOKE CREATE ON SCHEMA app_private FROM query_reader;

REVOKE ALL ON FUNCTION app_private.run_read_only(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.run_read_only(text) TO CURRENT_USER;
