import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { manifest } from "@saas/db/manifest";
// @ts-expect-error — a plain .mjs tool with no type declarations
import { csvToSql, parseCsv, parseDate } from "../../../tooling/migrations/csv-to-sql.mjs";
// @ts-expect-error — a plain .mjs tool with no type declarations
import { migrationFiles } from "../../../tooling/migrations/apply-local.mjs";

// tooling/migrations/csv-to-sql.mjs: CB Insights' CSV — what upstream's README
// has each owner download and its lib/seed.ts loaded — as a migration that
// replaces the sample companies. Read as upstream read it.
const migrationsDir = path.resolve(__dirname, "../../../packages/db/src/migrations");
const sqlOf = (rel: string) => readFileSync(path.join(migrationsDir, rel), "utf8");

const CSV = [
  "﻿Company,Valuation ($B),Date Joined,Country,City,Industry,Select Investors",
  'Acme Rockets,"$1,250.50",7/4/2017,United States,San Francisco,industrials,"First Fund, Second Fund"',
  `"O'Brien & Daughters",$3.00,21/11/2021,Ireland,Dublin,consumer & retail,Third Fund`,
  'Acme Rockets,$9.99,1/1/2020,United States,New York,industrials,Duplicate Fund',
  "",
].join("\r\n");

describe("tooling/migrations/csv-to-sql.mjs", () => {
  it("reads quoted fields, a BOM and CRLF, and upstream's day/month/year dates", () => {
    const rows = parseCsv(CSV.replace(/^﻿/, ""));
    expect(rows).toHaveLength(4);
    expect(rows[1]![6]).toBe("First Fund, Second Fund");
    expect(rows[2]![0]).toBe("O'Brien & Daughters");
    expect(parseDate("7/4/2017")).toBe("2017-04-07");
    expect(() => parseDate("2017-04-07")).toThrow(/Could not parse date/);
  });

  it("refuses a CSV without the list's columns", () => {
    expect(() => csvToSql("Name,Value\nx,1\n")).toThrow(/no column\(s\) Company/);
  });

  it("writes a migration that replaces the sample companies with the CSV's", async () => {
    const db = new PGlite();
    for (const entry of manifest.migrations) {
      await db.exec(sqlOf(entry.path));
    }
    await db.exec(csvToSql(CSV));
    const { rows } = await db.query<{
      company: string;
      valuation: string;
      date_joined: string;
      select_investors: string;
    }>("select company, valuation::text, date_joined::text, select_investors from unicorns order by company");
    expect(rows).toEqual([
      { company: "Acme Rockets", valuation: "1250.50", date_joined: "2017-04-07", select_investors: "First Fund, Second Fund" },
      { company: "O'Brien & Daughters", valuation: "3.00", date_joined: "2021-11-21", select_investors: "Third Fund" },
    ]);
    // query_reader reads the new rows as it read the sample's.
    const seen = await db.query<{ rows: unknown[] }>(
      "select app_private.run_read_only('select count(*) as n from unicorns') as rows",
    );
    expect(seen.rows[0]!.rows).toEqual([{ n: 2 }]);
  }, 60_000);
});

// tooling/migrations/apply-local.mjs: the local apply walks the manifest.

describe("tooling/migrations/apply-local.mjs", () => {
  it("applies every migration, in the manifest's order", () => {
    expect((migrationFiles() as string[]).map((f) => path.relative(migrationsDir, f))).toEqual(
      manifest.migrations.map((m) => m.path),
    );
  });
});
