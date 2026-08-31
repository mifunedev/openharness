#!/usr/bin/env bash
# tier: A
# source: issue #858 — Tailscale mobile access for T3 Code. There is no tailnet, no
#         auth key, and no phone in CI, so the acceptance criterion "a phone outside
#         the tailnet cannot reach the backend" cannot be executed. It is discharged
#         structurally instead: the sandbox gains no capability, no tun device and no
#         published port, the boot path installs a pinned checksummed binary without
#         ever joining a tailnet, and no Funnel command or reusable auth key ships.
#         #908 additionally proved a root-installed tool is unusable from inside the
#         sandbox: commands/tool.ts uses stdio:"inherit", so a root install becomes an
#         interactive `sudo` and /etc/sudoers.d/sandbox has no NOPASSWD.
# desc: the Tailscale optional tool stays a zero-privilege, zero-exposure install —
#       entrypointGuard (not buildArg) ground truth, version and both sha256 pins
#       agreeing between the entrypoint and the tool catalog, no cap_add/devices/
#       privileged/3773 in any compose file, no tailscaled or `tailscale up` on boot,
#       no Funnel, no committed auth key.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"; cd "$ROOT"
ENTRY=".devcontainer/entrypoint.sh"
DOCKERFILE=".devcontainer/Dockerfile"
CATALOG=".oh/cli/src/lib/tools/catalog.ts"

for f in "$ENTRY" "$DOCKERFILE" "$CATALOG"; do
  [ -f "$f" ] || { echo "SKIPPED: $f absent" >&2; exit 2; }
done

shopt -s nullglob
COMPOSE=(.devcontainer/docker-compose*.yml)
if ((${#COMPOSE[@]} == 0)); then
  echo "SKIPPED: no .devcontainer/docker-compose*.yml to check" >&2
  exit 2
fi

missing=()

grep -qF 'INSTALL_TAILSCALE' "$ENTRY" \
  || missing+=("$ENTRY: no INSTALL_TAILSCALE guard — the tool catalog's ground truth moved")
grep -qF 'INSTALL_TAILSCALE' "$DOCKERFILE" \
  && missing+=("$DOCKERFILE: INSTALL_TAILSCALE appeared — a Dockerfile guard means the catalog field must be buildArg, not entrypointGuard")

mapfile -t pins < <(grep -oE 'tailscale_[0-9]+\.[0-9]+\.[0-9]+_' "$ENTRY" | sed 's/^tailscale_//; s/_$//' | sort -u)
if ((${#pins[@]} == 0)); then
  missing+=("$ENTRY: no pinned tailscale_<x.y.z>_ tarball — the install is unpinned")
elif ((${#pins[@]} > 1)); then
  missing+=("$ENTRY: per-architecture version pins disagree (${pins[*]})")
else
  grep -qF "tailscale_${pins[0]}_" "$CATALOG" \
    || missing+=("$CATALOG: version pin disagrees with $ENTRY (${pins[0]})")
fi

grep -qF 'sha256sum -c' "$ENTRY" \
  || missing+=("$ENTRY: no 'sha256sum -c' verification of the Tailscale tarball")

mapfile -t entry_shas < <(grep -iE 'tailscale|ts_sha' "$ENTRY" | grep -oE '\b[0-9a-f]{64}\b' | sort -u)
mapfile -t catalog_shas < <(grep -iE 'tailscale' "$CATALOG" | grep -oE '\b[0-9a-f]{64}\b' | sort -u)
if ((${#entry_shas[@]} < 2)); then
  missing+=("$ENTRY: expected a sha256 literal per supported architecture, found ${#entry_shas[@]}")
elif [ "${entry_shas[*]}" != "${catalog_shas[*]}" ]; then
  missing+=("$CATALOG: sha256 literals disagree with $ENTRY (entrypoint: ${entry_shas[*]:-none} / catalog: ${catalog_shas[*]:-none})")
fi

if grep -qE '(^|[;&|]|&&|\|\||\bthen |\bdo |\bexec |\bnohup |\bsudo )[[:space:]]*("?[^[:space:]"]*/)?tailscaled\b' "$ENTRY"; then
  missing+=("$ENTRY: invokes tailscaled — the boot path installs the binary, it never starts the daemon")
fi
if grep -qE '\btailscale[[:space:]]+(-[^[:space:]]+[[:space:]]+)*up([[:space:]]|$)' "$ENTRY"; then
  missing+=("$ENTRY: runs 'tailscale up' — joining a tailnet must stay an explicit human act")
fi
if grep -qE 'TS_AUTHKEY|--authkey' "$ENTRY"; then
  missing+=("$ENTRY: reads an auth key — the documented path is interactive 'tailscale up'")
fi

for f in "${COMPOSE[@]}"; do
  if grep -qE '^[[:space:]]*cap_add:' "$f"; then
    missing+=("$f: cap_add — userspace networking needs no capability grant")
  fi
  if grep -qE '^[[:space:]]*devices:' "$f"; then
    missing+=("$f: devices: — /dev/net/tun must never be handed to the sandbox")
  fi
  if grep -qE '^[[:space:]]*privileged:[[:space:]]*true' "$f"; then
    missing+=("$f: privileged: true — the Tailscale path grants no privilege")
  fi
  published=$(awk '
    /^[[:space:]]*ports:[[:space:]]*$/ { indent = match($0, /[^ ]/); inports = 1; next }
    inports {
      if ($0 ~ /^[[:space:]]*$/) next
      if (match($0, /[^ ]/) <= indent) { inports = 0; next }
      if ($0 ~ /3773/) print
    }
  ' "$f")
  if [ -n "$published" ]; then
    missing+=("$f: publishes 3773 — T3 Code must stay on container loopback and be reachable only through the tailnet")
  fi
done

if ! grep -qE 'id:[[:space:]]*"tailscale"' "$CATALOG"; then
  missing+=("$CATALOG: no tool entry with id \"tailscale\"")
else
  entry_block=$(awk '/id:[[:space:]]*"tailscale"/{found=1} found{print; if (/\}\)/) exit}' "$CATALOG")
  grep -qE 'kind:[[:space:]]*"opt-in"' <<<"$entry_block" \
    || missing+=("$CATALOG: the tailscale entry is not kind \"opt-in\" — it must never install by default")
  grep -qE 'toolKey:[[:space:]]*"tailscale"' <<<"$entry_block" \
    || missing+=("$CATALOG: the tailscale entry has no toolKey \"tailscale\" — the oh.json opt-in is not wired")
  grep -qE 'entrypointGuard:[[:space:]]*"INSTALL_TAILSCALE"' <<<"$entry_block" \
    || missing+=("$CATALOG: the tailscale entry has no entrypointGuard \"INSTALL_TAILSCALE\"")
  # tailscaled runs fine unprivileged with --tun=userspace-networking, so nothing
  # here needs root. A root install would hang `oh tool install tailscale` on a
  # sudo password prompt no agent can answer, and would put the binary in an
  # image-layer path that no running sandbox can upgrade and every container
  # recreate discards.
  grep -qE 'installUser:[[:space:]]*"root"' <<<"$entry_block" \
    && missing+=("$CATALOG: the tailscale entry installs as root — commands/tool.ts uses stdio:\"inherit\", so that becomes an interactive \`sudo\`, and /etc/sudoers.d/sandbox has no NOPASSWD")
  grep -qE 'installUser:[[:space:]]*"sandbox"' <<<"$entry_block" \
    || missing+=("$CATALOG: the tailscale entry does not declare installUser \"sandbox\"")
  grep -qF 'NPM_USER_PREFIX' <<<"$entry_block" \
    || missing+=("$CATALOG: the tailscale entry does not install into NPM_USER_PREFIX — the binary must land in the home mount, not an image-layer path")
  grep -qE '/usr/local/bin/tailscale' <<<"$entry_block" \
    && missing+=("$CATALOG: the tailscale entry writes to /usr/local/bin — that needs root and is discarded on container recreate")
fi

# The boot path must agree with the catalog: same destination, same user.
grep -qE 'install -m 0755 [^ ]+ /usr/local/bin/tailscaled?' "$ENTRY" \
  && missing+=("$ENTRY: installs Tailscale into /usr/local/bin — the catalog installs it into the home mount, and an image-layer copy is lost on every recreate")

# tailscaled's default control socket is /var/run/tailscale/tailscaled.sock and
# t3-code.sh calls a bare `tailscale status`. Only root can create that directory,
# so the entrypoint must, and it must not be gated behind INSTALL_TAILSCALE —
# `oh tool install tailscale` is supposed to leave the tool usable immediately.
socket_dir_line=$(grep -nE 'install -d .*-o sandbox .*/var/run/tailscale' "$ENTRY" | head -1 | cut -d: -f1)
if [ -z "$socket_dir_line" ]; then
  missing+=("$ENTRY: never creates /var/run/tailscale — tailscaled's default socket path is unwritable, so a bare \`tailscale status\` cannot work")
else
  guard_line=$(grep -nE '^if \[ "\$\{INSTALL_TAILSCALE:-false\}" = "true" \]' "$ENTRY" | head -1 | cut -d: -f1)
  if [ -n "$guard_line" ] && [ "$socket_dir_line" -gt "$guard_line" ]; then
    missing+=("$ENTRY: creates /var/run/tailscale inside the INSTALL_TAILSCALE guard — a later \`oh tool install tailscale\` would then need a reboot before the socket path exists")
  fi
fi

funnel=$(grep -rniE '\bfunnel\b' .oh/skills/t3 .devcontainer 2>/dev/null || true)
if [ -n "$funnel" ]; then
  missing+=("Funnel appears in .oh/skills/t3 or .devcontainer — Funnel is public exposure and the harness ships no Funnel command")
fi

authkeys=$(grep -rIlE 'tskey[-](auth|client|api)[-]' . --exclude-dir=.git 2>/dev/null || true)
if [ -n "$authkeys" ]; then
  missing+=("a Tailscale auth key literal is committed in: $(tr '\n' ' ' <<<"$authkeys")")
fi

if ((${#missing[@]})); then
  printf 'REGRESSION: %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: Tailscale installs pinned and checksummed into the home mount as the sandbox user, grants no capability, publishes no port, joins no tailnet on boot, and ships no Funnel or auth key" >&2
