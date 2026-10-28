# nl-postgres

Vercel's [Natural Language Postgres](https://github.com/vercel-labs/natural-language-postgres)
— a question about a table of unicorn companies asked in plain English, the
SQL a model writes for it, the rows, a chart of them and an explanation of
the query: one page and four server actions — running on **Cloudflare
Workers + Static Assets** through [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare),
its SQL written by **Workers AI** through the Worker's `AI` binding and run
as a **read-only database role**, its table a **Supabase** project's
database reached through **Cloudflare Hyperdrive**, both provisioned by
Terraform through [Orun](https://github.com/sourceplane/orun) and the schema
applied by Orun's `db-migrate`, the way the
[rag-chatbot baseline](https://github.com/sourceplane/rag-chatbot) does it, deployed by
[Orun](https://github.com/sourceplane/orun) to stage and prod on every merge.
Packaging it as an Orun baseline is the next milestone (NL2).

The template's code is the code. What the port changes is what the Workers
runtime, a fresh unattended deployment and SQL written by a model force: the
database client is built per call over the Hyperdrive binding (`lib/db.ts`);
the model is Workers AI's (`lib/ai/models.ts`) — the platform brokers no AI
vendor, and the Cloudflare account the app deploys into already is one —
with upstream's OpenAI model behind an optional key; and the model's SQL runs
only as `query_reader`, a role that can read the one table and nothing else,
through a function it cannot step out of (migration `040_read_only_queries`),
with the template's own string check kept in front. The template's data is
CB Insights' list, which each owner downloads; a fresh product starts with
sixty fictional companies in its shape, and a tool turns the owner's CSV into
a migration. See [`specs/epics/nl-postgres`](specs/epics/nl-postgres/README.md)
for the design, the milestones and the as-built status, including every
departure.

## What is here (the product)

| Surface | Where |
|---|---|
| The product's name and source link | `apps/web/lib/site.ts` |
| The page and its four server actions, `/api/health` | `apps/web/app` |
| The model: Workers AI, or OpenAI behind an optional key | `apps/web/lib/ai/models.ts` |
| The per-call client and the read-only query path | `apps/web/lib/db.ts` |
| Workers build and deploy contract | `apps/web/next.config.mjs`, `open-next.config.ts`, `wrangler.template.jsonc` → `wrangler.jsonc` (committed), `component.yaml` |
| The table, the sample data, row-level security and the read-only role as migrations, and Lumen's runner | `packages/db` (`@saas/db`) |
| CB Insights' CSV as a migration; the local apply | `tooling/migrations` |
| The Supabase project, the Hyperdrive config, the migration step | `infra/terraform/supabase`, `infra/terraform/cloudflare-hyperdrive`, `infra/db-migrate` |
| Tests | `tests/web`, `tests/db` (vitest) |

## Getting started

```bash
pnpm install
pnpm run wire:fixture   # re-render apps/web/wrangler.jsonc from its template (committed; this changes nothing)
pnpm typecheck
pnpm lint
pnpm test
pnpm build              # next build + opennextjs-cloudflare build → apps/web/.open-next
pnpm --filter @saas/db run manifest:check
```

The build needs no database, no model and no Cloudflare credential. Running
it locally — a Postgres on `localhost:5432`, `pnpm --filter @app/web
db:migrate:local`, `wrangler login` for Workers AI, `next dev` or `wrangler
dev` — is in the product's README (`.baseline/product/README.md`), which is
what a product built from here carries.

## How it maps to Vercel

| Vercel | Here |
|---|---|
| Next.js 15.5 hosting, four server actions | One Cloudflare Worker (`.open-next/worker.js`) + Static Assets on Next.js 16.3.8 (the adapter refuses 15.5); the actions run as they did |
| `"openai/gpt-5.4-mini"` through Vercel's AI Gateway | Workers AI through the `AI` binding: `@cf/meta/llama-4-scout-17b-16e-instruct`, in JSON mode for the three structured outputs, no key. `OPENAI_API_KEY`, if set, switches to upstream's `gpt-5.4-mini` straight from OpenAI |
| `sql.query(query)` from `@vercel/postgres`, on the owner's connection | `runReadOnlyQuery()`: the query through `app_private.run_read_only` as `query_reader`, in a read-only transaction with a 5 s timeout, behind the template's own check |
| Vercel Postgres | The Supabase project's Postgres through a Hyperdrive config; `getSql()` builds the `postgres` client per call from the `HYPERDRIVE` binding's connection string |
| `pnpm run seed` (lib/seed.ts: the table, and CB Insights' CSV) | `packages/db` + `infra/db-migrate`: the same CREATE TABLE, sixty fictional sample companies, row-level security and the read-only role, applied through Supabase's Management API before the Worker deploys; `tooling/migrations/csv-to-sql.mjs` turns the CSV into a migration |
| A Postgres database created in the dashboard | `infra/terraform/supabase` (one project per environment) + `infra/terraform/cloudflare-hyperdrive` (one config per environment), ids and credentials as orun secrets |
| "Deploy with Vercel" (clone the template) | `orun new --blueprint repo-blueprint.yaml` — a new repository, branded, provisioned, deployed; the header links to its own source |

## CI

| Workflow | What it runs | Ships to a product |
|---|---|---|
| `ci.yml` | the Orun pipeline, and the only workflow a product carries: `orun plan --changed`, then one job per lane. A pull request runs the verify lanes (the app built and dry-deployed per environment, both Terraform roots checked and planned, the migrations planned); no lane runs the `typecheck`, `lint` or `test` scripts — `baseline.yml`'s e2e tier runs them on the bootstrapped product before every tag, and a product's developers run them before they push. The bootstrap's own landings (`orun/BASE-*`) run `plan` alone and nothing waits for it — the landing was checked in the build box; a merge applies, migrates and deploys stage → prod. It plans nothing while `intent.yaml` names the placeholder workspace `ws_CHANGE_ME`, as this repository does. A manual run (Orunbase's Deploy button, or Run workflow on `main`) plans the environment and components it names under the push-to-main trigger, so they deploy as a merge deploys them | yes |
