# nl-postgres — open risks

What is not yet proven or not yet decided. The full write-up of every risk,
including the accepted ones, is
`specs/epics/nl-postgres/risks-and-open-questions.md`; this page lists only
what is still live, so it should be short.

| ID | Risk | State | What closes it |
|---|---|---|---|
| NL-A | `baseline-v1` is not yet proven live | OPEN | A bootstrap against a workspace with Cloudflare and Supabase connected |
| NL-B | The model is verified only against a stand-in: what SQL a real Llama 4 Scout writes for a question, and how often the database must refuse it | OPEN | Asking the deployed Worker; OpenAI's model is one Worker secret away |
| NL-C | `040` (a role created and handed a function by `postgres`) has run on Postgres 16 and PGlite, not on a real Supabase project | OPEN | The first db-migrate apply |

Accepted, and worth knowing before you change them: NL-D (`query_reader` can
read the catalog every role can), NL-E (two Supabase projects per product —
the organization needs room for both), NL-F (the data is fictional until the
owner loads CB Insights' list).
