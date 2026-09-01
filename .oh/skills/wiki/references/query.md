# /wiki query — reference

> Full procedure for the `query` subcommand of the `/wiki` dispatcher. The
> dispatcher (`.oh/skills/wiki/SKILL.md`) routes here when the first
> `$ARGUMENTS` token is `query`. Canonical schema:
> `.oh/skills/wiki/references/schema.md`.

# Knowledge Query

Search the knowledge base by topic keyword(s) and load the top matching entries
directly into context. This is Karpathy's "Query + Enhance" operation adapted for
Open Harness: grep frontmatter, rank, read into context.

Query scope is **frontmatter-only** (`title`, `slug`, `tags`). Body text is
deliberately excluded — the frontmatter fields capture the entry's identity
precisely; including body text would make match semantics unpredictable and slow
as the knowledge base grows.

## The tracked boundary

`query` reads **tracked shared knowledge only**:

```text
.oh/knowledge/source/*.md      kind: repo | external
.oh/knowledge/patterns/*.md    kind: pattern
```

It does **not** read `.oh/knowledge/local/`. That directory is gitignored
per-machine scratch, and there is no flag that folds it into a result set. A
plan grounded in a page only one machine can see is a plan nobody else can
reproduce, which is the failure this boundary exists to prevent. To make a local
page usable, promote it through the one authorized write path:

```bash
/wiki ingest .oh/knowledge/local/<slug>.md --slug <slug>
```

`raw/` is not queried either — snapshots are provenance for the entity pages that
cite them, not results.

## When to Use

- `/wiki query <topic>` when a session needs to recall previously-compiled
  knowledge about a recurring topic (tools, integrations, constraints, key
  concepts).
- **Before re-deriving something from scratch** — check the knowledge base first.
  `/spec plan`'s recall step is exactly this call.
- After `/wiki ingest` lands a new entry, to verify it is queryable.

## When NOT to Use

- **`/wiki ingest`** — to add or update an entry. `query` is read-only.
- **`/wiki lint`** — to health-check the knowledge base or regenerate the index.
- **Direct `grep`** — for full-text search including body prose. This subcommand
  is intentionally frontmatter-only.
- **As authority.** A page is orientation. Re-ground its material claims against
  the sources it cites before relying on them (`schema.md` preamble).

## Argument Interface (locked)

```
/wiki query <topic> [--patterns]
```

`<topic>` is one or more whitespace-separated words. The interface is locked to
`<topic>` plus the `--patterns` flag; adding further flags or positional
arguments requires editing this reference and
`.oh/evals/probes/wiki-query-pattern-isolation.sh`.

## Two disjoint modes

The directory split (`schema.md` § 2) separates entity pages from pattern pages.
The two modes never mix.

| Mode | Reads | Returns | Read cap | Ranking |
|------|-------|---------|----------|---------|
| default | `.oh/knowledge/source/*.md` | `kind: repo` and `kind: external` | 3 | `updated:` descending |
| `--patterns` | `.oh/knowledge/patterns/*.md` | `kind: pattern` only | **5** | term-hit count descending, `updated:` descending as tiebreak |

There is deliberately **no `--all` mode**. The evidence this split comes from
(`[[wikiskill-experience-compilation]]`) measured the mixed configuration as
worst-of-both: the proposer-only setting scored 63.7 while giving both roles the
same view scored 60.9. Two disjoint modes make the asymmetry the path of least
resistance.

This is a **default, not a boundary**. Any session can read a pattern file
directly; nothing prevents it. The flag keeps patterns out of ordinary results,
which is what the measurement supports — do not describe it as isolation.

**The planner/executor asymmetry.** `/spec plan` queries both modes: patterns
inform proposal and design. `/spec execute` consumes the approved PRD's
`## Knowledge Context` and re-reads the authoritative sources it names; it does
not load the pattern set unless the task turns into replanning.

## Multi-Word OR Semantics

`<topic>` is **split on whitespace** into individual terms. An entry matches if
**ANY** term appears in the frontmatter `title`, `slug`, or `tags` fields (union
of per-term matches, deduplicated). This is OR semantics, not AND.

```
/wiki query github auth
```

matches entries containing `github` OR `auth` in their frontmatter — not only
entries containing both.

Rationale: OR semantics maximize recall on a small corpus. The read cap
constrains how much context is loaded regardless of match count.

## Instructions

### 1. Parse the topic argument and mode

```bash
ARGUMENTS="${ARGUMENTS:-}"
KNOWLEDGE=.oh/knowledge
DIR="$KNOWLEDGE/source"
CAP=3
if echo "$ARGUMENTS" | grep -q -- '--patterns'; then
  DIR="$KNOWLEDGE/patterns"
  CAP=5
fi
TOPIC=$(echo "$ARGUMENTS" | sed 's/--patterns//g' | xargs)
```

Split `$TOPIC` on whitespace to produce an array of search terms. An empty
`$TOPIC` after stripping the flag is a usage error: print the `argument-hint`
line and exit 0.

### 2. Collect entry paths

```bash
ENTRIES=()
for f in "$DIR"/*.md; do
  [ -f "$f" ] || continue
  [ "$(basename "$f")" = "README.md" ] && continue
  ENTRIES+=("$f")
done
```

This enumerates the mode's directory directly — NOT via `.oh/knowledge/README.md`
(the README is a human-orientation index regenerated by `/wiki lint`, not a query
backend). The glob is flat and does not descend, which is why `schema.md` § 2
forbids sub-directories.

If no entries exist, jump to step 5 (empty result).

### 3. Grep frontmatter for each term — OR semantics

Extract each entry's frontmatter with the canonical command locked in
`schema.md` § 9, then grep the extracted block for the topic terms. The directory
already selected the kind, so no `kind:` filter is needed; the number of matching
terms is counted for ranking.

```bash
MATCHES=()
declare -A HITS
for entry in "${ENTRIES[@]}"; do
  frontmatter=$(awk '/^---$/{f=!f; next} f{print}' "$entry")
  hits=0
  for term in $TOPIC; do
    if echo "$frontmatter" | grep -qi -- "$term"; then
      hits=$((hits + 1))
    fi
  done
  if [ "$hits" -gt 0 ]; then
    MATCHES+=("$entry")
    HITS["$entry"]=$hits
  fi
done
```

The grep targets the full extracted frontmatter block — which contains `title:`,
`slug:`, and `tags:` — so all three fields are searched in one pass,
case-insensitively.

### 4. Print all matching paths to stdout

```bash
for m in "${MATCHES[@]}"; do
  echo "$m"
done
```

### 5. Handle empty results

If `${#MATCHES[@]} -eq 0`:

```bash
echo "No knowledge entries matched $TOPIC"
exit 0
```

This is NOT an error condition. Exit status 0 is correct; an empty knowledge base
or a genuinely absent topic is a normal outcome.

### 6. Rank matches

Sort the match list before reading. In `--patterns` mode `updated:` is the
**tiebreak**, not the primary key: entries rank by how many topic terms they
matched, descending, and only then by recency.

```bash
RANKED=()
for m in "${MATCHES[@]}"; do
  updated=$(awk '/^---$/{f=!f; next} f{print}' "$m" | grep '^updated:' | awk '{print $2}')
  if [ "$CAP" = 5 ]; then
    RANKED+=("$(printf '%03d' "${HITS[$m]}") $updated $m")
  else
    RANKED+=("000 $updated $m")
  fi
done

SORTED_PATHS=()
while IFS= read -r line; do
  rest="${line#* }"                # drop hit count
  SORTED_PATHS+=("${rest#* }")     # drop updated date
done < <(printf '%s\n' "${RANKED[@]}" | sort -r)
```

Default mode pins every hit count to `000`, so the sort reduces to `updated:`
descending.

**Why ranking exists in `--patterns` mode only.** Pattern pages accumulate
monotonically and are never pruned, so a recency-only order degenerates into
"most recently compiled" — the wrong bias for a proposer that needs the
*relevant* failure mode, not the newest one. Entity pages have a natural refresh
cycle through re-ingest, so their recency ordering still carries signal.

**Honest caveat.** At roughly one pattern per merged skill change, the pattern
layer will hold single digits of pages for months. The cap-5-plus-hit-ranking is
cheap insurance against a flood that is not yet happening, not a fix for a live
problem. Do not add scoring beyond this — no term frequency, no TF-IDF, no
embeddings.

An entry with no `updated:` field sorts to the bottom; `/wiki lint` reports it as
a schema finding.

### 7. Apply the read cap

The cap is set by the mode in step 1: **3** for the default entity mode and **5**
for `--patterns`. Neither is configurable by a further flag; changing either
requires editing this reference and its probe.

```bash
MATCH_COUNT=${#SORTED_PATHS[@]}
if [ "$MATCH_COUNT" -lt "$CAP" ]; then
  READ_PATHS=("${SORTED_PATHS[@]}")
else
  READ_PATHS=("${SORTED_PATHS[@]:0:$CAP}")
fi
```

| `Match-Count` | Behavior |
|---------------|----------|
| 0 | Print empty-result message; exit 0; read nothing |
| below `$CAP` | Read ALL matches into context |
| at or above `$CAP` | Read the top `$CAP` by the mode's ranking; skip the rest |

### 8. Read matched entries into context

Read each path in `READ_PATHS` whole. Each file is read directly — not routed via
`.oh/knowledge/README.md`.

After reading, summarize what was loaded: the slugs read, the total match count,
and how many were skipped above the cap. A caller recording `## Knowledge
Context` in a PRD lists exactly those slugs.

## Extraction Command Reference

The canonical frontmatter extraction command, per `schema.md` § 9:

```bash
awk '/^---$/{f=!f; next} f{print}' .oh/knowledge/source/<slug>.md
```

This MUST be the extraction method used here. Deviation is forbidden — `query`,
`lint`, and `knowledge-impact.sh` must extract identically or a match that works
in one will not work in another.

## Anti-Patterns

- **Reading `.oh/knowledge/local/`** — it is per-machine scratch and no query
  path reads it. Promote through `/wiki ingest` instead.
- **Grepping the full file** — searching body text produces false positives from
  prose mentions. Always extract frontmatter first, then grep the extracted
  output.
- **Routing through `.oh/knowledge/README.md`** — the README is a generated
  human-orientation index. Its table format is not a stable query backend; use
  direct file enumeration.
- **AND semantics for multi-word topics** — requiring all terms reduces recall
  inappropriately on a small corpus. Use OR.
- **Treating an empty result as an error** — a zero match count is a normal
  outcome on a young knowledge base. Print the message, exit 0.
- **Hard-coding today's date** in a glob or path — always compute UTC at runtime.
- **Writing a run log** — there is no log tier. Summarize the slugs read, the
  match count, and the skipped count to the terminal, and stop.
- **Mixing kinds in one result set** — there is no `--all`. Pattern pages and
  entity pages answer different questions for different roles, and the
  measurement behind the split scored the mixed configuration worst-of-both.
- **Ranking patterns by recency alone** — patterns are never pruned, so recency
  ordering degenerates into "most recently compiled". Rank by term-hit count
  first.
- **Treating a returned page as authority** — re-ground its material claims
  against the sources it cites. The repository outranks the page.

## See Also

- `.oh/skills/wiki/references/schema.md` — the locked schema: § 2 (layout and the
  tracked boundary), § 3 (entry schema), § 7 (cross-links), § 9 (extraction)
- `/wiki ingest` — add or update an entity page
- `/wiki compile` — create or patch a `kind: pattern` page from a `/retro` report
- `/wiki lint` — health-check the knowledge base and regenerate the index
- `.oh/evals/probes/wiki-query-pattern-isolation.sh` — the guard on the mode split
- `.oh/evals/probes/knowledge-tracked-query-boundary.sh` — the guard on the
  tracked/local boundary
