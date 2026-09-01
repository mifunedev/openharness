# /wiki lint — reference

> Full procedure for the `lint` subcommand of the `/wiki` dispatcher. The
> dispatcher (`.oh/skills/wiki/SKILL.md`) routes here when the first
> `$ARGUMENTS` token is `lint`. Canonical schema:
> `.oh/skills/wiki/references/schema.md`.

# Knowledge Lint

Health-check `.oh/knowledge/` and regenerate `.oh/knowledge/README.md`.

**Every check here is a correctness check.** A lint finding names something that
is actually wrong: a page that violates the schema, a source path that does not
resolve, a page whose declared dependencies moved under it, a link that goes
nowhere, or an index that no longer matches its inputs. Nothing in this list is a
matter of taste, and nothing reports a page for being unpopular or old.

The canonical schema, extraction command, cross-link convention, provenance
forms, and confidence lifecycle all live in
`.oh/skills/wiki/references/schema.md`. This reference defers to those rules — it
does not redefine them.

## Why this list is short

A health check nobody gates on converges on never being run
(`[[pattern-wiki-ungated-check-drift]]`). Each surviving check below therefore
has a deterministic oracle in `.oh/evals/probes/` that fails on the *finding*,
not on the check having been run. This document is the procedure; the probes are
the enforcement:

| Check | Oracle |
|---|---|
| 1 · schema validity | `.oh/evals/probes/wiki-kind-schema-contract.sh` |
| 2 · source/dependency paths resolve | `.oh/evals/probes/knowledge-source-freshness.sh` |
| 3 · source-change freshness | `.oh/evals/probes/knowledge-source-freshness.sh` |
| 4 · broken `[[...]]` links | `.oh/evals/probes/wiki-related-slugs.sh` |
| 5 · broken `related:` slugs | `.oh/evals/probes/wiki-related-slugs.sh` |
| 6 · generated index consistency | `.oh/evals/probes/wiki-readme-index.sh` |

## What this check list deliberately dropped

- **Orphan detection.** A queryable page with zero inbound `[[slug]]` references
  is perfectly valid in a knowledge base this size. Reporting it as a health
  finding produced a permanent non-zero count that readers learned to skip,
  which cost the checks that mean something.
- **The 90-day stale rule as a validity test.** Age does not decide validity: a
  page updated today is wrong one commit later if a source it depends on moved,
  and a page untouched for a year is correct if nothing it cites changed. Check 3
  replaces it. Age survives only as the informational `last-reviewed` line.
- **The contradiction-detection stub.** It printed a fixed "not yet implemented"
  string for the whole of its life and detected nothing.

## When to Use

- `/wiki lint` to regenerate `.oh/knowledge/README.md` and surface findings.
- `/wiki lint --dry-run` to preview without writing.
- After `/wiki ingest` or `/wiki compile` lands a page, so the index matches.

## When NOT to Use

- **`/wiki ingest`** — to add or update an entry. `lint` is read-only except for
  `.oh/knowledge/README.md`.
- **`/wiki query`** — to search and read entries into context.
- **Direct `Edit` on `.oh/knowledge/README.md`** — `lint` owns that file; hand
  edits are overwritten on the next run.

## Argument Interface (locked)

```
/wiki lint [--dry-run]
```

- **No arguments**: run all checks, atomically regenerate the index.
- **`--dry-run`**: run all checks, print the proposed index, write nothing.

## Instructions

### 1. Parse arguments

```bash
ARGUMENTS="${ARGUMENTS:-}"
DRY_RUN=false
if echo "$ARGUMENTS" | grep -q -- '--dry-run'; then
  DRY_RUN=true
fi
```

Every write is gated on `DRY_RUN=false`.

### 2. Collect entry paths

```bash
ROOT="${AUDIT_ROOT:-$(git rev-parse --show-toplevel)}"
ROOT=$(cd "$ROOT" && pwd -P)
KNOWLEDGE="$ROOT/.oh/knowledge"

ENTRIES=()
for f in "$KNOWLEDGE"/source/*.md "$KNOWLEDGE"/patterns/*.md; do
  [ -f "$f" ] || continue
  [ "$(basename "$f")" = "README.md" ] && continue
  ENTRIES+=("$f")
done
ENTRIES_COUNT=${#ENTRIES[@]}
```

**One entry set.** `.oh/knowledge/source/` and `.oh/knowledge/patterns/` are
tracked by default (`schema.md` § 2), so the working tree and the git-tracked set
are the same set. The dual-set split that older versions of this procedure
carried — health checks over the working tree, index over the tracked set —
existed only because entries were gitignored-by-default, and it went away with
that rule. `.oh/knowledge/local/` is never enumerated.

If `$ENTRIES_COUNT = 0`, skip to § 9 (index regeneration with an empty base).

### 3. Extract frontmatter

For every entry, extract frontmatter with the canonical command in
`schema.md` § 9:

```bash
awk '/^---$/{f=!f; next} f{print}' <entry>
```

Build a lookup table of slug → fields:

```bash
declare -A ENTRY_PATH ENTRY_TITLE ENTRY_TAGS ENTRY_UPDATED ENTRY_KIND
declare -A ENTRY_CONFIDENCE ENTRY_VERIFIED

for entry in "${ENTRIES[@]}"; do
  fm=$(awk '/^---$/{f=!f; next} f{print}' "$entry")
  slug=$(grep '^slug:' <<<"$fm" | awk '{print $2}' | head -1)
  [ -z "$slug" ] && continue        # § 4 reports it as a schema failure
  ENTRY_PATH["$slug"]="$entry"
  ENTRY_TITLE["$slug"]=$(grep '^title:' <<<"$fm" | sed 's/^title: *//' | tr -d '"')
  ENTRY_TAGS["$slug"]=$(grep '^tags:' <<<"$fm" | sed 's/^tags: *//')
  ENTRY_UPDATED["$slug"]=$(grep '^updated:' <<<"$fm" | awk '{print $2}')
  ENTRY_KIND["$slug"]=$(grep '^kind:' <<<"$fm" | awk '{print $2}' | head -1)
  ENTRY_CONFIDENCE["$slug"]=$(grep '^confidence:' <<<"$fm" | awk '{print $2}')
  ENTRY_VERIFIED["$slug"]=$(grep '^verified_at:' <<<"$fm" | awk '{print $2}' | head -1)
done
```

Deviation from the § 9 command is forbidden — `query`, `lint`, and
`knowledge-impact.sh` must extract identically.

### 4. Check 1 — schema validity

For every entry file, report a finding when any of these holds:

- a required field is missing: `title`, `slug`, `tags`, `created`, `updated`,
  `sources`, `confidence`;
- `slug` does not match the filename without `.md`, or does not match
  `[a-z0-9-]+`;
- `kind` is absent or is not one of `repo`, `external`, `pattern`;
- `kind` disagrees with the directory: a `patterns/` file whose `kind` is not
  `pattern`, or a `source/` file whose `kind` is not `repo` or `external`;
- a `patterns/` filename lacks the `pattern-` prefix, or a `source/` filename
  carries it;
- `confidence` is not one of `provisional`, `confirmed`, `deprecated`;
- `kind: repo` with no `verified_at:`;
- `kind: repo` or `kind: pattern` with no `## Relevant Source Files` section.

```
=== Schema findings (<n>) — the entry violates schema.md ===
  - <path>: <what is wrong>
```

Report-only. `lint` never edits frontmatter and never sets `confidence`
(`schema.md` § 8).

### 5. Check 2 — source and dependency paths resolve

Every `sources:` entry must resolve to something real, in the form
`schema.md` § 4 defines for it:

| Form | Resolves when |
|---|---|
| `raw/<yyyy-mm-dd>-<slug>.md` | `.oh/knowledge/raw/<...>` exists (resolved from `.oh/knowledge/`, not the page's directory) |
| `<repo-relative-path>` or glob | at least one path in the working tree matches |
| `<repo-relative-path>@<short-sha>` | the content exists at that revision — see the rename note below |
| `https://<...>` | never checked locally; the weakest form (`schema.md` § 4) |

A pin names a revision of the file's **content**, so a path that has moved since
`<sha>` must not read as broken. Try the exact path first, then fall back to the
basename in that commit's tree:

```bash
if ! git cat-file -e "${sha}:${path}" 2>/dev/null; then
  tree="$(git ls-tree -r --name-only "$sha" 2>/dev/null || true)"
  grep -qE "(^|/)$(basename "$path")\$" <<<"$tree" \
    || echo "  - $slug: pinned source $path@$sha does not resolve"
fi
```

Capture the tree before matching. A `git ls-tree | grep -q` pipeline SIGPIPEs
`git` the moment `grep` finds its match, and under `pipefail` that turns a
successful match into a failed pipeline.

A page whose only unresolved source is a path that has since been deleted is
repaired by pinning it (`<path>@<sha>`), not by deleting the citation — the
evidence still exists in history.

Also report `kind: repo` pages whose `sources:` list holds **no** live
repository path: there is nothing for check 3 to verify them against.

```
=== Source-path findings (<n>) — a declared source does not resolve ===
```

### 6. Check 3 — source-change freshness (`needs-review`)

Do not reimplement this. Call the one implementation:

```bash
bash .oh/skills/wiki/scripts/knowledge-impact.sh --verified
```

Every `NEEDS-REVIEW` row is a finding: a `kind: repo` page whose declared
dependencies changed after its `verified_at` commit. Print the rows verbatim —
each names the page and the specific sources that moved.

```
=== Freshness findings (<n>) — declared sources changed since verified_at ===
  - <slug>: <sources that moved> (verified_at <short-sha>)
```

Remediation is to re-read the page against those sources and then either correct
it or, if it is still accurate, advance `verified_at:` to the current commit.
Advancing the pin without re-reading is the one thing this check cannot detect,
and the reason it is a report rather than an automatic bump.

`kind: external` and `kind: pattern` pages report `NOT-APPLICABLE` — their
provenance is immutable, so freshness does not apply.

### 7. Check 4 — broken outbound `[[...]]` links

A broken outbound link is a `[[slug]]` reference in any entry body whose slug
matches no entry's frontmatter `slug` in either directory. The slug namespace is
flat and links cross `source/` and `patterns/` freely.

A `[[slug]]` inside a code span or a fenced block is a **mention**, not a link —
schema prose and pattern pages both show the syntax literally. Strip fences and
inline code spans before extracting, or every document that explains the
convention becomes a finding.

```bash
BROKEN_LINKS=()
for entry in "${ENTRIES[@]}"; do
  entry_slug=$(basename "$entry" .md)
  body=$(awk '/^---$/{n++; if(n==2){p=1; next}} p{print}' "$entry" \
         | awk '/^```/{f=!f; next} !f' \
         | sed 's/`[^`]*`//g')
  while IFS= read -r link_slug; do
    [ -z "$link_slug" ] && continue
    if [ -z "${ENTRY_PATH[$link_slug]+_}" ]; then
      BROKEN_LINKS+=("$entry_slug → [[$link_slug]] (no such entry)")
    fi
  done < <(grep -oE '\[\[[a-z0-9-]+\]\]' <<<"$body" | sed 's/\[\[\(.*\)\]\]/\1/')
done
```

```
=== Broken outbound link findings (<n>) ===
```

### 8. Check 5 — broken `related:` slugs

A broken related-slug is an entry whose `related:` frontmatter names a slug with
no matching entry. This is distinct from check 4: a `[[slug]]` body link is a
navigational claim, a `related:` slug is a frontmatter adjacency claim. They fail
for different reasons and are remediated differently, so they are counted
separately.

```bash
RELATED_BROKEN=()
for slug in "${!ENTRY_PATH[@]}"; do
  fm=$(awk '/^---$/{f=!f; next} f{print}' "${ENTRY_PATH[$slug]}")
  rel=$(grep '^related:' <<<"$fm" | sed 's/^related: *//; s/[][]//g; s/,/ /g')
  for r in $rel; do
    [ -z "$r" ] && continue
    [ -z "${ENTRY_PATH[$r]+_}" ] && RELATED_BROKEN+=("$slug → related: $r (no such entry)")
  done
done
```

```
=== Broken related-slug findings (<n>) ===
```

Report-only. The orchestrator decides whether to repoint the slug or author the
missing entry.

### 9. Check 6 — regenerate the index

`.oh/knowledge/README.md` is generated state owned by this subcommand.

#### 9a. Sort by `updated:` descending

```bash
RANK_LINES=()
for slug in "${!ENTRY_PATH[@]}"; do
  RANK_LINES+=("${ENTRY_UPDATED[$slug]:-0000-00-00} $slug")
done
SORTED_SLUGS=()
while IFS= read -r line; do
  SORTED_SLUGS+=("${line#* }")
done < <(printf '%s\n' "${RANK_LINES[@]}" | sort -r)
```

The domain is every entry in `source/` and `patterns/`. It matches
`.oh/evals/probes/wiki-readme-index.sh` exactly; the two must never diverge.

#### 9b. Build the content

The table header is literal — the exact byte sequence matters for validation.

```bash
PREAMBLE=$(awk '/^## Index$/{exit} {print}' "$KNOWLEDGE/README.md")

NEW_README="$PREAMBLE"$'\n'
NEW_README+="## Index"$'\n\n'
NEW_README+="| Slug | Title | Tags | Updated |"$'\n'
NEW_README+="| --- | --- | --- | --- |"$'\n'
for slug in "${SORTED_SLUGS[@]}"; do
  NEW_README+="| $slug | ${ENTRY_TITLE[$slug]:-} | ${ENTRY_TAGS[$slug]:-} | ${ENTRY_UPDATED[$slug]:-} |"$'\n'
done
```

**Empty base**: the table contains only the two header lines. Not an error.

#### 9c. Atomic write or dry-run

In `--dry-run`, print the proposed content between
`--- Proposed .oh/knowledge/README.md (dry-run, not written) ---` and
`--- end proposed .oh/knowledge/README.md ---`.

Otherwise write atomically:

```bash
TMP="$KNOWLEDGE/README.md.tmp"
FINAL="$KNOWLEDGE/README.md"
printf '%s' "$NEW_README" > "$TMP"
[ -s "$TMP" ] || { echo "ERROR: proposed index is empty — aborting"; rm -f "$TMP"; exit 1; }
grep -qF '| Slug | Title | Tags | Updated |' "$TMP" \
  || { echo "ERROR: proposed index is missing the header line — aborting"; rm -f "$TMP"; exit 1; }
mv "$TMP" "$FINAL"
echo ".oh/knowledge/README.md regenerated (${ENTRIES_COUNT} entries)"
```

Write to tmp → validate non-empty and header present → atomic rename. On
validation failure the original stays intact, the reason is printed, and the tmp
file is removed. A partial write never leaves the index corrupt.

Verify:

```bash
bash .oh/evals/probes/wiki-readme-index.sh
```

### 10. Informational telemetry (decides nothing)

After the findings, print one line of context. It is not a check and no gate
reads it:

```
last-reviewed: <n> entries, oldest <slug> (<updated>, <N>d), <k> deprecated
```

Age answers "when did a human last look at this", which is worth knowing and is
not a validity claim. Validity is check 3.

## Six checks — summary

| # | Check | Finding trigger | Sets anything? |
|---|-------|-----------------|----------------|
| 1 | Schema validity | missing/invalid field, kind-directory disagreement, filename mismatch | No |
| 2 | Source paths resolve | a `sources:` entry names nothing that exists at the form it declares | No |
| 3 | Source-change freshness | a declared repository source changed after `verified_at` | No |
| 4 | Broken outbound link | `[[slug]]` with no matching entry | No |
| 5 | Broken `related:` slug | `related:` slug with no matching entry | No |
| 6 | Index consistency | the generated table does not match current frontmatter | Yes — rewrites the index |

Check 6 is the only writer. Everything else reports.

## Anti-Patterns

- **Reintroducing orphan detection as a failure** — inbound-link count is not a
  health signal (`schema.md` § 7). If a page is genuinely unreachable, the fix is
  a link from a page that should have had one, not a report row.
- **Deciding validity from `updated:`** — age is telemetry. Check 3 decides.
- **Reimplementing freshness** — `knowledge-impact.sh` is the one implementation,
  and `/spec execute` calls the same script. A second copy will disagree with it.
- **Advancing `verified_at:` to silence check 3** — the pin means "the claims
  were re-read against these sources at this commit". Moving it without reading
  launders staleness into freshness.
- **Setting `confidence: deprecated` autonomously** — the flag is set manually by
  the orchestrator (`schema.md` § 8).
- **Conflating broken `related:` slugs with broken `[[slug]]` body links** — a
  frontmatter adjacency claim and a navigational link are distinct checks with
  distinct remediation.
- **Non-atomic index write** — always use the tmp → validate → rename protocol.
- **Grepping `.oh/knowledge/README.md` for entries** — the README is this
  subcommand's output, not its input. Enumerate the directories.
- **Writing a run log** — there is no log tier. Report the findings and the
  result to the terminal.
- **Hardcoding today's date** — compute UTC at runtime with `date -u +%Y-%m-%d`.

## See Also

- `.oh/skills/wiki/references/schema.md` — § 2 layout and the tracked boundary,
  § 4 provenance forms, § 5 freshness, § 7 cross-links, § 8 confidence,
  § 9 extraction, § 10 index freshness
- `.oh/skills/wiki/scripts/knowledge-impact.sh` — the one freshness implementation
- `/wiki ingest` — the authorized write path for entity pages
- `/wiki query` — the read path; shares the § 9 extraction command
