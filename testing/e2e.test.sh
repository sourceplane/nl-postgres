#!/usr/bin/env bash
# TIER 2 — the product a bootstrap produces builds, migrates, deploys (dry),
# serves, and answers a question in SQL it runs as a read-only role, with no
# AI vendor key — and the database refuses the SQL a model could be talked
# into.
#
# placement.test.sh proves the tree a bootstrap ends with is the right tree,
# and that its own plan converges in the right order. This proves it WORKS,
# by doing to it what its own pipelines will:
#
#   1. at the 01-product landing (the commit its PR merges), install with the
#      lockfile the product ships, render the wrangler fixture (which must
#      change nothing: the render is committed), typecheck, lint, test, build.
#      The landing itself is checked in the build box with `orun validate`
#      and `orun plan` alone (`checks: local`), and its PR runs `plan` alone
#      (an `orun/BASE-*` branch), so THIS is where a product those steps
#      refuse is caught: before the tag, not after a build has merged it;
#   2. a Postgres of its own on a random port, with Supabase's roles — the
#      database a Supabase project would be: `postgres` a login role WITHOUT
#      superuser or BYPASSRLS, `anon` and `authenticated` with the Data API's
#      default grants (testing/lib/local-postgres.sh); and a stand-in for the
#      ONE Supabase Management API endpoint the migration runner calls
#      (testing/lib/fake-supabase-api.py), connected as `postgres`;
#   3. the db-migrate lane's own steps, rendered by `orun plan` for a push to
#      main and run IN THE TREE THE RUNNER STAGES for the job: install, build
#      @saas/db, apply — every migration: upstream's unicorns table, the sixty
#      sample companies, row-level security on every table in `public`, and
#      query_reader with the one function the model's SQL runs through — then
#      apply again, which must apply nothing, and the pull-request profile's
#      offline plan;
#   4. the web lane's own steps for stage, rendered for a pull request (the
#      verify profile carries deploy-dry-run; the deploy profile does not) and
#      run in its staged job tree: install, `verify-app-structure` (the
#      committed wrangler.jsonc must exist BEFORE the build, in a tree with no
#      build output), `build-app` — which re-renders the config from the
#      stage wiring document it is handed, as the deploy does — then
#      `verify-build-output` and `deploy-dry-run`;
#   5. the built Worker under `wrangler dev`, its HYPERDRIVE binding pointed at
#      that Postgres, with NO .dev.vars — no AI vendor key — and its AI
#      binding pointed at a deterministic stand-in for Workers AI
#      (testing/lib/fake-workers-ai.js), because Workers AI has no local mode
#      and this machine has no Cloudflare account. Then the component's OWN
#      `smokeCommand` against it, verbatim, and every route the product
#      promises: the page under the product's own name, `/api/health`
#      (answered only by the Worker), a 404 — and the page's real path, its
#      four server actions called as the page calls them: a question turned
#      into SQL, the SQL run (its rows the database's own answer to it), the
#      chart configured and the query explained;
#   6. what refuses the SQL a model could be talked into: the template's own
#      string check for a DELETE, and THE DATABASE for what passes that check
#      — a read of the migration ledger, a step back up to the connection's
#      role, a DELETE spelled in hex — through the app; then query_reader's
#      own grants, statement by statement, and the function closed to the
#      Data API's roles; and every row still there;
#   7. the Data API's view of the same database: every table in `public` has
#      row-level security, and `anon` and `authenticated` — granted everything
#      Supabase grants them — read no row of it and write none, while the app,
#      as the table's owner and nothing more, reads all sixty.
#
# WHAT IS VERIFIED ONLY OFFLINE: the model. The stand-in answers in the shape
# Workers AI's JSON mode does, so the app's provider, its structured outputs,
# its SQL path and its server actions are the real ones; what SQL a real
# Llama 4 Scout writes for a question is not tested here. Nor is the
# platform's half: create the repository, mint the brokered tokens, create a
# real Supabase project and Hyperdrive config (Terraform is validated, not
# applied, in this repository), deploy for real and probe workers.dev. That is
# a bootstrap against a workspace (BOOTSTRAP.md); everything short of it is
# here.
#
# Needs: orun, node, pnpm, python3 (+PyYAML), git, curl, psql, a PostgreSQL
# server install (initdb, pg_ctl), and the network for `pnpm install` (or a
# warm store). A few minutes: three installs, two builds.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
# shellcheck source=lib/bootstrap.sh
source "$here/lib/bootstrap.sh"
# shellcheck source=lib/local-postgres.sh
source "$here/lib/local-postgres.sh"

for bin in orun node pnpm python3 git curl psql; do
  command -v "$bin" >/dev/null || { echo "e2e.test.sh needs $bin on PATH" >&2; exit 1; }
done
pg_bin >/dev/null || { echo "e2e.test.sh needs a PostgreSQL server install (initdb, pg_ctl)" >&2; exit 1; }

scratch="$(mktemp -d)"
pgdir="$(mktemp -d)"
dev_pid=""
api_pid=""
# wrangler dev runs under pnpm, node and two workerd processes; a TERM to the
# first does not reach the rest, and waiting on it then never returns. So each
# server is started as its own process group (setsid) and the group stopped.
stop_group() {
  local pid="$1"
  [ -n "$pid" ] || return 0
  kill -TERM -- "-$pid" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 -- "-$pid" 2>/dev/null || break; sleep 0.5; done
  kill -KILL -- "-$pid" 2>/dev/null || true
}
cleanup() {
  stop_group "$dev_pid"
  stop_group "$api_pid"
  pg_down "$pgdir"
  [ -n "$pgdir" ] && [ -d "$pgdir" ] && rm -rf "$pgdir"
  [ -n "$scratch" ] && [ -d "$scratch" ] && rm -rf "$scratch"
}
trap cleanup EXIT
free_port() { python3 -c "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1]);s.close()"; }
values="$here/fixtures/acme.json"
repo="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['reponame'])" "$values")"
export CI=1 WRANGLER_SEND_METRICS=false NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1

# The landing's own checks, step for step — what the product's Checks
# workflow ran on a pull request before the product carried ci.yml alone —
# run here at once on the whole tree.
LANDING_CHECKS=(
  "pnpm install --frozen-lockfile"
  "pnpm run wire:fixture"
  "pnpm typecheck"
  "pnpm lint"
  "pnpm test"
  "pnpm build"
)
checks() { # DIR LOG
  local dir="$1" log="$2" cmd
  for cmd in "${LANDING_CHECKS[@]}"; do
    echo "   \$ $cmd" | tee -a "$log"
    if ! (cd "$dir" && bash -c "$cmd") >> "$log" 2>&1; then
      echo "FAIL: \`$cmd\` failed in $dir" >&2; tail -40 "$log" >&2; return 1
    fi
  done
}

# One job of a plan, written out as the runner would run it: each `run:` step
# (the `use:` actions are setup-node and setup-pnpm, which this machine has)
# as a numbered script, the job's env, and the component path the steps run
# in. Steps are picked BY ID when given, else every `run:` step in order.
extract_job() { # PLAN JOB-ID OUT-DIR [STEP-ID…]
  python3 - "$@" <<'PY'
import json, pathlib, sys
plan, jid, out, *want = sys.argv[1:]
job = next((j for j in json.load(open(plan))["jobs"] if j["id"] == jid), None)
if job is None:
    sys.exit(f"the plan has no job {jid}")
out = pathlib.Path(out); out.mkdir(parents=True)
steps = [s for s in job["steps"] if s.get("run")]
if want:
    by = {s["id"]: s for s in steps}
    missing = [w for w in want if w not in by]
    if missing:
        sys.exit(f"{jid} has no step(s) {missing}")
    steps = [by[w] for w in want]
for i, s in enumerate(steps):
    (out / f"{i:02d}.sh").write_text(s["run"])
    (out / f"{i:02d}.id").write_text(s["id"])
(out / "path").write_text(job.get("path") or ".")
with (out / "env").open("w") as f:
    for k, v in (job.get("env") or {}).items():
        f.write(f"export {k}={json.dumps(v)}\n")
PY
}
run_job() { # STEPS-DIR WORK-TREE ENV LOG-PREFIX
  local steps="$1" work="$2" envname="$3" logp="$4" s id
  for s in "$steps"/[0-9][0-9].sh; do
    id="$(cat "${s%.sh}.id")"
    echo "   ▸ $id"
    if ! (cd "$work/$(cat "$steps/path")" && source "$steps/env" && export ORUN_ENVIRONMENT="$envname" \
          && bash -e "$s") > "$logp-$id.log" 2>&1; then
      echo "FAIL: the lane's $id step" >&2; tail -40 "$logp-$id.log" >&2; return 1
    fi
  done
}

echo "── the offline bootstrap (testing/lib/bootstrap.sh)"
tree="$scratch/$repo"
bootstrap_offline "$root" "$tree" "$values" "$scratch/logs" > "$scratch/bootstrap.log" 2>&1 || {
  echo "FAIL: the offline bootstrap stopped" >&2; tail -40 "$scratch/bootstrap.log" >&2; exit 1; }
echo "   2 phases placed and landed"

# ── 1. the product's own pull request ──────────────────────────────────────
echo "── 01-product's landing: install, the fixture render, typecheck, lint, test, build"
s01="$(git -C "$tree" rev-parse HEAD~1)"
at01="$scratch/at-01/$repo"
git -C "$tree" worktree add -q "$at01" "$s01"
checks "$at01" "$scratch/checks.log"
dirty="$(git -C "$at01" status --porcelain)"
[ -z "$dirty" ] || { echo "FAIL: the checks changed tracked files — the committed wrangler.jsonc is not the fixture render:" >&2; echo "$dirty" >&2; exit 1; }
echo "   the checks left the tree as committed (wire:fixture rendered the committed wrangler.jsonc)"

# ── 2. a database, and the one API the migration runner calls ──────────────
echo "── a local Postgres and the Supabase Management API stand-in"
pgurl="$(pg_up "$pgdir" "$(free_port)")" || { echo "FAIL: Postgres did not start" >&2; exit 1; }
api_port="$(free_port)"
ref="localproject"
setsid python3 "$here/lib/fake-supabase-api.py" "$api_port" "$pgurl" --ref "$ref" > "$scratch/api.log" 2>&1 < /dev/null &
api_pid=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$api_port/" && break; sleep 0.3; done
echo "   $pgurl; the API on :$api_port"

# The two plans the lanes below run from, each in the product's own tree: a
# push to main at the 01-product commit (the db-migrate lane's APPLY profile),
# and a pull request over the finished product against an empty base (the web
# lane's VERIFY profile, which carries deploy-dry-run, and db-migrate's PLAN).
(cd "$at01" && orun plan --intent intent.yaml --trigger github-push-main --env stage --output "$scratch/plan-main.json") > "$scratch/plan-main.log" 2>&1 \
  || { echo "FAIL: orun plan (push to main)" >&2; tail -15 "$scratch/plan-main.log" >&2; exit 1; }
git -C "$tree" worktree remove --force "$at01"
mkdir -p "$scratch/pr"
git clone -q "$tree" "$scratch/pr/$repo"
prtree="$scratch/pr/$repo"
git -C "$prtree" checkout -q --orphan empty
git -C "$prtree" rm -rqf .
git -C "$prtree" -c user.email=t@example.invalid -c user.name=t commit -qm empty --allow-empty
git -C "$prtree" checkout -q main
(cd "$prtree" && orun plan --intent intent.yaml --trigger github-pull-request --base empty --head HEAD --env stage \
   --output "$scratch/plan-pr.json") > "$scratch/plan-pr.log" 2>&1 \
  || { echo "FAIL: orun plan (pull request)" >&2; tail -15 "$scratch/plan-pr.log" >&2; exit 1; }
# This tier runs the bootstrap floor, newer than the orun the product's CI
# pins, and both read the per-edge `modeRules`: on a pull request — which
# applies and deploys nothing — the infrastructure edges that order a push to
# main are advisory, so no lane waits on another. (placement.test.sh checks
# the push to main's order.)
python3 - "$scratch/plan-pr.json" <<'PY'
import json, sys
jobs = {j["component"]: j for j in json.load(open(sys.argv[1]))["jobs"] if j["environment"] == "stage"}
chain = ["supabase", "cloudflare-hyperdrive", "db-migrate", "web"]
for a, b in zip(chain, chain[1:]):
    ja, jb = jobs[a], jobs[b]
    if ja["id"] in (jb.get("dependsOn") or []) or ja["id"] not in (jb.get("advisoryDependsOn") or []):
        sys.exit(f"FAIL: on a pull request {b}@stage must name {a}@stage as advisory, not wait on it")
print("   pull request: " + " → ".join(chain) + ", every edge advisory")
PY

# ── 3. the db-migrate lane, in its staged job tree ─────────────────────────
echo "── the stage db-migrate lane: install, build @saas/db, apply — then apply again, and the PR's plan"
extract_job "$scratch/plan-main.json" db-migrate.stage.migrate "$scratch/steps-migrate" \
  install-dependencies build-db-package "Migration Apply"
extract_job "$scratch/plan-main.json" db-migrate.stage.migrate "$scratch/steps-migrate-again" "Migration Apply"
extract_job "$scratch/plan-pr.json" db-migrate.stage.migrate "$scratch/steps-migrate-plan" "Migration Plan"
# Staged from the fresh clone (a CI checkout: no build output, no
# node_modules); its migrations are the 01-product commit's, byte for byte.
mwork="$prtree/.orun/runs/e2e/db-migrate.stage.migrate/work"
python3 "$here/lib/stage-job.py" "$prtree" "$mwork"
# The component's secretEnv, as the lane resolves it: the supabase apply's
# published credentials and the brokered access token. SUPABASE_API_URL is
# the one value no lane has — it points the runner at the stand-in.
export SUPABASE_ACCESS_TOKEN=e2e-token SUPABASE_PROJECT_REF="$ref" SUPABASE_DB_PASSWORD=postgres \
       SUPABASE_DB_URL="$pgurl" SUPABASE_API_URL="http://127.0.0.1:$api_port"
run_job "$scratch/steps-migrate" "$mwork" stage "$scratch/migrate"
applied() { python3 -c "import json,sys;t=open(sys.argv[1]).read();print(' '.join(json.loads(t[t.index('{'):t.rindex('}')+1])['applied']))" "$1"; }
want="000_control_baseline 010_unicorns 020_sample_unicorns 030_row_level_security 040_read_only_queries"
[ "$(applied "$scratch/migrate-Migration Apply.log")" = "$want" ] \
  || { echo "FAIL: the first apply applied '$(applied "$scratch/migrate-Migration Apply.log")', not '$want'" >&2; exit 1; }
echo "   applied $want"
run_job "$scratch/steps-migrate-again" "$mwork" stage "$scratch/migrate-again"
[ -z "$(applied "$scratch/migrate-again-Migration Apply.log")" ] \
  || { echo "FAIL: a second apply applied '$(applied "$scratch/migrate-again-Migration Apply.log")'" >&2; exit 1; }
echo "   a second apply applied nothing (the ledger holds $(psql "$pgurl" -XAtc 'select count(*) from _migrations.applied') migrations)"
seeded="$(psql "$pgurl" -XAtc "select count(*) from unicorns")"
reader="$(psql "$pgurl" -XAtc "select rolcanlogin::text || ' ' || rolsuper::text || ' ' || rolbypassrls::text from pg_roles where rolname = 'query_reader'")"
runner="$(psql "$pgurl" -XAtc "select pg_get_userbyid(proowner) || ' ' || prosecdef::text || ' ' || has_function_privilege('public', oid, 'execute')::text from pg_proc where oid = to_regprocedure('app_private.run_read_only(text)')")"
[ "$seeded" = 60 ] && [ "$reader" = "false false false" ] && [ "$runner" = "query_reader true false" ] \
  || { echo "FAIL: after the apply unicorns holds '$seeded' rows, query_reader is '$reader' (login super bypassrls), the runner '$runner' (owner definer public-can-execute)" >&2; exit 1; }
echo "   unicorns holds the 60 sample companies; query_reader cannot log in, is no superuser and bypasses no RLS; app_private.run_read_only is its, SECURITY DEFINER, closed to PUBLIC"
run_job "$scratch/steps-migrate-plan" "$mwork" stage "$scratch/migrate-plan"
[ "$(applied "$scratch/migrate-plan-Migration Plan.log")" = "$want" ] \
  || { echo "FAIL: the pull request's offline plan did not verify every migration" >&2; exit 1; }
echo "   the pull request's plan step verifies every migration's checksum offline"
unset SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF SUPABASE_DB_PASSWORD SUPABASE_DB_URL SUPABASE_API_URL
rm -rf "$mwork"

# ── 4. the web lane's steps, for stage ─────────────────────────────────────
echo "── the stage web lane: install, verify-app-structure, build-app, verify-build-output, deploy-dry-run"
extract_job "$scratch/plan-pr.json" web.stage.verify-deploy "$scratch/steps-web" \
  install-workspace-dependencies verify-app-structure build-app verify-build-output deploy-dry-run
work="$prtree/.orun/runs/e2e/web.stage.verify-deploy/work"
# The job's private tree, staged as orun stages it — no build output, no
# node_modules: under stack-tectonic 0.19.0 the job installs inside it.
python3 "$here/lib/stage-job.py" "$prtree" "$work"
[ ! -e "$work/apps/web/.open-next" ] && [ -f "$work/apps/web/wrangler.jsonc" ] \
  || { echo "FAIL: the staged tree is not a fresh checkout with the committed wrangler.jsonc" >&2; exit 1; }
echo "   staged: $(realpath --relative-to="$prtree" "$work") — no build output, the committed wrangler.jsonc"
# The stage wiring document, as the cloudflare-hyperdrive apply publishes it
# and the lane resolves it (secretEnv WIRING_CLOUDFLARE_HYPERDRIVE_STAGE).
hd_id="e2e0000000000000000000000000c0de"
export WIRING_CLOUDFLARE_HYPERDRIVE_STAGE="{\"hyperdrive_id\":\"$hd_id\",\"hyperdrive_name\":\"stg-$repo-stage\"}"
run_job "$scratch/steps-web" "$work" stage "$scratch/web"
unset WIRING_CLOUDFLARE_HYPERDRIVE_STAGE
build_log="$(ls "$scratch"/web-build-app.log)"
grep -q '(Turbopack)' "$build_log" \
  || { echo "FAIL: the staged build did not run on Turbopack" >&2; grep -m3 'Next.js' "$build_log" >&2; exit 1; }
grep -q "\"id\": \"$hd_id\"" "$work/apps/web/wrangler.jsonc" \
  || { echo "FAIL: build-app did not re-render wrangler.jsonc from the stage wiring document" >&2; exit 1; }
[ "$(node -e 'const fs=require("fs");process.stdout.write(String(fs.readdirSync(process.argv[1]).length))' "$work/node_modules")" -gt 0 ] && [ ! -L "$work/node_modules" ] \
  || { echo "FAIL: the job's install did not land inside its own tree" >&2; exit 1; }
echo "   the staged build ran on Turbopack, inside its own tree, bound to the stage Hyperdrive id it was handed"



# ── 5. serve it with no AI vendor key, Workers AI stood in for ─────────────
echo "── wrangler dev over the built Worker: HYPERDRIVE on the local Postgres, AI on the Workers AI stand-in"
[ ! -e "$work/apps/web/.dev.vars" ] || { echo "FAIL: the staged tree carries a .dev.vars" >&2; exit 1; }
# The stand-in, as a second Worker in the same `wrangler dev`
# (testing/lib/fake-workers-ai.js says what it answers, and why).
fake="$scratch/fake-workers-ai"
mkdir -p "$fake"
cp "$here/lib/fake-workers-ai.js" "$fake/index.js"
printf '{ "name": "fake-workers-ai", "main": "index.js", "compatibility_date": "2026-10-01" }\n' > "$fake/wrangler.jsonc"
# The config the build used, with ONE change: its `ai` binding becomes a
# service binding named AI to the stand-in, whose `run()` the Worker reaches
# over RPC as it would reach Workers AI's. Everything else — the Hyperdrive
# binding, the assets, the flags — is the built config, under the Worker
# name the stage deploy gives it. Written beside it, in the throwaway tree.
python3 - "$work/apps/web/wrangler.jsonc" "$work/apps/web/wrangler.e2e.json" "$repo-web-stage" <<'PY' \
  || { echo "FAIL: could not derive the dev config from the built one" >&2; exit 1; }
import json, sys
src, out, name = sys.argv[1:]
cfg = json.loads("\n".join(l for l in open(src).read().splitlines() if not l.lstrip().startswith("//")))
if cfg.pop("ai", None) != {"binding": "AI"}:
    sys.exit("the built Worker's wrangler.jsonc does not bind Workers AI as AI")
cfg.pop("$schema", None)
cfg["name"] = name
cfg["services"] = [{"binding": "AI", "service": "fake-workers-ai"}]
json.dump(cfg, open(out, "w"), indent=2)
PY
port="$(free_port)"
(cd "$work/apps/web" && CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$pgurl" \
   exec setsid pnpm exec wrangler dev --config wrangler.e2e.json --config "$fake/wrangler.jsonc" \
   --ip 127.0.0.1 --port "$port" --inspector-port "$(free_port)" \
   --show-interactive-dev-session=false) > "$scratch/dev.log" 2>&1 < /dev/null &
dev_pid=$!
url="http://127.0.0.1:$port"
for _ in $(seq 1 90); do
  curl -s -o /dev/null "$url/" && break
  kill -0 "$dev_pid" 2>/dev/null || { echo "FAIL: wrangler dev exited" >&2; tail -30 "$scratch/dev.log" >&2; exit 1; }
  sleep 1
done
curl -s -o /dev/null "$url/" || { echo "FAIL: wrangler dev never answered" >&2; tail -30 "$scratch/dev.log" >&2; exit 1; }

echo "   ▸ the component's own smokeCommand, DEPLOYED_URL=$url"
smoke="$(python3 -c "import yaml,sys;print(yaml.safe_load(open(sys.argv[1]))['spec']['parameters']['smokeCommand'])" "$tree/apps/web/component.yaml")"
DEPLOYED_URL="$url" bash -c "$smoke" || { echo "FAIL: the deploy's smoke refused the product" >&2; tail -20 "$scratch/dev.log" >&2; exit 1; }

echo "   ▸ every route the product promises, a question answered in SQL, and the SQL it must not run"
python3 - "$url" "$values" "$pgurl" "$work/apps/web/.next/server/server-reference-manifest.json" "$scratch/dev.log" <<'PY' \
  || { echo "FAIL: the routes; wrangler dev said:" >&2; tail -40 "$scratch/dev.log" >&2; exit 1; }
import html, http.client, json, re, subprocess, sys, time, urllib.error, urllib.parse, urllib.request
base, values, pgurl, manifest, devlog = sys.argv[1], json.load(open(sys.argv[2])), sys.argv[3], sys.argv[4], sys.argv[5]
name = values["productname"]
problems = []
def bad(m): problems.append(m)

def req(path, data=None, headers=None, method=None):
    # A GET whose CONNECTION drops (not one that answers an error) is asked
    # again, twice at most, and says so: `wrangler dev` on a loaded machine
    # has dropped one. A POST is never repeated — it would submit twice.
    for attempt in range(3):
        r = urllib.request.Request(base + path, data=data, headers=headers or {}, method=method)
        try:
            with urllib.request.urlopen(r, timeout=120) as resp:
                return resp.status, {k.lower(): v for k, v in resp.headers.items()}, resp.read().decode(errors="replace")
        except urllib.error.HTTPError as e:
            return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read().decode(errors="replace")
        except (http.client.RemoteDisconnected, ConnectionResetError) as e:
            if data is not None or attempt == 2:
                raise
            print(f"   (GET {path}: the connection dropped ({e.__class__.__name__}) — asking again)")
            time.sleep(1)

def sql(query):
    return subprocess.run(["psql", pgurl, "-XAt", "-c", query], capture_output=True, text=True, check=True).stdout.strip()

def rows_of(query):
    # The database's own answer to a query, as the JSON the app returns it in.
    return json.loads(sql(f"select coalesce(json_agg(t), '[]') from ({query.rstrip().rstrip(';')}) t"))

# The page's four server actions, by the ids the build gave them — called as
# the page calls them: a POST to the page with the action's id, the arguments
# as a JSON array, the result back in the RSC stream's row 1.
ids = {v["exportedName"]: k for k, v in json.load(open(manifest))["node"].items()}
for want in ("generateQuery", "runGenerateSQLQuery", "explainQuery", "generateChartConfig"):
    if want not in ids:
        sys.exit(f"the build has no server action {want}: {sorted(ids)}")

def log_now():
    return open(devlog, errors="replace").read()

def action(fn, *args):
    before = len(log_now())
    s, h, raw = req("/", json.dumps(list(args)).encode(),
                    {"Next-Action": ids[fn], "Content-Type": "text/plain;charset=UTF-8", "Accept": "text/x-component"},
                    "POST")
    rows = dict(re.findall(r"^(\w+):(.*)$", raw, re.M))
    value = rows.get("1", "")
    if s == 200 and h.get("content-type", "").startswith("text/x-component") and not value.startswith("E"):
        return True, json.loads(value)
    # A refused action answers 500 with a digest; the reason is the Worker's
    # log line beside it.
    digest = (re.search(r'"digest":"(\d+)"', value) or [None, None])[1]
    for _ in range(20):
        said = log_now()[before:]
        if not digest or digest in said:
            break
        time.sleep(0.25)
    return False, said

def refused(fn, args, why, what):
    ok, said = action(fn, *args)
    if ok:
        bad(f"{what}: {fn} answered {said!r} instead of refusing")
    elif not re.search(why, said):
        bad(f"{what}: {fn} was refused, but not for /{why}/: {said[-600:]!r}")

# ── the page, under the product's own name ────────────────────────────────
s, _, home = req("/")
if s != 200:
    bad(f"/ answered {s}")
title = re.search(r"<title>(.*?)</title>", home, re.S)
if not title or html.unescape(title.group(1)) != name:
    bad(f"the page's <title> is {title and title.group(1)!r}, not {name!r}")
if "Natural Language Postgres" in home or "Natural Language PostgreSQL" in home:
    bad("the page still carries the baseline's name")
h1 = re.search(r"<h1[^>]*>(.*?)</h1>", home, re.S)
if not h1 or html.unescape(re.sub(r"<[^>]+>", "", h1.group(1))).strip() != name:
    bad(f"the page's header is {h1 and h1.group(1)!r}, not {name!r}")
if 'placeholder="Ask about startup unicorns..."' not in home:
    bad("the page has no question box")
source = f'href="https://github.com/{values["githuborg"]}/{values["reponame"]}"'
if source not in home or "vercel.com/new" in home:
    bad(f"the page's source link is not {source} (or the Vercel deploy button is still there)")
# The Open Graph image link is absolute, resolved against the origin the
# build was given (component.yaml's NEXT_PUBLIC_SITE_URL, rebranded): the
# product's own stage Worker — never upstream's demo on vercel.app.
og = re.search(r'<meta property="og:image" content="([^"]+)"', home)
want_origin = f"https://{values['reponame']}-web-stage.{values['subdomain']}.workers.dev/"
if not og or "vercel.app" in og.group(1) or not og.group(1).startswith(want_origin + "opengraph-image"):
    bad(f"the Open Graph image is {og and og.group(1)!r}, not on the stage origin {want_origin} the build was given")
else:
    image = urllib.parse.urlsplit(html.unescape(og.group(1)))
    s, h, png = req(image.path + (f"?{image.query}" if image.query else ""))
    if s != 200 or not h.get("content-type", "").startswith("image/png") or not png:
        bad(f"the Open Graph image's path {image.path} answered {s} {h.get('content-type')}")
s, _, _ = req("/no-such-page")
if s != 404:
    bad(f"/no-such-page answered {s}, not 404")

# ── what only the Worker answers ──────────────────────────────────────────
s, _, body = req("/api/health")
if s != 200 or json.loads(body) != {"ok": True, "database": "reachable", "schema": "migrated", "model": "workers-ai"}:
    bad(f"/api/health answered {s} {body}")

# ── a question, as the page asks it ───────────────────────────────────────
answered = []
for question, want_sql in [
    ("Countries with highest unicorn density",
     "SELECT country, COUNT(*) AS count FROM unicorns GROUP BY country ORDER BY count DESC, country LIMIT 10;"),
    ("Show the number of unicorns founded each year over the past two decades",
     "SELECT EXTRACT(YEAR FROM date_joined)::int AS year, COUNT(*) AS count FROM unicorns GROUP BY year ORDER BY year;"),
]:
    ok, query = action("generateQuery", question)
    if not ok or query != want_sql:
        bad(f"generateQuery({question!r}) answered {query!r}")
        continue
    ok, rows = action("runGenerateSQLQuery", query)
    if not ok:
        bad(f"runGenerateSQLQuery({query!r}) was refused: {rows[-600:]!r}")
        continue
    direct = rows_of(query)
    if rows != direct or not rows:
        bad(f"the app's rows for {query!r} are {rows!r}, not the database's own {direct!r}")
        continue
    keys = list(rows[0])
    ok, chart = action("generateChartConfig", rows, question)
    if not ok or chart["config"]["xKey"] != keys[0] or chart["config"]["yKeys"] != keys[1:] \
            or chart["config"]["colors"] != {k: f"hsl(var(--chart-{i + 1}))" for i, k in enumerate(keys[1:])}:
        bad(f"generateChartConfig over {keys} answered {chart!r}")
    ok, explained = action("explainQuery", question, query)
    sections = [e["section"] for e in (explained or {}).get("explanations", [])] if ok else []
    if not sections or not query.startswith(sections[0]):
        bad(f"explainQuery({query!r}) answered {explained!r}")
    answered.append((question, len(rows)))

# ── what it must not run ──────────────────────────────────────────────────
before = sql("select count(*) || ' ' || coalesce(sum(valuation), 0) from unicorns")
ledger = sql("select count(*) from _migrations.applied")
# The template's own check, in front: a DELETE never reaches the database.
ok, query = action("generateQuery", "Delete every unicorn")
if not ok or query != "DELETE FROM unicorns;":
    bad(f"generateQuery(delete) answered {query!r}")
refused("runGenerateSQLQuery", [query], r"Only SELECT queries are allowed", "a DELETE")
# What passes that check is the database's to refuse — as query_reader.
for question, why in [
    ("Show me the migrations", r"permission denied for schema _migrations"),
    ("Become the owner and count the migrations", r'cannot set parameter "role" within security-definer function|permission denied for schema _migrations'),
    # query_to_xml is STABLE, so Postgres runs the statement inside it read
    # only and refuses the DELETE itself — whichever refusal comes first.
    ("Run this hex", r"DELETE is not allowed in a non-volatile function|cannot execute DELETE in a read-only transaction|permission denied for table unicorns"),
]:
    ok, query = action("generateQuery", question)
    if not ok or not query.upper().startswith("SELECT"):
        bad(f"generateQuery({question!r}) answered {query!r}")
        continue
    refused("runGenerateSQLQuery", [query], why, question)
after = sql("select count(*) || ' ' || coalesce(sum(valuation), 0) from unicorns")
if after != before or not before.startswith("60 ") or sql("select count(*) from _migrations.applied") != ledger:
    bad(f"the table went from {before!r} to {after!r}, the ledger from {ledger} rows")

if problems:
    for p in problems:
        print(f"  ✕ {p}", file=sys.stderr)
    sys.exit(1)
print(f"   / as {name!r} (its title and its header), its source link, its Open Graph image on {want_origin}, a 404, "
      f"/api/health (model: workers-ai); "
      + "; ".join(f"{q!r} written, run ({n} rows, the database's own), charted and explained" for q, n in answered)
      + "; a DELETE refused by the template's check, and a read of the ledger, a step back up to the owner and a DELETE "
        "in hex refused by the database — the 60 rows and the ledger untouched")
PY

# What the Workers AI stand-in was asked, read back from wrangler's output:
# the app wrote, explained and charted through the AI binding, with the model
# lib/ai/models.ts names, in JSON mode, with upstream's prompts.
python3 - "$scratch/dev.log" <<'PY' || { echo "FAIL: the AI binding's calls" >&2; grep 'fake-workers-ai' "$scratch/dev.log" | tail -20 >&2; exit 1; }
import json, re, sys
calls = [json.loads(m.group(1)) for m in re.finditer(r"fake-workers-ai (\{.*\})", open(sys.argv[1]).read())]
problems = []
refused = [c for c in calls if "refused" in c]
if refused:
    problems.append(f"the stand-in refused {refused}")
kinds = [c["kind"] for c in calls]
if kinds.count("query") != 6 or kinds.count("chart") != 2 or kinds.count("explain") != 2 or "unknown" in kinds:
    problems.append(f"the calls were {kinds}: want six questions, two charts, two explanations")
schemas = {c["kind"]: c["schema"] for c in calls}
if schemas.get("query") != ["query"] or schemas.get("explain") != ["explanations"] \
        or "xKey" not in (schemas.get("chart") or []):
    problems.append(f"the structured outputs asked for {schemas}")
if any(c["roles"] != ["system", "user"] for c in calls):
    problems.append("a call was not a system prompt and one user message")
if not all(c["describesTable"] for c in calls if c["kind"] in ("query", "explain")):
    problems.append("a question or an explanation was asked without upstream's table description")
for p in problems:
    print(f"  ✕ {p}", file=sys.stderr)
if problems:
    sys.exit(1)
print(f"   the AI binding: {len(calls)} calls, every one JSON mode, whole, the model lib/ai/models.ts names")
PY

# ── 6. query_reader, as itself ─────────────────────────────────────────────
echo "── query_reader's own grants, and the function closed to the Data API's roles"
for statement in \
  "DELETE FROM unicorns" \
  "UPDATE unicorns SET valuation = 0" \
  "INSERT INTO unicorns (company, valuation, country, city, industry, select_investors) VALUES ('x', 1, 'x', 'x', 'x', 'x')" \
  "DROP TABLE unicorns" \
  "TRUNCATE unicorns" \
  "ALTER TABLE unicorns ADD COLUMN x int" \
  "CREATE TABLE public.x (y int)" \
  "SELECT * FROM _migrations.applied" \
  "SELECT nextval('unicorns_id_seq')"; do
  if psql "$pgurl" -X -q -At -c "SET ROLE query_reader; $statement" > "$scratch/reader.log" 2>&1; then
    echo "FAIL: query_reader ran: $statement" >&2; exit 1
  fi
  grep -qE "permission denied|must be owner" "$scratch/reader.log" \
    || { echo "FAIL: query_reader's '$statement' was refused for another reason:" >&2; cat "$scratch/reader.log" >&2; exit 1; }
done
[ "$(psql "$pgurl" -X -q -At -c "SET ROLE query_reader; SELECT count(*) FROM unicorns")" = 60 ] \
  || { echo "FAIL: query_reader does not read the sixty rows" >&2; exit 1; }
for role in anon authenticated; do
  if psql "$pgurl" -X -q -At -c "SET ROLE $role; SELECT app_private.run_read_only('select 1')" > "$scratch/runner.log" 2>&1; then
    echo "FAIL: $role ran the model's SQL door" >&2; exit 1
  fi
  grep -q "permission denied for schema app_private" "$scratch/runner.log" \
    || { echo "FAIL: $role was refused the function for another reason:" >&2; cat "$scratch/runner.log" >&2; exit 1; }
done
echo "   query_reader reads the sixty rows and nothing else — every write, DDL, the ledger and the sequence refused by its own grants; anon and authenticated cannot reach app_private"

# ── 7. what Supabase's Data API would see ──────────────────────────────────
echo "── the Data API's roles (anon, authenticated) against the same database"
psql "$pgurl" -X -q -v ON_ERROR_STOP=1 -At > "$scratch/rls.out" 2> "$scratch/rls.err" <<'SQL' \
  || { echo "FAIL: the row-level security checks" >&2; cat "$scratch/rls.err" >&2; exit 1; }
SELECT 'app role: superuser=' || rolsuper || ' bypassrls=' || rolbypassrls FROM pg_roles WHERE rolname = current_user;
SELECT 'public tables without RLS: ' || count(*) FILTER (WHERE NOT c.relrowsecurity) || ' of ' || count(*)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');
SELECT 'not owned by the app: ' || count(*) FILTER (WHERE pg_get_userbyid(c.relowner) <> current_user)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');
SELECT 'app sees unicorns: ' || count(*) FROM unicorns;
SET ROLE anon;
SELECT 'anon sees unicorns: ' || count(*) FROM unicorns;
RESET ROLE;
SET ROLE authenticated;
SELECT 'authenticated sees unicorns: ' || count(*) FROM unicorns;
RESET ROLE;
SQL
sed 's/^/   /' "$scratch/rls.out"
grep -qx "app role: superuser=false bypassrls=false" "$scratch/rls.out" \
  && grep -qx "public tables without RLS: 0 of 1" "$scratch/rls.out" \
  && grep -qx "not owned by the app: 0" "$scratch/rls.out" \
  || { echo "FAIL: the app's role, the table's owner or its row-level security is not what Supabase's would be" >&2; exit 1; }
for line in "app sees unicorns: 60" "anon sees unicorns: 0" "authenticated sees unicorns: 0"; do
  grep -qx "$line" "$scratch/rls.out" || { echo "FAIL: expected '$line'" >&2; exit 1; }
done
# A write through the Data API's roles is refused by row-level security.
for role in anon authenticated; do
  if psql "$pgurl" -X -q -At -c "SET ROLE $role; INSERT INTO unicorns (company, valuation, country, city, industry, select_investors) VALUES ('$role', 1, 'x', 'x', 'x', 'x')" > "$scratch/rls-write.log" 2>&1; then
    echo "FAIL: $role wrote a row through row-level security" >&2; exit 1
  fi
  grep -q "row-level security" "$scratch/rls-write.log" \
    || { echo "FAIL: $role's write was refused for another reason:" >&2; cat "$scratch/rls-write.log" >&2; exit 1; }
done
echo "   anon and authenticated, granted what Supabase grants them, read the table as empty and write nothing; the app reads all sixty rows as its owner"

echo "e2e.test.sh: ok"
