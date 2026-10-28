#!/usr/bin/env node
// Turns CB Insights' list of unicorn companies — the CSV upstream's README has
// each owner download (https://www.cbinsights.com/research-unicorn-companies)
// and its lib/seed.ts loaded — into a packages/db migration, so the data
// reaches each environment's database the way the schema does: through
// db-migrate, on a merge.
//
//   node tooling/migrations/csv-to-sql.mjs unicorns.csv \
//     packages/db/src/migrations/050_cb_insights_unicorns/up.sql
//
// then list the migration in packages/db/src/manifest.ts and run
// `pnpm --filter @saas/db run manifest:fix`.
//
// The migration REPLACES what the table holds — the sixty fictional sample
// companies of 020 included — with the CSV's rows, in one statement batch the
// runner applies as one migration. Rows are read as upstream's seed read them:
// the columns Company, Valuation ($B), Date Joined (day/month/year), Country,
// City, Industry and Select Investors; the valuation without its `$` and
// thousands comma; a company that appears twice kept once (ON CONFLICT
// (company) DO NOTHING). Nothing is sent anywhere: this writes a file.
import { readFileSync, writeFileSync } from "node:fs";

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

// Upstream's parseDate: day/month/year.
export function parseDate(value) {
  const parts = String(value).trim().split("/");
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) {
    throw new Error(`Could not parse date: ${value}`);
  }
  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parseValuation(value) {
  const n = parseFloat(String(value).replace("$", "").replace(/,/g, ""));
  if (!Number.isFinite(n)) throw new Error(`Could not parse valuation: ${value}`);
  return n;
}

const COLUMNS = ["Company", "Valuation ($B)", "Date Joined", "Country", "City", "Industry", "Select Investors"];
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

export function csvToSql(text) {
  const [header, ...records] = parseCsv(text.replace(/^﻿/, ""));
  const at = Object.fromEntries((header ?? []).map((h, i) => [h.trim(), i]));
  const missing = COLUMNS.filter((c) => !(c in at));
  if (missing.length) throw new Error(`the CSV has no column(s) ${missing.join(", ")}`);
  if (records.length === 0) throw new Error("the CSV has no rows");
  const values = records.map((r) => {
    const get = (c) => (r[at[c]] ?? "").trim();
    return `  (${[
      lit(get("Company")),
      parseValuation(get("Valuation ($B)")).toFixed(2),
      lit(parseDate(get("Date Joined"))),
      lit(get("Country")),
      lit(get("City")),
      lit(get("Industry")),
      lit(get("Select Investors")),
    ].join(", ")})`;
  });
  return [
    "-- CB Insights' list of unicorn companies, written by",
    "-- tooling/migrations/csv-to-sql.mjs from the CSV its owner downloaded.",
    "-- Replaces whatever the table held (the sample companies of 020 included).",
    "DELETE FROM unicorns;",
    "INSERT INTO unicorns (company, valuation, date_joined, country, city, industry, select_investors) VALUES",
    values.join(",\n"),
    "ON CONFLICT (company) DO NOTHING;",
    "",
  ].join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [csvPath, outPath] = process.argv.slice(2);
  if (!csvPath || !outPath) {
    console.error("usage: csv-to-sql.mjs <unicorns.csv> <packages/db/src/migrations/NNN_name/up.sql>");
    process.exit(2);
  }
  const sql = csvToSql(readFileSync(csvPath, "utf8"));
  writeFileSync(outPath, sql);
  console.log(`csv-to-sql: wrote ${outPath} (${sql.split("\n").filter((l) => l.startsWith("  (")).length} companies)`);
}
