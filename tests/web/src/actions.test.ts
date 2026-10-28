import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";

// app/actions.ts: the template's four server actions. What they ask the model
// and what they do with its answers is upstream's; what changed is where the
// model comes from (lib/ai/models.ts) and where the SQL runs (lib/db.ts, as
// query_reader). The template's own string check stays in front of it.
const runReadOnlyQuery = vi.fn();
vi.mock("@/lib/db", () => ({ runReadOnlyQuery: (...args: unknown[]) => runReadOnlyQuery(...args) }));

type Answer = unknown;
let answers: Answer[] = [];
const prompts: { system?: string; user: string }[] = [];
vi.mock("@/lib/ai/models", () => ({
  model: async () =>
    new MockLanguageModelV3({
      doGenerate: async ({ prompt }) => {
        const system = prompt.find((m) => m.role === "system");
        const user = prompt.find((m) => m.role === "user");
        prompts.push({
          system: system && typeof system.content === "string" ? system.content : undefined,
          user:
            user && Array.isArray(user.content)
              ? user.content.map((p) => ("text" in p ? p.text : "")).join("")
              : "",
        });
        const next = answers.shift();
        return {
          content: [{ type: "text", text: JSON.stringify(next) }],
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          },
          warnings: [],
        };
      },
    }),
}));

describe("app/actions.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    runReadOnlyQuery.mockReset();
    answers = [];
    prompts.length = 0;
  });

  it("generateQuery returns the SQL the model wrote, asked with upstream's prompt", async () => {
    answers = [{ query: "SELECT country, COUNT(*) AS count FROM unicorns GROUP BY country" }];
    const { generateQuery } = await import("@/app/actions");
    await expect(generateQuery("Countries with highest unicorn density")).resolves.toBe(
      "SELECT country, COUNT(*) AS count FROM unicorns GROUP BY country",
    );
    expect(prompts[0]!.system).toContain("unicorns (");
    expect(prompts[0]!.system).toContain("Only retrieval queries are allowed.");
    expect(prompts[0]!.user).toBe(
      "Generate the query necessary to retrieve the data the user wants: Countries with highest unicorn density",
    );
  });

  it("runGenerateSQLQuery runs a SELECT through the read-only path and returns its rows", async () => {
    runReadOnlyQuery.mockResolvedValue([{ country: "United States", count: 30 }]);
    const { runGenerateSQLQuery } = await import("@/app/actions");
    await expect(runGenerateSQLQuery("SELECT country, COUNT(*) AS count FROM unicorns GROUP BY country")).resolves.toEqual([
      { country: "United States", count: 30 },
    ]);
    expect(runReadOnlyQuery).toHaveBeenCalledWith("SELECT country, COUNT(*) AS count FROM unicorns GROUP BY country");
  });

  it("keeps the template's own check in front of the database", async () => {
    const { runGenerateSQLQuery } = await import("@/app/actions");
    for (const query of [
      "DELETE FROM unicorns",
      "WITH x AS (SELECT 1) SELECT * FROM x",
      "select 1; drop table unicorns",
      "select * from unicorns where company = 'x'; delete from unicorns",
      "select 1 union select 2; insert into unicorns values (1)",
      "SELECT * FROM unicorns; UPDATE unicorns SET valuation = 0",
      "select 1; alter table unicorns add column x int",
      "select 1; truncate unicorns",
      "select 1; create table x (y int)",
      "select 1; grant all on unicorns to anon",
      "select 1; revoke all on unicorns from postgres",
    ]) {
      await expect(runGenerateSQLQuery(query), query).rejects.toThrow("Only SELECT queries are allowed");
    }
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("says the table is missing when the database was never migrated", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error('relation "unicorns" does not exist'));
    const { runGenerateSQLQuery } = await import("@/app/actions");
    await expect(runGenerateSQLQuery("SELECT * FROM unicorns")).rejects.toThrow("Table does not exist");
    runReadOnlyQuery.mockRejectedValue(new Error("function app_private.run_read_only(unknown) does not exist"));
    await expect(runGenerateSQLQuery("SELECT * FROM unicorns")).rejects.toThrow("Table does not exist");
  });

  it("passes on what the database refuses", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("permission denied for schema _migrations"));
    const { runGenerateSQLQuery } = await import("@/app/actions");
    await expect(runGenerateSQLQuery("SELECT * FROM _migrations.applied")).rejects.toThrow(
      "permission denied for schema _migrations",
    );
  });

  it("generateChartConfig colours each y key from the theme, as upstream does", async () => {
    answers = [
      {
        description: "Unicorns per country",
        takeaway: "Most are in the United States",
        type: "bar",
        title: "Unicorns by country",
        xKey: "country",
        yKeys: ["count"],
        multipleLines: null,
        measurementColumn: null,
        lineCategories: null,
        colors: null,
        legend: true,
      },
    ];
    const { generateChartConfig } = await import("@/app/actions");
    const { config } = await generateChartConfig([{ country: "United States", count: 30 }], "Countries");
    expect(config).toMatchObject({ type: "bar", xKey: "country", yKeys: ["count"] });
    expect(config.colors).toEqual({ count: "hsl(var(--chart-1))" });
    expect(prompts[0]!.user).toContain('"country": "United States"');
  });

  it("explainQuery returns the model's sections", async () => {
    answers = [{ explanations: [{ section: "SELECT country", explanation: "Pick the country." }] }];
    const { explainQuery } = await import("@/app/actions");
    await expect(explainQuery("Countries", "SELECT country FROM unicorns")).resolves.toEqual({
      explanations: [{ section: "SELECT country", explanation: "Pick the country." }],
    });
    expect(prompts[0]!.user).toContain("SELECT country FROM unicorns");
  });
});
