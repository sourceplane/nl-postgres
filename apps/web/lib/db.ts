import postgres from "postgres";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Result } from "@/lib/types";

// Not upstream's. Upstream ran `sql.query(query)` from @vercel/postgres on a
// pool it opened from POSTGRES_URL at module scope. On Cloudflare the
// database is the HYPERDRIVE binding's (Hyperdrive pools the real Postgres
// connections at the edge), and a socket opened in one request cannot be used
// by another ("Cannot perform I/O on behalf of a different request"), so each
// call builds its own client and closes it.
//
// Without a Cloudflare context — tests, scripts — DATABASE_URL is the
// connection string. `next dev` has the context (initOpenNextCloudflareForDev
// in next.config.mjs) and so uses the binding's localConnectionString from
// wrangler.jsonc.
async function connectionString(): Promise<string> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    if (env.HYPERDRIVE?.connectionString) {
      return env.HYPERDRIVE.connectionString;
    }
  } catch {
    // Not running under OpenNext: fall through to DATABASE_URL.
  }
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not set and no HYPERDRIVE binding is available");
  }
  return url;
}

export async function getSql() {
  // Hyperdrive pools on its side; a Worker request holds few connections,
  // skips the pg_types round trip and sends plain (unprepared) statements.
  return postgres(await connectionString(), {
    max: 5,
    fetch_types: false,
    prepare: false,
  });
}

// How long the model's SQL may run before Postgres cancels it.
export const QUERY_TIMEOUT = "5s";

/**
 * Runs SQL the model wrote, as `query_reader` and nothing more.
 *
 * The SQL goes to app_private.run_read_only (migration 040), a SECURITY
 * DEFINER function owned by query_reader: inside it the query has SELECT on
 * `unicorns` and no other privilege, and cannot SET ROLE back to this
 * connection's. Around it: a READ ONLY transaction, and a statement timeout.
 * The rows come back as the function returns them — one JSON array, in the
 * query's order.
 */
export async function runReadOnlyQuery(query: string): Promise<Result[]> {
  const sql = await getSql();
  try {
    return await sql.begin("read only", async (tx) => {
      await tx.unsafe(`SET LOCAL statement_timeout = '${QUERY_TIMEOUT}'`);
      const [row] = await tx<{ rows: Result[] }[]>`
        SELECT app_private.run_read_only(${query}) AS rows`;
      return row?.rows ?? [];
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
