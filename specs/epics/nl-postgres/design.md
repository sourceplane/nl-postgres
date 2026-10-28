# nl-postgres — design

## The template

Vercel's Natural Language Postgres ([vercel-labs/natural-language-postgres](https://github.com/vercel-labs/natural-language-postgres))
is a Next.js 15 App Router app with one page, a client component, and four
server actions (`app/actions.ts`). A visitor asks a question about a table of
unicorn companies in plain English (or picks a suggested one);
`generateQuery` asks a model for the SQL — upstream's system prompt describes
the `unicorns` table and says "Only retrieval queries are allowed" — and
`runGenerateSQLQuery` runs it after a string check (it must start with
`select` and name none of drop, delete, insert, update, alter, truncate,
create, grant, revoke). The rows show as a table; `generateChartConfig` asks
the model for a Recharts configuration over them, and `explainQuery` for an
explanation of the query, clause by clause. All three model calls are
structured outputs (AI SDK 6, `Output.object` with zod schemas), the model
named as the string `"openai/gpt-5.4-mini"` — which AI SDK 6 sends through
Vercel's AI Gateway. The database is Vercel Postgres through
`@vercel/postgres`; its owner downloads CB Insights' list of unicorn
companies as a CSV and runs `lib/seed.ts`, which creates the table and loads
it.

## How it maps to Cloudflare and Supabase

| Vercel | Here | Why |
|---|---|---|
| Next.js hosting | One Worker (`.open-next/worker.js`) + Static Assets, built by `@opennextjs/cloudflare` on Next.js 16.3.8 | The adapter refuses Next.js 15.5 (out of the Next.js team's support window) |
| `"openai/gpt-5.4-mini"` through Vercel's AI Gateway | `lib/ai/models.ts`: Workers AI's `@cf/meta/llama-4-scout-17b-16e-instruct` through the Worker's `AI` binding by default (JSON mode answers the three structured outputs); OpenAI's `gpt-5.4-mini`, straight from OpenAI through `@ai-sdk/openai`, once `OPENAI_API_KEY` is a Worker secret | A product answers on its first deploy with no vendor key, and AI Gateway is not a composition this platform has; the optional key is the one upstream's own Vercel button asked for |
| Vercel Postgres, `sql.query(query)` from `@vercel/postgres` | A Supabase project's Postgres through the `HYPERDRIVE` binding: `getSql()` builds a `postgres` client per call | The Workers runtime refuses to reuse a socket across requests (rag-chatbot's decision) |
| The generated SQL run on the owner's connection | `runReadOnlyQuery()` sends it to `app_private.run_read_only(query)`, in a READ ONLY transaction with a 5 s statement timeout; the function runs it as `query_reader` (below). The template's string check stays in front | The check alone does not stop SQL a model can be talked into |
| `lib/seed.ts`: CREATE TABLE + the downloaded CSV, run by hand | `packages/db`'s `010_unicorns` (the same CREATE TABLE) and `020_sample_unicorns` (sixty fictional companies), applied by `infra/db-migrate` before the Worker deploys; `tooling/migrations/csv-to-sql.mjs` turns the owner's CB Insights CSV into a migration that replaces them | One schema, applied in order, recorded in a ledger; CB Insights' list is theirs and is not redistributed |
| A table the Data API would serve | `030_row_level_security` on every table in `public` | Supabase serves `public` to anyone with the anon key |
| A Postgres database created in the dashboard | `infra/terraform/supabase` (one project per environment) + `infra/terraform/cloudflare-hyperdrive` (one config per environment) | rag-chatbot's roots |
| "Deploy with Vercel" | The header's source link to the product's own repository; `orun new --blueprint repo-blueprint.yaml` | |

## The read-only role (040)

The template's own check is a string check, and it is not a boundary: a
model writes what it is asked to, and a visitor can ask. SQL that starts with
`select` and names no forbidden word can still read other schemas, call
functions that run SQL of their own (`query_to_xml` over a hex-decoded
`DELETE`), or set the session's role. So the database is the boundary:

- **`query_reader`** — `NOLOGIN NOINHERIT`, no superuser, no BYPASSRLS. It
  holds `SELECT` on `unicorns` (through the one policy on it, since the table
  has row-level security) and nothing else: no write, no DDL, no sequence, no
  other schema (`_migrations`, `app_private`).
- **`app_private.run_read_only(query text) → jsonb`** — a `SECURITY DEFINER`
  PL/pgSQL function OWNED by `query_reader`, so the query runs with its
  privileges. It runs the query as a cursor (`FOR r IN EXECUTE`), so a second
  statement is refused, and returns the rows in order as one JSON array.
  Inside a security-definer function Postgres refuses `SET ROLE`, `RESET
  ROLE` and `set_config('role', …)` — which is why the function, and not a
  `SET LOCAL ROLE` in the app's own session, is the door: the session's user
  is `postgres`, and `SET ROLE` checks the session user, so SQL run after a
  `SET ROLE` could step straight back. Only `postgres` (the role the
  migrations run as, and the app's) may execute it; `PUBLIC`, and so the Data
  API's `anon` and `authenticated`, may not, and cannot see `app_private`.
- The app calls it inside `BEGIN READ ONLY` with `SET LOCAL
  statement_timeout = '5s'`, the query a bound parameter of the call.

What `query_reader` can still see is the catalog Postgres shows every role:
table and column names, its own settings. The e2e tier and `tests/db` hold
every refusal above to the database, with the string check out of the way.

## The data

CB Insights' list of unicorn companies is CB Insights' data, which each
owner downloads; it is not in this repository. So that a fresh product has
rows to ask about, `020_sample_unicorns` writes sixty fictional companies in
the list's shape — the columns of the table, valuations in billions, the
countries and cities spelled out, the industries the prompt names, investors
as a comma-separated list — and says in its first line that they are
fictional; the page's info card says so too. Loading the real list is a
migration the owner adds (`csv-to-sql.mjs`), which db-migrate applies on the
next merge like any other.

## The repository

rag-chatbot's tree in the turso v8 shape: `apps/web` (the template),
`packages/db` (the migrations and Lumen's runner), `infra/terraform/supabase`,
`infra/terraform/cloudflare-hyperdrive`, `infra/db-migrate`, `tests/web`,
`tests/db`, `tooling/*`; the baseline's own `blueprint.yaml`,
`repo-blueprint.yaml`, `.baseline/`, `hooks/`, `docs/phases/`, `testing/`
and `ai/context/`. Per environment, on a push to main: supabase →
cloudflare-hyperdrive → db-migrate → web, every edge enforced.

## Alternatives rejected

- **`SET LOCAL ROLE query_reader` in the app's transaction.** One line, and
  not a boundary: the session user is `postgres`, so the generated SQL could
  `set_config('role', 'postgres', true)` its way back.
- **A second Hyperdrive config that logs in as a read-only user.** A real
  boundary, but the role and its password would have to exist before
  Hyperdrive can create a config over them, and the migrations run after
  Hyperdrive; it would need a new Terraform root, a generated password
  published as a secret and a reordered plan. The security-definer function
  gives the same privileges with what the reference already has.
- **Keeping the AI Gateway model as the default.** It needs a gateway key
  before anything answers, and AI Gateway is not a composition here.
- **Shipping CB Insights' CSV.** It is not ours to redistribute.
- **Next.js 15.5.28.** The adapter's peer range admits it, but its build
  refuses a Next.js release the Next.js team no longer supports.
