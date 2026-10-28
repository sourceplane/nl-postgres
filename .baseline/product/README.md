# nl-postgres

Vercel's [Natural Language Postgres](https://github.com/vercel-labs/natural-language-postgres)
— ask a question about a table of unicorn companies in plain English, and a
model writes the SQL, the page runs it and shows the rows, a chart of them
and an explanation of the query — on **Cloudflare Workers + Static Assets**
through [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare). The
model is **Workers AI**'s, through the Worker's `AI` binding, so it needs no
AI vendor key, and **the SQL it writes runs as a read-only database role**
that can read that one table and nothing else. The database is a
**Supabase** project's Postgres reached through **Cloudflare Hyperdrive**.
Terraform provisions both per environment and Orun's `db-migrate` applies
the schema and its sample data, all on every merge to `main`.

## Live deployment

<!-- 02-docs:begin -->
Not recorded yet. The bootstrap's last phase writes the live URLs, the
workspace, the model that writes the SQL and the secrets the product uses into
[ai/context/deployment.md](ai/context/deployment.md); how the product deploys
and how to operate it is in
[ai/context/operations.md](ai/context/operations.md).
<!-- 02-docs:end -->

## What is here

| Surface | Where |
|---|---|
| The product's name and source link | `apps/web/lib/site.ts` |
| The page and its four server actions (write the SQL, run it, chart it, explain it) | `apps/web/app/page.tsx`, `apps/web/app/actions.ts`, `apps/web/components` |
| The model — Workers AI by default, OpenAI if you add its key | `apps/web/lib/ai/models.ts` |
| The per-call client and the read-only query path | `apps/web/lib/db.ts` |
| The database check the deploy smoke-tests | `apps/web/app/api/health/route.ts` |
| Workers build and deploy contract | `apps/web/next.config.mjs`, `open-next.config.ts`, `wrangler.template.jsonc` → `wrangler.jsonc`, `component.yaml` |
| The schema, the sample data and the read-only role, as migrations, and their runner | `packages/db` (`@saas/db`) |
| Loading CB Insights' list; applying the migrations locally | `tooling/migrations/csv-to-sql.mjs`, `tooling/migrations/apply-local.mjs` |
| The Supabase project, the Hyperdrive config, the migration step | `infra/terraform/supabase`, `infra/terraform/cloudflare-hyperdrive`, `infra/db-migrate` |
| Tests | `tests/web`, `tests/db` (vitest) |

## Getting started

```bash
pnpm install
pnpm run wire:fixture   # re-render apps/web/wrangler.jsonc from its template (it is committed)
pnpm typecheck
pnpm lint
pnpm test
pnpm build              # next build + opennextjs-cloudflare build → apps/web/.open-next
```

The build needs no database and no model: nothing pre-renders against
either. The tests run the server actions, the real AI SDK and the real
Workers AI provider against a scripted binding, and every migration — and
every refusal of the read-only path — on an in-process Postgres.

## The data

The table starts with **sixty fictional companies** (migration
`020_sample_unicorns`), so there is something to ask about on the first
deploy; the page says so. The template's data is CB Insights' list of
unicorn companies, which you download yourself from
[cbinsights.com/research-unicorn-companies](https://www.cbinsights.com/research-unicorn-companies)
— it is theirs, and not shipped here. To load it, turn the CSV into a
migration and merge it:

```bash
node tooling/migrations/csv-to-sql.mjs ~/Downloads/unicorns.csv \
  packages/db/src/migrations/050_cb_insights_unicorns/up.sql
```

then add an entry for it at the end of `packages/db/src/manifest.ts` (copy
the last one), run `pnpm --filter @saas/db run manifest:fix`, and merge. The
migration replaces the sample companies with the list; `db-migrate` applies
it to stage and prod before the next deploy. Then change the sentence in
`apps/web/components/project-info.tsx` that calls the data a sample.

## The SQL it runs, and what it cannot

The model writes SQL; the app does not trust it. The template's own check
stays (the query must start with `select` and name none of drop, delete,
insert, update, alter, truncate, create, grant or revoke), and behind it the
database is the boundary: the query runs only through
`app_private.run_read_only` (migration `040_read_only_queries`), a function
owned by the role `query_reader`, which can read the `unicorns` table and
nothing else — no write, no DDL, no other table or schema — and which
Postgres does not let switch back to the app's role. The app calls it in a
read-only transaction with a five-second statement timeout
(`apps/web/lib/db.ts`). To let it read a new table, grant `query_reader`
`SELECT` on it (and a policy, if the table has row-level security) in a new
migration.

## Running it locally

You need a Postgres and a Cloudflare login for the model.

1. **A Postgres** on `localhost:5432`, database `unicorns`, user and
   password `postgres` — the `localConnectionString` in
   `apps/web/wrangler.template.jsonc`. Docker is the quickest:

   ```bash
   docker run --name unicorns-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=unicorns -p 5432:5432 -d postgres:17
   ```

2. **Environment.** Copy `apps/web/.env.example` to `apps/web/.env.local`:
   `DATABASE_URL` is for the migration script. The Worker never reads it:
   its database is the `HYPERDRIVE` binding.

3. **Schema.** Apply every migration — the table, the sample companies,
   row-level security, the read-only role — with `psql`:

   ```bash
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/unicorns pnpm --filter @app/web db:migrate:local
   ```

   CI applies the same files to the real databases.

4. **Model.** Workers AI has no local mode: the `AI` binding always reaches
   your Cloudflare account, so `wrangler login` once. That is all — no key.

5. **Run.** Either Next's dev server, which gets the Worker's bindings
   through `getCloudflareContext()`:

   ```bash
   pnpm --filter @app/web dev          # http://localhost:3000
   ```

   or the built Worker under `wrangler dev`, which reads
   `apps/web/.dev.vars` (copy `.dev.vars.example`; every key is optional):

   ```bash
   pnpm build
   pnpm --filter @app/web preview      # http://localhost:8787
   ```

## How it deploys

Merges to `main` converge through [Orun](https://github.com/sourceplane/orun):
`.github/workflows/ci.yml` plans the changed components and runs each lane
against the workspace in `intent.yaml`. Per environment the order is
enforced — **the Supabase project, then the Hyperdrive config over its
database, then the migrations, then the Worker** — because each reads what
the one before it published: the project's ref and password, the Hyperdrive
id the Worker binds, the schema the app queries. `stage` deploys first and
`prod` once stage has converged on the same commit; `dev` only verifies.
Every deploy is smoke-tested over HTTP, `/api/health` included, which
answers only when the Worker reaches a migrated database.

The pipeline holds one credential, GitHub's own `GITHUB_TOKEN`. The
Cloudflare tokens and account id and the Supabase access token and org id
are brokered per run from the workspace's connections; the Supabase
project's credentials and the Hyperdrive id are published by the Terraform
applies as orun secrets. Workers AI needs nothing: the `AI` binding is the
account the Worker deploys into, billed to it after its free daily
allocation. Nothing provider-shaped is stored in the repository or in
GitHub.

**Deploy by hand.** Orunbase's **Deploy** button on a component, or **Run
workflow** on the CI workflow in GitHub's Actions tab (on `main`), runs
`ci.yml` for the environment and components you pick, and each one deploys
exactly as a merge would deploy it. Leave the component blank to redeploy
every component in that environment, with nothing changed: after rotating a
secret, say. A component with nothing to run in that environment (a test
suite in `prod`) is left out with a notice.

## Use OpenAI instead

The SQL is written by Workers AI (`@cf/meta/llama-4-scout-17b-16e-instruct`)
unless the environment's Worker has an `OPENAI_API_KEY`. With one, it is
written by `gpt-5.4-mini`, straight from OpenAI — the model the upstream
template shipped with. Per environment:

```bash
wrangler secret put OPENAI_API_KEY --name nl-postgres-web-prod
wrangler secret put OPENAI_API_KEY --name nl-postgres-web-stage
```

Worker secrets survive every later deploy; the next request sees them, and
`/api/health` reports `"model":"openai"`. Locally, put the key in
`apps/web/.dev.vars` (or `.env.local` for `next dev`). Whichever model writes
it, the SQL runs as `query_reader`.

## Custom domain

The app answers on workers.dev from its first deploy. To serve it on your
own domain, attach the domain to the Worker in Cloudflare (Workers & Pages →
`nl-postgres-web-prod` → Settings → Domains & Routes), then set `SITE_URL`
under that environment's `env:` in `intent.yaml` — the page's Open Graph
image link is absolute, and the build bakes the origin in — and merge.

The repository names the domain in one more place, `BASE_DOMAIN` in
`intent.yaml` (one line per environment), which the product was born with as
the reserved placeholder `nl-postgres.example.com`. Replace it with your
domain in the same change.

## CI

| Workflow | What it runs |
|---|---|
| `ci.yml` | the Orun pipeline, and the only workflow: `orun plan --changed`, then one job per lane. A pull request runs the verify lanes — the app built and dry-deployed for each environment, both Terraform roots checked and planned, the migrations planned — with nothing applied or deployed. No lane runs the `typecheck`, `lint` or `test` scripts: run them yourself (above) before you push. A merge applies, migrates and deploys stage → prod |
