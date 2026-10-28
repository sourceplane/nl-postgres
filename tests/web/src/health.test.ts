import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// app/api/health/route.ts: what the deploy's smoke and the bootstrap's probe
// read. It answers ok only when the database is reachable AND migrated — the
// table, the role the model's SQL runs as, and the function it runs through.
let row: Record<string, unknown> | null = null;
let fail: Error | null = null;
const end = vi.fn(async () => undefined);
const getSql = vi.fn(async () =>
  Object.assign(
    async () => {
      if (fail) throw fail;
      return row ? [row] : [];
    },
    { end },
  ),
);
vi.mock("@/lib/db", () => ({ getSql: () => getSql() }));

async function health() {
  const { GET } = await import("@/app/api/health/route");
  const res = await GET();
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body, cache: res.headers.get("cache-control") };
}

describe("/api/health", () => {
  beforeEach(() => {
    vi.resetModules();
    end.mockClear();
    row = null;
    fail = null;
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is ok when the table, the reader role and its function are there, and names the model", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    row = { unicorns: "unicorns", reader: true, runner: "app_private.run_read_only(text)" };
    await expect(health()).resolves.toEqual({
      status: 200,
      body: { ok: true, database: "reachable", schema: "migrated", model: "workers-ai" },
      cache: "no-store",
    });
    expect(end).toHaveBeenCalledTimes(1);
    vi.stubEnv("OPENAI_API_KEY", "sk-test-not-a-key");
    expect((await health()).body.model).toBe("openai");
  });

  it("is 503 'missing' until 040 has run", async () => {
    row = { unicorns: "unicorns", reader: false, runner: null };
    const { status, body } = await health();
    expect(status).toBe(503);
    expect(body).toMatchObject({ ok: false, database: "reachable", schema: "missing" });
  });

  it("is 503 'unreachable' when the database cannot be reached", async () => {
    fail = new Error("connect ECONNREFUSED");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(health()).resolves.toMatchObject({ status: 503, body: { ok: false, database: "unreachable" } });
  });
});
