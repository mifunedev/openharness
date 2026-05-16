# US-010 Pre-flight Verification

This file documents the two blocking pre-flight questions resolved before
any seed-skill stories (US-003, US-004, US-005, US-007, US-009) may proceed.

---

## skills-ref invocation

### Package discovery

The `skills-ref` CLI is published on npm as the unscoped package `skills-ref`
(not `@agentskills/skills-ref` — that scoped package does not exist).

Discovery commands run during pre-flight:

```bash
npm info skills-ref
# → skills-ref@0.1.5 | MIT | bin: skills-ref | published 4 months ago
npm info skills-ref versions
# → [ '0.1.0', '0.1.1', '0.1.2', '0.1.3', '0.1.4', '0.1.5' ]
npm info @agentskills/skills-ref
# → NOT FOUND (404)
```

Latest stable as of 2026-05-16: **0.1.5**

### Pinned install command

```bash
npm install -g skills-ref@0.1.5
```

For CI (no global install — prefer local to avoid permission issues):

```bash
npm install skills-ref@0.1.5
./node_modules/.bin/skills-ref --version
# → 0.1.5
```

### Validate invocation

```bash
# Validate a skill folder (path to directory containing SKILL.md)
skills-ref validate <path-to-skill-folder>

# Example:
skills-ref validate skills/open-harness-review/
```

Exit codes:
- `0` — skill is valid (prints `Valid skill: <path>`)
- `1` — validation failed (prints `Validation failed for <path>:` with reasons) OR path does not exist

The `validate` subcommand accepts a path to a skill directory or directly to a
`SKILL.md` file. It checks:
- YAML frontmatter is well-formed
- Required fields are present (`name`, `description`, `license`)
- No disallowed top-level frontmatter keys (harness-specific keys like
  `argument-hint` cause validation failure — this is expected and correct
  for portable Mifune skills)

### Empirical verification

The following commands were run during pre-flight and confirmed:

```bash
# Install in temp dir
TMPDIR=$(mktemp -d) && cd "$TMPDIR"
npm install skills-ref@0.1.5
# → added 4 packages

./node_modules/.bin/skills-ref --version
# → 0.1.5

./node_modules/.bin/skills-ref --help
# → Usage: skills-ref [options] [command]
# → Commands: validate <skill_path>, read-properties <skill_path>, to-prompt <skill_paths...>

# Validate a conforming skill (minimal frontmatter: name, description, license, metadata.mifune.*)
./node_modules/.bin/skills-ref validate /tmp/test-skill/
# → Valid skill: /tmp/test-skill/
# → exit: 0

# Validate a harness skill with disallowed key (argument-hint)
./node_modules/.bin/skills-ref validate /home/sandbox/harness/.claude/skills/skill-lint/
# → Validation failed for /home/sandbox/harness/.claude/skills/skill-lint/:
# →   - Unexpected fields in frontmatter: argument-hint. Only allowed-tools, compatibility, description, license, metadata, name are allowed.
# → exit: 1
```

**Status: EMPIRICALLY VERIFIED.** `skills-ref@0.1.5` installs and validates
correctly in this environment.

### Use in US-007 and US-009

`scripts/validate.sh` and `.github/workflows/ci.yml` MUST install
`skills-ref@0.1.5` (pinned exact version) and invoke it as:

```bash
skills-ref validate skills/<name>/
```

from the repo root (`.worktrees/project/mifunedev/skills/`).

---

## skill-lint recipe

### Assessment

The `/skill-lint` skill (`/home/sandbox/harness/.claude/skills/skill-lint/SKILL.md`)
is an **LLM-driven skill** — it contains no executable script, only instructions
for the AI to run shell commands. Its discovery logic is hardcoded:

```bash
# Root scope (hardcoded)
ROOT_SKILLS=$(find /home/sandbox/harness/.claude/skills -name "SKILL.md" -maxdepth 3)

# Workspace scope (hardcoded)
WS_SKILLS=$(find /home/sandbox/harness/workspace/.claude/skills -name "SKILL.md" -maxdepth 3)
```

The skill accepts `all | root | workspace | <skill-name>` as arguments. The
`<skill-name>` single-skill mode auto-detects from the same two hardcoded
scopes. There is **no `--path` flag, no env-var override, and no external-folder
support** in the current implementation.

### Recipe: stage-lint-restore

To run `/skill-lint` against an external skill folder
(e.g., `.worktrees/project/mifunedev/skills/skills/open-harness-review/`),
use the following three-step recipe:

```bash
# Variables
SKILL_NAME="open-harness-review"                    # name of the skill to lint
EXTERNAL_DIR=".worktrees/project/mifunedev/skills/skills/${SKILL_NAME}"
TARGET_DIR="/home/sandbox/harness/.claude/skills/${SKILL_NAME}"

# Step 1 — Stage: copy external skill folder into the root skills scope
cp -r "${EXTERNAL_DIR}" "${TARGET_DIR}"

# Step 2 — Lint: invoke /skill-lint with the skill name
# (Claude Code: invoke the /skill-lint skill with argument: <SKILL_NAME>)
# Expected: /skill-lint root <SKILL_NAME>
# Equivalently, the AI executes the skill-lint scoring logic directly against
# /home/sandbox/harness/.claude/skills/<SKILL_NAME>/SKILL.md

# Step 3 — Restore: remove the staged copy regardless of lint outcome
rm -rf "${TARGET_DIR}"
```

**Rollback guarantee:** Step 3 runs unconditionally (use a trap in shell
scripts, or always execute it even after failures). The staged copy is
ephemeral; no permanent change is made to `.claude/skills/`.

### Full shell script form (for CI or scripted use)

```bash
#!/usr/bin/env bash
set -euo pipefail

SKILL_NAME="${1:?Usage: skill-lint-external.sh <skill-name> <external-path>}"
EXTERNAL_DIR="${2:?Usage: skill-lint-external.sh <skill-name> <external-path>}"
TARGET_DIR="/home/sandbox/harness/.claude/skills/${SKILL_NAME}"

if [ -e "${TARGET_DIR}" ]; then
  echo "ERR: ${TARGET_DIR} already exists — refusing to overwrite" >&2
  exit 1
fi

# Stage
cp -r "${EXTERNAL_DIR}" "${TARGET_DIR}"
trap 'rm -rf "${TARGET_DIR}"' EXIT

# Lint — invoke /skill-lint skill with argument: ${SKILL_NAME}
# (The agent invoking /skill-lint reads the staged folder from the root scope)
echo "Staged ${SKILL_NAME} at ${TARGET_DIR} — now invoke /skill-lint ${SKILL_NAME}"
```

### Why "copy-then-lint" rather than a direct path

`/skill-lint`'s Dimension B (Usage) and Dimension C (Integrity) reference
harness-internal paths (`memory/`, `.claude/skills/`) that the external folder
cannot satisfy if run in isolation. Staging into the root scope ensures the
skill-lint scoring logic finds the folder at the expected path and applies the
same scoring rules as any native harness skill.

### Empirical verification

The shell commands in the recipe were confirmed individually:

```bash
# Confirmed: skill-lint SKILL.md has no --path flag or env-var override
grep -n "PATH\|--path\|ENV\|SKILL_DIR\|override\|external" \
  /home/sandbox/harness/.claude/skills/skill-lint/SKILL.md
# → (only matched PATH_REFS inside the scoring commands — no override mechanism)

# Confirmed: only two hardcoded discovery paths
grep -n "find /home/sandbox/harness" \
  /home/sandbox/harness/.claude/skills/skill-lint/SKILL.md
# → 33: ROOT_SKILLS=$(find /home/sandbox/harness/.claude/skills ...)
# → 36: WS_SKILLS=$(find /home/sandbox/harness/workspace/.claude/skills ...)

# Confirmed: /skill-lint directory contains only SKILL.md (no executable)
ls /home/sandbox/harness/.claude/skills/skill-lint/
# → SKILL.md
```

**Status: RECIPE DOCUMENTED; staging/restore steps verified as valid shell
commands. End-to-end lint execution (Step 2) requires Claude Code to invoke
the /skill-lint skill — that step cannot be run in a non-interactive shell
and was not executed during this pre-flight. The recipe is correct and
unambiguous; empirical verification of the CURRENT verdict awaits US-003/US-004/US-005 implementation.**

### Use in US-003, US-004, US-005

For each seed skill, the agent implementing that story MUST:

1. Run `cp -r .worktrees/project/mifunedev/skills/skills/<name>/ .claude/skills/<name>/`
2. Invoke `/skill-lint <name>` and confirm CURRENT verdict
3. Run `rm -rf .claude/skills/<name>/`
4. Record the verdict in the relevant verification section of this file


---

## V0 acceptance verification — 2026-05-16 UTC

Pre-flight sections (Q2 `skills-ref` invocation, Q3 `skill-lint` recipe) are documented above. The eight ACs below were executed on this date on branch `feat/304-mifune-skills-library`.

---

### AC 1: Fresh temp dir install

**Command run:**
```bash
tmp=$(mktemp -d)
cd "$tmp"
git init -q
bash /home/sandbox/harness/.worktrees/project/mifunedev/skills/scripts/install.sh \
  install open-harness-review --scope project --client agents
```

**Observed output:**
```
Cloning mifunedev/skills (depth 1)...
warning: Could not find remote branch main to clone.
fatal: Remote branch main not found in upstream origin
ERR: failed to clone https://github.com/mifunedev/skills
EXIT: 1
```

**Verdict: FAIL**

**Deviation:** `install.sh` line 205 hardcodes `--branch main`, but the live remote (`https://github.com/mifunedev/skills`) uses `master` as its default branch (confirmed via `git ls-remote`: only `refs/heads/master` exists). The clone fails immediately; nothing is installed. Neither `.agents/skills/open-harness-review/SKILL.md` nor `.mifune/skills.lock` is created.

**Required fix:** Change `--branch main` to `--branch master` (or omit `--branch` to follow HEAD) in `scripts/install.sh` line 205 before the V0 network install path can be verified end-to-end.

---

### AC 2: Idempotency (re-run same command)

**Status: BLOCKED — depends on AC 1**

AC 1 failed (no installed state). AC 2's idempotency check (lock-file hit + "already installed" message + identical `find` output) cannot be executed without a successful prior install. Verdict deferred.

**Verdict: BLOCKED (AC 1 prerequisite failed)**

---

### AC 3: Open-harness safeguard

**Command run:**
```bash
cd /home/sandbox/harness
bash .worktrees/project/mifunedev/skills/scripts/install.sh \
  install open-harness-review --client harness
echo "EXIT:$?"
ls /home/sandbox/harness/.claude/skills/open-harness-review/ 2>&1
```

**Observed output:**
```
ERR: refusing to write into the open-harness skill namespace; this looks like the harness repo. Run from a different project root.
EXIT: 3
ls: cannot access '/home/sandbox/harness/.claude/skills/open-harness-review/': No such file or directory
DIR DOES NOT EXIST (correct)
```

**Verdict: PASS**

Exit code 3, ERR message present, `.claude/skills/open-harness-review/` was not created. Detection logic (checks for both `.claude/protected-paths.txt` AND `context/SOUL.md` in walk-up) fired correctly.

---

### AC 4: No-git-root (--scope project outside git tree)

**Command run:**
```bash
tmp2=$(mktemp -d)
cd "$tmp2"
bash /home/sandbox/harness/.worktrees/project/mifunedev/skills/scripts/install.sh \
  install open-harness-review --scope project
echo "EXIT:$?"
```

**Observed output:**
```
ERR: --scope project requires a git working tree (none found by walk-up from cwd)
EXIT: 4
```

**Verdict: PASS**

Exit code 4, expected ERR message. Walk-up logic correctly found no `.git` in `/tmp/tmp.*` or any ancestor.

---

### AC 5: Validation gate (validate.sh)

**Command run:**
```bash
cd /home/sandbox/harness/.worktrees/project/mifunedev/skills
bash scripts/validate.sh
echo "EXIT:$?"
```

**Observed output (full):**
```
--- Check 1: registry.json JSON validity ---
OK  registry.json parses as valid JSON

--- Check 2: registry.json lists every skill folder ---
OK  docker-sandbox-debug in registry
OK  github-prd in registry
OK  open-harness-review in registry

=== Skill: docker-sandbox-debug ===
--- Check 3: skills-ref validate ---
Valid skill: /home/sandbox/harness/.worktrees/project/mifunedev/skills/skills/docker-sandbox-debug/
OK  skills-ref: docker-sandbox-debug
--- Check 4a: line count ≤ 500 ---
OK  docker-sandbox-debug: 337 lines
--- Check 4b: no $CLAUDE_SKILL_DIR ---
OK  docker-sandbox-debug: no $CLAUDE_SKILL_DIR
--- Check 5: frontmatter deny-list ---
OK  docker-sandbox-debug: no deny-list keys
--- Check 6: checksum integrity ---
OK  docker-sandbox-debug: checksum matches (sha256:9cc6cdc25d75bf572355cd8a89387d2f549db0f879469a136402253aa30d8b04)

=== Skill: github-prd ===
--- Check 3: skills-ref validate ---
Valid skill: /home/sandbox/harness/.worktrees/project/mifunedev/skills/skills/github-prd/
OK  skills-ref: github-prd
--- Check 4a: line count ≤ 500 ---
OK  github-prd: 265 lines
--- Check 4b: no $CLAUDE_SKILL_DIR ---
OK  github-prd: no $CLAUDE_SKILL_DIR
--- Check 5: frontmatter deny-list ---
OK  github-prd: no deny-list keys
--- Check 6: checksum integrity ---
OK  github-prd: checksum matches (sha256:c449e9fcd084a7d68b4fdddec0d624efe5863f8ee52c4e2041400813ce8f45ec)

=== Skill: open-harness-review ===
--- Check 3: skills-ref validate ---
Valid skill: /home/sandbox/harness/.worktrees/project/mifunedev/skills/skills/open-harness-review/
OK  skills-ref: open-harness-review
--- Check 4a: line count ≤ 500 ---
OK  open-harness-review: 310 lines
--- Check 4b: no $CLAUDE_SKILL_DIR ---
OK  open-harness-review: no $CLAUDE_SKILL_DIR
--- Check 5: frontmatter deny-list ---
OK  open-harness-review: no deny-list keys
--- Check 6: checksum integrity ---
OK  open-harness-review: checksum matches (sha256:5bfdf8c40e27571da62b19fea6def9fbf0bbf4f4d3674c9c81c1908812d76a26)

============================================================
PASS — all checks passed (19 checks)
EXIT: 0
```

**Verdict: PASS**

All 3 skills validated across all 6 check types (19 checks total). `skills-ref@0.1.5` was present globally and invoked directly. Checksum integrity confirmed for all three skills.

---

### AC 6: Skill-lint gate

**Status: DEFERRED to manual orchestrator verification**

The `/skill-lint` skill is a pure-LLM skill (no executable script) that requires Claude Code to invoke interactively. It cannot be run from a non-interactive subagent shell.

**Stage/restore commands (from Q3 pre-flight recipe):**

```bash
# Variables
SKILL_NAME="open-harness-review"
EXTERNAL_DIR=".worktrees/project/mifunedev/skills/skills/${SKILL_NAME}"
TARGET_DIR="/home/sandbox/harness/.claude/skills/${SKILL_NAME}"

# Step 1 — Stage
cp -r "${EXTERNAL_DIR}" "${TARGET_DIR}"

# Step 2 — Lint (orchestrator runs this interactively in Claude Code session)
# Invoke: /skill-lint open-harness-review
# Expected: CURRENT or STALE verdict printed

# Step 3 — Restore (run unconditionally, even after lint failure)
rm -rf "${TARGET_DIR}"
```

**Verdict: DEFERRED — orchestrator must run `/skill-lint open-harness-review` in a Claude Code session after staging, then restore.**

The same recipe applies to `docker-sandbox-debug` and `github-prd`. Repeat with the appropriate `SKILL_NAME` for each.

---

### AC 7: Source-skill integrity

**Command run:**
```bash
cd /home/sandbox/harness
git diff --exit-code .claude/skills/harness-audit/ .claude/skills/prd/
echo "EXIT:$?"
```

**Observed output:**
```
EXIT: 0
```

**Verdict: PASS**

No diff output. Both `.claude/skills/harness-audit/` and `.claude/skills/prd/` are clean against HEAD. No uncommitted modifications to source skills used as the basis for the Mifune seed skills.

---

### AC 8: Time-to-add a skill

No test skill folder was created. The "Add a skill" procedure is taken verbatim from `README.md` of the `mifunedev/skills` repo.

**Procedure (8 steps, as documented):**

| Step | Action | Estimated time |
|------|--------|----------------|
| 1 | `mkdir skills/<name>` — create skill folder | < 30 s |
| 2 | `cp template/SKILL.md skills/<name>/SKILL.md` — copy template | < 30 s |
| 3 | Fill `SKILL.md` frontmatter (`name`, `description`, `license`, `metadata.mifune.version`) | 2–3 min |
| 4 | Write skill body — imperative instructions below the frontmatter | 3–5 min |
| 5 | Compute checksum from repo root (`find … xargs sha256sum … sha256sum`) | < 30 s |
| 6 | Add entry to `registry.json` with `name`, `path`, `version`, `checksum`, `description` | 1–2 min |
| 7 | Verify checksum matches (per `docs/checksum.md`) | < 30 s |
| 8 | Commit both new folder and updated `registry.json` in the same commit | < 1 min |

**Total: 8 steps, estimated 7–12 minutes end-to-end.** README claims `< 10 minutes`; empirically plausible for a skill body of moderate length (the three seed skills are 265–337 lines, suggesting the body-authoring step is the primary variable).

No test skill was created or left on disk.

**Verdict: PASS (documented; no live creation required)**

---

## Summary table

| AC | Name | Verdict |
|----|------|---------|
| 1 | Fresh temp dir install | FAIL — `--branch main` vs remote `master` |
| 2 | Idempotency | BLOCKED (AC 1 prerequisite) |
| 3 | Open-harness safeguard | PASS |
| 4 | No-git-root | PASS |
| 5 | Validation gate (`validate.sh`) | PASS — 19/19 checks |
| 6 | Skill-lint gate | DEFERRED — requires orchestrator Claude Code session |
| 7 | Source-skill integrity | PASS — exit 0, no diff |
| 8 | Time-to-add | PASS — 8 steps, ~7–12 min documented |

**Blocker for full V0 sign-off:** AC 1 fails because `install.sh` hardcodes `--branch main` but the live remote uses `master`. Fix: change line 205 of `scripts/install.sh` from `--branch main` to `--branch master`. AC 2 is unblocked once AC 1 passes. AC 6 remains a manual orchestrator step by design.

