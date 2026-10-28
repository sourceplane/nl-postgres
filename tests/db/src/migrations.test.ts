import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { manifest } from "@saas/db/manifest";
import { buildPlan, runMigrations } from "@saas/db/runner";

const migrationsDir = path.resolve(__dirname, "../../../packages/db/src/migrations");
const sqlOf = (rel: string) => readFileSync(path.join(migrationsDir, rel), "utf8");

describe("the migration manifest (packages/db)", () => {
  it("starts with the control migration and names every file with its checksum", () => {
    expect(manifest.migrations.map((m) => m.id)).toEqual([
      "000_control_baseline",
      "010_unicorns",
      "020_sample_unicorns",
      "030_row_level_security",
      "040_read_only_queries",
    ]);
    for (const entry of manifest.migrations) {
      const file = readFileSync(path.join(migrationsDir, entry.path));
      expect(createHash("sha256").update(file).digest("hex"), entry.id).toBe(entry.checksum);
    }
  });

  it("plans every migration as pending offline", async () => {
    const result = await runMigrations(manifest, { mode: "plan", migrationsDir, adapter: null });
    expect(result.failed).toBeNull();
    expect(result.applied).toEqual(manifest.migrations.map((m) => m.id));
  });

  it("skips what the database already recorded", () => {
    const applied = new Map([[manifest.migrations[0]!.id, manifest.migrations[0]!.checksum]]);
    const plan = buildPlan(manifest, applied, migrationsDir);
    expect(plan.alreadyApplied).toEqual([manifest.migrations[0]!.id]);
    expect(plan.pending.map((m) => m.id)).toEqual(manifest.migrations.slice(1).map((m) => m.id));
    expect(plan.checksumMismatches).toEqual([]);
  });
});

describe("the schema (010) and its sample rows (020)", () => {
  it("is upstream's unicorns table, column for column", async () => {
    const db = new PGlite();
    await db.exec(sqlOf("010_unicorns/up.sql"));
    const { rows } = await db.query<{ column_name: string; type: string; nullable: string }>(
      `select c.column_name, format_type(a.atttypid, a.atttypmod) as type, c.is_nullable as nullable
         from information_schema.columns c
         join pg_attribute a on a.attrelid = 'public.unicorns'::regclass and a.attname = c.column_name
        where c.table_name = 'unicorns' order by c.ordinal_position`,
    );
    expect(rows).toEqual([
      { column_name: "id", type: "integer", nullable: "NO" },
      { column_name: "company", type: "character varying(255)", nullable: "NO" },
      { column_name: "valuation", type: "numeric(10,2)", nullable: "NO" },
      { column_name: "date_joined", type: "date", nullable: "YES" },
      { column_name: "country", type: "character varying(255)", nullable: "NO" },
      { column_name: "city", type: "character varying(255)", nullable: "NO" },
      { column_name: "industry", type: "character varying(255)", nullable: "NO" },
      { column_name: "select_investors", type: "text", nullable: "NO" },
    ]);
    const unique = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_indexes where tablename = 'unicorns' and indexdef like '%UNIQUE%(company)%'`,
    );
    expect(unique.rows[0]!.n).toBe(1);
  }, 60_000);

  it("seeds sixty companies, says they are fictional, and seeds nothing twice", async () => {
    const sample = sqlOf("020_sample_unicorns/up.sql");
    expect(sample).toMatch(/SIXTY FICTIONAL COMPANIES/);
    const db = new PGlite();
    await db.exec(sqlOf("010_unicorns/up.sql"));
    await db.exec(sample);
    await db.exec(sample);
    const { rows } = await db.query<{ n: number; countries: number; industries: string[] }>(
      `select count(*)::int as n, count(distinct country)::int as countries,
              array_agg(distinct industry order by industry) as industries from unicorns`,
    );
    expect(rows[0]!.n).toBe(60);
    expect(rows[0]!.countries).toBeGreaterThan(10);
    // Every industry the query prompt lists (app/actions.ts), and no other.
    expect(rows[0]!.industries).toEqual([
      "consumer & retail",
      "enterprise tech",
      "financial services",
      "health",
      "healthcare & life sciences",
      "industrials",
      "insurance",
      "media & entertainment",
    ]);
    // The countries the prompt says to write out in full.
    const spelled = await db.query<{ country: string }>(
      `select distinct country from unicorns where country in ('United States', 'United Kingdom', 'China') order by country`,
    );
    expect(spelled.rows.map((r) => r.country)).toEqual(["China", "United Kingdom", "United States"]);
  }, 60_000);
});
