---
name: skill-lint
description: |
  Score all skills for staleness using 5 dimensions (freshness, usage,
  integrity, format, dependencies). Reports CURRENT/STALE/BROKEN/DELETE
  verdicts with specific recommendations.
  TRIGGER when: asked to audit skills, check skill health, "are my skills
  stale", "skill lint", or periodically via heartbeat.
argument-hint: "all | root | workspace | <skill-name>"
---

# Skill Lint

Score every skill across two scopes on 5 deterministic dimensions and produce a CURRENT / STALE / BROKEN / DELETE verdict for each. No LLM judgment — scores come from file stats, grep counts, and path existence checks only.

## Instructions

### 1. Parse target

Arguments received: `$ARGUMENTS`

| Argument | Scope |
|----------|-------|
| `all` (default, or empty) | Root scope + workspace scope |
| `root` | `/home/sandbox/harness/.claude/skills/` only |
| `workspace` | `/home/sandbox/harness/workspace/.claude/skills/` only |
| `<skill-name>` | Single skill, auto-detect scope |

### 2. Discover skills

```bash
# Root scope
ROOT_SKILLS=$(find /home/sandbox/harness/.claude/skills -name "SKILL.md" -maxdepth 3 2>/dev/null)

# Workspace scope
WS_SKILLS=$(find /home/sandbox/harness/workspace/.claude/skills -name "SKILL.md" -maxdepth 3 2>/dev/null)
```

Build a list of `(skill-name, scope-label, skill-dir, skill-file)` tuples. Scope label is `root` or `ws`.

### 3. Score each skill on 5 dimensions

For every skill file, compute dimensions **independently** using only shell commands and file checks.

---

#### Dimension A — Freshness (0-2)

```bash
# Get modification time as Unix timestamp
MTIME=$(stat -c %Y "<skill-file>")
NOW=$(date +%s)
AGE_DAYS=$(( (NOW - MTIME) / 86400 ))
```

| Age | Score |
|-----|-------|
| <= 7 days | 2 |
| 8 – 30 days | 1 |
| 31+ days | 0 |

---

#### Dimension B — Usage (0-2)

```bash
# Count daily memory logs that mention this skill name (case-insensitive)
SKILL_NAME="<skill-name>"
MENTION_COUNT=$(grep -rli "$SKILL_NAME" /home/sandbox/harness/workspace/memory/ 2>/dev/null | wc -l)
```

| Mentions | Score |
|----------|-------|
| >= 2 log files | 2 |
| 1 log file | 1 |
| 0 log files | 0 |

---

#### Dimension C — Integrity (0-2)

Scan the SKILL.md body for references to paths and skill invocations, then verify existence.

```bash
# Extract all bare absolute paths (e.g. /home/sandbox/harness/...)
PATH_REFS=$(grep -oP '`[^`]*`|"[^"]*"' "<skill-file>" | grep -oP '/[a-zA-Z0-9_./-]+' | sort -u)

# Extract skill invocations (e.g. /provision, /delegate, /wiki-ingest)
SKILL_REFS=$(grep -oP '/[a-z][a-z0-9-]+' "<skill-file>" | grep -v '^/home' | sort -u)
```

For each extracted path reference: check `[ -e "<path>" ]`.
For each skill reference like `/foo-bar`: check whether `<root>/.claude/skills/foo-bar/SKILL.md` or `<ws>/.claude/skills/foo-bar/SKILL.md` exists.

Count total broken references (`BROKEN_COUNT`).

| Broken refs | Score |
|-------------|-------|
| 0 | 2 |
| 1 – 2 | 1 |
| 3+ | 0 |

---

#### Dimension D — Format (0-2)

```bash
# Check for YAML frontmatter (opening --- block)
HAS_FM=$(grep -c '^---$' "<skill-file>" | awk '{print ($1 >= 2) ? "yes" : "no"}')

# Check for memory protocol section
HAS_MEM=$(grep -c '## Memory Protocol\|## \[.*\] — HH:MM UTC\|Memory Improvement Protocol' "<skill-file>")

# Check for guidelines section
HAS_GL=$(grep -c '^## Guidelines\|^## Important Notes\|^## Reference' "<skill-file>")
```

| Conditions | Score |
|------------|-------|
| Has frontmatter AND memory protocol AND at least one of guidelines/reference | 2 |
| Has frontmatter, missing memory protocol | 1 |
| Missing frontmatter (`---` block absent) | 0 |

---

#### Dimension E — Dependencies (0-2)

Dependencies are skill references found in step C (`SKILL_REFS`). For each referenced skill:

1. If the skill exists, look up its **total score** (computed in this run, or estimate from freshness if not yet scored)
2. Classify the referenced skill's score using the verdict thresholds (see step 4)

| Dep state | Score |
|-----------|-------|
| No dependencies, OR all deps score >= 6 (CURRENT/STALE but functional) | 2 |
| 1+ deps score 3-5 (STALE/warning) | 1 |
| 1+ deps deleted OR score <= 2 (BROKEN/DELETE) | 0 |

If a skill has no cross-skill references, assign score **2**.

---

### 4. Compute total and verdict

```
TOTAL = A + B + C + D + E   (max 10)
```

| Total | Verdict |
|-------|---------|
| 8 – 10 | **CURRENT** |
| 5 – 7 | **STALE** |
| 3 – 4 | **BROKEN** |
| 0 – 2 | **DELETE** |

### 5. Generate recommendations

For each skill that is not CURRENT, produce one concrete recommendation line. Use this decision table:

| Primary signal | Recommendation template |
|----------------|------------------------|
| Format score = 0 | `Missing frontmatter — add YAML block with name/description` |
| Integrity score = 0 | `Fix broken references — N paths/skills no longer exist` |
| Freshness = 0, Usage = 0 | `Never triggered and not updated in 30+ days — remove or redesign` |
| Usage = 0, Freshness >= 1 | `Never triggered — confirm still needed or add to a heartbeat` |
| Deps score = 0 | `Depends on deleted or dead skills — update or remove cross-skill calls` |
| Freshness = 0, Format < 2 | `Pattern drift — rewrite to current conventions` |

If multiple signals apply, pick the highest-impact one (integrity > format > deps > freshness > usage).

### 6. Emit report

Print today's date as `YYYY-MM-DD` (use `date +%F`).

```
## Skill Lint — YYYY-MM-DD

### Summary
N skills scanned | M CURRENT | S STALE | B BROKEN | D DELETE

### Scores
| Skill | Scope | Fresh | Usage | Integ | Fmt | Deps | Total | Verdict |
|-------|-------|-------|-------|-------|-----|------|-------|---------|
| <name> | root | A | B | C | D | E | T | VERDICT |
...

### Recommendations
- **DELETE**: <skill> — <reason>
- **BROKEN**: <skill> — <reason>
- **STALE**: <skill> — <reason>
```

Sort the Scores table by Total ascending (worst first). Omit CURRENT skills from the Recommendations section — they need no action.

### 7. Memory Protocol

Append to `workspace/memory/YYYY-MM-DD.md`:

```markdown
## [Skill Lint] — HH:MM UTC
- **Result**: OP
- **Action**: scored N skills
- **Current**: M | **Stale**: S | **Broken**: B | **Delete**: D
- **Observation**: [one sentence — top finding]
```

If the audit reveals a systemic pattern (e.g., multiple skills missing memory protocol, or a whole scope never triggered), append to `workspace/MEMORY.md > Lessons Learned`.

## Guidelines

- Scoring is fully deterministic — run the same commands twice and get the same scores. Do not adjust scores based on content quality or subjective judgment.
- Run Dimension E (Dependencies) last, after all other dimensions are scored, so referenced-skill scores are available without a second pass.
- When checking integrity references, skip references to standard Unix paths (`/bin`, `/usr`, `/home/sandbox/harness` itself as a directory) — only flag references to specific files or skills that do not exist.
- A skill that is the target of `argument-hint: "all | root | workspace | <skill-name>"` style hints should not be penalized for referencing those placeholder tokens.
- For the single-skill target mode (`$ARGUMENTS` = a skill name), run all 5 dimensions and emit the same table for just that skill, plus its recommendation.
- Heartbeat coverage is a bonus signal, not a scored dimension — note it in the Recommendation line if a skill has 0 usage and no heartbeat reference in `workspace/heartbeats/`.

## Reference

### Scope paths

| Scope | Skills root |
|-------|-------------|
| root | `/home/sandbox/harness/.claude/skills/` |
| ws | `/home/sandbox/harness/workspace/.claude/skills/` |

### Score thresholds

| Dimension | 2 (healthy) | 1 (warning) | 0 (stale) |
|-----------|------------|-------------|-----------|
| Freshness | <= 7 days | 8-30 days | 31+ days |
| Usage | 2+ log mentions | 1 log mention | 0 mentions |
| Integrity | 0 broken refs | 1-2 broken refs | 3+ broken refs |
| Format | FM + memory protocol + guidelines/ref | FM only | No FM |
| Dependencies | All deps score >= 6 or none | Deps score 3-5 | Deps deleted or score <= 2 |

### Verdict thresholds

| Score | Verdict | Action |
|-------|---------|--------|
| 8-10 | CURRENT | No action needed |
| 5-7 | STALE | Review and update — may have drifted from current patterns |
| 3-4 | BROKEN | Fix broken references or rewrite — will fail if triggered |
| 0-2 | DELETE | Dead weight — remove or completely redesign |
