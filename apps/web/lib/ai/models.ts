import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createWorkersAI, type WorkersAI } from "workers-ai-provider";

// Not upstream's. Upstream named its model as a plain string id,
// openai/gpt-5.4-mini, which AI SDK 6 sends through Vercel's AI Gateway — a
// gateway key before it could answer anything. Here the model is:
//
//   Workers AI, by default   Llama 4 Scout, through the Worker's own `AI`
//                            binding (wrangler.jsonc): the Cloudflare account
//                            the app deploys into is the whole AI vendor, so a
//                            fresh deploy writes, runs and explains SQL with
//                            no key of anyone else's. It answers in JSON mode,
//                            which the three structured outputs in
//                            app/actions.ts ask for (Output.object).
//   OpenAI, once a key is    upstream's own model, gpt-5.4-mini, straight from
//   set                      OpenAI (@ai-sdk/openai) — OPENAI_API_KEY, a Worker
//                            secret the owner sets (README, "Use OpenAI
//                            instead"), the key upstream's own Vercel button
//                            asked for. No gateway either way.
//
// The id is checked against Workers AI's catalog as @cloudflare/workers-types
// lists it (`keyof AiModels`); workers-ai-provider narrows its own id type by
// an older shape most current models no longer match — hence the cast.
export const WORKERS_AI_MODEL =
  "@cf/meta/llama-4-scout-17b-16e-instruct" satisfies keyof AiModels;
export const OPENAI_MODEL = "gpt-5.4-mini";

export class AiNotConfiguredError extends Error {
  constructor() {
    super(
      "No model is available: the Worker has no AI binding (wrangler.jsonc) and OPENAI_API_KEY is not set",
    );
    this.name = "AiNotConfiguredError";
  }
}

/** Which provider writes the SQL — reported by /api/health. */
export function modelProvider(): "openai" | "workers-ai" {
  return process.env.OPENAI_API_KEY?.trim() ? "openai" : "workers-ai";
}

async function aiBinding(): Promise<Ai> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    if (env.AI) return env.AI;
  } catch {
    // Not running under OpenNext (a script, a test): no binding.
  }
  throw new AiNotConfiguredError();
}

export async function model(): Promise<LanguageModel> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (key) return createOpenAI({ apiKey: key })(OPENAI_MODEL);
  const workersai = createWorkersAI({ binding: await aiBinding() });
  return workersai(WORKERS_AI_MODEL as Parameters<WorkersAI>[0]);
}
