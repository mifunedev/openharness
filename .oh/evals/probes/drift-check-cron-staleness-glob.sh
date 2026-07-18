#!/usr/bin/env bash
# tier: A
# source: issue #98; issue #225 (restart-required cron frontmatter/config drift)
# desc: extract the LIVE Step C-2 bash block from /audit drift and RUN it
#       against fixtures (README-style, valid scheduled cron, disabled cron,
#       missing schedule, empty schedules, invalid schedule, invalid id,
#       id mismatch, unsafe agent) with RUNTIME_START before their mtimes; PASS
#       only if the inert set includes the valid cron and excludes invalid
#       runtime-config fixtures.
#       This is a behavioral extract-and-run probe (not a text-presence grep): a
#       revert of Step C-2 to the raw `for f in .oh/crons/*.md` glob flags all
#       fixtures and flips the probe to REGRESSION.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="${DRIFT_CHECK_SKILL:-$ROOT/.oh/skills/audit/references/drift.md}"

# --- SKIPPED: hard prerequisites genuinely absent --------------------------
if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: audit drift reference absent: $SKILL" >&2
  exit 2
fi
if ! command -v stat >/dev/null 2>&1; then
  echo "SKIPPED: stat unavailable — cannot exercise the mtime comparison" >&2
  exit 2
fi

# --- Extract the live Step C-2 bash block ----------------------------------
# Anchor on the heading line `**Step C-2 — compare cron file mtimes:**` (matched
# without relying on the em-dash byte sequence), then capture the lines of the
# first following ```bash fence up to its closing ```.
BLOCK="$(awk '
  /^\*\*Step C-2 /   { hit=1; next }
  hit && /^```bash$/ { cap=1; next }
  cap && /^```$/     { exit }
  cap                { print }
' "$SKILL")"

{
  echo "---- extracted Step C-2 block (from $SKILL) ----"
  printf '%s\n' "$BLOCK"
  echo "---- end extracted block ----"
} >&2

# --- REGRESSION: mis-extraction can never yield a false PASS ----------------
if [[ -z "${BLOCK//[[:space:]]/}" ]]; then
  echo "REGRESSION: Step C-2 bash block extraction was empty — heading/fence anchor broken in $SKILL" >&2
  exit 1
fi
if ! printf '%s' "$BLOCK" | grep -qF '.oh/crons/*.md'; then
  echo "REGRESSION: extracted Step C-2 block does not iterate .oh/crons/*.md — wrong block captured" >&2
  exit 1
fi
for required in schedule enabled agent tmux worktree preflight RESTART_REQUIRED_FRONTMATTER_FIELDS "frontmatter/config may be stale" "SIGHUP reschedule or runtime restart"; do
  if ! printf '%s' "$BLOCK" | grep -qF "$required"; then
    echo "REGRESSION: Step C-2 block is missing restart-required frontmatter contract text: $required" >&2
    exit 1
  fi
done

# --- SKIPPED: the behavioral predicate needs node + croner -------------------
# The extracted Step C-2 block's is_valid_cron_schedule() shells out to `node`
# and resolves the `croner` package from DRIFT_CHECK_ROOT/package.json (here
# $ROOT). A cold CI runner (the eval-probes job: checkout + bash, no
# `pnpm install`) has no node_modules/croner, so the predicate cannot run and the
# valid-cron fixture would be mis-excluded — a false REGRESSION. SKIP when node or
# croner is unavailable (the extraction-integrity checks above still gate in CI;
# the full behavioral predicate is exercised by manual /eval and the weekly cron
# where deps are installed). Mirrors the block's own croner resolution exactly.
if ! command -v node >/dev/null 2>&1; then
  echo "SKIPPED: node unavailable — Step C-2 schedule validation needs node + croner" >&2
  exit 2
fi
if ! DRIFT_CHECK_ROOT="$ROOT" node --input-type=module -e '
  import { createRequire } from "node:module";
  const root = (process.env.DRIFT_CHECK_ROOT || process.cwd()).replace(/\/$/, "");
  createRequire(`${root}/package.json`).resolve("croner");
' >/dev/null 2>&1; then
  echo "SKIPPED: croner not resolvable from $ROOT (no node_modules) — Step C-2 needs deps installed; skipping in this environment" >&2
  exit 2
fi

# --- Fixtures: trap-based cleanup registered BEFORE any fixture exists ------
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/.oh/crons"

# (a) README-style: first line is an H1, NO line-1 '---'. The '---' lines live
#     inside a fenced code block — the .oh/crons/README.md trap. Must be EXCLUDED.
cat > "$WORK/.oh/crons/aaa-readme.md" <<'EOF_A'
# Crons Directory

Not a cron — a directory README. The frontmatter below is an EXAMPLE inside a
fenced code block and must not qualify this file as schedulable.

```yaml
---
schedule: "0 * * * *"
enabled: true
---
```
EOF_A

# (b) Valid scheduled cron: line-1 '---', anchored schedule:, enabled: true,
#     closing '---'. Must be INCLUDED (flagged inert).
cat > "$WORK/.oh/crons/bbb-valid.md" <<'EOF_B'
---
id: bbb-valid
schedule: "0 * * * *"
timezone: UTC
enabled: true
agent: pi
tmux: true
worktree: true
preflight: scripts/autopilot-caps.sh
---

# Valid scheduled cron

Body.
EOF_B

# (c) Disabled cron: schedule: present but enabled: false → loadCrons drops it.
#     Must be EXCLUDED.
cat > "$WORK/.oh/crons/ccc-disabled.md" <<'EOF_C'
---
id: ccc-disabled
schedule: "0 * * * *"
enabled: false
---

# Disabled cron

Body.
EOF_C

# (d) Missing schedule: parseCronFile returns null because fm.schedule is absent.
#     Must be EXCLUDED.
cat > "$WORK/.oh/crons/ddd-missing-schedule.md" <<'EOF_D'
---
id: ddd-missing-schedule
enabled: true
---

# Missing schedule cron

Body.
EOF_D

# (e) Empty bare schedule: parseCronFile returns null because fm.schedule is empty.
#     Must be EXCLUDED.
cat > "$WORK/.oh/crons/eee-empty-schedule-bare.md" <<'EOF_E'
---
id: eee-empty-schedule-bare
schedule:
enabled: true
---

# Empty bare schedule cron

Body.
EOF_E

# (f) Empty double-quoted schedule: parseCronFile strips quotes to empty.
#     Must be EXCLUDED.
cat > "$WORK/.oh/crons/fff-empty-schedule-double-quoted.md" <<'EOF_F'
---
id: fff-empty-schedule-double-quoted
schedule: ""
enabled: true
---

# Empty double-quoted schedule cron

Body.
EOF_F

# (g) Empty single-quoted schedule: parseCronFile strips quotes to empty.
#     Must be EXCLUDED.
cat > "$WORK/.oh/crons/ggg-empty-schedule-single-quoted.md" <<'EOF_G'
---
id: ggg-empty-schedule-single-quoted
schedule: ''
enabled: true
---

# Empty single-quoted schedule cron

Body.
EOF_G

# (h) Invalid cron: frontmatter and schedule key exist, but Croner rejects it.
#     loadCrons logs SCHED_INVALID and drops it, so it must be EXCLUDED.
cat > "$WORK/.oh/crons/hhh-invalid-schedule-not-a-cron.md" <<'EOF_H'
---
id: hhh-invalid-schedule-not-a-cron
schedule: "not-a-cron"
enabled: true
---

# Invalid cron

Body.
EOF_H

printf '%s' "$BLOCK" > "$WORK/block.sh"

# --- Run the extracted predicate against the fixtures ----------------------
# RUNTIME_START=1 (epoch 1s) sits before every freshly-written fixture mtime, so
# under the OLD raw-glob logic ALL fixtures would be flagged inert; only the
# corrected predicate excludes the non-cron (a), disabled cron (c), missing
# schedule (d), empty schedules (e-g), and invalid schedule (h).
# (i) Invalid id: loadCrons logs ID_INVALID and drops it. Must be EXCLUDED.
cat > "$WORK/.oh/crons/iii-invalid-id.md" <<'EOF_I'
---
id: bad_id
schedule: "0 * * * *"
enabled: true
---

# Invalid id cron

Body.
EOF_I

# (j) ID mismatch: loadCrons logs ID_MISMATCH and drops it. Must be EXCLUDED.
cat > "$WORK/.oh/crons/jjj-id-mismatch.md" <<'EOF_J'
---
id: not-jjj-id-mismatch
schedule: "0 * * * *"
enabled: true
---

# ID mismatch cron

Body.
EOF_J

# (k) Unsafe agent override: loadCrons logs AGENT_INVALID and drops it. Must be EXCLUDED.
cat > "$WORK/.oh/crons/kkk-unsafe-agent.md" <<'EOF_K'
---
id: kkk-unsafe-agent
schedule: "0 * * * *"
agent: pi && bad
enabled: true
---

# Unsafe agent cron

Body.
EOF_K

# The block prints one `DRIFT-CHECK (C): .oh/crons/<file> ...` line per inert file —
# we read that observable contract rather than the internal INERT array name.
output="$(cd "$WORK" && DRIFT_CHECK_ROOT="$ROOT" RUNTIME_START=1 bash block.sh 2>/dev/null)" || true

inert_contains() { printf '%s\n' "$output" | grep -q "$1"; }

fail=0
if inert_contains "aaa-readme.md"; then
  echo "REGRESSION: README-style fixture (no line-1 ---) was flagged inert — predicate over-includes a non-cron" >&2
  fail=1
fi
if ! inert_contains "bbb-valid.md"; then
  echo "REGRESSION: valid scheduled cron was NOT flagged inert — predicate over-excludes a real cron" >&2
  fail=1
fi
if inert_contains "ccc-disabled.md"; then
  echo "REGRESSION: disabled cron (enabled: false) was flagged inert — predicate ignores the enabled toggle" >&2
  fail=1
fi
if inert_contains "ddd-missing-schedule.md"; then
  echo "REGRESSION: missing schedule was flagged inert — predicate diverges from parseCronFile/loadCrons skip" >&2
  fail=1
fi
if inert_contains "eee-empty-schedule-bare.md"; then
  echo "REGRESSION: empty bare schedule was flagged inert — predicate diverges from parseCronFile/loadCrons skip" >&2
  fail=1
fi
if inert_contains "fff-empty-schedule-double-quoted.md"; then
  echo "REGRESSION: empty double-quoted schedule was flagged inert — predicate diverges from parseCronFile/loadCrons skip" >&2
  fail=1
fi
if inert_contains "ggg-empty-schedule-single-quoted.md"; then
  echo "REGRESSION: empty single-quoted schedule was flagged inert — predicate diverges from parseCronFile/loadCrons skip" >&2
  fail=1
fi
if inert_contains "hhh-invalid-schedule-not-a-cron.md"; then
  echo "REGRESSION: invalid schedule was flagged inert — predicate diverges from runtime SCHED_INVALID skip" >&2
  fail=1
fi
if inert_contains "iii-invalid-id.md"; then
  echo "REGRESSION: invalid id was flagged inert — predicate diverges from runtime ID_INVALID skip" >&2
  fail=1
fi
if inert_contains "jjj-id-mismatch.md"; then
  echo "REGRESSION: id mismatch was flagged inert — predicate diverges from runtime ID_MISMATCH skip" >&2
  fail=1
fi
if inert_contains "kkk-unsafe-agent.md"; then
  echo "REGRESSION: unsafe agent override was flagged inert — predicate diverges from runtime AGENT_INVALID skip" >&2
  fail=1
fi
if ! printf '%s\n' "$output" | grep -qF 'frontmatter/config may be stale until SIGHUP reschedule or runtime restart'; then
  echo "REGRESSION: inert cron diagnostic does not name restart-required frontmatter/config and the reschedule/restart recovery" >&2
  fail=1
fi
for required in 'schedule=0 * * * *' 'enabled=true' 'agent=pi' 'tmux=true' 'worktree=true' 'preflight=scripts/autopilot-caps.sh'; do
  if ! printf '%s\n' "$output" | grep -qF "$required"; then
    echo "REGRESSION: inert cron diagnostic is missing current frontmatter field value: $required" >&2
    fail=1
  fi
done

if (( fail )); then
  {
    echo "  --- inert output from extracted block was: ---"
    printf '%s\n' "$output"
    echo "  --- end inert output ---"
  } >&2
  echo "REGRESSION: audit drift Step C-2 predicate does not match the schedulable-cron contract" >&2
  exit 1
fi

echo "PASS: audit drift Step C-2 includes the valid scheduled cron, reports restart-required frontmatter, and excludes README-style, disabled, missing, empty, invalid schedule/id/mismatch/agent fixtures" >&2
exit 0
