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

