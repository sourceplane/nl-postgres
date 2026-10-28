# nl-postgres — implementation status

| Milestone | State | Landed |
|---|---|---|
| NL0 — the spec | ✅ | NL-1 |
| NL1 — the app on Workers and Supabase | ✅ | NL-2 |
| NL2 — a baseline | planned | NL-3 |

## Departures from the upstream template

Everything not listed here is the template as it is at `f5af6a2`.

| # | What | Why |
|---|---|---|
| 1 | Next.js 15.5.10 → 16.3.8 (React 19.0.4 kept), ESLint in eslint-config-next 16's flat form, `react-hooks/immutability` off (NL-H), `images.domains` as `remotePatterns` | `@opennextjs/cloudflare` 1.20.11 refuses Next.js 15.5 at build (out of the Next.js team's support); `next lint` is gone in 16 |
| 2 | The model: `lib/ai/models.ts` — Workers AI's Llama 4 Scout through the `AI` binding, or OpenAI's gpt-5.4-mini from OpenAI when `OPENAI_API_KEY` is set; `model: "openai/gpt-5.4-mini"` (an AI Gateway string) is gone from `app/actions.ts` | A product answers with no vendor key; no gateway |
| 3 | `runGenerateSQLQuery` runs the SQL through `lib/db.ts`'s `runReadOnlyQuery()` — `app_private.run_read_only` as `query_reader`, READ ONLY, 5 s timeout — after the template's own check, which stays | The check is not a boundary (design.md, "The read-only role") |
| 4 | `@vercel/postgres` → `postgres` over the `HYPERDRIVE` binding, a client per call (`lib/db.ts`) | The Workers runtime |
| 5 | `lib/seed.ts` and its CSV → migrations `010_unicorns` (its CREATE TABLE) and `020_sample_unicorns` (sixty fictional companies); `tooling/migrations/csv-to-sql.mjs` for CB Insights' list | The list is not ours to ship; a product needs rows on its first deploy |
| 6 | `030_row_level_security`, `040_read_only_queries` | The Data API; the read-only role |
| 7 | `lib/site.ts`: `SITE_NAME` read by the layout's title and the header (upstream spelled the name twice, "…Postgres" and "…PostgreSQL"); `siteUrl()` for `metadataBase` (upstream's demo origin) | One rename seam; each product's own origin |
| 8 | The "Deploy with Vercel" button (`components/deploy-button.tsx`) → `components/source-link.tsx`, the product's own repository | |
| 9 | The info card says the data is sample data until CB Insights' list is loaded | It is (NL-F) |
| 10 | `app/api/health/route.ts` added | The deploy's smoke and the record's probe |
| 11 | Rows come back as JSON: numbers as numbers, dates as `YYYY-MM-DD` (NL-I) | The function returns one JSON array |
| 12 | `next.config.js` → `next.config.mjs` (standalone output, the trace root, the dev platform proxy), `open-next.config.ts` and `wrangler.template.jsonc` added; `tsconfig.json`'s `jsx` is `react-jsx` and `moduleResolution` `bundler`, as Next.js 16 writes them | OpenNext's build |
| 13 | `lint-staged`'s and `csv-parser`'s, `dotenv`'s and `tsx`'s dev dependencies dropped with the seed script | Nothing runs them |

## Departures from the reference

| # | What | Why |
|---|---|---|
| 1 | No drizzle-kit (upstream has no ORM): the migrations live only in `packages/db`, applied locally with `tooling/migrations/apply-local.mjs` | rag-chatbot's twins were drizzle's |
| 2 | One model, three structured outputs, no tools and no embeddings; the e2e calls the page's server actions by the ids the build gave them | The template |
| 3 | `OPENAI_API_KEY` in place of `AI_GATEWAY_API_KEY` | Upstream's own key, no gateway |
| 4 | The e2e and tests/db hold every refusal of the read-only path to the database | The template runs model-written SQL |
| 5 | No pgvector | No embeddings |

## Verified

- `pnpm typecheck`, `lint`, `test` (tests/web 31, tests/db 22) and `build`
  green; the Worker is 1.52 MiB gzipped (Workers Free).
- Every contract tier, the leak gate and the placement tier pass locally on
  orun v2.89.0. The e2e tier needs a PostgreSQL server (initdb, pg_ctl,
  psql), which this build's machine did not have: it ran on Baseline CI,
  where every pull request ran it before it merged. Its serving half — the
  page's server actions through the real provider to the Workers AI
  stand-in, a refused action's reason in the Worker's log — was run here
  too, against the built Worker, without a database.
