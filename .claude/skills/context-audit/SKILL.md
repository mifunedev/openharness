---
name: context-audit
description: |
  Score the default-loaded context budget across 4 dimensions and emit
  KEEP/TRIM/DEMOTE/CUT verdicts per file. Optional Tier-2 ablation harness
  removes a target file, runs a fixed probe suite, and measures behavior
  degradation — the only provably safe gate for cutting load-bearing content.
  TRIGGER when: asked to audit context window, check default context load,
  "what's in my context", evaluate rules for signal vs noise, or before/after
  any change to context/rules/ or CLAUDE.md.
argument-hint: "all | --baseline | --ablate <relative-path>"
---

# Context Audit

Score every file in the default-loaded context set on 4 deterministic dimensions (footprint, load-bearing, integrity, redundancy). Emit KEEP / TRIM / DEMOTE / CUT verdicts and a total token budget. Optionally run the Tier-2 ablation harness to verify a proposed cut is safe.

## Default-Loaded Set

| Layer | Files | Loaded how |
|-------|-------|-----------|
| Bootloader | `CLAUDE.md` | always |
| Rules | `context/rules/*.md` | always (auto via `.claude/rules` symlink) |
| Context | `context/SOUL.md`, `context/IDENTITY.md`, `context/TOOLS.md`, `context/USER.md` | session start |
| Memory | `memory/MEMORY.md` (+ today's log) | session start |
| Skill metadata | frontmatter of all `**/SKILL.md` | always injected |

## Instructions

### 1. Parse arguments

Arguments received: `$ARGUMENTS`

| Argument | Mode |
|----------|------|
| empty or `all` | Tier-1 scorecard only |
| `--baseline` | Tier-1 scorecard + record durable baseline snapshot to `memory/YYYY-MM-DD/context-audit-baseline/` |
| `--ablate <file>` | Tier-1 scorecard + Tier-2 ablation against `<file>` (path relative to harness root) |

### 2. Inventory the default-loaded set

```bash
HARNESS=/home/sandbox/harness
TODAY=$(date -u +%Y-%m-%d)

# Enumerate all files and their footprint
for f in \
  "$HARNESS/CLAUDE.md" \
  "$HARNESS"/context/rules/*.md \
  "$HARNESS/context/SOUL.md" \
  "$HARNESS/context/IDENTITY.md" \
  "$HARNESS/context/TOOLS.md" \
  "$HARNESS/context/USER.md" \
  "$HARNESS/memory/MEMORY.md"; do
  [ -f "$f" ] || continue
  chars=$(wc -c < "$f")
  words=$(wc -w < "$f")
  echo "$((chars/4)) $words $f"
done

# Skill metadata aggregate (all SKILL.md description fields)
skill_chars=$(grep -h -A10 '^description:' \
  "$HARNESS"/.claude/skills/*/SKILL.md \
  "$HARNESS"/workspace/.claude/skills/*/SKILL.md 2>/dev/null \
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
  "$HARNESS/.claude/skills" \
  "$HARNESS/.claude/agents" \
  "$HARNESS/AGENTS.md" \
  "$HARNESS/CLAUDE.md" \
  "$HARNESS/context" \
  "$HARNESS/docs" 2>/dev/null \
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
# Absolute paths referenced in backticks or quotes
PATH_REFS=$(grep -oP '`[^`]+`|"[^"]+"' "$f" \
  | grep -oP '/[a-zA-Z0-9_./-]+' | sort -u)

# Skill invocations like /release, /ci-status (exclude filesystem paths)
SKILL_REFS=$(grep -oP '/[a-z][a-z0-9-]+' "$f" \
  | grep -v '^/home' | sort -u)

BROKEN=0
for p in $PATH_REFS; do
  [ -e "$p" ] || BROKEN=$((BROKEN + 1))
done
for s in $SKILL_REFS; do
  name="${s#/}"
  { [ -d "$HARNESS/.claude/skills/$name" ] || \
    [ -d "$HARNESS/workspace/.claude/skills/$name" ]; } \
    || BROKEN=$((BROKEN + 1))
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

Omit KEEP files from Recommendations. Use the short filename (e.g. `recursive-delegation.md`), not the full path.

### 6. Tier-2 ablation (skip if mode is `all`)

**Purpose**: determine whether removing a file degrades observable behavior. This is the only step that goes beyond static proxies to provide an empirical signal measurement.

Do not apply Tier-2 to `CLAUDE.md` — removing orchestrator instructions produces meaningless probe results.

#### 6a. Baseline probe run

Run all probes in `.claude/skills/context-audit/probes/` with the full default-loaded set present.

```bash
SKILL_DIR="$HARNESS/.claude/skills/context-audit"
PROBE_DIR="$SKILL_DIR/probes"
RESULTS="/tmp/context-audit-$(date +%s)"
mkdir -p "$RESULTS"

extract_body() {
  # strips YAML frontmatter; prints body (text after closing ---)
  awk '/^---/{n++; if(n==2){p=1;next}} p{print}' "$1"
}

for probe in "$PROBE_DIR"/*.md; do
  pname=$(basename "$probe" .md)
  claude -p "$(extract_body "$probe")" --output-format text \
    > "$RESULTS/baseline-${pname}.txt" 2>&1
  echo "baseline: $pname → $RESULTS/baseline-${pname}.txt"
done
```

If `--baseline` mode: copy results to `memory/$TODAY/context-audit-baseline/` for durable storage.

```bash
mkdir -p "$HARNESS/memory/$TODAY/context-audit-baseline"
cp "$RESULTS"/baseline-*.txt "$HARNESS/memory/$TODAY/context-audit-baseline/"
```

#### 6b. Ablation run

Back up the target file, run all probes, restore. Use `trap` to guarantee restore on error.

```bash
TARGET="$HARNESS/$ARGUMENTS_FILE"   # the <file> arg from --ablate
cp "$TARGET" "${TARGET}.bak"
trap 'mv "${TARGET}.bak" "$TARGET" 2>/dev/null; echo "restored $TARGET"' EXIT

mv "${TARGET}.bak.tmp" "${TARGET}.bak" 2>/dev/null || true
mv "$TARGET" "${TARGET}.bak"

for probe in "$PROBE_DIR"/*.md; do
  pname=$(basename "$probe" .md)
  claude -p "$(extract_body "$probe")" --output-format text \
    > "$RESULTS/ablation-${pname}.txt" 2>&1
  echo "ablation: $pname → $RESULTS/ablation-${pname}.txt"
done

# trap fires on EXIT and restores the file
```

#### 6c. Evaluate degradation

For each probe, read MUST-CONTAIN markers from the probe's frontmatter `markers:` list. Count how many markers appear in the baseline vs. ablation response.

```bash
extract_markers() {
  # prints one marker per line from YAML frontmatter markers: list
  awk '/^markers:/{f=1;next} f && /^  - /{print substr($0,5)} f && /^[a-z]/{exit}' "$1"
}

for probe in "$PROBE_DIR"/*.md; do
  pname=$(basename "$probe" .md)
  baseline_hits=0; ablation_hits=0; total=0

  while IFS= read -r marker; do
    [ -z "$marker" ] && continue
    total=$((total + 1))
    grep -qi "$marker" "$RESULTS/baseline-${pname}.txt" \
      && baseline_hits=$((baseline_hits + 1))
    grep -qi "$marker" "$RESULTS/ablation-${pname}.txt" \
      && ablation_hits=$((ablation_hits + 1))
  done < <(extract_markers "$probe")

  drop=$((baseline_hits - ablation_hits))
  [ "$drop" -le 0 ] && severity="none" \
    || { [ "$drop" -eq 1 ] && severity="LOW" || severity="HIGH"; }
  echo "$pname|$baseline_hits|$ablation_hits|$total|$drop|$severity"
done
```

#### 6d. Emit Tier-2 report

```
## Ablation: <target-file> — YYYY-MM-DD HH:MM UTC

### Probe Results
| Probe | Baseline | Ablation | Markers | Drop | Severity |
|-------|:--------:|:--------:|:-------:|:----:|:--------:|
| probe-git-branch | 3/3 | 1/3 | 3 | 2 | HIGH |
| ...              |     |     |   |   |      |

### Verdict
SAFE TO CUT — all probes degraded ≤ 1 marker
  OR
SIGNAL DETECTED — N probe(s) degraded >1 marker; <target-file> earns its slot
```

Degradation threshold: **SIGNAL DETECTED** if any probe's ablation hits fall more than 1 below baseline hits. **SAFE TO CUT** otherwise.

### 7. Memory Protocol

```bash
mkdir -p "$HARNESS/memory/$TODAY"
cat >> "$HARNESS/memory/$TODAY/log.md" <<EOF

## [Context Audit] — $(date -u +%H:%M) UTC
- **Result**: OP
- **Budget**: Z tokens total (scored files + skill metadata)
- **Top finding**: <VERDICT> — <file> (<tokens> tokens, <citations> citations)
- **Ablation**: SAFE TO CUT | SIGNAL DETECTED | N/A
- **Observation**: [one sentence — the single most actionable finding]
EOF
```

See `context/rules/memory.md` for the canonical Memory Improvement Protocol.

## Guidelines

- All Tier-1 scoring is deterministic — same shell commands twice produce the same scores. No LLM judgment in Tier 1.
- Tier-2 ablation uses `trap` to restore the target file even if `claude -p` errors mid-run.
- The skill-metadata aggregate row gets a budget line but no verdict (it's aggregate; verdicts apply per-file only).
- Tier-2 probe results are probabilistic, not deterministic — `claude -p` is non-deterministic. Run ablation twice if a verdict is borderline.
- For before/after token diff: the Memory log's `Budget:` line from each run is the comparison data point. No separate snapshot mechanism needed for the diff.
- When `--baseline` mode is used, probe outputs are persisted to `memory/YYYY-MM-DD/context-audit-baseline/` and are gitignored (daily memory dirs are gitignored per `.gitignore`).
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
.claude/skills/context-audit/runner.sh --ablate context/rules/<file>.md
```

See `runner.sh` in this skill directory.

### Scoring cheatsheet

| Dimension | 2 (healthy) | 1 (warning) | 0 (noise) |
|-----------|------------|-------------|-----------|
| Footprint | < 500 tokens | 500–1,500 | > 1,500 |
| Load-bearing | 5+ citations | 1–4 citations | 0 citations |
| Integrity | 0 broken refs | 1–2 broken | 3+ broken |
| Redundancy | no overlap | 1 overlap file | 2+ overlap files |
