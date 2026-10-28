import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { generateText, Output } from "ai";
import { z } from "zod";

// lib/ai/models.ts: the model app/actions.ts asks for its three structured
// outputs. Upstream named "openai/gpt-5.4-mini", a string AI SDK 6 sends
// through Vercel's AI Gateway. Here it is Workers AI through the AI binding
// unless OPENAI_API_KEY is set, and then upstream's model straight from
// OpenAI — no gateway either way.
const getCloudflareContext = vi.fn();
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: (...args: unknown[]) => getCloudflareContext(...args),
}));

const app = path.resolve(__dirname, "../../../apps/web");
const usage = { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 };

describe("the model (lib/ai/models.ts)", () => {
  beforeEach(() => {
    vi.resetModules();
    getCloudflareContext.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is Workers AI's Llama 4 Scout through the AI binding when no key is set, in JSON mode", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const run = vi.fn(async () => ({ response: { query: "SELECT country, COUNT(*) FROM unicorns GROUP BY country" }, usage }));
    getCloudflareContext.mockResolvedValue({ env: { AI: { run } } });
    const { model, modelProvider, WORKERS_AI_MODEL } = await import("@/lib/ai/models");
    expect(modelProvider()).toBe("workers-ai");
    expect(WORKERS_AI_MODEL).toBe("@cf/meta/llama-4-scout-17b-16e-instruct");

    const { output } = await generateText({
      model: await model(),
      system: "You are a SQL (postgres) expert.",
      prompt: "Generate the query necessary to retrieve the data the user wants: countries",
      output: Output.object({ schema: z.object({ query: z.string() }) }),
    });
    expect(output).toEqual({ query: "SELECT country, COUNT(*) FROM unicorns GROUP BY country" });

    expect(run).toHaveBeenCalledTimes(1);
    const [id, inputs] = run.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(id).toBe(WORKERS_AI_MODEL);
    expect(inputs.stream).toBeFalsy();
    const format = inputs.response_format as { type: string; json_schema: { properties?: Record<string, unknown> } };
    expect(format.type).toBe("json_schema");
    expect(Object.keys(format.json_schema.properties ?? {})).toEqual(["query"]);
    const messages = inputs.messages as { role: string; content: string }[];
    expect(messages.map((m) => m.role)).toEqual(["system", "user"]);
  });

  it("is upstream's gpt-5.4-mini straight from OpenAI once OPENAI_API_KEY is set", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-not-a-key");
    const calls: { url: string; auth: string | null }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), auth: new Headers(init?.headers).get("authorization") });
      throw new Error("offline");
    }));
    const { model, modelProvider, OPENAI_MODEL } = await import("@/lib/ai/models");
    expect(modelProvider()).toBe("openai");
    const m = await model();
    expect(typeof m).not.toBe("string");
    expect((m as { modelId: string }).modelId).toBe(OPENAI_MODEL);
    expect(OPENAI_MODEL).toBe("gpt-5.4-mini");
    await expect(generateText({ model: m, prompt: "x", maxRetries: 0 })).rejects.toThrow();
    expect(calls.length).toBe(1);
    expect(new URL(calls[0]!.url).hostname).toBe("api.openai.com");
    expect(calls[0]!.auth).toBe("Bearer sk-test-not-a-key");
    // The binding is never asked for when OpenAI answers.
    expect(getCloudflareContext).not.toHaveBeenCalled();
  });

  it("refuses, saying why, with no AI binding and no key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    getCloudflareContext.mockRejectedValue(new Error("no cloudflare context"));
    const { model, AiNotConfiguredError } = await import("@/lib/ai/models");
    await expect(model()).rejects.toBeInstanceOf(AiNotConfiguredError);
  });

  it("names no gateway model anywhere the app asks for one", () => {
    for (const file of ["app/actions.ts", "lib/ai/models.ts"]) {
      const source = readFileSync(path.join(app, file), "utf8");
      expect(source, file).not.toMatch(/model:\s*"/);
      expect(source, file).not.toMatch(/"openai\/gpt/);
    }
    expect(readFileSync(path.join(app, "app/actions.ts"), "utf8").match(/model: await model\(\),/g)).toHaveLength(3);
  });
});
