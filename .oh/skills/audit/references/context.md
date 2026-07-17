# Context Audit

Score every file in the default-loaded context set on 4 deterministic dimensions (footprint, load-bearing, integrity, redundancy). Emit KEEP / TRIM / DEMOTE / CUT verdicts and a total token budget. Optionally run the Tier-2 ablation harness to verify a proposed cut is safe.

## Default-Loaded Set

| Layer | Files | Loaded how |
|-------|-------|-----------|
| Bootloader | `CLAUDE.md` | always |
| Context | `.oh/context/SOUL.md`, `.oh/context/IDENTITY.md`, `.oh/context/TOOLS.md`, `.oh/context/REPO_MAP.md`, `.oh/context/USER.md` | session start |
| Memory | `.oh/memory/MEMORY.md` and `.oh/memory/<UTC-today>/log.md` when present | session start |
| Skill metadata | frontmatter of all `**/SKILL.md` | always injected |

## Instructions

### 1. Parse arguments

Arguments received: `$ARGUMENTS`

| Argument | Mode |
|----------|------|
| empty or `all` | Tier-1 scorecard only |
| `--baseline` | Tier-1 scorecard + record durable baseline snapshot to `.oh/memory/YYYY-MM-DD/context-audit-baseline/` |
| `--ablate <file>` | Tier-1 scorecard + Tier-2 ablation against `<file>` (path relative to harness root) |

### 2. Inventory the default-loaded set

```bash
HARNESS=$AUDIT_ROOT
TODAY=$(date -u +%Y-%m-%d)

# Enumerate all files and their footprint
for f in \
  "$HARNESS/CLAUDE.md" \
  "$HARNESS/.oh/context/SOUL.md" \
  "$HARNESS/.oh/context/IDENTITY.md" \
  "$HARNESS/.oh/context/TOOLS.md" \
  "$HARNESS/.oh/context/REPO_MAP.md" \
  "$HARNESS/.oh/context/USER.md" \
  "$AUDIT_LOG_ROOT/.oh/memory/MEMORY.md" \
  "$AUDIT_LOG_ROOT/.oh/memory/$TODAY/log.md"; do
  [ -f "$f" ] || continue
  chars=$(wc -c < "$f")
  words=$(wc -w < "$f")
  echo "$((chars/4)) $words $f"
done

# Skill metadata aggregate (all SKILL.md description fields)
skill_chars=$(grep -h -A10 '^description:' \
  "$HARNESS"/.oh/skills/*/SKILL.md 2>/dev/null \
  | wc -c)
echo "$((skill_chars/4)) skill-metadata-aggregate (all trigger descriptions)"
```

Collect the list as `ALL_FILES` for use in the scoring steps below.

### 3. Score each file on 4 dimensions

For every file in the inventory (skip the skill-metadata aggregate row — no verdict, budget line only), compute 4 dimensions using shell commands only.

---

#### Dimension A — Footprint (0-2)

Token cost (chars/4). Lower cost earns a higher score — every token in the default-loaded set is paid on every session start.

```bash
TOKENS=$(($(wc -c < "$f") / 4))
```

| Tokens | Score |
|--------|-------|
| < 500 | 2 |
| 500 – 1,500 | 1 |
| > 1,500 | 0 |

---

#### Dimension B — Load-bearing (0-2)

Citation count: how many skills, agents, tracked docs, and orchestrator files reference this file by name (a measurable proxy for "this content is actively consumed").

```bash
FILE_BASE=$(basename "$f")
REFS=$(grep -rl "$FILE_BASE" \
  "$HARNESS/.oh/skills" \
  "$HARNESS/.oh/agents" \
  "$HARNESS/AGENTS.md" \
  "$HARNESS/CLAUDE.md" \
  "$HARNESS/.oh/context" \
  "$HARNESS/.oh/docs" 2>/dev/null \
  | grep -v "^${f}$" | wc -l)
```

| Citations | Score |
|-----------|-------|
| >= 5 | 2 |
| 1 – 4 | 1 |
| 0 | 0 |

---

#### Dimension C — Integrity (0-2)

Verify that every file path and skill reference within the file resolves. Broken references are load-bearing context that actively misleads.

```bash
# Repo-relative .oh/ paths referenced in backticks or quotes. Do not interpret
# command invocations (for example /audit) as filesystem-root paths.
PATH_REFS=$(grep -oP '`[^`]+`|"[^"]+"' "$f" \
  | grep -oP '(?:^|[[:space:]`"])(\.oh/[a-zA-Z0-9_./-]+)' \
  | grep -oP '\.oh/[a-zA-Z0-9_./-]+' | sort -u)

# Skill invocations like /release, /ci-status (exclude filesystem paths)
SKILL_REFS=$(grep -oP '/[a-z][a-z0-9-]+' "$f" \
  | grep -v '^/home' | sort -u)

BROKEN=0
for p in $PATH_REFS; do
  [ -e "$HARNESS/$p" ] || BROKEN=$((BROKEN + 1))
done
for s in $SKILL_REFS; do
  name="${s#/}"
  [ -d "$HARNESS/.oh/skills/$name" ] || BROKEN=$((BROKEN + 1))
done
```

| Broken refs | Score |
|-------------|-------|
| 0 | 2 |
| 1 – 2 | 1 |
| 3+ | 0 |

---

#### Dimension D — Redundancy (0-2)

Check whether this file's section-header structure substantially duplicates another loaded file. Redundant files add cost without adding unique signal.

```bash
HEADS=$(grep '^## ' "$f" | sed 's/^## //')
OVERLAP=0
for other in $ALL_FILES; do
  [ "$other" = "$f" ] && continue
  [ -f "$other" ] || continue
  match=$(grep '^## ' "$other" | sed 's/^## /' \
    | grep -cFf <(echo "$HEADS") 2>/dev/null || echo 0)
  [ "$match" -gt 2 ] && OVERLAP=$((OVERLAP + 1))
done
```

| Overlap files | Score |
|---------------|-------|
| 0 | 2 |
| 1 | 1 |
| 2+ | 0 |

---

### 4. Compute total and verdict

```
TOTAL = A + B + C + D  (max 8)
```

| Total | Verdict | Meaning |
|-------|---------|---------|
| 7 – 8 | **KEEP** | Signal justified; no action needed |
| 5 – 6 | **TRIM** | Reduce footprint or remove duplicate sections; stays default-loaded |
| 3 – 4 | **DEMOTE** | Move to on-demand (session-start explicit read or skill); remove from auto-load |
| 0 – 2 | **CUT** | Not earning its slot; remove or merge. Run Tier-2 ablation first if B > 0. |

### 5. Emit Tier-1 report

Print today's date as `YYYY-MM-DD`.

```
## Context Audit — YYYY-MM-DD

### Budget
Total default-loaded (scored files): X tokens
Skill metadata aggregate: ~Y tokens
Grand total: ~Z tokens

### Scorecard
| File | Tokens | A:Foot | B:Load | C:Integ | D:Redun | Total | Verdict |
|------|-------:|:------:|:------:|:-------:|:-------:|------:|---------|
| ...  |        |        |        |         |         |       |         |

(sorted by Total ascending — worst first)

### Recommendations
- **CUT**: <file> — <one-line reason>
- **DEMOTE**: <file> — <one-line reason>
- **TRIM**: <file> — <one-line reason>
```

Omit KEEP files from Recommendations. Use the short filename (e.g. `advisor.md`), not the full path.

### 6. Tier-2 ablation (skip if mode is `all`)

The canonical caller is `$AUDIT_ROOT/.oh/skills/audit/scripts/context-audit-runner.sh`.
Use `--baseline` only on explicit request; use `--ablate <relative-file>` for ablation.
The runner resolves probes from `$AUDIT_ROOT/.oh/skills/audit/probes/context/`, creates
invocation-scoped temporary results, and calls `.oh/scripts/ablate.sh` for validation,
locking, versioned sentinel transitions, signal restoration, and startup recovery. Do
not implement backup, sentinel parsing, locking, or restore in this route.

Ablation preserves the native `SAFE TO CUT` / `SIGNAL DETECTED` verdict. Explicit
baseline output is durable under `AUDIT_LOG_ROOT`; ordinary ablation restores the target
byte-for-byte and leaves only the structured observation returned to the dispatcher.

### 7. Memory Protocol

Return a structured context observation carrying `AUDIT_RUN_ID`, budget, top finding,
ablation verdict, and evidence path. Do not append or run retro from this route; the outer
dispatcher owns the one locked append under `AUDIT_LOG_ROOT`.

See `.oh/skills/retro/references/memory-protocol.md` for the canonical Memory Improvement Protocol.

## Guidelines

- All Tier-1 scoring is deterministic — same shell commands twice produce the same scores. No LLM judgment in Tier 1.
- Tier-2 ablation uses `trap` to restore the target file even if `claude -p` errors mid-run.
- The skill-metadata aggregate row gets a budget line but no verdict (it's aggregate; verdicts apply per-file only).
- Tier-2 probe results are probabilistic, not deterministic — `claude -p` is non-deterministic. Run ablation twice if a verdict is borderline.
- For before/after token diff: the Memory log's `Budget:` line from each run is the comparison data point. No separate snapshot mechanism needed for the diff.
- When `--baseline` mode is used, probe outputs are persisted to `.oh/memory/YYYY-MM-DD/context-audit-baseline/` and are gitignored (daily memory dirs are gitignored per `.gitignore`).
- Do not penalize `CLAUDE.md` on Dimension B (load-bearing) because it's the source of truth and may have few inbound citations by design — it doesn't need to be cited; it is the orchestrator instructions.

## Reference

### Verdict thresholds

| Score | Verdict | Recommended action |
|-------|---------|-------------------|
| 7–8 | KEEP | No action |
| 5–6 | TRIM | Edit for concision; remove duplicate sections |
| 3–4 | DEMOTE | Move to on-demand; remove from auto-load set |
| 0–2 | CUT | Remove; run Tier-2 ablation first if B score > 0 |

### Probe file format

```yaml
---
name: <identifier>
target: <rule-filename>   # which default-loaded file this probe exercises
markers:
  - <keyword or phrase that should appear when the rule is present>
  - ...
---

<Prompt text — what gets sent to claude -p. One task that requires the target rule to answer correctly.>
```

### Ablation runner (standalone)

For running ablation outside a Claude session:

```bash
.oh/skills/audit/scripts/context-audit-runner.sh --ablate .oh/context/<file>.md
```

See `runner.sh` in this skill directory.

### Scoring cheatsheet

| Dimension | 2 (healthy) | 1 (warning) | 0 (noise) |
|-----------|------------|-------------|-----------|
| Footprint | < 500 tokens | 500–1,500 | > 1,500 |
| Load-bearing | 5+ citations | 1–4 citations | 0 citations |
| Integrity | 0 broken refs | 1–2 broken | 3+ broken |
| Redundancy | no overlap | 1 overlap file | 2+ overlap files |
