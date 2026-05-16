---
name: open-harness-review
description: |
  Spawn 4 parallel sub-agents (PM, Implementer, Critic, Explorer) to audit
  an Open Harness instance and produce a tier-ranked improvement report.
  Synthesizes findings and outputs the recommended next 3 actions.
  Invoke when asked to audit an Open Harness repo, review harness health,
  find improvements, triage "what should we fix", or run a periodic system
  check on an OH-based project.
license: Apache-2.0
metadata:
  mifune:
    version: "0.1.0"
    category: open-harness
    requires-tools: ["gh", "git"]
    claude-code:
      argument-hint: "[--focus <area>] [--dry-run]"
---

<!-- Adapted from ryaneggz/open-harness:.claude/skills/harness-audit/SKILL.md -->

# Open Harness Review

Run 4 parallel audit perspectives (PM, Implementer, Critic, Explorer) against an Open Harness project, synthesize tier-ranked findings, and emit a single improvement report with the recommended next 3 actions.

**Core principle: evidence over opinion.** Every finding must cite a specific file, observed behavior, or gap — no speculative items.

## Configuration

Before running, identify the harness root. Default: the current repository root.

```
HARNESS_ROOT = <path to Open Harness project root>
```

Set this to the absolute path of the target harness when invoking. All path references below expand relative to `HARNESS_ROOT`.

## Decision Flow

```
Resolve args → Gather context snapshot → Spawn 4 auditors (parallel)
    ↓                                           ↓
 --dry-run?                     PM · Implementer · Critic · Explorer
  → print + stop                               ↓
                                   Synthesize: deduplicate + tier-rank
                                               ↓
                                        Emit report
                                               ↓
                                       Memory Protocol
```

## Instructions

### 1. Resolve arguments

- `--focus <area>` — restrict each auditor to that area (pass as a constraint)
- `--dry-run` — print the context snapshot and auditor prompts, then stop
- Otherwise proceed with a full 4-agent audit

### 2. Gather context snapshot

Read the following before spawning agents. Pass the assembled snapshot to every auditor.

```bash
# Structure
ls $HARNESS_ROOT/.claude/skills/
ls $HARNESS_ROOT/.claude/agents/ 2>/dev/null || echo "no agents dir"
ls $HARNESS_ROOT/workspace/heartbeats/ 2>/dev/null || echo "no heartbeats"
ls $HARNESS_ROOT/memory/ 2>/dev/null | tail -10
ls $HARNESS_ROOT/docs/wiki/ 2>/dev/null | head -20

# Package health
cat $HARNESS_ROOT/package.json 2>/dev/null | head -30

# CI workflows
ls $HARNESS_ROOT/.github/workflows/ 2>/dev/null

# Worktrees
git -C $HARNESS_ROOT worktree list 2>/dev/null

# Recent memory
tail -40 $HARNESS_ROOT/memory/MEMORY.md 2>/dev/null
```

Assemble a **Context Snapshot** (compact markdown, ~300 words):

```markdown
## Harness Context Snapshot — YYYY-MM-DD

### Skills present
[list]

### Agents present
[list or "none"]

### Heartbeats
[list files + frontmatter status if readable]

### Memory logs (recent)
[last 10 daily log files]

### Wiki pages
[list or "none"]

### Packages
- root: [version, dep count]

### CI workflows
[list]

### Git worktrees
[list]

### Focus constraint
[value of --focus or "none — full audit"]
```

### 3. Spawn 4 auditors in ONE message (parallel)

Launch 4 Agent tool calls **in a single message**. Each receives the Context Snapshot and its specific mandate. All agents use **Ultra compression** for their output (consumed by synthesis, not humans).

---

#### PM Auditor

> You are a Product Manager auditing an Open Harness project. Read the Context Snapshot. Then inspect `$HARNESS_ROOT`. Use Read, Glob, and Grep tools freely. Return findings in the Ultra-compressed format below.
>
> **Audit areas:**
>
> 1. **Developer onboarding friction** — Read `.devcontainer/`, `Makefile`, `install/`, `CLAUDE.md`, `workspace/AGENTS.md`. Count the distinct manual steps from `git clone` to a working sandbox. Flag any step that is undocumented, error-prone, or requires copy-pasting secrets.
>
> 2. **Skill consistency** — Read every `SKILL.md` under `.claude/skills/` and `workspace/.claude/skills/`. Check: valid YAML frontmatter (name, description)? Imperative instruction style? Stale (no recent invocation evidence in memory logs)?
>
> 3. **Issue template completeness** — List `.github/ISSUE_TEMPLATE/` files. For each: required fields, clear labels, assignment guidance?
>
> 4. **Wiki/memory utilization** — Count wiki pages under `docs/wiki/`. Count daily memory logs under `memory/`. Are logs recent (within 7 days)? Are wiki pages populated or placeholder-empty?
>
> **Return format (Ultra compression):**
> ```
> PM_FINDINGS
> [AREA] [SEVERITY: H/M/L] [EFFORT: S/M/L] [FINDING] | [EVIDENCE: file or observation]
> ...
> WORKING
> [what is functioning well]
> END
> ```

---

#### Implementer Auditor

> You are a senior engineer auditing an Open Harness project. Read the Context Snapshot. Then inspect `$HARNESS_ROOT`. Use Read, Glob, Grep, and Bash tools freely. Return findings in the Ultra-compressed format below.
>
> **Audit areas:**
>
> 1. **Startup reliability** — Read `.devcontainer/docker-compose.yml`, `.devcontainer/entrypoint.sh`, `workspace/startup.sh`. Look for: race conditions, silent failure paths (errors swallowed without exit codes), missing healthchecks.
>
> 2. **Test coverage** — Check `scripts/__tests__/` and any app test folders. Check `.github/workflows/` for test job definitions. Are orchestrator scripts tested in CI?
>
> 3. **CI/CD completeness** — Read each workflow file. Gaps: missing lint, missing type-check, no test job, no release job, no deploy step?
>
> 4. **Package health** — For root `package.json` and each `apps/*/package.json`: pinned vs caret deps, presence of `build` and `test` scripts.
>
> 5. **Compose overlay fragility** — Read `.devcontainer/docker-compose*.yml`. Hardcoded paths, missing `restart: unless-stopped`, volumes without named mounts, env vars without defaults?
>
> **Return format (Ultra compression):**
> ```
> IMP_FINDINGS
> [AREA] [SEVERITY: H/M/L] [EFFORT: S/M/L] [FINDING] | [EVIDENCE: file or command output]
> ...
> WORKING
> [what is solid]
> END
> ```

---

#### Critic Auditor

> You are an adversarial security and reliability critic auditing an Open Harness project. Assume everything is broken until proven otherwise. Read the Context Snapshot. Inspect `$HARNESS_ROOT`. Use Read, Glob, Grep, and Bash tools. Return findings in the Ultra-compressed format below.
>
> **Audit areas:**
>
> 1. **Security posture** — Docker socket mounted into containers? Containers running `--privileged` or as root? Default passwords or hardcoded secrets in compose files or entrypoints? Unrestricted sudo inside the sandbox?
>
> 2. **Heartbeat reliability** — Read all files in `workspace/heartbeats/`. Watchdog/restart mechanism? What happens if the heartbeat process crashes — auto-recovery? Cron/daemon config valid?
>
> 3. **Worktree cleanup** — Run `git -C $HARNESS_ROOT worktree list`. Identify orphaned agent branches with no recent commits. Automated cleanup in place?
>
> 4. **State corruption risks** — Shared files written by multiple agents concurrently? No file locking on append operations? Mid-commit crash scenarios? Compose volumes that could diverge?
>
> **Return format (Ultra compression):**
> ```
> CRITIC_FINDINGS
> [AREA] [SEVERITY: H/M/L] [EFFORT: S/M/L] [FINDING] | [EVIDENCE: file or observed gap]
> ...
> WORKING
> [what is hardened or acceptable]
> END
> ```

---

#### Explorer Auditor

> You are a system archaeologist auditing an Open Harness project. Your job is to discover what is actually happening vs. what the documentation claims. Read the Context Snapshot. Inspect `$HARNESS_ROOT` and `$HARNESS_ROOT/workspace`. Use Read, Glob, Grep, and Bash tools. Return findings in the Ultra-compressed format below.
>
> **Audit areas:**
>
> 1. **Memory system quality** — Read the 5 most recent daily logs in `memory/`. Are entries following the Memory Improvement Protocol (Result/Action/Observation fields)? Quality declining over time?
>
> 2. **Wiki utilization** — List all files under `docs/wiki/`. For each: substantive content (>10 lines) or placeholder stub? Percentage populated?
>
> 3. **Heartbeat health** — For each file in `workspace/heartbeats/`, classify: ACTIVE (recently logged), STALE (defined, no recent log), MISCONFIGURED (broken frontmatter or missing schedule). Check memory logs for execution traces.
>
> 4. **Agent worktree status** — Run `git -C $HARNESS_ROOT worktree list` and `git -C $HARNESS_ROOT branch -a | grep agent/`. Classify each: ACTIVE (commits in last 7 days), IDLE (7-30 days), ORPHANED (30+ days or branch deleted).
>
> 5. **Skill usage patterns** — Read `memory/MEMORY.md` and recent daily logs. Which skills appear in memory entries (evidence of use)? Which skills exist but never appear in logs (potentially stale)?
>
> **Return format (Ultra compression):**
> ```
> EXP_FINDINGS
> [AREA] [SEVERITY: H/M/L] [EFFORT: S/M/L] [FINDING] | [EVIDENCE: file or log reference]
> ...
> WORKING
> [what is healthy]
> END
> ```

---

### 4. Synthesize findings

After all 4 auditors return:

1. **Deduplicate** — if 2+ auditors flag the same issue, merge into one entry (note multiple sources)
2. **Tier-rank** using this matrix:

| Tier | Criteria |
|------|----------|
| **Tier 1: Fix Now** | Severity H + any effort, OR Severity M + Effort S |
| **Tier 2: Build Next** | Severity M + Effort M/L, OR Severity L + Effort S with clear payoff |
| **Tier 3: Design Decisions Needed** | Requires architectural choice, policy decision, or cross-team alignment before action |

3. **Identify what's working** — consolidate all WORKING entries from auditors
4. **Select top 3 actions** — the 3 highest-leverage Tier 1 items (or Tier 2 if Tier 1 is empty), stated as concrete next steps

### 5. Emit the report

```
## Open Harness Review — YYYY-MM-DD

### Tier 1: Fix Now (high impact, low-medium effort)
| # | Issue | Source | Effort | Why |
|---|-------|--------|--------|-----|
| 1 | ... | PM/IMP/CRITIC/EXP | S/M/L | ... |

### Tier 2: Build Next (medium impact, medium effort)
| # | Issue | Source | Effort | Why |
|---|-------|--------|--------|-----|

### Tier 3: Design Decisions Needed
| # | Issue | Source | Why |
|---|-------|--------|-----|

### What's Working (keep investing)
- ...

### Recommended Next 3 Actions
1. ...
2. ...
3. ...
```

### 6. Memory Protocol

Append to `memory/YYYY-MM-DD/log.md` inside the target harness (where today = `date -u +%Y-%m-%d`):

```markdown
## [Open Harness Review] — HH:MM UTC
- **Result**: OP | DRY-RUN | PARTIAL | FAIL
- **Action**: audited N areas, found M tier-1 issues
- **Observation**: [one sentence — top finding]
```

## Reference

### Auditor-to-area mapping

| Auditor | Primary areas |
|---------|--------------|
| PM | Onboarding, skill consistency, issue templates, wiki/memory utilization |
| Implementer | Startup reliability, test coverage, CI/CD, package health, compose overlays |
| Critic | Security, heartbeat reliability, worktree cleanup, state corruption |
| Explorer | Memory quality, wiki utilization, heartbeat health, worktree status, skill usage |

### Severity and effort definitions

| Label | Severity meaning | Effort meaning |
|-------|-----------------|---------------|
| H | Data loss, security breach, or blocks all agents | S = < 1 hour |
| M | Degrades reliability or developer experience | M = 1 hour – 1 day |
| L | Nice-to-have, cosmetic, or minor friction | L = > 1 day |

### Portability notes

- **`HARNESS_ROOT`** replaces all hard-coded `/home/sandbox/harness` paths from the original OH-internal skill. Set this to the target project root before running.
- **Memory log path** expands to `$HARNESS_ROOT/memory/YYYY-MM-DD/log.md`. Create the directory if it does not exist.
- **tmux conventions** from the original skill are intentionally omitted — this portable version focuses on the audit logic and report format. OH consumers running inside a sandbox may still use tmux for long-running audits; that is a local concern.
- **Agent model selection** is not mandated here. The original skill specified Sonnet; choose whichever model is available and appropriate for your agent client.
