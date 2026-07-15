#!/usr/bin/env bash
# tier: A
# source: issue #171 — pnpm security audits must run in CI
# desc: string/order guard — local pnpm installs and CI/release validation must audit before dependency install so pnpm audit cannot be silently removed
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PACKAGE_JSON="$ROOT/package.json"
CI_WORKFLOW="$ROOT/.github/workflows/ci-harness.yml"
RELEASE_WORKFLOW="$ROOT/.github/workflows/release.yml"

for file in "$PACKAGE_JSON" "$CI_WORKFLOW" "$RELEASE_WORKFLOW"; do
  if [[ ! -f "$file" ]]; then
    echo "SKIPPED: required file absent: $file" >&2
    exit 2
  fi
done

# --ignore-registry-errors: npm retired the audit endpoint pnpm calls (HTTP 410),
# which made this exit non-zero and abort every fresh `pnpm install` (and CI/release).
# The flag exits 0 on registry-side errors while STILL failing on real advisories, so
# the audit keeps running (issue #171) without a retired endpoint bricking installs.
EXPECTED_AUDIT="pnpm audit --audit-level low --ignore-registry-errors"
script_value="$(node -e 'const p=require(process.argv[1]); process.stdout.write(p.scripts?.["security:audit"] || "")' "$PACKAGE_JSON")"
if [[ "$script_value" != "$EXPECTED_AUDIT" ]]; then
  echo "REGRESSION: package.json scripts.security:audit must be exactly '$EXPECTED_AUDIT' (got: ${script_value:-<missing>})" >&2
  exit 1
fi
if grep -Fq 'GHSA-h67p-54hq-rp68' "$PACKAGE_JSON"; then
  echo "REGRESSION: docs-only js-yaml audit ignore must not remain after Docusaurus extraction" >&2
  exit 1
fi

dev_preinstall_value="$(node -e 'const p=require(process.argv[1]); process.stdout.write(p.scripts?.["pnpm:devPreinstall"] || "")' "$PACKAGE_JSON")"
if [[ "$dev_preinstall_value" != "pnpm run security:audit" ]]; then
  echo "REGRESSION: package.json scripts.pnpm:devPreinstall must run 'pnpm run security:audit' before local dependency install (got: ${dev_preinstall_value:-<missing>})" >&2
  exit 1
fi

node - "$CI_WORKFLOW" "$RELEASE_WORKFLOW" <<'NODE'
const fs = require('fs');
let failed = false;
for (const file of process.argv.slice(2)) {
  const text = fs.readFileSync(file, 'utf8');
  const audit = text.indexOf('pnpm run security:audit');
  const install = text.indexOf('pnpm install --frozen-lockfile');
  if (audit === -1) {
    console.error(`REGRESSION: ${file} no longer invokes 'pnpm run security:audit'`);
    failed = true;
  }
  if (install === -1) {
    console.error(`REGRESSION: ${file} no longer invokes 'pnpm install --frozen-lockfile'`);
    failed = true;
  }
  if (audit !== -1 && install !== -1 && audit > install) {
    console.error(`REGRESSION: ${file} runs pnpm audit after dependency install; audit must run first`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
NODE

if ! grep -q 'pnpm/action-setup@v4' "$CI_WORKFLOW"; then
  echo "REGRESSION: ci-harness workflow no longer installs pnpm via pnpm/action-setup@v4" >&2
  exit 1
fi

echo "PASS: pnpm audit is wired through local devPreinstall, CI, and release validation before install" >&2
