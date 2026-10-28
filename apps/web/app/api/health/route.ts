import { getSql } from "@/lib/db";
import { modelProvider } from "@/lib/ai/models";

// Not upstream's: the deploy's smoke check and the bootstrap's probe read
// this. A page that renders proves the Worker deployed; this proves what the
// page never touches until somebody asks a question — the HYPERDRIVE binding
// names a real config, Hyperdrive reaches the Supabase database, and
// db-migrate applied the schema: the table, the role the model's SQL runs as
// and the function it runs through (migration 040). It calls no model and
// runs no generated SQL. `model` says which provider would write the SQL
// (lib/ai/models.ts).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sql = await getSql();
    try {
      const [row] = await sql<
        { unicorns: string | null; reader: boolean; runner: string | null }[]
      >`select to_regclass('public.unicorns')::text as unicorns,
               exists (select 1 from pg_roles where rolname = 'query_reader') as reader,
               to_regprocedure('app_private.run_read_only(text)')::text as runner`;
      const ok = Boolean(row?.unicorns && row?.reader && row?.runner);
      return Response.json(
        { ok, database: "reachable", schema: ok ? "migrated" : "missing", model: modelProvider() },
        { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch (error) {
    console.error("health: database check failed", error);
    return Response.json(
      { ok: false, database: "unreachable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
