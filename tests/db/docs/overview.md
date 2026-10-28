# db-tests

The migrations' tests (the manifest and its checksums, upstream's table and the sample companies, row-level security on every table in public, query_reader and the function the model's SQL runs through refusing every write, DDL and other schema, and the CB Insights CSV loader, on an in-process Postgres)

The test suite for **db**. It deploys nothing: its lane installs, builds and runs the tests.

|              |                      |
| ------------ | -------------------- |
| Type         | `turbo-package`      |
| Source       | `tests/db`           |
| Package      | `@app/db-tests`      |
| Environments | `dev`: `quick-check` |

## Depends on

- (none)

## Depended on by

- (none)
