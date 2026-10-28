import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { manifest } from "@saas/db/manifest";

// Migration 040: the model's SQL runs as query_reader, through
// app_private.run_read_only — never as the connection's own role. These hold
// the DATABASE to that, with the template's string check out of the way: each
// statement below goes straight to the function (or straight to the role), so
// what refuses it is Postgres. apps/web/lib/db.ts calls the function inside a
// READ ONLY transaction with a statement timeout; the e2e tier repeats the
// refusals on a server Postgres through the app's own path.
const migrationsDir = path.resolve(__dirname, "../../../packages/db/src/migrations");
const sqlOf = (rel: string) => readFileSync(path.join(migrationsDir, rel), "utf8");

async function migrated(): Promise<PGlite> {
  const db = new PGlite();
  for (const entry of manifest.migrations) {
    await db.exec(sqlOf(entry.path));
  }
  return db;
}

async function runReadOnly(db: PGlite, query: string): Promise<unknown[]> {
  const { rows } = await db.query<{ rows: unknown[] }>("select app_private.run_read_only($1) as rows", [query]);
  return rows[0]!.rows;
}

const count = async (db: PGlite) =>
  (await db.query<{ n: number }>("select count(*)::int as n from unicorns")).rows[0]!.n;

describe("app_private.run_read_only (migration 040)", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await migrated();
  }, 60_000);

  it("runs a SELECT as query_reader and returns its rows, in order, as JSON", async () => {
    const rows = await runReadOnly(
      db,
      "SELECT country, COUNT(*) AS count FROM unicorns GROUP BY country ORDER BY count DESC, country LIMIT 3",
    );
    const direct = await db.query<{ country: string; count: number }>(
      "SELECT country, COUNT(*)::int AS count FROM unicorns GROUP BY country ORDER BY count DESC, country LIMIT 3",
    );
    expect(rows).toEqual(direct.rows);
    const who = await runReadOnly(db, "select current_user as role, session_user <> current_user as switched");
    expect(who).toEqual([{ role: "query_reader", switched: true }]);
    // A trailing semicolon, as models write it, is one statement.
    expect(await runReadOnly(db, "SELECT count(*) AS n FROM unicorns;")).toEqual([{ n: 60 }]);
    // Numbers stay numbers and dates come back as ISO dates.
    const [first] = (await runReadOnly(
      db,
      "select valuation, date_joined from unicorns where company = 'Aldervane Robotics'",
    )) as { valuation: number; date_joined: string }[];
    expect(typeof first!.valuation).toBe("number");
    expect(first!.date_joined).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("refuses every write, however the SQL is dressed, and the table is untouched", async () => {
    for (const query of [
      "DELETE FROM unicorns RETURNING id",
      "UPDATE unicorns SET valuation = 0 RETURNING id",
      "INSERT INTO unicorns (company, valuation, country, city, industry, select_investors) VALUES ('x', 1, 'x', 'x', 'x', 'x') RETURNING id",
      "WITH gone AS (DELETE FROM unicorns RETURNING *) SELECT count(*) FROM gone",
      // Past the string check: the DELETE spelled in hex, run by query_to_xml.
      "select query_to_xml(convert_from(decode('44454c4554452046524f4d20756e69636f726e73','hex'),'UTF8'), true, false, '')",
      "SELECT nextval('unicorns_id_seq')",
    ]) {
      await expect(runReadOnly(db, query), query).rejects.toThrow(/permission denied|cannot|not allowed/);
    }
    expect(await count(db)).toBe(60);
  });

  it("refuses DDL and a second statement", async () => {
    for (const query of [
      "DROP TABLE unicorns",
      "TRUNCATE unicorns",
      "ALTER TABLE unicorns ADD COLUMN x int",
      "CREATE TABLE public.x (y int)",
      "GRANT ALL ON unicorns TO PUBLIC",
      "SELECT 1; DELETE FROM unicorns",
    ]) {
      await expect(runReadOnly(db, query), query).rejects.toThrow();
    }
    expect(await count(db)).toBe(60);
    const tables = await db.query<{ n: number }>(
      "select count(*)::int as n from pg_tables where schemaname = 'public'",
    );
    expect(tables.rows[0]!.n).toBe(1);
  });

  it("refuses every other schema's data", async () => {
    for (const [query, why] of [
      ["SELECT * FROM _migrations.applied", /permission denied for schema _migrations/],
      ["SELECT app_private.run_read_only('select 1')", /permission denied for schema app_private/],
    ] as const) {
      await expect(runReadOnly(db, query), query).rejects.toThrow(why);
    }
  });

  it("cannot step back up to the connection's role", async () => {
    for (const query of [
      "SELECT set_config('role', 'postgres', true)",
      "SELECT set_config('role', 'none', false)",
      "SELECT set_config('session_authorization', 'postgres', true)",
    ]) {
      await expect(runReadOnly(db, query), query).rejects.toThrow(/within security-definer function/);
    }
    // And so a read of the ledger behind such a step is refused with it.
    await expect(
      runReadOnly(db, "select set_config('role', 'postgres', true) as r, (select count(*) from _migrations.applied) as n"),
    ).rejects.toThrow(/permission denied|security-definer/);
  });

  it("is query_reader's, executable by the migrations' role alone", async () => {
    const { rows } = await db.query<{ owner: string; definer: boolean; public_can: boolean }>(
      `select pg_get_userbyid(p.proowner) as owner, p.prosecdef as definer,
              has_function_privilege('public', p.oid, 'execute') as public_can
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app_private' and p.proname = 'run_read_only'`,
    );
    expect(rows).toEqual([{ owner: "query_reader", definer: true, public_can: false }]);
    const role = await db.query<{ rolcanlogin: boolean; rolsuper: boolean; rolbypassrls: boolean }>(
      "select rolcanlogin, rolsuper, rolbypassrls from pg_roles where rolname = 'query_reader'",
    );
    expect(role.rows).toEqual([{ rolcanlogin: false, rolsuper: false, rolbypassrls: false }]);
    // It no longer holds CREATE on app_private (040 gives it only for the hand-over).
    const create = await db.query<{ can: boolean }>(
      "select has_schema_privilege('query_reader', 'app_private', 'create') as can",
    );
    expect(create.rows[0]!.can).toBe(false);
  });
});

describe("query_reader, as itself", () => {
  // The same refusals with the function out of the way: the role's own grants.
  it("reads unicorns and nothing else, and writes nothing", async () => {
    const db = await migrated();
    await db.exec("set role query_reader");
    try {
      expect((await db.query<{ n: number }>("select count(*)::int as n from unicorns")).rows[0]!.n).toBe(60);
      for (const [statement, why] of [
        ["DELETE FROM unicorns", /permission denied for table unicorns/],
        ["UPDATE unicorns SET valuation = 0", /permission denied for table unicorns/],
        [
          "INSERT INTO unicorns (company, valuation, country, city, industry, select_investors) VALUES ('x', 1, 'x', 'x', 'x', 'x')",
          /permission denied for table unicorns/,
        ],
        ["DROP TABLE unicorns", /must be owner of table unicorns/],
        ["TRUNCATE unicorns", /permission denied for table unicorns/],
        ["ALTER TABLE unicorns ADD COLUMN x int", /must be owner of table unicorns/],
        ["CREATE TABLE public.x (y int)", /permission denied for schema public/],
        ["SELECT * FROM _migrations.applied", /permission denied for schema _migrations/],
      ] as const) {
        await expect(db.exec(statement), statement).rejects.toThrow(why);
      }
    } finally {
      await db.exec("reset role");
    }
    expect((await db.query<{ n: number }>("select count(*)::int as n from unicorns")).rows[0]!.n).toBe(60);
  }, 60_000);

  it("is the same after every migration is applied a second time", async () => {
    const db = await migrated();
    for (const entry of manifest.migrations) {
      await db.exec(sqlOf(entry.path));
    }
    expect(await count(db)).toBe(60);
    expect(await runReadOnly(db, "select current_user as role")).toEqual([{ role: "query_reader" }]);
    const policies = await db.query<{ n: number }>("select count(*)::int as n from pg_policies");
    expect(policies.rows[0]!.n).toBe(1);
  }, 60_000);
});
