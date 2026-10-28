import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { manifest } from "@saas/db/manifest";

// Supabase's Data API (PostgREST) serves the `public` schema to anyone holding
// the project's anon key. Migration 030 enables row-level security on every
// table there: `anon` and `authenticated` get nothing, and the app — which
// owns the table — keeps everything. These run every migration db-migrate
// applies, in the manifest's order, on a real Postgres in process (PGlite:
// Postgres compiled to WASM), and read the catalog it leaves.
const migrationsDir = path.resolve(__dirname, "../../../packages/db/src/migrations");
const sqlOf = (rel: string) => readFileSync(path.join(migrationsDir, rel), "utf8");
const fresh = () => new PGlite();

async function migrated(): Promise<PGlite> {
  const db = fresh();
  for (const entry of manifest.migrations) {
    await db.exec(sqlOf(entry.path));
  }
  return db;
}

type Rel = { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean };
const PUBLIC_TABLES = `
  select c.relname, c.relrowsecurity, c.relforcerowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
   order by c.relname`;

describe("row-level security on public (after every migration)", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await migrated();
  }, 60_000);

  it("leaves no table in public without row-level security", async () => {
    const { rows } = await db.query<Rel>(PUBLIC_TABLES);
    // Not vacuous: the template's table is there.
    expect(rows.map((r) => r.relname)).toEqual(["unicorns"]);
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });

  it("forces none, and its only policy is query_reader's, for SELECT", async () => {
    const { rows } = await db.query<Rel>(PUBLIC_TABLES);
    expect(rows.filter((r) => r.relforcerowsecurity).map((r) => r.relname)).toEqual([]);
    const policies = await db.query<{ policyname: string; cmd: string; roles: string; qual: string }>(
      "select policyname, cmd, roles::text as roles, qual from pg_policies where schemaname = 'public'",
    );
    expect(policies.rows).toEqual([
      { policyname: "unicorns_read_only_queries", cmd: "SELECT", roles: "{query_reader}", qual: "true" },
    ]);
  });

  it("gives a role with the Data API's grants nothing, and the owner everything", async () => {
    // What Supabase grants `anon` on public by default — so a refusal below is
    // row-level security's, not a missing grant's.
    await db.exec(`
      create role anon nologin;
      grant usage on schema public to anon;
      grant select, insert, update, delete on all tables in schema public to anon;
      grant usage on all sequences in schema public to anon;`);
    await db.exec("set role anon");
    try {
      const seen = await db.query<{ n: number }>("select count(*)::int as n from unicorns");
      expect(seen.rows[0]!.n).toBe(0);
      await expect(
        db.exec(
          "insert into unicorns (company, valuation, country, city, industry, select_investors) values ('x', 1, 'x', 'x', 'x', 'x')",
        ),
      ).rejects.toThrow(/row-level security/);
      // Nor can it reach the function the app runs the model's SQL through.
      await expect(db.query("select app_private.run_read_only('select 1')")).rejects.toThrow(
        /permission denied for schema app_private/,
      );
    } finally {
      await db.exec("reset role");
    }
    const owner = await db.query<{ n: number }>("select count(*)::int as n from unicorns");
    expect(owner.rows[0]!.n).toBe(60);
  });
});

describe("migration 030's guard", () => {
  // The guard names `postgres`, the role Hyperdrive connects as, which PGlite
  // cannot take SUPERUSER from. Pointed instead at a role that neither owns the
  // table nor bypasses RLS, it must refuse — and enable nothing.
  const migration = sqlOf("030_row_level_security/up.sql");
  const aimedAt = (role: string) =>
    migration.replaceAll("rolname = 'postgres'", `rolname = '${role}'`).replaceAll("<> 'postgres'", `<> '${role}'`);

  async function beforeRls(): Promise<PGlite> {
    const db = fresh();
    for (const entry of manifest.migrations.filter((m) => m.id < "030")) {
      await db.exec(sqlOf(entry.path));
    }
    return db;
  }

  it("refuses when the app's role would be locked out, enabling nothing", async () => {
    const db = await beforeRls();
    await db.exec("create role app_without_bypass nologin");
    await expect(db.exec(aimedAt("app_without_bypass"))).rejects.toThrow(/would lock the app out/);
    const { rows } = await db.query<Rel>(PUBLIC_TABLES);
    expect(rows.filter((r) => r.relrowsecurity)).toEqual([]);
  }, 60_000);

  it("passes for a role with BYPASSRLS", async () => {
    const db = await beforeRls();
    await db.exec("create role app_with_bypass nologin bypassrls");
    await db.exec(aimedAt("app_with_bypass"));
    const { rows } = await db.query<Rel>(PUBLIC_TABLES);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  }, 60_000);
});
