---
name: wiki-lint
description: |
  Manual health-check skill for the wiki corpus. Surfaces five finding types:
  stale entries (updated > 90 days ago), deprecated entries (confidence:
  deprecated), orphaned entries (zero inbound [[slug]] references), broken
  outbound links ([[slug]] references with no matching entry), and a stub for
  contradiction detection (not yet implemented). Default invocation atomically
  regenerates wiki/README.md; --dry-run prints proposed changes without writing.
  Always logs to memory/<today>/log.md per the Memory Improvement Protocol.
  TRIGGER when: asked to health-check the wiki, "lint the wiki", "regenerate
  wiki/README.md", "find stale or orphaned wiki entries", or before a release
  that includes wiki changes.
argument-hint: "[--dry-run]"
---

# Wiki Lint

Health-check the `wiki/` corpus and regenerate `wiki/README.md`. This is
Karpathy's "Lint + Maintain" operation adapted for Open Harness: surface
stale, deprecated, orphaned, and broken-link entries; regenerate the index
atomically.

The canonical schema, frontmatter extraction command, cross-link convention,
and confidence lifecycle all live in `context/rules/wiki.md`. This skill
defers to those rules — it does not redefine them.

## When to Use

- `/wiki-lint` to regenerate `wiki/README.md` and surface any health findings.
- `/wiki-lint --dry-run` to preview what would change without writing.
- Periodically (manual cadence — no heartbeat cron in v1) to keep the corpus
  healthy as entries accumulate.

## When NOT to Use

- **`/wiki-ingest`** — to add or update an entry. `/wiki-lint` is read-only
  except for `wiki/README.md` regeneration.
- **`/wiki-query`** — to search for a topic and read entries into context.
- **Direct `Edit` tool on `wiki/README.md`** — `/wiki-lint` owns this file;
  hand-edits will be overwritten on the next run.

## Argument Interface (locked)

```
/wiki-lint [--dry-run]
```

The argument interface is locked. Do not add flags or positional arguments
without editing this SKILL.md.

- **No arguments**: run all checks, atomically regenerate `wiki/README.md`.
- **`--dry-run`**: run all checks, print the proposed `wiki/README.md` content
  and any findings, but do NOT write `wiki/README.md` or any other file.

## Instructions

### 1. Parse arguments

```bash
ARGUMENTS="${ARGUMENTS:-}"
DRY_RUN=false
if echo "$ARGUMENTS" | grep -q -- '--dry-run'; then
  DRY_RUN=true
fi
```

All subsequent write operations (including the atomic `wiki/README.md`
regeneration) are gated on `DRY_RUN=false`. In dry-run mode, print what
would be written; never write it.

### 2. Collect all wiki entry paths

```bash
HARNESS=/home/sandbox/harness
WIKI_ENTRIES=()
for f in "$HARNESS"/wiki/*.md; do
  [ -f "$f" ] && WIKI_ENTRIES+=("$f")
done
ENTRIES_COUNT=${#WIKI_ENTRIES[@]}
```

This enumerates `wiki/*.md` directly — NOT via `wiki/README.md` (the README is
the output of this skill, not its input). Sub-article files at
`wiki/<parent>/<child>.md` are not matched by this glob; they are scoped for
a future iteration.

If `$ENTRIES_COUNT = 0`, skip all check steps and proceed directly to
§ 7 (README regeneration with empty corpus) and § 8 (Memory Protocol).

### 3. Extract frontmatter for each entry

For every entry path, extract its YAML frontmatter using the canonical command
locked in `context/rules/wiki.md` § 6:

```bash
awk '/^---$/{f=!f; next} f{print}' wiki/<slug>.md
```

Build a lookup table of slug → frontmatter fields:

```bash
declare -A ENTRY_SLUGS         # slug → file path
declare -A ENTRY_TITLES        # slug → title
declare -A ENTRY_TAGS          # slug → tags string
declare -A ENTRY_UPDATED       # slug → updated date
declare -A ENTRY_CONFIDENCE    # slug → confidence value
declare -A ENTRY_PATH          # slug → full path

for entry in "${WIKI_ENTRIES[@]}"; do
  frontmatter=$(awk '/^---$/{f=!f; next} f{print}' "$entry")
  slug=$(echo "$frontmatter" | grep '^slug:' | awk '{print $2}')
  title=$(echo "$frontmatter" | grep '^title:' | sed 's/^title: *//' | tr -d '"')
  tags=$(echo "$frontmatter" | grep '^tags:' | sed 's/^tags: *//')
  updated=$(echo "$frontmatter" | grep '^updated:' | awk '{print $2}')
  confidence=$(echo "$frontmatter" | grep '^confidence:' | awk '{print $2}')

  [ -z "$slug" ] && continue   # skip malformed entries (no slug)

  ENTRY_SLUGS["$slug"]="$entry"
  ENTRY_TITLES["$slug"]="$title"
  ENTRY_TAGS["$slug"]="$tags"
  ENTRY_UPDATED["$slug"]="$updated"
  ENTRY_CONFIDENCE["$slug"]="$confidence"
  ENTRY_PATH["$slug"]="$entry"
done
```

This extraction MUST use the exact `awk '/^---$/{f=!f; next} f{print}'` command.
Deviation from the § 6 canonical command is forbidden — both `/wiki-query` and
`/wiki-lint` must use identical extraction to prevent silent divergence (a match
that works in one skill must work in the other).

### 4. Stale-90d check

Enumerate entries where frontmatter `updated:` is more than 90 days older than
today's UTC date. These are reported as a separate finding type with the
recommendation "consider review".

```bash
TODAY=$(date -u +%Y-%m-%d)
STALE_90D=()

for slug in "${!ENTRY_UPDATED[@]}"; do
  updated="${ENTRY_UPDATED[$slug]}"
  [ -z "$updated" ] && continue

  # Compute age in days (compatible with GNU date)
  today_epoch=$(date -u -d "$TODAY" +%s 2>/dev/null \
    || date -u -j -f "%Y-%m-%d" "$TODAY" +%s)
  updated_epoch=$(date -u -d "$updated" +%s 2>/dev/null \
    || date -u -j -f "%Y-%m-%d" "$updated" +%s)
  age_days=$(( (today_epoch - updated_epoch) / 86400 ))

  if [ "$age_days" -gt 90 ]; then
    STALE_90D+=("$slug (updated: $updated, age: ${age_days}d)")
  fi
done
```

Print findings:

```
=== Stale-90d findings (${#STALE_90D[@]}) — consider review ===
```

For each entry in `STALE_90D`, print one line: `  - <slug> (updated: <date>, age: <N>d)`.

If `${#STALE_90D[@]} = 0`, print `  (none)`.

**Important**: this check only REPORTS. `/wiki-lint` does NOT modify the
`updated:` field or any other frontmatter field on any entry.

### 5. Deprecated check

Enumerate entries where frontmatter `confidence: deprecated`. These are reported
as a separate finding type with the recommendation "consider archive or delete".

```bash
DEPRECATED=()

for slug in "${!ENTRY_CONFIDENCE[@]}"; do
  if [ "${ENTRY_CONFIDENCE[$slug]}" = "deprecated" ]; then
    DEPRECATED+=("$slug")
  fi
done
```

Print findings:

```
=== Deprecated findings (${#DEPRECATED[@]}) — consider archive or delete ===
```

For each entry in `DEPRECATED`, print one line: `  - <slug>`.

If `${#DEPRECATED[@]} = 0`, print `  (none)`.

**Critical constraint**: `/wiki-lint` ONLY REPORTS deprecated entries — it NEVER
autonomously SETS `confidence: deprecated`. The `deprecated` value is set
MANUALLY by the orchestrator only, per the lifecycle defined in
`context/rules/wiki.md` § 5. This constraint is non-negotiable.

Stale-90d (§ 4) and Deprecated (§ 5) are always reported separately. They are
distinct finding types and MUST NOT be conflated — an entry can be stale-90d
and NOT deprecated, or deprecated and NOT stale-90d.

### 6. Orphan check (two-pass)

An orphaned entry has zero inbound `[[slug]]` references from any other entry
body. A single-entry corpus is always an orphan — this is a **true positive**,
not a false positive. The orphan check does not distinguish corpus size.

#### Pass 1: enumerate all known slugs

```bash
ALL_SLUGS=("${!ENTRY_SLUGS[@]}")
```

This is already populated from § 3.

#### Pass 2: count inbound references per slug

```bash
declare -A INBOUND_COUNT
for slug in "${ALL_SLUGS[@]}"; do
  INBOUND_COUNT["$slug"]=0
done

for entry in "${WIKI_ENTRIES[@]}"; do
  entry_slug=$(basename "$entry" .md)

  # Extract body (everything after the closing frontmatter ---)
  body=$(awk '/^---$/{n++; if(n==2){p=1; next}} p{print}' "$entry")

  # Find all [[slug]] references in this entry's body
  while IFS= read -r link_slug; do
    [ -z "$link_slug" ] && continue
    # Count this as an inbound reference for link_slug (from entry_slug)
    # Only count if link_slug is different from the entry itself
    if [ "$link_slug" != "$entry_slug" ] && [ -n "${INBOUND_COUNT[$link_slug]+_}" ]; then
      INBOUND_COUNT["$link_slug"]=$(( INBOUND_COUNT["$link_slug"] + 1 ))
    fi
  done < <(echo "$body" | grep -oE '\[\[[a-z0-9-]+\]\]' | sed 's/\[\[\(.*\)\]\]/\1/')
done
```

Build the orphan list (zero inbound references):

```bash
ORPHANS=()
for slug in "${ALL_SLUGS[@]}"; do
  if [ "${INBOUND_COUNT[$slug]}" -eq 0 ]; then
    ORPHANS+=("$slug")
  fi
done
```

Print findings:

```
=== Orphan findings (${#ORPHANS[@]}) — entries with zero inbound [[links]] ===
```

For each entry in `ORPHANS`, print one line: `  - <slug>`.

If `${#ORPHANS[@]} = 0`, print `  (none)`.

**Single-entry corpus note**: a corpus with exactly one entry always produces
one orphan (the only entry cannot link to itself). This is a true positive.
Document it in the log `Observation` field when it occurs.

### 7. Broken outbound link check

A broken outbound link is a `[[slug]]` reference in any entry's body where
`slug` does NOT match any existing entry's frontmatter `slug` field. This
finding type is separate from orphans — orphans have no INBOUND links; broken
outbound links reference slugs that DO NOT EXIST.

```bash
BROKEN_LINKS=()

for entry in "${WIKI_ENTRIES[@]}"; do
  entry_slug=$(basename "$entry" .md)
  body=$(awk '/^---$/{n++; if(n==2){p=1; next}} p{print}' "$entry")

  while IFS= read -r link_slug; do
    [ -z "$link_slug" ] && continue
    # Check if link_slug matches any known entry slug
    if [ -z "${ENTRY_SLUGS[$link_slug]+_}" ]; then
      BROKEN_LINKS+=("$entry_slug → [[$link_slug]] (no such entry)")
    fi
  done < <(echo "$body" | grep -oE '\[\[[a-z0-9-]+\]\]' | sed 's/\[\[\(.*\)\]\]/\1/')
done
```

Print findings:

```
=== Broken outbound link findings (${#BROKEN_LINKS[@]}) ===
```

For each finding in `BROKEN_LINKS`, print one line: `  - <source-slug> → [[<missing-slug>]] (no such entry)`.

If `${#BROKEN_LINKS[@]} = 0`, print `  (none)`.

See `context/rules/wiki.md` § 4 for the cross-link convention and grep
patterns that govern outbound link syntax (`\[\[[a-z0-9-]+\]\]`).

### 8. Contradiction detection (stub)

Contradiction detection is explicitly **descoped** for v1. The function prints
the following exact text and returns:

```
contradiction detection: not yet implemented — see wiki-lint follow-up tracking
```

A follow-up tracking issue may be filed post-merge but is not a pre-merge
blocker. Do not attempt any heuristic approximation of contradiction detection;
the stub text above is the complete implementation for v1.

### 9. README regeneration

Build the `wiki/README.md` entries table. Sort all entries by `updated:`
descending (most recently updated first).

#### 9a. Sort entries by updated date descending

```bash
SORTED_SLUGS=()
RANK_LINES=()
for slug in "${!ENTRY_UPDATED[@]}"; do
  updated="${ENTRY_UPDATED[$slug]:-0000-00-00}"
  RANK_LINES+=("$updated $slug")
done

while IFS= read -r line; do
  SORTED_SLUGS+=("${line#* }")
done < <(printf '%s\n' "${RANK_LINES[@]}" | sort -r)
```

#### 9b. Build the README content

The README file is owned and regenerated by `/wiki-lint`. The table header is
literal — the exact byte sequence matters for validation.

```bash
# Preserve the static preamble of wiki/README.md (lines before the Index table)
# The Index section starts at "## Index"
PREAMBLE=$(awk '/^## Index$/{exit} {print}' "$HARNESS/wiki/README.md")

NEW_README="$PREAMBLE"$'\n'
NEW_README+="## Index"$'\n\n'
NEW_README+="| Slug | Title | Tags | Updated |"$'\n'
NEW_README+="| --- | --- | --- | --- |"$'\n'

for slug in "${SORTED_SLUGS[@]}"; do
  title="${ENTRY_TITLES[$slug]:-}"
  tags="${ENTRY_TAGS[$slug]:-}"
  updated="${ENTRY_UPDATED[$slug]:-}"
  NEW_README+="| $slug | $title | $tags | $updated |"$'\n'
done
```

**Empty corpus**: if `$ENTRIES_COUNT = 0`, the table contains only the two
header lines and no data rows. This is NOT an error condition.

#### 9c. Atomic write or dry-run

In `--dry-run` mode, print the proposed content:

```
--- Proposed wiki/README.md (dry-run, not written) ---
<content>
--- end proposed wiki/README.md ---
```

In default (non-dry-run) mode, perform the **atomic write**:

```bash
TMP="$HARNESS/wiki/README.md.tmp"
FINAL="$HARNESS/wiki/README.md"

# Write to tmp
printf '%s' "$NEW_README" > "$TMP"

# Validate: non-empty AND contains the exact header line
if [ ! -s "$TMP" ]; then
  echo "ERROR: wiki/README.md.tmp is empty — aborting regeneration"
  rm -f "$TMP"
  exit 1
fi

if ! grep -qF '| Slug | Title | Tags | Updated |' "$TMP"; then
  echo "ERROR: wiki/README.md.tmp is missing the required header line — aborting regeneration"
  rm -f "$TMP"
  exit 1
fi

# Atomic rename on validation success
mv "$TMP" "$FINAL"
echo "wiki/README.md regenerated (${ENTRIES_COUNT} entries)"
```

**Atomic write protocol** (Critic-B mitigation):

1. Write to `wiki/README.md.tmp` first.
2. Validate the tmp file: it must be non-empty AND contain the exact header line
   `| Slug | Title | Tags | Updated |`.
3. On validation success: atomically rename `wiki/README.md.tmp` → `wiki/README.md`.
4. On validation failure: exit non-zero, leave the original `wiki/README.md`
   intact, print the failure reason, and remove the tmp file.

This protocol ensures that a partial write or generation failure never leaves
`wiki/README.md` in a corrupt or empty state.

### 10. Memory Improvement Protocol

Always run this step regardless of outcome, dry-run or not. Get the current
UTC time first:

```bash
date -u +%H:%M
TODAY=$(date -u +%Y-%m-%d)
mkdir -p "$HARNESS/memory/$TODAY"
```

Append to `memory/<UTC-date>/log.md`:

```markdown
## /wiki-lint -- HH:MM UTC
- **Result**: OP | DRY-RUN | FAIL
- **Entries-Scanned**: <count>
- **Stale-90d**: <count>
- **Deprecated**: <count>
- **Orphaned**: <count>
- **Broken-Links**: <count>
- **Mode**: op | dry-run
- **Observation**: <one sentence — key finding or "no findings on a fresh corpus">
```

Field definitions:

| Field | Content |
|-------|---------|
| `Entries-Scanned` | Total number of `wiki/*.md` files processed |
| `Stale-90d` | Count of entries with `updated:` > 90 days older than today |
| `Deprecated` | Count of entries with `confidence: deprecated` |
| `Orphaned` | Count of entries with zero inbound `[[links]]` |
| `Broken-Links` | Count of `[[slug]]` references with no matching entry |
| `Mode` | `op` for a normal run (README regenerated); `dry-run` if `--dry-run` was passed |
| `Result` | `OP` on success (including dry-run); `FAIL` if the skill errored out |
| `Observation` | One sentence — e.g., "1 orphan (single-entry corpus, true positive); no other findings" |

Then apply the qualify/improve loop per `context/rules/memory.md` § Write:

- Did any finding reveal a gap in the wiki schema or cross-link conventions?
- Did the atomic write step surface an edge case worth capturing?
- If yes, propose a `memory/MEMORY.md` addition.

See `context/rules/memory.md` for the canonical Memory Improvement Protocol.

## Extraction Command Reference

The canonical frontmatter extraction command, per `context/rules/wiki.md` § 6:

```bash
awk '/^---$/{f=!f; next} f{print}' wiki/<slug>.md
```

This MUST be the extraction method used in this skill. Deviation from the § 6
command is forbidden — both `/wiki-query` and `/wiki-lint` must use identical
extraction to prevent silent divergence (a match that works in one skill must
work in the other). Any future change to this extraction method requires
updating both skills atomically.

## Five Check Types — Summary

| # | Type | Finding trigger | Recommendation | Autonomously sets flag? |
|---|------|-----------------|---------------|------------------------|
| 1 | Stale-90d | `updated:` > 90 days older than today UTC | consider review | No |
| 2 | Deprecated | `confidence: deprecated` | consider archive or delete | No — report only |
| 3 | Orphan | zero inbound `[[slug]]` references | (informational; true positive even for single-entry corpus) | No |
| 4 | Broken outbound | `[[slug]]` in body where `slug` has no matching entry | (informational; fix by adding the entry or correcting the link) | No |
| 5 | Contradiction | descoped | n/a — stub only | n/a |

These five types are always reported separately. Types 1 and 2 (both related to
"staleness" in a loose sense) MUST NOT be conflated — they have distinct triggers
and distinct recommendations.

## Anti-Patterns

- **Conflating stale-90d with deprecated** — stale-90d triggers on age of `updated:`;
  deprecated triggers on the value of `confidence:`. An entry may be one, both, or
  neither. Always report them under separate headings.
- **Setting `confidence: deprecated` autonomously** — `/wiki-lint` is a reporter,
  not a writer. The `deprecated` flag is set MANUALLY by the orchestrator per
  `context/rules/wiki.md` § 5. If `/wiki-lint` sets this flag, it violates the
  confidence lifecycle.
- **Treating a single-entry orphan as a false positive** — a corpus with one entry
  always produces one orphan finding. This is correct behavior. Document it in the
  log Observation.
- **Conflating orphans with broken outbound links** — orphans have no INBOUND links
  (other entries don't reference them); broken outbound links reference slugs that
  DO NOT EXIST. They are separate checks with different remediation paths.
- **Non-atomic README write** — writing directly to `wiki/README.md` without the
  tmp → validate → rename protocol risks corruption. Always use the three-step
  atomic write in § 9c.
- **Grepping `wiki/README.md` for entries** — the README is the output of this
  skill, not its input. Always enumerate `wiki/*.md` directly.
- **Skipping the log** — every invocation (OP, DRY-RUN, FAIL) appends a log entry.
  No exceptions.
- **Hardcoding today's date** — always compute UTC date at runtime with
  `date -u +%Y-%m-%d`.

## See Also

- `context/rules/wiki.md` — the locked schema, § 4 (cross-link / orphan / broken-link
  definitions), § 5 (confidence lifecycle: who SETS vs REPORTS), § 6 (frontmatter
  extraction canonical command)
- `/wiki-ingest` — add or update an entry; the only authorized write path to `wiki/`
- `/wiki-query` — search the wiki by topic; shares the § 6 extraction command
- `context/rules/memory.md` — Memory Improvement Protocol (MIP) governing the log step
- `/context-audit` — reference for `--dry-run` flag pattern and atomic-write convention
