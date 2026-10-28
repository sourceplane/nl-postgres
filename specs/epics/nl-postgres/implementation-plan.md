# nl-postgres — implementation plan

Three milestones, each one reviewed pull request (NL0 is the repository's
first commit and its spec), each green before it merges.

## NL0 — the spec (NL-1)

The repository is born: `intent.yaml` with the placeholder workspace
`ws_CHANGE_ME`, `ci.yml` (byte for byte rag-chatbot's, which is
turso-starter's with the comment lines its own copy changes), the shared
TypeScript and ESLint configuration, the wiring renderer and migration
helpers, the spec index, this doc set and the task contracts.

## NL1 — the app on Workers and Supabase (NL-2)

- The template in `apps/web` on Next.js 16.3.8: `app/actions.ts`'s four
  actions with the model from `lib/ai/models.ts` and the SQL through
  `lib/db.ts`'s `runReadOnlyQuery()`, the template's string check kept;
  `lib/site.ts` (the name seam, the source link, the origin) read by the
  layout and the header; the "Deploy with Vercel" button replaced by the
  source link; `app/api/health/route.ts`; ESLint in eslint-config-next 16's
  flat form.
- `wrangler.template.jsonc` + `wiring.fixture.json` (the `HYPERDRIVE` and
  `AI` bindings), `component.yaml` (the smoke: the page's question box and
  `/api/health`).
- `packages/db`: `010_unicorns`, `020_sample_unicorns`,
  `030_row_level_security`, `040_read_only_queries`; the Supabase and
  Hyperdrive roots; `infra/db-migrate`; `tooling/migrations/csv-to-sql.mjs`.
- `tests/web` (the actions and the string check, the model on Workers AI in
  JSON mode and on OpenAI, the client and the read-only path, the health
  check, the origin and the name) and `tests/db` (the manifest, the schema
  and the sample rows, row-level security, every refusal of the read-only
  path, the CSV loader), on PGlite.

## NL2 — a baseline (NL-3)

rag-chatbot's machinery on this tree: `blueprint.yaml` (Cloudflare and
Supabase, five brokered keys, the subdomain read from the connection, no AI
key), `repo-blueprint.yaml` (01-product, then 02-docs), `.baseline/`, the
rename engine, the bootstrap helpers, the deployment-record renderer probing
`/` and `/api/health` and reading which model writes the SQL, the phase
pages, the context pack, and the baseline's tests: manifest, phases,
coverage, rebrand, retouch, bootstrap-defer, the generated component docs,
the leak gate, the offline bootstrap with the product's own plan, and the
end-to-end tier — the migrations applied through a stand-in Supabase
Management API over a real Postgres, the built Worker served over it with
Workers AI stood in for, the page's four actions called as the page calls
them, and the SQL a model could be talked into refused by the template's
check or by the database.
