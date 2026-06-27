# Critique — project-root-seam (RFC #531 Phase 1)

Two adversarial critics (implementer lens + maintainer lens) reviewed the plan against
the actual repo files. Verdicts: **SOUND-WITH-AMENDMENTS** / **SHIP-WITH-CHANGES**.
The design is correct; the amendments below are mandatory and are folded into
`prd.json` acceptance criteria + the executor briefings. `/approve` → **APPROVED**.

## Must-fix amendments (folded into prd.json)

### A. Test that WILL break — US-001
`.oh/scripts/__tests__/sandbox-healthcheck.test.ts:138` reads the raw
`.devcontainer/docker-compose.yml` text and asserts it `.toContain(
"/home/sandbox/harness/.oh/scripts/sandbox-healthcheck.sh")`. Once US-001 routes the
healthcheck path through `${OH_PROJECT_ROOT:-/home/sandbox/harness}`, that literal no
longer appears verbatim. **US-001 owner must update this assertion** to match the
seam'd form (e.g. assert it contains `sandbox-healthcheck.sh` and the
`${OH_PROJECT_ROOT:-/home/sandbox/harness}` token). The PRD's "no test fixture change"
claim is FALSE for this one file. (`cron-runtime.test.ts` fixtures stay green — they
assert runtime *values*, and the value is unchanged.)

### B. entrypoint.sh:194 unconditional override — US-003 (HIGH)
`entrypoint.sh:194` currently has an **unconditional** `HARNESS="/home/sandbox/harness"`
that runs AFTER any top-of-file seam and silently defeats it for every consumer below
(gh, git identity, pnpm, cron, gateway). US-003 must **remove/replace** that line, not
just add a seam at the top. Establish the seam (`OH_PROJECT_ROOT` then
`HARNESS="${HARNESS:-$OH_PROJECT_ROOT}"`) **before line 68** (`HARNESS_DIR` uses the
path for UID sync) and ensure no later unconditional reassignment survives.

### C. Single-quote expansion traps — US-002 & US-003 (HIGH)
Shell `'single quotes'` and single-quoted heredocs do NOT expand `${...}`:
- **entrypoint.sh:190** banner wiring is inside `bash -c '…'` → restructure quoting so
  `$OH_PROJECT_ROOT` expands at entrypoint runtime (double-quote or `printf`), baking
  the resolved path into `.bashrc` exactly as today.
- **entrypoint.sh:321-338** cron-watchdog uses a single-quoted heredoc; its inner
  `HARNESS="${HARNESS:-/home/sandbox/harness}"` (line ~324) must chain through the
  seam, AND the tmux launch (line ~346) must pass `OH_PROJECT_ROOT=$OH_PROJECT_ROOT`
  alongside `HARNESS=$HARNESS` so the generated `/tmp/cron-watchdog.sh` inherits it.
- **Dockerfile:200** (`echo '{"workspaceFolder":…}'`) and **Dockerfile:203** (`LABEL`
  single-quoted JSON) cannot expand the ARG. Treat these two as **documented static
  Phase-2 exceptions** (cosmetic VS Code attach metadata; value unchanged this PR),
  consistent with the host-side `devcontainer.json` Non-Goal. The probe must NOT flag
  documented exceptions.

### D. Other bare literals in entrypoint.sh — US-003
- `entrypoint.sh:124` `HERMES_SHARED_SKILLS_DIR="/home/sandbox/harness/.mifune/skills"`
  → `"$HARNESS/.mifune/skills"`.
- `entrypoint.sh:105` `HERMES_RUNTIME="${HERMES_HOME:-/home/sandbox/harness/.hermes}"`
  → chain through the seam (`${HERMES_HOME:-$HARNESS/.hermes}`).

### E. US-004 scope correction (MEDIUM)
**Drop** from US-004 — they carry NO hardcoded path literal (touching them is make-work
and dead-code risk):
- `cron-runtime.ts` — uses relative `process.env.CRONS_DIR || "crons"`.
- `seed-msg-bridge.sh` — takes its path as `$1`.
- `docker-compose.sh` — derives `REPO_DIR` from script self-location.

**Add** to US-004:
- `.oh/scripts/sandbox-boot-smoke.sh:14` — bare literal, currently unowned.
- `.oh/install/banner.sh:151` — `${HERMES_HOME:-/home/sandbox/harness/.hermes}` chain
  through the seam (or document-exclude if a probe protects banner.sh — owner checks).

Confirmed US-004 keepers (half-seam `${HARNESS:-/home/sandbox/harness}` → chain):
`sandbox-healthcheck.sh:10`, `gateway.sh`, `maintenance/restart-openharness-tmux.sh`,
`client-slack-supervise.sh`.

### F. Dockerfile safe routes — US-002
Dockerfile is **single-stage** (`FROM debian:bookworm-slim`, no 2nd FROM) — one
top-level `ARG OH_PROJECT_ROOT=/home/sandbox/harness` + `ENV OH_PROJECT_ROOT` reaches
all instructions. Route the EXPANDABLE literals: `WORKDIR ${OH_PROJECT_ROOT}` (~215),
`git config --global --add safe.directory ${OH_PROJECT_ROOT}` (~194), the `workspace/`
`COPY` target → `${OH_PROJECT_ROOT}/workspace/` (~209), and the banner-source / default
`cd` rc-append RUN lines (use double quotes so the var expands). Leave the two
single-quoted JSON emitters (200, 203) as documented exceptions (item C).

### G. Probe design — US-005
Mirror existing probes (positive assertions; see `evals/probes/*.sh`). The probe must:
- Assert `OH_PROJECT_ROOT` is defined as the seam in `docker-compose.yml`, `Dockerfile`,
  and `entrypoint.sh`.
- Assert `HARNESS` is defined as `${HARNESS:-$OH_PROJECT_ROOT}` (NOT a bare literal).
- For any negative "no fresh bare literal" check, exclude comment lines (`grep -v '^[[:space:]]*#'`)
  and the documented Dockerfile JSON exceptions, to avoid false positives.
- Be a clean 3-state oracle (PASS / REGRESSION / SKIPPED) — SKIPPED if files absent.

## Non-blocking notes (recorded, not gating)
- Dual-naming (`OH_PROJECT_ROOT` + `HARNESS`) is **intentional**: `OH_PROJECT_ROOT` is
  the forward-compatible name for the equipped repo's root; `HARNESS` is kept as a
  deprecated alias to avoid churning ~8 scripts. Add a `# DEPRECATED alias — prefer
  $OH_PROJECT_ROOT` comment at the alias definition.
- `.example.env` is the correct place for a commented override reference (compose
  interpolates from the env file); the conceptual note lives in `.oh/README.md`.
- CHANGELOG + RESULTS.md isolated to US-005 — correct, avoids concurrent-merge conflict.

## Verdict
**APPROVED** — build with amendments A–G folded in. No GitHub-side state existed before
this gate (critic-before-commitment satisfied).
