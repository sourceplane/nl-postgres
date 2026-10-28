import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// lib/db.ts: the client upstream's @vercel/postgres pool became — one per
// call, from the HYPERDRIVE binding — and the one way the model's SQL runs:
// app_private.run_read_only (migration 040), in a READ ONLY transaction with
// a statement timeout.
type Call = { kind: string; text: string; values: unknown[] };
const calls: Call[] = [];
let rows: unknown = [];
let fail: Error | null = null;
const end = vi.fn(async () => undefined);
const begin = vi.fn(async (mode: string, fn: (tx: unknown) => Promise<unknown>) => {
  calls.push({ kind: "begin", text: mode, values: [] });
  const tx = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ kind: "query", text: strings.join("$"), values });
      if (fail) throw fail;
      return [{ rows }];
    },
    {
      unsafe: async (text: string) => {
        calls.push({ kind: "unsafe", text, values: [] });
        return [];
      },
    },
  );
  return fn(tx);
});
const postgres = vi.fn((connectionString: string, options: unknown) => ({
  connectionString,
  options,
  begin,
  end,
}));
vi.mock("postgres", () => ({ default: (...args: [string, unknown]) => postgres(...args) }));
const getCloudflareContext = vi.fn();
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: (...args: unknown[]) => getCloudflareContext(...args),
}));

const hyperdriveOptions = { max: 5, fetch_types: false, prepare: false };
const hyperdrive = { env: { HYPERDRIVE: { connectionString: "postgres://hyperdrive/db" } } };

describe("lib/db.ts", () => {
  const databaseUrl = process.env.DATABASE_URL;
  beforeEach(() => {
    vi.resetModules();
    postgres.mockClear();
    end.mockClear();
    begin.mockClear();
    getCloudflareContext.mockReset();
    calls.length = 0;
    rows = [];
    fail = null;
  });
  afterEach(() => {
    if (databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = databaseUrl;
  });

  it("connects through the HYPERDRIVE binding when a Cloudflare context exists", async () => {
    process.env.DATABASE_URL = "postgres://should-not-be-used";
    getCloudflareContext.mockResolvedValue(hyperdrive);
    const { getSql } = await import("@/lib/db");
    const sql = (await getSql()) as unknown as { connectionString: string; options: unknown };
    expect(getCloudflareContext).toHaveBeenCalledWith({ async: true });
    expect(sql.connectionString).toBe("postgres://hyperdrive/db");
    expect(sql.options).toEqual(hyperdriveOptions);
  });

  it("falls back to DATABASE_URL without a Cloudflare context, and refuses with neither", async () => {
    process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5432/unicorns";
    getCloudflareContext.mockRejectedValue(new Error("no cloudflare context"));
    const { getSql } = await import("@/lib/db");
    const sql = (await getSql()) as unknown as { connectionString: string };
    expect(sql.connectionString).toBe("postgres://postgres:postgres@localhost:5432/unicorns");
    delete process.env.DATABASE_URL;
    await expect(getSql()).rejects.toThrow(/DATABASE_URL is not set and no HYPERDRIVE binding/);
  });

  it("builds a new client on every call", async () => {
    getCloudflareContext.mockResolvedValue(hyperdrive);
    const { getSql } = await import("@/lib/db");
    await getSql();
    await getSql();
    expect(postgres).toHaveBeenCalledTimes(2);
  });

  it("runs the model's SQL only through app_private.run_read_only, read only, under a timeout", async () => {
    getCloudflareContext.mockResolvedValue(hyperdrive);
    rows = [{ country: "United States", count: 30 }];
    const { runReadOnlyQuery, QUERY_TIMEOUT } = await import("@/lib/db");
    const query = "SELECT country, COUNT(*) AS count FROM unicorns GROUP BY country";
    await expect(runReadOnlyQuery(query)).resolves.toEqual([{ country: "United States", count: 30 }]);
    expect(calls.map((c) => c.kind)).toEqual(["begin", "unsafe", "query"]);
    expect(calls[0]!.text).toBe("read only");
    expect(calls[1]!.text).toBe(`SET LOCAL statement_timeout = '${QUERY_TIMEOUT}'`);
    expect(QUERY_TIMEOUT).toBe("5s");
    // The query is a bound parameter of the function call, never SQL text.
    expect(calls[2]!.text.replace(/\s+/g, " ").trim()).toBe("SELECT app_private.run_read_only($) AS rows");
    expect(calls[2]!.values).toEqual([query]);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("closes its client when the database refuses the query", async () => {
    getCloudflareContext.mockResolvedValue(hyperdrive);
    fail = new Error("permission denied for table unicorns");
    const { runReadOnlyQuery } = await import("@/lib/db");
    await expect(runReadOnlyQuery("SELECT 1")).rejects.toThrow(/permission denied/);
    expect(end).toHaveBeenCalledTimes(1);
  });
});
