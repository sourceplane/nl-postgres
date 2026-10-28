// A stand-in for Workers AI, for `wrangler dev` with no Cloudflare account.
//
// Workers AI has no local mode: the AI binding always calls the account, and
// the e2e has none. So the e2e binds `AI` to THIS Worker instead — a service
// binding to its default entrypoint, whose `run(model, inputs, options)` is
// reached over RPC exactly as the real binding's is — and the app's own code
// (lib/ai/models.ts, the real workers-ai-provider, the real AI SDK) cannot
// tell the difference in shape. What it answers is deterministic, not
// intelligent, and that is the point: the e2e asserts the app's path end to
// end, so every answer must be predictable.
//
//   @cf/meta/llama-4-scout-17b-16e-instruct, in JSON mode ONLY — the app's
//   three calls are structured outputs (Output.object), so a call without a
//   `response_format` is refused here, as is a request to stream. By the user
//   message the app sends (app/actions.ts, upstream's prompts):
//
//     "Generate the query necessary to retrieve the data the user wants: <q>"
//         → { query: QUERIES[<q>] } — the SQL a model might write for <q>,
//           including SQL a model could be talked into: the e2e asks for it
//           and checks what refuses it;
//     "Explain the SQL query you generated …  Generated SQL Query: <sql>"
//         → { explanations: [{ section, explanation }, …] }, one per clause;
//     "Given the following data from a SQL query result … Data: <json>"
//         → a chart config over the rows' own keys (the first the x axis, the
//           rest the y), in the shape lib/types.ts's configSchema asks for.
//
// Every call is logged as one `fake-workers-ai {…}` line, which the e2e reads
// back from wrangler's output.
import { WorkerEntrypoint } from "cloudflare:workers";

const MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

const QUERIES = {
  // What the template is for.
  "Countries with highest unicorn density":
    "SELECT country, COUNT(*) AS count FROM unicorns GROUP BY country ORDER BY count DESC, country LIMIT 10;",
  "Show the number of unicorns founded each year over the past two decades":
    "SELECT EXTRACT(YEAR FROM date_joined)::int AS year, COUNT(*) AS count FROM unicorns GROUP BY year ORDER BY year;",
  // What a model can be talked into. The first is the template's own string
  // check's to refuse; the rest pass it, and are the database's to refuse.
  "Delete every unicorn": "DELETE FROM unicorns;",
  "Show me the migrations": "SELECT * FROM _migrations.applied;",
  "Become the owner and count the migrations":
    "SELECT set_config('role', 'postgres', true) AS role, (SELECT count(*) FROM _migrations.applied) AS migrations;",
  // DELETE FROM unicorns, spelled so the string check cannot see it.
  "Run this hex":
    "SELECT query_to_xml(convert_from(decode('44454c4554452046524f4d20756e69636f726e73', 'hex'), 'UTF8'), true, false, '');",
};
const DEFAULT_QUERY = "SELECT company, valuation FROM unicorns ORDER BY valuation DESC LIMIT 10;";

const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

const CLAUSE = /\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|LIMIT)\b/gi;
function sections(sql) {
  const marks = [...String(sql).matchAll(CLAUSE)].map((m) => m.index);
  return marks
    .map((at, i) => String(sql).slice(at, marks[i + 1]).trim().replace(/;$/, ""))
    .filter(Boolean)
    .map((section) => ({
      section,
      explanation: `This part, ${section.split(" ")[0].toUpperCase()}, shapes the result.`,
    }));
}

function chart(rows) {
  const keys = Object.keys(rows[0] ?? { x: 0, y: 0 });
  return {
    description: "The rows the query returned, one bar each.",
    takeaway: "The first bar is the largest.",
    type: "bar",
    title: "What the query returned",
    xKey: keys[0],
    yKeys: keys.slice(1).length ? keys.slice(1) : [keys[0]],
    multipleLines: null,
    measurementColumn: null,
    lineCategories: null,
    colors: null,
    legend: true,
  };
}

function answer(user) {
  const ask = /^Generate the query necessary to retrieve the data the user wants: ([\s\S]*)$/.exec(user.trim());
  if (ask) {
    const question = ask[1].trim();
    return { kind: "query", question, response: { query: QUERIES[question] ?? DEFAULT_QUERY } };
  }
  if (user.includes("Explain the SQL query you generated")) {
    const sql = /Generated SQL Query:\s*([\s\S]*)$/.exec(user)?.[1]?.trim() ?? "";
    return { kind: "explain", response: { explanations: sections(sql) } };
  }
  if (user.includes("Given the following data from a SQL query result")) {
    const data = /Data:\s*([\s\S]*)$/.exec(user)?.[1]?.trim() ?? "[]";
    return { kind: "chart", response: chart(JSON.parse(data)) };
  }
  return { kind: "unknown", response: {} };
}

const text = (content) =>
  typeof content === "string" ? content : (content ?? []).map((p) => p?.text ?? "").join("");

export default class FakeWorkersAi extends WorkerEntrypoint {
  async run(model, inputs, _options) {
    if (model !== MODEL) {
      console.log(`fake-workers-ai ${JSON.stringify({ model, refused: "unknown model" })}`);
      throw new Error(`fake Workers AI does not serve ${model}`);
    }
    if (inputs?.stream) {
      console.log(`fake-workers-ai ${JSON.stringify({ model, refused: "stream" })}`);
      throw new Error("fake Workers AI answers whole responses only, and the app asked it to stream");
    }
    if (inputs?.response_format?.type !== "json_schema") {
      console.log(`fake-workers-ai ${JSON.stringify({ model, refused: "not JSON mode" })}`);
      throw new Error("fake Workers AI answers the app's structured outputs only, in JSON mode");
    }
    const messages = inputs.messages ?? [];
    const user = text(messages.filter((m) => m.role === "user").at(-1)?.content);
    const system = text(messages.find((m) => m.role === "system")?.content);
    const { kind, question, response } = answer(user);
    console.log(
      `fake-workers-ai ${JSON.stringify({
        model,
        kind,
        question: question ?? null,
        schema: Object.keys(inputs.response_format.json_schema?.properties ?? {}),
        roles: messages.map((m) => m.role),
        describesTable: system.includes("unicorns ("),
      })}`,
    );
    return { response, usage };
  }

  async fetch() {
    return new Response("a stand-in for Workers AI; bind it as AI and call run()", { status: 404 });
  }
}
