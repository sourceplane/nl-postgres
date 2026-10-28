# nl-postgres — where this repository stands

The entry page for anyone (or any agent) picking this repository up. It is
this repository's own state and does not ship to a product built from it; the
two pages that do are [operations.md](operations.md) and
[deployment.md](deployment.md).

## What it is

Vercel's Natural Language Postgres (`natural-language-postgres`) on
Cloudflare Workers + Static Assets through `@opennextjs/cloudflare`: a
question in plain English, the SQL a model writes for it — run as
`query_reader`, a read-only role, through one function it cannot step out of
— the rows, a chart and an explanation, over a table of unicorn companies in
a Supabase project's Postgres reached through Hyperdrive. Packaged as an Orun
baseline: `orun new --blueprint repo-blueprint.yaml` builds a new product in
its own repository and takes it to live on stage and prod in one landing
(`01-product`) — the Supabase project, then the Hyperdrive config, then the
migrations, then the Worker — and records what went live (`02-docs`). A fresh
product writes its SQL on Workers AI through its `AI` binding, with no AI
vendor key, over sixty fictional sample companies.

## Release

| | |
|---|---|
| Latest tag | `baseline-v1` (NL2) |
| Proven live | No. Everything short of the platform is proven offline in Baseline CI, with stand-ins for Workers AI and Supabase's Management API. The real model, a deploy with the brokered token and its `AI` binding, the Terraform and db-migrate applies — `040`'s role and function on a real Supabase project among them — and a live bootstrap are still to come (risks NL-A, NL-B, NL-C) |

## Where to read

| Question | Page |
|---|---|
| What shipped, and every departure from upstream | `specs/epics/nl-postgres/IMPLEMENTATION-STATUS.md` |
| Why it is built this way | [decisions.md](decisions.md), then `specs/epics/nl-postgres/design.md` |
| What could still go wrong | [open-risks.md](open-risks.md), then `specs/epics/nl-postgres/risks-and-open-questions.md` |
| How to instantiate it | `BOOTSTRAP.md`, `docs/phases/` |
| What each component is | `docs/` beside each `component.yaml` — `apps/web`, `packages/db`, `infra/db-migrate`, `infra/terraform/{supabase,cloudflare-hyperdrive}`, `tests/{web,db}` (generated; `python3 tooling/catalog/gen-component-docs.py`) |

## Next

1. Bootstrap one product from `baseline-v1` against a workspace with
   Cloudflare and Supabase connected (two free project slots, NL-E): the first
   run of the real model and of the `AI` binding under the brokered deploy
   token, and the first Terraform and db-migrate applies (closes NL-A, NL-B,
   NL-C).
