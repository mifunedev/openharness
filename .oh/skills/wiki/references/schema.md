# Wiki — Schema and Authoring Rules

The Open Harness wiki (`.oh/skills/wiki/corpus/`) is a personal-scale knowledge base compiled and maintained by the orchestrator. Its target quality bar is architecture-first pages that explain source-backed system relationships, not loose notes. Entity pages hold **facts and synthesis** about recurring topics; they are loaded directly into context on demand (via `/wiki query`) rather than retrieved through vector search.

`.oh/skills/wiki/references/schema.md` is the sole schema document for `.oh/skills/wiki/corpus/`. There is no `.oh/skills/wiki/corpus/CLAUDE.md` — that would collide with the root `CLAUDE.md` symlink to `AGENTS.md`.

---

## 1. Boundary table

The sharp test: *Is this a fact or synthesis about a topic, intended to be read whole into agent context on demand?* If yes → wiki. Else use the surface below.

| Surface | Holds | Written by | When wiki wins instead |
| --- | --- | --- | --- |
| `.oh/skills/*/SKILL.md` | Behavioral norms (prescriptive) | Deliberate orchestrator revision | Wiki holds **facts**, skills hold **how to behave**. A `kind: pattern` entry sits closest to this line: it records that a workaround *worked*, which is evidence; the skill records that the workaround *must be applied*, which is a norm. When a pattern's workaround becomes a rule, it is promoted into a skill and the pattern stays as the evidence for it |
| `docs/` | Human-facing prose | Orchestrator / contributors | Wiki is LLM-readable; docs are human-readable |
| `.claude/skills/*/SKILL.md` | Executable procedures | Orchestrator | Skills are *how to do*; wiki is *what is true* |
| `.oh/skills/wiki/corpus/raw/` | Immutable source captures (snapshots of fetched pages, papers) | Skills writing snapshots only | Same surface; raw is upstream, wiki entries are synthesis |

---

## 2. Entry schema

Every wiki entry is a single markdown file at `.oh/skills/wiki/corpus/<slug>.md` with YAML frontmatter followed by a bounded, source-backed body. The minimum body is three sections; architecture and harness-mechanism entries use the source-backed expansion below.

### Frontmatter

```yaml
---
title: "GitHub Token Workflow Scope"
slug: gh-token-workflow-scope
kind: source          # source | pattern; absent means source
tags: [git, github, auth, ci]
created: 2026-05-23
updated: 2026-05-23
sources:
  - raw/2026-05-23-github-docs-fine-grained-pat.md
related: [github-auth-sandbox, ci-secrets-handling]
confidence: confirmed   # provisional | confirmed | deprecated
---
```

Field definitions:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | string | yes | Human-readable entry title |
| `slug` | string | yes | Matches filename without `.md`; charset `[a-z0-9-]+` |
| `kind` | enum | no | `source` \| `pattern`. **An absent `kind:` field means `kind: source`.** Set to `pattern` only by `/wiki compile` |
| `tags` | list of strings | yes | Used by `/wiki query` for frontmatter-only grep |
| `created` | date (YYYY-MM-DD) | yes | UTC date of initial creation; never updated |
| `updated` | date (YYYY-MM-DD) | yes | UTC date of most recent ingest/edit; always updated on write |
| `sources` | list of paths | yes | At least one `raw/<yyyy-mm-dd>-<slug>.md` snapshot path |
| `related` | list of slugs | no | Slugs of conceptually adjacent entries |
| `confidence` | enum | yes | `provisional` \| `confirmed` \| `deprecated` |

### Entry kinds

The corpus holds two kinds of entry, distinguished by `kind:`.

| `kind` | Holds | Written by | Read by |
| --- | --- | --- | --- |
| `source` | Facts and synthesis about an external topic, backed by a `raw/` snapshot | `/wiki ingest` | any session, via `/wiki query <topic>` |
| `pattern` | A failure mode or successful strategy observed in this harness's own runs, with an actionable workaround | `/wiki compile` | the proposer role, via `/wiki query <topic> --patterns` |

**Back-compatibility.** `kind` is the only optional-with-default field in this
schema. Every entry authored before the field existed is a `source` entry, and none
require editing. `/wiki ingest` MAY emit `kind: source` explicitly on new source
pages but is not required to. **Consumers that filter on `kind` MUST apply the
default: read the field, and treat empty as `source`.**

**Pattern placement.** `kind: pattern` entries are flat files at
`.oh/skills/wiki/corpus/pattern-<subsystem>-<short-name>.md` — never in a
subdirectory. The `corpus/*.md` glob used by `/wiki query` and `/wiki lint` does not
descend, so a pattern in a subdirectory would be invisible to both while still
visible to `.oh/evals/probes/wiki-readme-index.sh`'s git pathspec, which does. The
`pattern-` filename prefix is a redundant, greppable encoding of the `kind:` field:
`ls corpus/pattern-*.md` answers "what has this harness learned" without parsing
YAML, and the two must always agree. When a pattern page overflows the word cap,
split it into a second flat pattern page and cross-link; do not create a
sub-article.

**Why the proposer, and not every session, reads patterns.** The source this rule
comes from measured it: giving the skill proposer access to accumulated knowledge was
worth +15.0 points, while additionally giving the inference agent that same access
*cost* 2.8 (`[[wikiskill-experience-compilation]]`). `--patterns` is a default, not a
boundary — any session can read a pattern file directly. Say "default", never
"isolation".

### Body layout

```markdown
# <Title matching frontmatter title>

## Relevant Source Files
- `<path>` — <why this source is relevant>

## Summary
<2-3 sentence synthesis of the topic — what it is and why it matters>

## Detail
<Bounded prose. Claims about repository behavior cite concrete source paths and line numbers.>

## System Relationships
<Optional for simple external-concept entries; required when the topic describes a harness subsystem, skill pipeline, runtime, or cross-file mechanism. Prefer Mermaid diagrams for flows, ownership boundaries, and lifecycle state.>

## See Also
- [[related-slug-one]]
- [[related-slug-two]]
```

Sections must appear in this order: H1, optional `## Relevant Source Files`, `## Summary`, `## Detail`, optional `## System Relationships`, `## See Also`. Architecture/harness entries SHOULD include both optional sections; simple external-concept entries may omit them. `## Summary`, `## Detail`, and `## See Also` are always present even if `## See Also` has no bullets yet.

### Source-backed architecture standard

New or substantially revised architecture pages follow one shape: source files first, then concise synthesis, then component relationships, then navigation. A page meets the standard when:

- **Relevant source files are explicit**: list the files that make the page true before the summary, not as vague bibliography. Prefer local repo paths; cite external URLs only when the page is about an external artifact.
- **Claims are line-cited**: repository behavior, stage ordering, lifecycle claims, and invariants cite source paths with line numbers such as `AGENTS.md:111` or `.claude/skills/spec/references/execute.md:20`.
- **Relationships are visible**: when the page explains a pipeline, runtime, or architecture, include a compact Mermaid diagram or table that shows ownership, ordering, and handoff boundaries.
- **Synthesis stays separate from evidence**: use prose to explain what the cited files imply, but do not let unsupported interpretation look like a source fact.
- **Navigation closes the loop**: `## See Also` points to adjacent wiki entries using `[[slug]]` links, so a reader can walk between related pages.

### Pattern body layout (`kind: pattern`)

A pattern page uses the **same sections in the same order** as a source page. The
paper's Symptom / Root cause / Workaround / Evidence all fit inside them as bold
leads, so patterns need no structural exception and no special case in `/wiki lint`.
The only rule change is that `## Relevant Source Files` — where the evidence lands —
is **required** for `kind: pattern`, where it is optional for `kind: source`.

```markdown
# <Pattern title — the failure mode, not the incident>

## Relevant Source Files
- `<harness path>` — the artifact the pattern is about
- `<evidence path>@<short-sha>` — the run that produced the observation

## Summary
<2-3 sentences: what goes wrong (or what reliably works), and in which subsystem.>

## Detail
**Symptom.** <What an agent or operator observes. Observable, not inferred.>

**Root cause.** <Why it happens, cited to `path:line`.>

**Workaround.** <The actionable change. Append-only across compiles; a superseded
workaround is annotated `(superseded YYYY-MM-DD, SI-nnnn)`, never deleted.>

## See Also
- [[<motivating source page>]]
```

Title a pattern for the failure mode, not the incident that revealed it:
`pattern-eval-probe-provenance-decay`, not `pattern-2026-08-31-retro-findings`. One
page per failure mode, never one per run — a dated per-run page is a session journal,
which this corpus is not.

**`sources:` for a pattern.** A pattern entry MUST carry at least one `sources:`
entry. Each is either a `raw/<yyyy-mm-dd>-<slug>.md` snapshot path (when the pattern
is grounded in an ingested source) **or** a pinned repository-evidence path of the
form `<repo-relative-path>@<short-sha>` — for example
`.oh/tasks/<slug>/progress.txt@a1b2c3d`, `.oh/evals/RESULTS.md@a1b2c3d`. The
`@<short-sha>` suffix is required: it buys for a mutable tracked file the same
reproducibility that immutability buys for a `raw/` snapshot.

**`/wiki compile` MUST NOT write a `raw/` snapshot of a `/retro` report.** `raw/`
holds snapshots of external sources. A `/retro` report is this harness's own
ephemeral output, and `/retro` is report-only by contract; persisting its reports
under `raw/` would recreate the per-session journal tier the harness deliberately
removed, wearing a new name.

**Authoring constraint.** Pattern prose discusses harness subsystems, so it is the
most likely place for retired vocabulary to reappear. `.oh/evals/probes/audit-stale-references.sh`
greps every tracked file, this corpus included, for retired route and skill names.
Read that probe's pattern before writing about an audit subsystem, and use the
current route names.

### Word cap and sub-articles

Every entry should stay concise enough to read whole into context. Default cap is ≤ 600 words (title excluded, frontmatter excluded). Architecture/harness entries may reach ≤ 900 words when needed for source-file evidence and diagrams. When a topic overflows, split into sub-articles named `.oh/skills/wiki/corpus/<parent>/<child>.md`. The parent entry becomes an index: its `## Detail` section lists child slugs as `[[parent/child]]` cross-links; each child carries its own frontmatter with its own `slug` (e.g., `gh-auth/sandbox`), `sources`, and `confidence`.

---

## 3. Slug derivation rule

Slugs are derived from the source URL or file path. Rules, in order:

1. **URL path — last non-UUID segment**: take the URL path, strip trailing slashes, split on `/`, take the last segment. If that segment is a UUID or a bare hash (matches `/^[0-9a-f-]{8,}$/i`), it is a UUID/gist ID — see rule 3.
   - Example: `https://example.com/foo/bar` → `bar`
   - Example: `https://docs.github.com/en/authentication/token-scopes` → `token-scopes`
2. **Lowercased kebab-case**: lowercase the segment; replace non-`[a-z0-9]` runs with a single `-`; strip leading/trailing `-`.
3. **Gist / UUID URLs**: if the last path segment is a UUID or hash (e.g., `https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f`), the segment contains no meaningful label. `/wiki ingest` MUST require `--slug <override>` and exit with an error if it is absent.
   - Example: `/wiki ingest https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f --slug karpathy-llm-wiki`
4. **Social / share URLs**: if the URL host is a known social platform (`linkedin.com`, `x.com`, `twitter.com`, `threads.net`, `facebook.com`, `instagram.com`), OR the last path segment contains a run of ≥ 10 consecutive digits (an embedded share/activity ID), OR the slugified segment would exceed 60 characters, the segment contains no meaningful label. `/wiki ingest` MUST require `--slug <override>` and exit with an error if it is absent:
   ```
   ERROR: URL segment is a social/share URL with no meaningful label (social host, >=10-digit share/activity ID, or >60-char slug).
   Re-run with --slug <override>, e.g.:
     /wiki ingest <url> --slug inspectable-agent-harness
   ```
5. **File paths**: use the basename without extension, slugified per rule 2. `--slug <override>` is optional; without it, the basename is used.
6. **Charset constraint**: the final slug MUST match `[a-z0-9-]+`. Any slug that does not pass this check is rejected by `/wiki ingest` before any file is written.

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
- `/wiki lint` greps all entry bodies for outbound links using: `grep -roE '\[\[[a-z0-9-]+\]\]' .oh/skills/wiki/corpus/`
- A link is **broken** if its slug does not match any existing `.oh/skills/wiki/corpus/<slug>.md` frontmatter `slug` field
- A link is **orphaned** (from the target's perspective) if no other entry links to it — zero inbound `[[slug]]` references

Sub-article cross-links use the full path form: `[[parent/child]]`. The grep pattern for sub-articles extends to: `grep -roE '\[\[[a-z0-9/-]+\]\]' .oh/skills/wiki/corpus/`.

---

## 5. Confidence lifecycle

The `confidence` field tracks the curation state of a wiki entry. Ownership is strictly defined:

| Value | Set by | Trigger |
| --- | --- | --- |
| `provisional` | `/wiki ingest` | Automatically on entry creation |
| `confirmed` | Orchestrator, manually | After the orchestrator reviews and validates the entry's accuracy (e.g., via `Edit` tool) |
| `deprecated` | Orchestrator, manually | When the orchestrator judges the entry stale, superseded, or incorrect beyond update |

**`/wiki lint` (US-004) REPORTS entries with `confidence: deprecated` but NEVER sets the flag.** The lint skill surfaces deprecated entries as a finding with recommendation "consider archive or delete" — action is always taken by the orchestrator, never autonomously.

Lifecycle flow:

```
[create via /wiki ingest] → confidence: provisional
         ↓  (orchestrator reviews, confirms)
    confidence: confirmed
         ↓  (orchestrator judges stale/superseded)
    confidence: deprecated
         ↓  (orchestrator archives or deletes; no automation)
    [entry removed or moved to .oh/skills/wiki/corpus/archive/<slug>.md]
```

**Patterns.** A `kind: pattern` entry is created `provisional` by `/wiki compile`.
The orchestrator promotes it to `confirmed` when a skill proposal it motivated is
recorded `ACCEPTED` in `.oh/skills/wiki/corpus/skill-impact.md`. **A `REJECTED`
proposal never demotes or deprecates its motivating pattern** — see § 8.

The archive vs. delete decision for `deprecated` entries is not yet defined — defer to `.oh/skills/wiki/references/schema.md` update after the first deprecation in practice.

---

## 6. Frontmatter extraction canonical command

Both `/wiki query` (US-003) and `/wiki lint` (US-004) MUST extract YAML frontmatter from a wiki entry using this exact command:

```bash
awk '/^---$/{f=!f; next} f{print}' .oh/skills/wiki/corpus/<slug>.md
```

This pattern toggles a flag on each `---` delimiter and prints lines only while the flag is active (between the opening and closing `---`). It correctly handles:
- Frontmatter at the start of the file (opening `---` on line 1)
- Body content that contains `---` separators (the flag toggles off again)
- Files with no frontmatter (flag never activates; no output)

**Deviation from this canonical command is forbidden.** Both skills must use the identical extraction method to prevent silent divergence — a grep that works on one skill's output must work identically on the other's. Any future change to this extraction method requires updating both skills atomically.

Usage in practice:

```bash
# Extract frontmatter from a single entry
awk '/^---$/{f=!f; next} f{print}' .oh/skills/wiki/corpus/gh-token-workflow-scope.md

# Extract and grep for a field
awk '/^---$/{f=!f; next} f{print}' .oh/skills/wiki/corpus/gh-token-workflow-scope.md | grep '^tags:'

# Enumerate all entry slugs (for orphan check, broken-link check)
for f in .oh/skills/wiki/corpus/*.md; do
  awk '/^---$/{f=!f; next} f{print}' "$f" | grep '^slug:'
done
```

---

## 6a. README index freshness

`.oh/skills/wiki/corpus/README.md` is an owned generated index. Its table MUST match the current `.oh/skills/wiki/corpus/*.md` entry frontmatter exactly: one row per entry slug (excluding `README.md`), row fields derived from `slug`, `title`, `tags`, and `updated`, sorted by `updated` descending with the same deterministic tie behavior as `/wiki lint`.

The tier-A probe `.oh/evals/probes/wiki-readme-index.sh` is the drift guard. It reconstructs the expected table from the canonical § 6 frontmatter extraction and exits REGRESSION when the committed README has missing, extra, stale, or out-of-order rows. Any change to `/wiki lint` index generation must keep that probe green.

---

## 7. Body-merge strategy for `/wiki ingest` updates

When `/wiki ingest` is invoked with a source whose derived slug matches an existing `.oh/skills/wiki/corpus/<slug>.md`, the skill MUST update that entry using the following merge strategy — it MUST NOT create a duplicate entry, and it MUST NOT concatenate old and new bodies.

**Merge steps, in order:**

1. **Replace `## Summary`**: overwrite the entire `## Summary` section (from `## Summary` heading to the next `##` heading) with the new summary derived from the freshly-ingested source.

2. **Replace `## Detail`**: overwrite the entire `## Detail` section in-place with the new detail prose derived from the fresh source.

3. **Append to `sources:`**: append the new snapshot path (`raw/<yyyy-mm-dd>-<slug>.md`) to the `sources:` list in the frontmatter. Do NOT remove prior snapshot paths — every snapshot remains in the provenance trail.

4. **Append to `## See Also`** (deduplicated): extract `[[slug]]` candidates from the new source and append any that are not already present in `## See Also`. Do not remove existing cross-links.

5. **Update `updated:`**: set `updated:` in the frontmatter to today's date (UTC, `date -u +%Y-%m-%d`).

6. **Do NOT touch `created:`**: the `created:` field is immutable after initial entry creation. `/wiki ingest` must skip it during updates.

7. **Do NOT concatenate bodies**: the prior `## Summary` and `## Detail` content is replaced, not concatenated. The entry stays ≤ 600 words.

**Rationale**: bodies grow unbounded if concatenated across multiple ingests, eventually exceeding the 600-word cap and diluting the entry's utility. The replace-in-place strategy keeps entries fresh and bounded while the `sources:` list preserves the full provenance trail.

---

## 7a. Pattern amendment to the body-merge strategy

Applies only when the target entry has `kind: pattern`. All of § 7 holds except
steps 1, 2, and 7, which are amended as follows.

**1'. `## Summary` is replaced** — unchanged from § 7 step 1. The summary is a
rolling 2-3 sentence statement of the current understanding.

**2'. `## Detail` is merged, not replaced.**

- `**Symptom.**` and `**Root cause.**` are rewritten in place ONLY when the new
  evidence contradicts them. New corroborating evidence adds a citation, not a
  rewrite.
- `**Workaround.**` is **append-only**. A new workaround is appended. A workaround
  shown not to work is annotated `(superseded YYYY-MM-DD, SI-nnnn)` and left in
  place. It is never deleted.

**7'. The word cap is met by compressing older evidence into one clause, never by
dropping a distinct root cause.** When a pattern page holds two or more distinct root
causes and exceeds the cap, split it into two flat pattern pages (§ 2, pattern
placement) and cross-link them.

**Rationale**: § 7's replace-in-place strategy keeps a source page fresh against a
moving upstream. A pattern page has no upstream — it is this harness's own
accumulated experience, and replacing it discards exactly the knowledge the page
exists to hold.

---

## 8. Pattern persistence invariant

**A `kind: pattern` entry is never rolled back.**

When a skill proposal is rejected and the skill edit is reverted, the revert covers
the skill artifact **only**. The pattern page that motivated the proposal stays, its
`confidence` is unchanged, its `sources:` list is unchanged, and its accumulated
`**Workaround.**` text is unchanged. `/wiki compile` records the rejection as
evidence — annotating the workaround that failed with `(superseded YYYY-MM-DD,
SI-nnnn)` — rather than deleting it. The `skill-impact.md` record of the rejected
proposal is likewise never removed.

**Reverting a `corpus/` path as collateral of a skill revert is forbidden.**

Rationale: the knowledge that an approach was tried and did not work is the most
valuable output of a rejected cycle, and it is the only thing preventing the same
proposal being made again. Rolling it back with the code destroys exactly the
persistence this layer exists to provide.

Prose is not enforcement. The oracles are
`.oh/evals/probes/wiki-pattern-persistence.sh` (pattern pages present at the
merge-base are present at HEAD, and no pattern's `sources:` list has shrunk) and
`.oh/evals/probes/wiki-skill-impact-append-only.sh` (ledger records are added, never
removed or edited in place).
