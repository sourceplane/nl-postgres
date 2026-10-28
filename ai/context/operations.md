# nl-postgres — operating contract (for humans and agents)

This is the standing guide to how this product is deployed and operated.
Instance facts (live URLs, workspace, which model writes the SQL, the
secrets it uses) live in [deployment.md](deployment.md), rendered from
probed reality by the bootstrap's `02-docs` phase; this file is the contract
that stays true between deployments. It is written to give an agent with
repository read access enough context to reason about and operate the product
without any other source.

## What this system is

Vercel's Natural Language Postgres — a question about a table of unicorn
companies asked in plain English, answered in SQL: the page's four server
actions (`apps/web/app/actions.ts`) ask a model for the query, run it, ask
for a chart configuration over the rows and for an explanation of the query
— on Cloudflare Workers. Its model is **Workers AI's**
`@cf/meta/llama-4-scout-17b-16e-instruct`, through the Worker's `AI` binding,
in JSON mode for all three structured outputs (`apps/web/lib/ai/models.ts`).
**The model's SQL runs as `query_reader`**, a role that can read the
`unicorns` table and nothing else, through `app_private.run_read_only` — a
SECURITY DEFINER function it owns, inside which Postgres refuses to change
role — in a read-only transaction with a 5 s statement timeout
(`apps/web/lib/db.ts`); the template's own string check stays in front. The
table is a Supabase project's Postgres, reached through Cloudflare
Hyperdrive. Expressed as an Orun component-native desired-state repo. Seven
components:

- **`infra/terraform/supabase`** (`supabase`) — one Supabase project per
  environment. Its apply publishes `SUPABASE_PROJECT_REF`,
  `SUPABASE_DB_PASSWORD` and `SUPABASE_DB_URL` onto the environment's secret
  rung.
- **`infra/terraform/cloudflare-hyperdrive`** (`cloudflare-hyperdrive`) — one
  Hyperdrive config per environment over that database. Its apply publishes
  `WIRING_CLOUDFLARE_HYPERDRIVE` (the config's id and name).
- **`infra/db-migrate`** (`db-migrate`) — applies `packages/db`'s migrations
  to the environment's database through Supabase's Management API: the
  `unicorns` table (`010`), sixty fictional sample companies (`020`),
  row-level security (`030`) and `query_reader` with its function (`040`).
  Each migration is recorded with its
  checksum in `_migrations.applied`; only the missing ones apply.
- **`packages/db`** (`db`) — the migrations and their runner.
- **`apps/web`** (`web`) — the app: Next.js built by `@opennextjs/cloudflare`
  into one Worker plus Static Assets. It reaches Postgres through its
  `HYPERDRIVE` binding, one client per call (`lib/db.ts`), and its model
  through its `AI` binding.
- **`tests/web`**, **`tests/db`** — vitest suites, verified on the `dev` rung.

Environments: **`stage`** and **`prod`** are deployed; **`dev` is
verify-only by design** — lanes build and test, nothing deploys.

## Identity and tenancy

Every remote operation runs against ONE Orun workspace, declared in
`intent.yaml` under `execution.state.workspace` — committed, enforced, and
what CI uses. Do not remove it; headless credentials depend on it. If it
reads `ws_SET_ME`, the bootstrap had no workspace to write: set the real one
before anything else.

## How deployment works

1. Merge (or push) to `main`.
2. CI (`.github/workflows/ci.yml`) runs `orun plan --changed` — only
   components whose files changed are planned — then runs each planned lane
   with `orun run --remote-state`, authenticated by GitHub OIDC (the
   exchange resolves this repository's linked workspace server-side).
3. Per environment, in this order — each edge `mode: enforced` on a push to
   main, advisory on a pull request (which deploys nothing):
   **`supabase` → `cloudflare-hyperdrive` → `db-migrate` → `web`.** A job
   resolves its secrets when it starts, so each one reads what the apply
   before it published. The app's deploy re-renders `apps/web/wrangler.jsonc`
   from `WIRING_CLOUDFLARE_HYPERDRIVE` before it builds, deploys
   `nl-postgres-web-<env>`, and smoke-tests it: the page, and
   `/api/health`, which answers 200 only when the database is reachable
   through Hyperdrive and migrated (the table, `query_reader` and its
   function). Neither calls a model.
4. `prod` deploys after `stage` has converged on the same commit
   (`environments.prod.promotion` in intent.yaml).
5. **The convergence run is the deployment.** A green run means every
   planned lane applied. Failed lanes are retried with
   `gh run rerun --failed`, which resumes the same execution.

Caveats that matter:

- A push that touches no component files plans zero lanes — that run is
  green and deployed nothing. Never treat "latest run green" as "product
  converged"; probe the URLs instead.
- `apps/web/wrangler.jsonc` is committed as the render of
  `wrangler.template.jsonc` from `wiring.fixture.json` (a placeholder
  Hyperdrive id): edit the template and run `pnpm run wire:fixture`. The
  deploy lanes render the real one in their own job tree; never commit a
  real id.
- **The model's SQL can read what `query_reader` can, and nothing more.**
  A new table the questions should reach needs, in a new migration,
  `GRANT SELECT ON <table> TO query_reader` and — since every table in
  `public` has row-level security — a `FOR SELECT TO query_reader` policy;
  and the prompt in `app/actions.ts` must describe it. Never grant it a
  write, never run the model's SQL any other way than through
  `runReadOnlyQuery()`, and never make `query_reader` able to log in.
- Every table in `public` has row-level security; its only policy is
  `query_reader`'s SELECT. Supabase's Data API serves `public` to the anon
  key, so this is what keeps the table out of it; the app is unaffected
  because it connects as `postgres`, the table's owner. Enable RLS on a new
  table; never `FORCE` it, and never add a policy for `anon` without meaning
  to publish that table.
- **The data is a sample until the owner loads CB Insights' list.** `020`
  writes sixty fictional companies; `tooling/migrations/csv-to-sql.mjs` turns
  the owner's CSV into a migration that replaces them (the product's README,
  "The data").
- A migration is immutable once applied: its checksum is in
  `packages/db/src/manifest.ts` and in the database's ledger. Change the
  schema with a NEW migration in `packages/db/src/migrations`.

## Secrets model

- **Brokered provider secrets**, minted per run from the workspace's
  connections — no long-lived values at rest, nothing to rotate by hand:
  `CLOUDFLARE_API_TOKEN` (Workers deploy, the AI binding included),
  `CLOUDFLARE_HYPERDRIVE_TOKEN` (Hyperdrive — the deploy token deliberately
  cannot touch it), `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_ACCESS_TOKEN` (project
  create and migrations) and `SUPABASE_ORG_ID`.
- **Published by the applies** onto the stage and prod rungs:
  `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL`,
  `WIRING_CLOUDFLARE_HYPERDRIVE`.
- **No model key.** Workers AI is the Cloudflare account the Worker runs in;
  it bills that account after its free daily allocation.
- **Optional, the owner's:** `OPENAI_API_KEY`, a Worker secret, switches the
  model to OpenAI's (below). No platform brokers it.
- Inspect by NAME only: `orun secrets list --org <ws> --project` and
  `--env stage|prod`. No tooling in this repository prints a secret value,
  and no document in `ai/context/` may contain one.

## Use OpenAI instead

The SQL is written by Workers AI unless the environment's Worker has an
`OPENAI_API_KEY`. With one, it is written by `gpt-5.4-mini`, straight from
OpenAI (`@ai-sdk/openai`) — the model the upstream template shipped with. Per
environment (`stage`, `prod`):

```bash
wrangler secret put OPENAI_API_KEY --name nl-postgres-web-<env>
```

Worker secrets survive every later deploy; nothing in CI touches them. The
next request is answered by OpenAI's model, and `/api/health` reports
`"model":"openai"`. To go back, `wrangler secret delete OPENAI_API_KEY
--name nl-postgres-web-<env>`. Whichever model writes it, the SQL runs as
`query_reader`. Re-running the bootstrap's `02-docs` phase records the
change in [deployment.md](deployment.md).

## Verifying the system

```bash
# the app and its database path on each environment (also recorded, probed, in deployment.md)
curl -s -o /dev/null -w '%{http_code}\n' https://nl-postgres-web-stage.your-workers-subdomain.workers.dev/
curl -s https://nl-postgres-web-prod.your-workers-subdomain.workers.dev/api/health

# the whole path, the model included: ask a question on the page (its four
#   server actions write the SQL, run it as query_reader, chart and explain it)

# workspace readiness (integrations + repository link)
orun integrations list --org <ws> --json && orun cloud check --org <ws>
```

## Common operations

| task | how |
|---|---|
| deploy a change | merge to `main`; watch the run; failed lanes → `gh run rerun --failed` |
| deploy by hand | Orunbase's Deploy button, or `gh workflow run ci.yml --ref main -f environment=<env> [-f component=<a,b>]` — the named components (blank: every one) run in that environment as a merge runs them; started off `main` it is refused |
| change the schema | a new `packages/db/src/migrations/<nnn>_<name>/up.sql` (enable row-level security on any new table in `public`; grant `query_reader` SELECT and a policy if questions should reach it), its entry in the manifest (`pnpm --filter @saas/db run manifest:fix` for its checksum), and the table described in `app/actions.ts`'s prompts; merge — db-migrate applies it before the app deploys. `pnpm test` fails on a table in `public` without row-level security |
| load CB Insights' list | `node tooling/migrations/csv-to-sql.mjs <unicorns.csv> packages/db/src/migrations/<nnn>_cb_insights_unicorns/up.sql`, its manifest entry, `manifest:fix`, merge |
| try the schema locally | `DATABASE_URL=… pnpm --filter @app/web db:migrate:local` applies every migration to a local Postgres |
| change the model | `WORKERS_AI_MODEL` in `apps/web/lib/ai/models.ts` — a Workers AI model with JSON mode |
| redeploy without a change | edit the last line of the component's `component.yaml` (`# orun: redeploy <reason> <stamp>`) and merge — it is a deploy trigger, nothing reads it |
| use OpenAI | above |
| serve a custom domain | attach it to the Worker in Cloudflare, then set `SITE_URL` under that environment's `env:` in `intent.yaml` (the page's Open Graph link is absolute), replace the placeholder `nl-postgres.example.com` in its `BASE_DOMAIN` with the domain, and merge |
| headless credentials | `ORUN_TOKEN` (workspace-scoped) + `GITHUB_TOKEN` |

The deployment record is the bootstrap's `02-docs` phase. Re-running it (the
Orun console's Retry on that phase, or `orun new … --phase 02-docs`)
re-probes the URLs and re-renders [deployment.md](deployment.md); it is
idempotent.

## Evolution

Structural changes (a second Worker, a queue, another data store) follow the
same contract that deployed the product: add a component under `apps/`,
`infra/` or `packages/` with a `component.yaml` — declaring `dependsOn` on
any infrastructure whose published secrets it reads, enforced on main — land
it as a pull request, and the convergence run applies it.
