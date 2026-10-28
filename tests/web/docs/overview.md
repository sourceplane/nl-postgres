# web-tests

The app's tests (the server actions and the template's SQL check, the model on Workers AI or OpenAI, the database client over Hyperdrive and the read-only query path, the health check, the page's public origin and name, the committed wrangler config)

The test suite for **web**. It deploys nothing: its lane installs, builds and runs the tests.

|              |                      |
| ------------ | -------------------- |
| Type         | `turbo-package`      |
| Source       | `tests/web`          |
| Package      | `@app/web-tests`     |
| Environments | `dev`: `quick-check` |

## Depends on

- (none)

## Depended on by

- (none)
