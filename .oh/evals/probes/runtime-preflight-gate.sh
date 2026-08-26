#!/usr/bin/env bash
# tier: A
# source: issue #806 § B1 (open sandbox.substrate vs sandbox.runtime selector);
#         issue #805 (glibc 2.39 floor + absent /dev/kvm)
# desc: `oh runtime` installs a tool and reports host readiness without selecting a
#       runtime — it writes no runtime config key, declares both measured MicroSandbox
#       blockers, and gates the installer behind the preflight rather than warning past it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CATALOG="$ROOT/.oh/cli/src/lib/runtimes/catalog.ts"
CMD="$ROOT/.oh/cli/src/commands/runtime.ts"

if [[ ! -f "$CATALOG" ]]; then
  echo "SKIPPED: runtime catalog absent: $CATALOG" >&2
  exit 2
fi
if [[ ! -f "$CMD" ]]; then
  echo "SKIPPED: runtime command absent: $CMD" >&2
  exit 2
fi

missing=()

strip_comments() {
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

for sym in setInstallFlag seedHarnessYaml; do
  if grep -qF "$sym" "$CMD"; then
    missing+=("commands/runtime.ts: imports $sym — this command persists no configuration")
  fi
done

if grep -qE 'buildArg|harnessKey' "$CATALOG"; then
  missing+=("runtimes/catalog.ts: declares a build arg / INSTALL_* key — see the file header")
fi

grep -qF '"2.39"' "$CATALOG" \
  || missing+=("runtimes/catalog.ts: no glibc 2.39 floor — blocker 1 of #805")
grep -qF '/dev/kvm' "$CATALOG" \
  || missing+=("runtimes/catalog.ts: no /dev/kvm requirement — blocker 2 of #805")

grep -qF 'get.microsandbox.dev' "$CATALOG" \
  || missing+=("runtimes/catalog.ts: installer is not the command recorded by the #803 spike")

grep -qE 'id: *"docker"' "$CATALOG" \
  || missing+=("runtimes/catalog.ts: the active runtime (docker) is not listed")
grep -qE 'state: *"active"' "$CATALOG" \
  || missing+=("runtimes/catalog.ts: no runtime is marked active — nothing reports what is in use")
grep -qF '{{.Server.Version}}' "$CATALOG" \
  || missing+=("runtimes/catalog.ts: docker is listed but never probed — presence is assumed, not measured")
grep -qE 'scope: *"host"' "$CATALOG" \
  || missing+=("runtimes/catalog.ts: no host-scoped check — the docker daemon cannot be probed from inside the container")

cmd_code=$(strip_comments "$CMD")

if ! grep -qF 'if (!opts.force) return 1;' <<<"$cmd_code"; then
  missing+=("commands/runtime.ts: preflight failure does not return 1 — the gate became a warning")
fi
if ! grep -qF -e '--force' <<<"$cmd_code"; then
  missing+=("commands/runtime.ts: no --force override — the operator has no way past the gate")
fi

if grep -qE '\("docker"|\bdocker exec\b' <<<"$cmd_code"; then
  missing+=("commands/runtime.ts: names docker directly — go through ExecutionTarget.exec")
fi
if grep -qE '\.kind ===' <<<"$cmd_code"; then
  missing+=("commands/runtime.ts: branches on target.kind — use capability discovery")
fi

CLI="$ROOT/.oh/cli/src/cli.ts"
if [[ -f "$CLI" ]]; then
  grep -qF 'first === "runtime"' "$CLI" \
    || missing+=("cli.ts: no dispatch for `oh runtime`")
  grep -qF 'oh runtime <args...>' "$CLI" \
    || missing+=("cli.ts: `oh runtime` missing from the top-level usage block")
fi

if ((${#missing[@]})); then
  printf 'REGRESSION: %s\n' "${missing[@]}" >&2
  exit 1
fi

echo 'PASS: oh runtime gates on the measured preflight and selects no runtime' >&2
