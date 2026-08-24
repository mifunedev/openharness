#!/usr/bin/env bash
# tier: A
# source: issue #806 § B1 (open sandbox.substrate vs sandbox.runtime selector);
#         issue #805 (glibc 2.39 floor + absent /dev/kvm)
# desc: `oh substrate` installs a tool and reports host readiness without selecting a
#       runtime — it writes no substrate config key, declares both measured MicroSandbox
#       blockers, and gates the installer behind the preflight rather than warning past it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CATALOG="$ROOT/.oh/cli/src/lib/substrates/catalog.ts"
CMD="$ROOT/.oh/cli/src/commands/substrate.ts"

if [[ ! -f "$CATALOG" ]]; then
  echo "SKIPPED: substrate catalog absent: $CATALOG" >&2
  exit 2
fi
if [[ ! -f "$CMD" ]]; then
  echo "SKIPPED: substrate command absent: $CMD" >&2
  exit 2
fi

missing=()

# --- 1. No substrate selector -------------------------------------------------
#
# #806 § B1 records this as an OPEN decision owned by #731, and states that
# settling it elsewhere forks the ExecutionTarget seam. The command therefore
# writes nothing. Comments explaining that are required; a KEY is not.
#
# Strip comments before matching, so the explanation can name the keys freely.
strip_comments() {
  # Block comments, then line comments whose `//` is not preceded by `:`
  # (which would truncate a `https://` URL inside a string literal).
  perl -0pe 's{/\*.*?\*/}{}gs; s{(^|[^:])//[^\n]*}{$1}gm' "$1"
}

for src in "$CATALOG" "$CMD"; do
  code=$(strip_comments "$src")
  if grep -qF 'sandbox.substrate' <<<"$code"; then
    missing+=("${src#"$ROOT/"}: writes/reads sandbox.substrate — the selector decision belongs to #731 (#806 B1)")
  fi
  if grep -qF 'sandbox.runtime' <<<"$code"; then
    missing+=("${src#"$ROOT/"}: writes/reads sandbox.runtime — the selector decision belongs to #731 (#806 B1)")
  fi
done

# The harness.yaml writers exist one directory away and are easy to reach for.
for sym in setInstallFlag seedHarnessYaml; do
  if grep -qF "$sym" "$CMD"; then
    missing+=("commands/substrate.ts: imports $sym — this command persists no configuration")
  fi
done

# A build arg would bake a guaranteed-failing install into the image (#805).
if grep -qE 'buildArg|harnessKey' "$CATALOG"; then
  missing+=("substrates/catalog.ts: declares a build arg / harness.yaml key — see the file header")
fi

# --- 2. Both measured blockers are declared -----------------------------------
#
# These are the numbers `install` refuses on. If the catalog drops one, the
# command silently starts claiming a host is ready when #805 says it is not.
grep -qF '"2.39"' "$CATALOG" \
  || missing+=("substrates/catalog.ts: no glibc 2.39 floor — blocker 1 of #805")
grep -qF '/dev/kvm' "$CATALOG" \
  || missing+=("substrates/catalog.ts: no /dev/kvm requirement — blocker 2 of #805")

# The installer command must stay the one the P0 spike recorded (#803), because
# no msb binary has ever existed in this harness to derive another from.
grep -qF 'get.microsandbox.dev' "$CATALOG" \
  || missing+=("substrates/catalog.ts: installer is not the command recorded by the #803 spike")

# --- 3. The preflight is a gate, not a warning --------------------------------
#
# The failure mode this guards: someone converts the early return into a printed
# warning, and `install` starts spending a network round trip to reproduce an
# error #805 already documents.
# Checks 3 and 4 read CODE only. The module header describes the very patterns
# being banned, so matching raw text would flag the explanation of the rule.
cmd_code=$(strip_comments "$CMD")

if ! grep -qF 'if (!opts.force) return 1;' <<<"$cmd_code"; then
  missing+=("commands/substrate.ts: preflight failure does not return 1 — the gate became a warning")
fi
if ! grep -qF -e '--force' <<<"$cmd_code"; then
  missing+=("commands/substrate.ts: no --force override — the operator has no way past the gate")
fi

# --- 4. Container work stays behind the ExecutionTarget contract --------------
#
# rfc-brain-hands-boundary.md: callers branch on capabilities, never on `kind`,
# and never spawn `docker exec` directly.
if grep -qE '\("docker"|\bdocker exec\b' <<<"$cmd_code"; then
  missing+=("commands/substrate.ts: names docker directly — go through ExecutionTarget.exec")
fi
if grep -qE '\.kind ===' <<<"$cmd_code"; then
  missing+=("commands/substrate.ts: branches on target.kind — use capability discovery")
fi

# --- 5. The command is reachable ---------------------------------------------
CLI="$ROOT/.oh/cli/src/cli.ts"
if [[ -f "$CLI" ]]; then
  grep -qF 'first === "substrate"' "$CLI" \
    || missing+=("cli.ts: no dispatch for `oh substrate`")
  grep -qF 'oh substrate <args...>' "$CLI" \
    || missing+=("cli.ts: `oh substrate` missing from the top-level usage block")
fi

if ((${#missing[@]})); then
  printf 'REGRESSION: %s\n' "${missing[@]}" >&2
  exit 1
fi

echo 'PASS: oh substrate gates on the measured preflight and selects no runtime' >&2
