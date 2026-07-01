#!/usr/bin/env bash
# tier: A
# source: issue #553 — Railway one-click hosted deploy surface
# desc: Guards the Railway one-click hosted deploy README/config/docs contract
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RAILWAY_JSON="$ROOT/railway.json"
README="$ROOT/README.md"
DOCS="$ROOT/.oh/docs/railway.md"
DOCKERFILE="$ROOT/.oh/deploy/railway/Dockerfile"
START="$ROOT/.oh/deploy/railway/start.sh"
SERVER="$ROOT/.oh/deploy/railway/status-server.mjs"

missing=()
[[ -f "$RAILWAY_JSON" ]] || missing+=("railway.json missing")
[[ -f "$README" ]] || missing+=("README.md missing")
[[ -f "$DOCS" ]] || missing+=(".oh/docs/railway.md missing")
[[ -f "$DOCKERFILE" ]] || missing+=("Railway Dockerfile missing")
[[ -x "$START" ]] || missing+=("Railway start.sh missing or not executable")
[[ -f "$SERVER" ]] || missing+=("Railway status-server.mjs missing")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: Railway deploy artifacts missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

node -e '
const fs = require("node:fs");
const path = process.argv[1];
const cfg = JSON.parse(fs.readFileSync(path, "utf8"));
const failures = [];
if (cfg.$schema !== "https://railway.com/railway.schema.json") failures.push("schema URL");
if (cfg.build?.builder !== "DOCKERFILE") failures.push("build.builder DOCKERFILE");
if (cfg.build?.dockerfilePath !== ".oh/deploy/railway/Dockerfile") failures.push("dockerfilePath");
if (!String(cfg.deploy?.startCommand || "").includes(".oh/deploy/railway/start.sh")) failures.push("startCommand start.sh");
if (cfg.deploy?.healthcheckPath !== "/healthz") failures.push("healthcheckPath /healthz");
if (cfg.deploy?.restartPolicyType !== "ON_FAILURE") failures.push("restartPolicyType ON_FAILURE");
if (failures.length) {
  console.error(`REGRESSION: railway.json contract failed: ${failures.join(", ")}`);
  process.exit(1);
}
' "$RAILWAY_JSON"

checks=()

grep -qF 'https://railway.com/button.svg' "$README" || checks+=("README deploy button")
grep -qF 'https://railway.com/new/template?template=' "$README" || checks+=("README Railway template link")
grep -qF '.oh/docs/railway.md' "$README" || checks+=("README .oh/docs/railway.md link")
grep -qi 'Docker socket' "$README" || checks+=("README Docker socket limitation")

grep -qi 'does not provide the host Docker socket' "$DOCS" || checks+=("docs Docker socket limitation")
grep -qF 'GH_TOKEN' "$DOCS" || checks+=("docs GH_TOKEN variable")
grep -qi 'Railway volume' "$DOCS" || checks+=("docs Railway volume persistence")
grep -qF '/healthz' "$DOCS" || checks+=("docs health endpoint")

grep -qF 'COPY --chown=sandbox:sandbox . ${OH_PROJECT_ROOT}/' "$DOCKERFILE" || checks+=("Dockerfile copies repo")
grep -qF 'npm --prefix .oh/cli run build' "$DOCKERFILE" || checks+=("Dockerfile builds oh CLI")
if grep -qF '/var/run/docker.sock' "$DOCKERFILE"; then checks+=("Dockerfile must not require Docker socket"); fi

grep -qF ': "${PORT:=3000}"' "$START" || checks+=("start.sh PORT default")
grep -qF 'status-server.mjs' "$START" || checks+=("start.sh launches status server")
grep -qF "const host = '0.0.0.0'" "$SERVER" || checks+=("status server binds 0.0.0.0")
grep -qF "process.env.PORT" "$SERVER" || checks+=("status server reads PORT")
grep -qF "'/healthz'" "$SERVER" || checks+=("status server health route")

if (( ${#checks[@]} )); then
  printf 'REGRESSION: Railway one-click deploy contract missing: %s\n' "${checks[*]}" >&2
  exit 1
fi

echo "PASS: Railway one-click deploy README/config/docs/startup contract is present" >&2
exit 0
