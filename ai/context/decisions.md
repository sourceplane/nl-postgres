# nl-postgres — decisions

The choices that shape this repository, one line each, with where the full
reasoning lives.

| # | Decision | Why | Source |
|---|---|---|---|
| 1 | OpenNext on Workers + Static Assets, the static-assets incremental cache, Next.js 16.3.8 | The page is a client component with server actions; the pre-rendered shell needs nothing provisioned; the adapter refuses Next.js 15.5 | `specs/epics/nl-postgres/design.md` |
| 2 | `getSql()` builds a `postgres` client per call over the `HYPERDRIVE` binding; no module-level pool | Workers refuse a socket opened in another request; Hyperdrive holds the pool | design.md, rag-chatbot |
| 3 | Workers AI's Llama 4 Scout through an `AI` binding is the default model, in JSON mode for the three structured outputs; `OPENAI_API_KEY` is optional and switches to upstream's gpt-5.4-mini straight from OpenAI. No gateway | The platform brokers no AI vendor, AI Gateway is not a composition here, and the optional key is the one upstream's Vercel button asked for | design.md, risk NL-B |
| 4 | The model's SQL runs only through `app_private.run_read_only`, a SECURITY DEFINER function owned by `query_reader` (SELECT on `unicorns` only), in a READ ONLY transaction with a 5 s timeout; the template's string check stays in front | A string check is not a boundary, and a `SET ROLE` in the app's own session could be undone by the SQL it guards; inside a security-definer function Postgres refuses to change role | design.md, "The read-only role" |
| 5 | The table and sixty fictional sample companies are migrations; CB Insights' list is the owner's to load through `csv-to-sql.mjs` | The list is CB Insights' and not ours to ship; a product needs rows on its first deploy | design.md, "The data", risk NL-F |
| 6 | The database comes from Terraform (a Supabase project and a Hyperdrive config per environment) and the schema from db-migrate (`@saas/db`) before the Worker deploys | rag-chatbot's roots and runner; the build stays credential-free | design.md |
| 7 | `apps/web/wrangler.jsonc` is committed as the fixture render; the stage and prod lanes re-render it from the Hyperdrive wiring document | The composition checks the file exists before the build | design.md |
| 8 | Row-level security on every table in `public`; the one policy is `query_reader`'s SELECT | Supabase's Data API serves `public` to the anon key; the app, as owner, is not subject to it | `packages/db` 030, 040 |
| 9 | One landing (`01-product`) then the record (`02-docs`); one convergence runs supabase → cloudflare-hyperdrive → db-migrate → web, enforced on `main`, advisory on a pull request | A job resolves its secrets when it starts, so each apply must finish before its reader | `repo-blueprint.yaml` |
| 10 | `ci.yml` plans nothing while `intent.yaml` names `ws_CHANGE_ME` | A bootstrap cannot set a repository variable | `.github/workflows/ci.yml` |
| 11 | stack-tectonic 0.19.0, not 0.20.0 | 0.20.0's lane-scoped install links `node_modules` out of the job tree, which Next 16's Turbopack refuses | `intent.yaml`, `BOOTSTRAP.md` (Troubleshooting) |
| 12 | orun is pinned only where it runs; component docs are generated from the manifests and checked in CI; the subdomain is read from the Cloudflare connection; the console asks for no domain | The cirrus standard and the turso-starter v8 shape, as rag-chatbot has them | `blueprint.yaml`, `repo-blueprint.yaml`, `tooling/catalog/gen-component-docs.py` |
