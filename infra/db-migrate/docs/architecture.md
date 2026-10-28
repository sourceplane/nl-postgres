# db-migrate — architecture

Applies the migrations under `packages/db/src/migrations` in order, recording each one
it applies so a run only ever applies what is new. An already-applied migration
is never edited: a change is a new, later migration.

## Migrations

- `000_control`
- `010_unicorns`
- `020_sample_unicorns`
- `030_row_level_security`
- `040_read_only_queries`

## Resolved at run time (names only)

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_DB_URL`
- `SUPABASE_PROJECT_REF`
