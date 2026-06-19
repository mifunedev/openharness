#!/usr/bin/env bash
# scripts/prompt-miner-caps.sh — origin-scoped PR-cap preflight for the
# prompt-miner cron.
#
# The prompt-miner cron ships PRs to the origin fork (ryaneggz/openharness),
# labeled `prompt-miner`. The canonical cap gate (scripts/autopilot-caps.sh)
# defaults to mifunedev/openharness + the `autopilot` label, so on its own it
# would not count this cron's PRs. This thin wrapper re-scopes the same gate to
# the fork + the prompt-miner label by exporting AUTOPILOT_REPO/AUTOPILOT_LABEL,
# then execs the canonical script — inheriting its exact SKIPPED-CAP-* / PROCEED
# contract, fail-open behavior, harness.yaml cap defaults, and liveness logging.
#
# Run as the cron `preflight:` gate (scripts/cron-runtime.ts → runPreflight),
# BEFORE any worktree/tmux/agent is created. The FINAL stdout line is the STATUS
# token the runtime reads as the skip reason; all diagnostics go to stderr.
set -euo pipefail
trap 'echo "ERROR: prompt-miner-caps.sh failed at line $LINENO" >&2' ERR

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

export AUTOPILOT_REPO="${AUTOPILOT_REPO:-ryaneggz/openharness}"
export AUTOPILOT_LABEL="${AUTOPILOT_LABEL:-prompt-miner}"

exec "$SCRIPT_DIR/autopilot-caps.sh" "$@"
