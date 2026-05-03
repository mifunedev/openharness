#!/usr/bin/env bash
set -euo pipefail

# ─── Cloudflared Tunnel Setup ──────────────────────────────────────
# Creates a named tunnel, configures ingress, and routes DNS.
#
# Prerequisites:
#   - cloudflared installed (system package manager or INSTALL_CLOUDFLARED=true sandbox rebuild)
#   - User authenticated: cloudflared login (opens browser, saves cert.pem)
#
# Usage:
#   Single ingress:
#     cloudflared-tunnel.sh <tunnel-name> <hostname> <local-port> [--run]
#
#   Multi-ingress:
#     cloudflared-tunnel.sh <tunnel-name> <hostname:port> [<hostname:port> ...] [--run]
#
# Examples (replace <your-domain> with your own Cloudflare-managed domain):
#   cloudflared-tunnel.sh myproject app.<your-domain> 3000
#   cloudflared-tunnel.sh myproject app.<your-domain>:3000 api.<your-domain>:3001
#   cloudflared-tunnel.sh myproject app.<your-domain>:3000 api.<your-domain>:3001 --run

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
banner() { printf "\n${CYAN}==> %s${NC}\n" "$*"; }
ok()     { printf "${GREEN} ✓  %s${NC}\n" "$*"; }
die()    { printf "${RED}ERROR: %s${NC}\n" "$*" >&2; exit 1; }

TUNNEL_NAME="${1:?Usage: cloudflared-tunnel.sh <tunnel-name> <hostname:port> [<hostname:port> ...] [--run]}"
shift

# ─── Parse arguments: collect hostname:port pairs, detect --run ──
declare -a INGRESS_PAIRS=()
RUN_AFTER=false

for arg in "$@"; do
  if [[ "$arg" == "--run" ]]; then
    RUN_AFTER=true
  elif [[ "$arg" == *:* ]]; then
    INGRESS_PAIRS+=("$arg")
  else
    # Legacy single-ingress mode: <hostname> <port>
    # Next arg should be the port
    if [[ ${#INGRESS_PAIRS[@]} -eq 0 && -z "${_LEGACY_HOST:-}" ]]; then
      _LEGACY_HOST="$arg"
    elif [[ -n "${_LEGACY_HOST:-}" ]]; then
      INGRESS_PAIRS+=("${_LEGACY_HOST}:${arg}")
      unset _LEGACY_HOST
    fi
  fi
done

[[ ${#INGRESS_PAIRS[@]} -eq 0 ]] && die "No hostname:port pairs provided. Usage: cloudflared-tunnel.sh <tunnel-name> <hostname:port> [...]"

CFLARED_DIR="$HOME/.cloudflared"

# ─── Check prerequisites ─────────────────────────────────────────
command -v cloudflared >/dev/null 2>&1 || die "cloudflared is not installed. Install it via your system package manager or rebuild the sandbox with INSTALL_CLOUDFLARED=true."

if [ ! -f "$CFLARED_DIR/cert.pem" ]; then
  banner "Authenticating with Cloudflare"
  printf "  Run: cloudflared login\n"
  printf "  This opens a browser to authenticate with your Cloudflare account.\n"
  cloudflared login
fi

[ -f "$CFLARED_DIR/cert.pem" ] || die "No cert.pem found after login. Authentication may have failed."

# ─── Create tunnel (idempotent) ───────────────────────────────────
banner "Creating tunnel: $TUNNEL_NAME"
if cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
  ok "Tunnel '$TUNNEL_NAME' already exists"
  TUNNEL_ID=$(cloudflared tunnel list --output json | jq -r ".[] | select(.name==\"$TUNNEL_NAME\") | .id")
else
  cloudflared tunnel create "$TUNNEL_NAME"
  TUNNEL_ID=$(cloudflared tunnel list --output json | jq -r ".[] | select(.name==\"$TUNNEL_NAME\") | .id")
  ok "Tunnel '$TUNNEL_NAME' created (ID: $TUNNEL_ID)"
fi

# ─── Write config (multi-ingress) ────────────────────────────────
CREDS_FILE="$CFLARED_DIR/${TUNNEL_ID}.json"
CONFIG_FILE="$CFLARED_DIR/config-${TUNNEL_NAME}.yml"

banner "Writing config: $CONFIG_FILE (${#INGRESS_PAIRS[@]} ingress rules)"

{
  printf "tunnel: %s\n" "$TUNNEL_ID"
  printf "credentials-file: %s\n" "$CREDS_FILE"
  printf "\ningress:\n"
  for pair in "${INGRESS_PAIRS[@]}"; do
    hostname="${pair%%:*}"
    port="${pair##*:}"
    printf "  - hostname: %s\n    service: http://0.0.0.0:%s\n" "$hostname" "$port"
  done
  printf "  - service: http_status:404\n"
} > "$CONFIG_FILE"

ok "Config written"

# ─── Route DNS ───────────────────────────────────────────────────
for pair in "${INGRESS_PAIRS[@]}"; do
  hostname="${pair%%:*}"
  banner "Routing DNS: $hostname -> tunnel $TUNNEL_NAME"
  cloudflared tunnel route dns --overwrite-dns "$TUNNEL_NAME" "$hostname" 2>/dev/null && \
    ok "DNS route set for $hostname" || \
    ok "DNS route already correct for $hostname"
done

# ─── Summary ─────────────────────────────────────────────────────
printf "\n${GREEN}Tunnel '$TUNNEL_NAME' is configured!${NC}\n"
printf "\n"
printf "  ${CYAN}Tunnel ID${NC}:  $TUNNEL_ID\n"
printf "  ${CYAN}Config${NC}:     $CONFIG_FILE\n"
printf "  ${CYAN}Creds${NC}:      $CREDS_FILE\n"
printf "\n"
printf "  ${CYAN}Ingress rules${NC}:\n"
for pair in "${INGRESS_PAIRS[@]}"; do
  hostname="${pair%%:*}"
  port="${pair##*:}"
  printf "    %s → localhost:%s\n" "$hostname" "$port"
done
printf "\n"
printf "  ${CYAN}To run${NC}:\n"
printf "    cloudflared tunnel --config $CONFIG_FILE run $TUNNEL_NAME\n"
printf "\n"

# ─── Optionally run ──────────────────────────────────────────────
if [[ "$RUN_AFTER" == true ]]; then
  banner "Starting tunnel: $TUNNEL_NAME"
  exec cloudflared tunnel --config "$CONFIG_FILE" run "$TUNNEL_NAME"
fi
