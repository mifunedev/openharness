# Wiki — Schema and Authoring Rules

The Open Harness wiki (`wiki/`) is a personal-scale knowledge base compiled and maintained by the orchestrator following the Karpathy LLM Wiki pattern. Entity pages hold **facts and synthesis** about recurring topics; they are loaded directly into context on demand (via `/wiki-query`) rather than retrieved through vector search.

`context/rules/wiki.md` is the sole schema document for `wiki/`. There is no `wiki/CLAUDE.md` — that would collide with the root `CLAUDE.md` symlink to `AGENTS.md`.

---

## 1. Boundary table

The sharp test: *Is this a fact or synthesis about a topic, intended to be read whole into agent context on demand?* If yes → wiki. Else use the surface below.

| Surface | Holds | Written by | When wiki wins instead |
| --- | --- | --- | --- |
| `context/rules/*.md` | Behavioral norms (prescriptive) | Deliberate orchestrator revision | Wiki holds **facts**, rules hold **how to behave** |
| `context/IDENTITY.md` | Cross-session operating principles | Orchestrator, deliberate | Wiki is codebase/domain knowledge; IDENTITY is "always do X" |
| `memory/MEMORY.md` | Distilled experiential lessons ("run on date X showed Y") | Orchestrator via `/retro` | Wiki entries are **reference**; memory is **journal** |
| `memory/<topic>.md` | Ad-hoc reference notes, no schema, no retrieval | Any session | Wiki wins after a note is re-derived twice and earns a schema |
| `docs/` (Docusaurus) | Human-facing prose | Orchestrator / contributors | Wiki is LLM-readable; docs are human-readable |
| `.claude/skills/*/SKILL.md` | Executable procedures | Orchestrator | Skills are *how to do*; wiki is *what is true* |
| `wiki/raw/` | Immutable source captures (snapshots of fetched pages, papers) | Skills writing snapshots only | Same surface; raw is upstream, wiki entries are synthesis |

---

## 2. Entry schema

Every wiki entry is a single markdown file at `wiki/<slug>.md` with YAML frontmatter followed by a three-section body.

### Frontmatter

```yaml
---
title: "GitHub Token Workflow Scope"
slug: gh-token-workflow-scope
tags: [git, github, auth, ci]
created: 2026-05-23
updated: 2026-05-23
sources:
  - raw/2026-05-23-github-docs-fine-grained-pat.md
  # aspirational: memory/MEMORY.md heading anchors are not stable today;
  # once MEMORY.md gains stable anchors, entries may cite them as:
  #   - memory/MEMORY.md#<anchor>
related: [github-auth-sandbox, ci-secrets-handling]
confidence: confirmed   # provisional | confirmed | deprecated
---
```

Field definitions:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | string | yes | Human-readable entry title |
| `slug` | string | yes | Matches filename without `.md`; charset `[a-z0-9-]+` |
| `tags` | list of strings | yes | Used by `/wiki-query` for frontmatter-only grep |
| `created` | date (YYYY-MM-DD) | yes | UTC date of initial creation; never updated |
| `updated` | date (YYYY-MM-DD) | yes | UTC date of most recent ingest/edit; always updated on write |
| `sources` | list of paths | yes | At least one `raw/<yyyy-mm-dd>-<slug>.md` snapshot path |
| `related` | list of slugs | no | Slugs of conceptually adjacent entries |
| `confidence` | enum | yes | `provisional` \| `confirmed` \| `deprecated` |

### Body layout

```markdown
# <Title matching frontmatter title>

## Summary
<2-3 sentence synthesis of the topic — what it is and why it matters>

## Detail
<Bounded prose, ≤ 600 words total for the entry. Factual, LLM-readable.>

## See Also
- [[related-slug-one]]
- [[related-slug-two]]
```

Sections must appear in this order: H1, `## Summary`, `## Detail`, `## See Also`. Every section must be present even if `## See Also` has no bullets yet (leave it empty rather than omitting it).

### Word cap and sub-articles

Every entry must be ≤ 600 words (title excluded, frontmatter excluded). When a topic overflows, split into sub-articles named `wiki/<parent>/<child>.md`. The parent entry becomes an index: its `## Detail` section lists child slugs as `[[parent/child]]` cross-links; each child carries its own frontmatter with its own `slug` (e.g., `gh-auth/sandbox`), `sources`, and `confidence`.

---

## 3. Slug derivation rule

Slugs are derived from the source URL or file path. Rules, in order:

1. **URL path — last non-UUID segment**: take the URL path, strip trailing slashes, split on `/`, take the last segment. If that segment is a UUID or a bare hash (matches `/^[0-9a-f-]{8,}$/i`), it is a UUID/gist ID — see rule 3.
   - Example: `https://example.com/foo/bar` → `bar`
   - Example: `https://docs.github.com/en/authentication/token-scopes` → `token-scopes`
2. **Lowercased kebab-case**: lowercase the segment; replace non-`[a-z0-9]` runs with a single `-`; strip leading/trailing `-`.
3. **Gist / UUID URLs**: if the last path segment is a UUID or hash (e.g., `https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f`), the segment contains no meaningful label. `/wiki-ingest` MUST require `--slug <override>` and exit with an error if it is absent.
   - Example: `/wiki-ingest https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f --slug karpathy-llm-wiki`
4. **Social / share URLs**: if the URL host is a known social platform (`linkedin.com`, `x.com`, `twitter.com`, `threads.net`, `facebook.com`, `instagram.com`), OR the last path segment contains a run of ≥ 10 consecutive digits (an embedded share/activity ID), OR the slugified segment would exceed 60 characters, the segment contains no meaningful label. `/wiki-ingest` MUST require `--slug <override>` and exit with an error if it is absent:
   ```
   ERROR: URL segment is a social/share URL with no meaningful label (social host, >=10-digit share/activity ID, or >60-char slug).
   Re-run with --slug <override>, e.g.:
     /wiki-ingest <url> --slug inspectable-agent-harness
   ```
5. **File paths**: use the basename without extension, slugified per rule 2. `--slug <override>` is optional; without it, the basename is used.
6. **Charset constraint**: the final slug MUST match `[a-z0-9-]+`. Any slug that does not pass this check is rejected by `/wiki-ingest` before any file is written.

---

## 4. Cross-link convention

Cross-links between wiki entries use Obsidian-style double-bracket syntax:

```markdown
- [[gh-token-workflow-scope]]
- [[github-auth-sandbox]]
```

Rules:

- The slug inside `[[...]]` MUST be a valid slug matching `[a-z0-9-]+` — no spaces, no uppercase, no special characters
- Cross-links appear in `## See Also` sections and may appear inline in `## Detail` prose
- `/wiki-lint` greps all entry bodies for outbound links using: `grep -roE '\[\[[a-z0-9-]+\]\]' wiki/`
- A link is **broken** if its slug does not match any existing `wiki/<slug>.md` frontmatter `slug` field
- A link is **orphaned** (from the target's perspective) if no other entry links to it — zero inbound `[[slug]]` references

Sub-article cross-links use the full path form: `[[parent/child]]`. The grep pattern for sub-articles extends to: `grep -roE '\[\[[a-z0-9/-]+\]\]' wiki/`.

---

## 5. Confidence lifecycle

The `confidence` field tracks the curation state of a wiki entry. Ownership is strictly defined:

| Value | Set by | Trigger |
| --- | --- | --- |
| `provisional` | `/wiki-ingest` | Automatically on entry creation |
| `confirmed` | Orchestrator, manually | After the orchestrator reviews and validates the entry's accuracy (e.g., via `Edit` tool) |
| `deprecated` | Orchestrator, manually | When the orchestrator judges the entry stale, superseded, or incorrect beyond update |

**`/wiki-lint` (US-004) REPORTS entries with `confidence: deprecated` but NEVER sets the flag.** The lint skill surfaces deprecated entries as a finding with recommendation "consider archive or delete" — action is always taken by the orchestrator, never autonomously.

Lifecycle flow:

```
[create via /wiki-ingest] → confidence: provisional
         ↓  (orchestrator reviews, confirms)
    confidence: confirmed
         ↓  (orchestrator judges stale/superseded)
    confidence: deprecated
         ↓  (orchestrator archives or deletes; no automation)
    [entry removed or moved to wiki/archive/<slug>.md]
```

The archive vs. delete decision for `deprecated` entries is not yet defined — defer to `context/rules/wiki.md` update after the first deprecation in practice.

---

## 6. Frontmatter extraction canonical command

Both `/wiki-query` (US-003) and `/wiki-lint` (US-004) MUST extract YAML frontmatter from a wiki entry using this exact command:

```bash
awk '/^---$/{f=!f; next} f{print}' wiki/<slug>.md
```

This pattern toggles a flag on each `---` delimiter and prints lines only while the flag is active (between the opening and closing `---`). It correctly handles:
- Frontmatter at the start of the file (opening `---` on line 1)
- Body content that contains `---` separators (the flag toggles off again)
- Files with no frontmatter (flag never activates; no output)

**Deviation from this canonical command is forbidden.** Both skills must use the identical extraction method to prevent silent divergence — a grep that works on one skill's output must work identically on the other's. Any future change to this extraction method requires updating both skills atomically.

Usage in practice:

```bash
# Extract frontmatter from a single entry
awk '/^---$/{f=!f; next} f{print}' wiki/gh-token-workflow-scope.md

# Extract and grep for a field
awk '/^---$/{f=!f; next} f{print}' wiki/gh-token-workflow-scope.md | grep '^tags:'

# Enumerate all entry slugs (for orphan check, broken-link check)
for f in wiki/*.md; do
  awk '/^---$/{f=!f; next} f{print}' "$f" | grep '^slug:'
done
```

---

## 6a. README index freshness

`wiki/README.md` is an owned generated index. Its table MUST match the current `wiki/*.md` entry frontmatter exactly: one row per entry slug (excluding `README.md`), row fields derived from `slug`, `title`, `tags`, and `updated`, sorted by `updated` descending with the same deterministic tie behavior as `/wiki-lint`.

The tier-A probe `evals/probes/wiki-readme-index.sh` is the drift guard. It reconstructs the expected table from the canonical § 6 frontmatter extraction and exits REGRESSION when the committed README has missing, extra, stale, or out-of-order rows. Any change to `/wiki-lint` index generation must keep that probe green.

---

## 7. Body-merge strategy for `/wiki-ingest` updates

When `/wiki-ingest` is invoked with a source whose derived slug matches an existing `wiki/<slug>.md`, the skill MUST update that entry using the following merge strategy — it MUST NOT create a duplicate entry, and it MUST NOT concatenate old and new bodies.

**Merge steps, in order:**

1. **Replace `## Summary`**: overwrite the entire `## Summary` section (from `## Summary` heading to the next `##` heading) with the new summary derived from the freshly-ingested source.

2. **Replace `## Detail`**: overwrite the entire `## Detail` section in-place with the new detail prose derived from the fresh source.

3. **Append to `sources:`**: append the new snapshot path (`raw/<yyyy-mm-dd>-<slug>.md`) to the `sources:` list in the frontmatter. Do NOT remove prior snapshot paths — every snapshot remains in the provenance trail.

4. **Append to `## See Also`** (deduplicated): extract `[[slug]]` candidates from the new source and append any that are not already present in `## See Also`. Do not remove existing cross-links.

5. **Update `updated:`**: set `updated:` in the frontmatter to today's date (UTC, `date -u +%Y-%m-%d`).

6. **Do NOT touch `created:`**: the `created:` field is immutable after initial entry creation. `/wiki-ingest` must skip it during updates.

7. **Do NOT concatenate bodies**: the prior `## Summary` and `## Detail` content is replaced, not concatenated. The entry stays ≤ 600 words.

**Rationale**: bodies grow unbounded if concatenated across multiple ingests, eventually exceeding the 600-word cap and diluting the entry's utility. The replace-in-place strategy keeps entries fresh and bounded while the `sources:` list preserves the full provenance trail.
