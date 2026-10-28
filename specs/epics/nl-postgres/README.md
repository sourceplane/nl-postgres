# nl-postgres — Vercel's Natural Language Postgres on Cloudflare

**The template's app as it is — a question in plain English, the SQL a model
writes for it, the rows, a chart and an explanation of the query — on one
Cloudflare Worker, the SQL written by Workers AI and run as a read-only
database role against a Supabase project behind Hyperdrive; and the baseline
that makes a copy of it somebody else's product in one landing.**

| | |
|---|---|
| Status | In progress — NL1 on main: the site runs on Workers |
| Upstream | [vercel-labs/natural-language-postgres](https://github.com/vercel-labs/natural-language-postgres) (MIT), Vercel's [Natural Language Postgres](https://vercel.com/templates/next.js/natural-language-postgres), at `f5af6a2` |
| Reference | [rag-chatbot](https://github.com/sourceplane/rag-chatbot) — an AI SDK app on Workers AI and Supabase through Hyperdrive, migrations, db-migrate, row-level security; [admin-dashboard](https://github.com/sourceplane/admin-dashboard) — the most recent Supabase port |
| Key | `NL` |

## Read in this order

1. [design.md](design.md) — the template, how each Vercel piece maps to
   Cloudflare and Supabase, the read-only role the model's SQL runs as, the
   repository and the build, and the alternatives rejected.
2. [implementation-plan.md](implementation-plan.md) — the milestones.
3. [risks-and-open-questions.md](risks-and-open-questions.md) — what is not
   proven, and what was accepted.
4. [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) — what shipped, and
   every departure from the upstream template.

## Milestones

| Milestone | What it lands | Task |
|---|---|---|
| NL0 — the spec | the repository, its intent, CI, tooling and spec index; this doc set | NL-1 |
| NL1 — the app on Workers and Supabase | the template in `apps/web`, the model on Workers AI, the read-only query path, the table, sample data and role as migrations, the Supabase and Hyperdrive roots, the tests | NL-2 |
| NL2 — a baseline | the console card, the build document, the context pack and the baseline's tests | NL-3 |
