# Knowledge — Schema and Authoring Rules

The Open Harness knowledge base lives at `.oh/knowledge/`: a personal-scale,
LLM-readable cache of what this repository has been understood to be. Pages hold
**facts and synthesis** about recurring topics and are loaded whole into context on
demand (`/wiki query`) rather than retrieved through vector search. The target
quality bar is architecture-first pages that explain source-backed system
relationships, not loose notes.

**Two surfaces, one owner each.** `.oh/knowledge/` owns the **data**.
`.oh/skills/wiki/` owns the **procedure** — how a page is written, queried,
linted, and compiled. Nothing about a page's schema, provenance, or lifecycle
lives inside the skill's implementation tree, and no knowledge page lives inside
it either.

**The repository outranks the knowledge base, always.** A page is orientation.
Code and tests are implementation truth; canonical docs, RFCs, and ADRs are
intended-design truth. When a page and its source disagree, the source wins and
the page is wrong. This file is the sole schema document for `.oh/knowledge/`.

---

## 1. Boundary table

The sharp test: *Is this a fact or synthesis about a topic, intended to be read
whole into agent context on demand?* If yes → knowledge. Else use the surface
below.

| Surface | Holds | Written by | When knowledge wins instead |
| --- | --- | --- | --- |
| `.oh/skills/*/SKILL.md` | Behavioral norms (prescriptive) | Deliberate orchestrator revision | Knowledge holds **facts**, skills hold **how to behave**. A `kind: pattern` entry sits closest to this line: it records that a workaround *worked*, which is evidence; the skill records that the workaround *must be applied*, which is a norm. When a pattern's workaround becomes a rule, it is promoted into a skill and the pattern stays as the evidence for it |
| `docs/` | Human-facing prose | Orchestrator / contributors | Knowledge is LLM-readable; docs are human-readable |
| `.oh/evals/decisions/` | Accepted/rejected proposal history (`skill-impact.md`) | `/builder`, `/benchmark` | A decision ledger is a record of judgments, not synthesis about a topic |
| `.oh/knowledge/raw/` | Immutable external captures (snapshots of fetched pages, papers) | `/wiki ingest` | Same surface; raw is upstream evidence, entity pages are synthesis |
| `.oh/knowledge/local/` | Per-machine scratch | anyone | **Nothing reads it.** A page only one machine can see must never inform a plan another machine cannot reproduce |

---

## 2. Directory layout and the tracked boundary

```text
.oh/knowledge/
├── README.md          generated index — owned by /wiki lint, never hand-edited
├── source/<slug>.md   kind: repo | external entity pages          TRACKED
├── patterns/pattern-<subsystem>-<mode>.md   kind: pattern pages   TRACKED
├── raw/<yyyy-mm-dd>-<slug>.md               external snapshots    TRACKED
└── local/                                   per-machine scratch   IGNORED
```

**The directory is the `kind` boundary, and `kind:` must agree with it.** A
`kind: pattern` page lives in `patterns/`; `kind: repo` and `kind: external`
pages live in `source/`. Both globs are flat and do not descend — a page in a
sub-directory is invisible to `/wiki query` and `/wiki lint` while still visible
to git, which is how a page silently stops being knowledge.

**Tracked by default.** `source/`, `patterns/`, and `raw/` are committed like any
other repository content, reviewed in the PR that lands them. There is no
`git add -f` step and no whitelist. An untracked page is provenance a fresh clone
cannot see, which is the same as no provenance.

**`local/` is the only ignored tier, and nothing reads it.** `/wiki query`
enumerates `source/` and `patterns/`. Every `/spec` flow consumes tracked
knowledge only. There is no flag that folds a local page into a normal result
set. Promotion out of `local/` goes through `/wiki ingest`, which applies this
schema and lands a tracked page.

**Path resolution.** A `raw/<...>` value in `sources:` resolves relative to
`.oh/knowledge/`, not to the page's own directory. Every other `sources:` value
is repository-relative from the repository root.

---

## 3. Entry schema

Every entry is a single markdown file with YAML frontmatter followed by a
bounded, source-backed body.

### Frontmatter

```yaml
---
title: "Compose Environment Boundary"
slug: compose-env-boundary
kind: repo            # repo | external | pattern
tags: [compose, devcontainer, boundary]
created: 2026-08-31
updated: 2026-08-31
sources:
  - .devcontainer/docker-compose.yml
  - .devcontainer/entrypoint.sh
  - .oh/evals/probes/compose-env-boundary.sh
verified_at: 1c5f37230822ec2bbc5ed316be92ad295722b693
related: [sandbox-dependency-installs]
confidence: confirmed
---
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | string | yes | Human-readable entry title |
| `slug` | string | yes | Matches filename without `.md`; charset `[a-z0-9-]+` |
| `kind` | enum | yes | `repo` \| `external` \| `pattern`. Must agree with the directory |
| `tags` | list of strings | yes | Used by `/wiki query` for frontmatter-only grep |
| `created` | date (YYYY-MM-DD) | yes | UTC date of initial creation; never updated |
| `updated` | date (YYYY-MM-DD) | yes | UTC date of most recent write. Telemetry only — see § 5 |
| `sources` | list of paths | yes | The provenance **and** dependency declaration — see § 4 |
| `verified_at` | commit sha | `kind: repo` only | The commit the page's claims were last checked against |
| `related` | list of slugs | no | Slugs of conceptually adjacent entries |
| `confidence` | enum | yes | `provisional` \| `confirmed` \| `deprecated` |

### Entry kinds

| `kind` | Directory | Holds | `sources:` | Written by | Read by |
| --- | --- | --- | --- | --- | --- |
| `repo` | `source/` | Synthesis about **this repository** — a subsystem, pipeline, runtime, or convention | Repository-relative paths or globs, plus `verified_at` | `/wiki ingest` | any session, `/wiki query <topic>` |
| `external` | `source/` | Synthesis about an **outside** topic — a paper, a product, a landscape | At least one `raw/<yyyy-mm-dd>-<slug>.md` snapshot | `/wiki ingest` | any session, `/wiki query <topic>` |
| `pattern` | `patterns/` | A failure mode or working strategy observed in **this harness's own runs**, with an actionable workaround | Pinned evidence, `<repo-relative-path>@<short-sha>` | `/wiki compile` | the proposer role, `/wiki query <topic> --patterns` |

**A `kind: repo` page never snapshots this repository's own source into `raw/`.**
The repository is already versioned; a snapshot of it is a second copy that
drifts. Cite the paths and pin the commit instead. `raw/` holds external captures
only, which is why it is the `kind: external` provenance form.

**Why the proposer, and not every session, reads patterns.** The source this rule
comes from measured it: giving the skill proposer access to accumulated knowledge
was worth +15.0 points, while additionally giving the inference agent that same
access *cost* 2.8 (`[[wikiskill-experience-compilation]]`). `--patterns` is a
default, not a boundary — any session can read a pattern file directly. Say
"default", never "isolation".

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

Sections appear in this order: H1, optional `## Relevant Source Files`,
`## Summary`, `## Detail`, optional `## System Relationships`, `## See Also`.
`## Relevant Source Files` is **required** for `kind: repo` and `kind: pattern`
and optional for `kind: external`. `## Summary`, `## Detail`, and `## See Also`
are always present even if `## See Also` has no bullets yet.

### Source-backed architecture standard

New or substantially revised architecture pages follow one shape: source files
first, then concise synthesis, then component relationships, then navigation. A
page meets the standard when:

- **Relevant source files are explicit**: list the files that make the page true
  before the summary, not as vague bibliography. Prefer local repository paths;
  cite external URLs only when the page is about an external artifact.
- **Claims are line-cited**: repository behavior, stage ordering, lifecycle
  claims, and invariants cite source paths with line numbers such as
  `AGENTS.md:111` or `.oh/skills/spec/references/execute.md:20`.
- **Relationships are visible**: when the page explains a pipeline, runtime, or
  architecture, include a compact Mermaid diagram or table showing ownership,
  ordering, and handoff boundaries.
- **Synthesis stays separate from evidence**: use prose to explain what the cited
  files imply, but do not let unsupported interpretation look like a source fact.
- **Navigation closes the loop**: `## See Also` points to adjacent entries using
  `[[slug]]` links, so a reader can walk between related pages.

### Pattern body layout (`kind: pattern`)

A pattern page uses the **same sections in the same order** as an entity page.
Symptom / Root cause / Workaround / Evidence all fit inside them as bold leads,
so patterns need no structural exception and no special case in `/wiki lint`.

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
- [[<motivating entity page>]]
```

Title a pattern for the failure mode, not the incident that revealed it:
`pattern-evals-probe-provenance-decay`, not `pattern-2026-08-31-retro-findings`.
One page per failure mode, never one per run — a dated per-run page is a session
journal, which this knowledge base is not.

**`sources:` for a pattern.** A pattern entry MUST carry at least one `sources:`
entry, each a pinned repository-evidence path of the form
`<repo-relative-path>@<short-sha>` — for example
`.oh/tasks/<slug>/evidence.md@a1b2c3d`, `.oh/evals/RESULTS.md@a1b2c3d`. The
`@<short-sha>` suffix is required: it buys for a mutable tracked file the same
reproducibility that immutability buys for a `raw/` snapshot. A pattern grounded
in an ingested external source may additionally cite that `raw/` snapshot.

**`/wiki compile` MUST NOT write a `raw/` snapshot of a `/retro` report.** `raw/`
holds snapshots of external sources. A `/retro` report is this harness's own
ephemeral output, and `/retro` is report-only by contract; persisting its reports
under `raw/` would recreate the per-session journal tier the harness deliberately
removed, wearing a new name.

**Authoring constraint.** Pattern prose discusses harness subsystems, so it is
the most likely place for retired vocabulary to reappear.
`.oh/evals/probes/audit-stale-references.sh` greps every tracked file, this
knowledge base included, for retired route and skill names. Read that probe's
pattern before writing about an audit subsystem, and use the current route names.

### Word cap

Every entry should stay concise enough to read whole into context. Default cap is
≤ 600 words (title excluded, frontmatter excluded). Architecture entries may
reach ≤ 900 words when needed for source-file evidence and diagrams. When a topic
overflows, split it into a second flat page in the same directory and cross-link;
do not create a sub-directory (§ 2).

---

## 4. `sources:` is the dependency declaration

There is **one** provenance list, and freshness is computed from it. A second
`depends_on:` list holding the same paths would be a copy that drifts.

An entry in `sources:` is one of three forms:

| Form | Example | Expires? |
| --- | --- | --- |
| Repository path or glob | `.devcontainer/docker-compose*.yml` | **yes** — this is a live dependency |
| Immutable external snapshot | `raw/2026-07-04-runtime-isolation-landscape.md` | no — the file never changes |
| Pinned repository evidence | `.oh/evals/RESULTS.md@a1b2c3d` | no — the sha names a fixed revision |
| Bare upstream reference | `https://arxiv.org/abs/2607.21653v1` | no — but it is the **weakest** form |

Only the first form participates in freshness. A `kind: repo` page must carry at
least one of them; a page that declares no live dependency has nothing to be
verified against and `/wiki lint` reports it as such.

A path that has left the working tree but is real at a known commit becomes a
pin rather than a broken source: `.oh/tasks/<slug>/evidence.md@0fd2efcb`. **A pin
survives a rename**: the sha names a revision of the file's *content*, so a
resolver that cannot find `<sha>:<path>` looks the basename up in that commit's
tree rather than declaring the provenance broken.

**The bare upstream reference is a legacy form, not an option.** `/wiki ingest`
always writes a snapshot for anything it fetches, so a page it authors can never
take this form. It exists for pages written before that rule, whose fetch was
never committed and whose snapshot is therefore unrecoverable — an unsnapshotted
URL is a claim about a moving target and proves nothing about what was read. When
such a page is next re-ingested, the snapshot replaces the URL.

---

## 5. Freshness is a source-change fact, not an age

`verified_at:` records the commit a `kind: repo` page's claims were last checked
against. A page is **needs-review** when any live dependency in its `sources:`
list changed after that commit. That is the whole test:

```bash
bash .oh/skills/wiki/scripts/knowledge-impact.sh --verified
```

`knowledge-impact.sh` is the single implementation of dependency-aware
invalidation. `/wiki lint` calls it for the freshness check and `/spec execute`
calls it with `--changed <paths>` for the Actual Knowledge Impact gate; neither
reimplements the logic.

**`updated:` is telemetry, not a validity test.** A page updated today is stale
one commit later if a source it depends on moved, and a page untouched for a year
is perfectly valid if nothing it cites has changed. `/wiki lint` may report
`last-reviewed` age as informational output; nothing decides validity from it.

`kind: external` and `kind: pattern` pages have immutable provenance, so
freshness does not apply to them. They are re-examined when their topic is
re-ingested or a later run produces counter-evidence.

---

## 6. Slug derivation rule

Slugs are derived from the source URL or file path. Rules, in order:

1. **URL path — last non-UUID segment**: take the URL path, strip trailing
   slashes, split on `/`, take the last segment. If that segment is a UUID or a
   bare hash (matches `/^[0-9a-f-]{8,}$/i`), see rule 3.
   - `https://example.com/foo/bar` → `bar`
   - `https://docs.github.com/en/authentication/token-scopes` → `token-scopes`
2. **Lowercased kebab-case**: lowercase the segment; replace non-`[a-z0-9]` runs
   with a single `-`; strip leading/trailing `-`.
3. **Gist / UUID URLs**: if the last path segment is a UUID or hash, it contains
   no meaningful label. `/wiki ingest` MUST require `--slug <override>` and exit
   with an error if it is absent.
4. **Social / share URLs**: if the URL host is a known social platform
   (`linkedin.com`, `x.com`, `twitter.com`, `threads.net`, `facebook.com`,
   `instagram.com`), OR the last path segment contains a run of ≥ 10 consecutive
   digits, OR the slugified segment would exceed 60 characters, the segment
   contains no meaningful label. `/wiki ingest` MUST require `--slug <override>`:
   ```
   ERROR: URL segment is a social/share URL with no meaningful label (social host, >=10-digit share/activity ID, or >60-char slug).
   Re-run with --slug <override>, e.g.:
     /wiki ingest <url> --slug inspectable-agent-harness
   ```
5. **File paths**: use the basename without extension, slugified per rule 2.
   `--slug <override>` is optional.
6. **Charset constraint**: the final slug MUST match `[a-z0-9-]+`. Any slug that
   fails this check is rejected before any file is written.

---

## 7. Cross-link convention

Cross-links use Obsidian-style double-bracket syntax:

```markdown
- [[compose-env-boundary]]
- [[sandbox-dependency-installs]]
```

Rules:

- The slug inside `[[...]]` MUST match `[a-z0-9-]+` — no spaces, no uppercase, no
  special characters.
- Cross-links appear in `## See Also` and may appear inline in `## Detail` prose.
- A link is **broken** if its slug matches no entry's frontmatter `slug` in
  either `source/` or `patterns/`. Links cross the two directories freely; the
  slug namespace is flat.
- Outbound links are enumerated with:
  ```bash
  grep -roE '\[\[[a-z0-9-]+\]\]' .oh/knowledge/source/ .oh/knowledge/patterns/
  ```

**Inbound-link count is not a health signal.** A queryable page with zero inbound
links is perfectly valid in a knowledge base this size, and treating it as a
finding trains readers to ignore the report. `/wiki lint` does not check it.

---

## 8. Confidence lifecycle

| Value | Set by | Trigger |
| --- | --- | --- |
| `provisional` | `/wiki ingest`, `/wiki compile` | Automatically on entry creation |
| `confirmed` | Orchestrator, manually | After the orchestrator reviews and validates the entry's accuracy |
| `deprecated` | Orchestrator, manually | When the orchestrator judges the entry stale, superseded, or incorrect beyond update |

`/wiki lint` never sets `confidence`. The value is set manually by the
orchestrator; automation only reads it.

```
[create via /wiki ingest] → confidence: provisional
         ↓  (orchestrator reviews, confirms)
    confidence: confirmed
         ↓  (orchestrator judges stale/superseded)
    confidence: deprecated
         ↓  (orchestrator archives or deletes; no automation)
    [entry removed]
```

**Patterns.** A `kind: pattern` entry is created `provisional` by `/wiki compile`.
The orchestrator promotes it to `confirmed` when a skill proposal it motivated is
recorded `ACCEPTED` in `.oh/evals/decisions/skill-impact.md`. **A `REJECTED`
proposal never demotes or deprecates its motivating pattern** — see § 12.

---

## 9. Frontmatter extraction canonical command

`/wiki query`, `/wiki lint`, and `knowledge-impact.sh` MUST extract YAML
frontmatter using this exact command:

```bash
awk '/^---$/{f=!f; next} f{print}' .oh/knowledge/source/<slug>.md
```

It toggles a flag on each `---` delimiter and prints lines only while the flag is
active. It correctly handles frontmatter at the start of the file, body content
containing `---` separators, and files with no frontmatter (no output).

**Deviation from this canonical command is forbidden.** A grep that works on one
consumer's output must work identically on another's. Any future change requires
updating every consumer atomically.

```bash
# Enumerate every entry slug
for f in .oh/knowledge/source/*.md .oh/knowledge/patterns/*.md; do
  awk '/^---$/{f=!f; next} f{print}' "$f" | grep '^slug:'
done
```

---

## 10. README index freshness

`.oh/knowledge/README.md` is an owned generated index. Its table MUST match the
current tracked `source/*.md` and `patterns/*.md` frontmatter exactly: one row
per entry slug, fields derived from `slug`, `title`, `tags`, and `updated`,
sorted by `updated` descending with the deterministic tie behavior `/wiki lint`
uses.

The tier-A probe `.oh/evals/probes/wiki-readme-index.sh` is the drift guard. It
reconstructs the expected table from the § 9 extraction and exits REGRESSION when
the committed README has missing, extra, stale, or out-of-order rows. Any change
to `/wiki lint` index generation must keep that probe green.

---

## 11. Body-merge strategy for `/wiki ingest` updates

When `/wiki ingest` is invoked with a source whose derived slug matches an
existing entry, the skill MUST update that entry using the following merge
strategy — it MUST NOT create a duplicate entry, and it MUST NOT concatenate old
and new bodies.

1. **Replace `## Summary`**: overwrite the entire section with the new summary.
2. **Replace `## Detail`**: overwrite the entire section in place.
3. **Append to `sources:`**: append the new snapshot path or repository path. Do
   NOT remove prior entries — every one remains in the provenance trail.
4. **Append to `## See Also`** (deduplicated): add new `[[slug]]` candidates; do
   not remove existing cross-links.
5. **Update `updated:`** to today's UTC date (`date -u +%Y-%m-%d`).
6. **Update `verified_at:`** to `git rev-parse HEAD` for a `kind: repo` page —
   the write re-checked the claims, so the pin moves with them.
7. **Do NOT touch `created:`** — immutable after initial creation.
8. **Do NOT concatenate bodies** — the prior `## Summary` and `## Detail` are
   replaced. The entry stays inside the word cap.

**Rationale**: bodies grow unbounded if concatenated across ingests, eventually
exceeding the cap and diluting the entry. Replace-in-place keeps entries fresh
and bounded while `sources:` preserves the full provenance trail.

### 11a. Pattern amendment

Applies only when the target entry has `kind: pattern`. All of § 11 holds except
steps 1, 2, and 8, which are amended as follows.

**1'. `## Summary` is replaced** — unchanged. The summary is a rolling 2-3
sentence statement of the current understanding.

**2'. `## Detail` is merged, not replaced.**

- `**Symptom.**` and `**Root cause.**` are rewritten in place ONLY when the new
  evidence contradicts them. New corroborating evidence adds a citation, not a
  rewrite.
- `**Workaround.**` is **append-only**. A new workaround is appended. A
  workaround shown not to work is annotated `(superseded YYYY-MM-DD, SI-nnnn)`
  and left in place. It is never deleted.

**8'. The word cap is met by compressing older evidence into one clause, never by
dropping a distinct root cause.** When a pattern page holds two or more distinct
root causes and exceeds the cap, split it into two flat pattern pages and
cross-link them.

**Rationale**: § 11's replace-in-place strategy keeps an entity page fresh
against a moving upstream. A pattern page has no upstream — it is this harness's
own accumulated experience, and replacing it discards exactly the knowledge the
page exists to hold.

---

## 12. Pattern persistence invariant

**A `kind: pattern` entry is never rolled back.**

When a skill proposal is rejected and the skill edit is reverted, the revert
covers the skill artifact **only**. The pattern page that motivated the proposal
stays, its `confidence` is unchanged, its `sources:` list is unchanged, and its
accumulated `**Workaround.**` text is unchanged. `/wiki compile` records the
rejection as evidence — annotating the workaround that failed with
`(superseded YYYY-MM-DD, SI-nnnn)` — rather than deleting it. The
`.oh/evals/decisions/skill-impact.md` record of the rejected proposal is likewise
never removed.

**Reverting a `.oh/knowledge/` path as collateral of a skill revert is
forbidden.**

Rationale: the knowledge that an approach was tried and did not work is the most
valuable output of a rejected cycle, and it is the only thing preventing the same
proposal being made again. Rolling it back with the code destroys exactly the
persistence this layer exists to provide.

Prose is not enforcement. The oracles are
`.oh/evals/probes/wiki-pattern-persistence.sh` (pattern pages present at the
merge-base are present at HEAD, and no pattern's `sources:` list has shrunk) and
`.oh/evals/probes/wiki-skill-impact-append-only.sh` (ledger records are added,
never removed or edited in place).
