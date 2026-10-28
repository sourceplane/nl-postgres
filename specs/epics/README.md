# Epics

Orun-style work programs. Each epic is a folder carrying `epic.yaml` (the
declaration the platform reads: slug, key prefix, milestones with exit
criteria and task keys) beside its doc set. The pull request that adds the
folder is the adoption; the merge creates the epic in the workspace.

| Epic | Cluster | Status | What it is |
|------|---------|--------|------------|
| [`nl-postgres/`](./nl-postgres/) | **NL** | In progress (NL1: the site on Workers) | Vercel's Natural Language Postgres — plain-English questions answered in SQL — on Cloudflare Workers with Workers AI and Supabase Postgres through Hyperdrive, the model's SQL run as a read-only role, and an Orun baseline that instantiates it in one landing (NL2) |

As-built ≠ intent: what shipped lives in each epic's `IMPLEMENTATION-STATUS.md`.
