#!/usr/bin/env bash
# .mifune/skills/prompt-miner/prompt-miner-caps.sh — origin-scoped PR-cap
# preflight for the prompt-miner cron (skill-private: owned by the /prompt-miner
# skill).
#
# The prompt-miner cron ships PRs to the origin fork (your private fork),
# labeled `prompt-miner`. The canonical cap gate
# (.mifune/skills/autopilot/autopilot-caps.sh) defaults to mifunedev/openharness
# + the `autopilot` label, so on its own it would not count this cron's PRs. This
# thin wrapper re-scopes the same gate to the fork + the prompt-miner label by
# exporting AUTOPILOT_REPO/AUTOPILOT_LABEL, then execs the canonical script —
# inheriting its exact SKIPPED-CAP-* / PROCEED contract, fail-open behavior,
# harness.yaml cap defaults, and liveness logging.
#
# Run as the cron `preflight:` gate (.oh/scripts/cron-runtime.ts → runPreflight),
# BEFORE any worktree/tmux/agent is created. The FINAL stdout line is the STATUS
# token the runtime reads as the skip reason; all diagnostics go to stderr.
set -euo pipefail
trap 'echo "ERROR: prompt-miner-caps.sh failed at line $LINENO" >&2' ERR

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# The canonical gate is the sibling skill's script under .mifune/skills/autopilot/
# (both live one level below .mifune/skills/), so resolve it relative to here.
SKILLS_DIR="$(dirname "$SCRIPT_DIR")"

export AUTOPILOT_REPO="${AUTOPILOT_REPO:-mifunedev/openharness}"
export AUTOPILOT_LABEL="${AUTOPILOT_LABEL:-prompt-miner}"

exec "$SKILLS_DIR/autopilot/autopilot-caps.sh" "$@"
