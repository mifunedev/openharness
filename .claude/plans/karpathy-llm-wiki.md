# Karpathy LLM Wiki — Harness Integration

> Status: **finalized** after `/interview` (2026-05-23). All open questions resolved; see § *Decisions* below.

---

## Context

Andrej Karpathy published a [GitHub Gist in April 2026](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) describing a pattern he calls an "LLM Wiki" — a personal-scale knowledge base **compiled and maintained by an LLM** rather than retrieved on-demand via RAG. The pattern's distinguishing claim: for bounded corpora (~100K tokens), structured markdown loaded directly into the context window outperforms vector-DB RAG on both fidelity and token cost, because synthesis **compounds** across reads rather than re-deriving on every query.

### What the actual pattern is

Three layers:

| Layer | Role | LLM access |
|---|---|---|
| `raw/` | Immutable source docs (papers, articles, snapshots) | Read-only |
| `wiki/` | Markdown entity pages the LLM authors and maintains | Read + write |
| Schema doc (Karpathy uses `CLAUDE.md`) | Conventions, structure, ops contract | Read-only |

Three operations:

1. **Ingest** — new source arrives → LLM reads, writes new entity pages, *updates 10-15 existing pages*, flags contradictions. Knowledge is compiled once.
2. **Query + Enhance** — LLM searches the wiki, synthesizes with citations, files valuable discoveries back as new pages. Every interaction enriches the wiki.
3. **Lint + Maintain** — periodic health checks: stale claims, orphaned pages, missing cross-links, contradictions.

### Why this is non-trivial to graft onto this harness

- The harness already has memory tiers (`memory/MEMORY.md`, `memory/<date>/log.md`, `memory/<topic>.md`) governed by `context/rules/memory.md` — overlap is real and must be resolved sharply or the wiki will rot into a duplicate.
- The harness's `CLAUDE.md` is a symlink to `AGENTS.md` (orchestrator boundary doc) — it cannot also be the wiki's schema doc. Karpathy's naming conflicts directly.
- Karpathy's pattern presupposes the LLM is the *primary* curator of `raw/` content (research workflow). This harness is a coding-orchestrator; "raw" content is less obvious — codebase? web fetches? upstream docs? — and the answer determines whether the wiki is genuinely useful here.

The user wants to surface these tradeoffs in `/interview` rather than commit to a path. This document is the briefing for that conversation.

---

## Decisions (confirmed via /interview, 2026-05-23)

| # | Question | Decision |
|---|---|---|
| 1 | `raw/` framing | **Fetch-as-raw** — `wiki/raw/` persists `WebFetch` snapshots; entries cite concrete captures |
| 2 | Schema doc location | **`context/rules/wiki.md`** — auto-loaded with other rules; no symlink collision |
| 3 | Sub-agent write access | **Orchestrator-only + drafts** — sub-agents drop to `memory/<today>/wiki-drafts/`; orchestrator promotes |
| 4 | Lint cadence | **Manual `/wiki-lint` only** — no heartbeat cron in the first cut |

## Approach

**Adopt Karpathy's three-layer / three-operation model, mapped onto harness conventions per the decisions above.**

### Layout

```
wiki/                         # new top-level dir, tracked
  README.md                   # directory-readme convention, points to schema rule
  raw/                        # immutable source captures (gitignored by default; README tracked)
    README.md
    <yyyy-mm-dd>-<slug>.md    # snapshot of a fetched page/paper/transcript
  <slug>.md                   # entity pages: one topic per file
context/rules/wiki.md         # the schema document (NOT a nested CLAUDE.md — avoids symlink/precedence collisions)
.claude/skills/
  wiki-ingest/SKILL.md        # operation 1: read source → write/update entity pages
  wiki-query/SKILL.md         # operation 2: search + synthesize + enhance
  wiki-lint/SKILL.md          # operation 3: health check
```

Rationale for the deviations from Karpathy's literal layout:
- **`wiki/raw/` nested rather than sibling** — keeps the new surface area to a single top-level directory; the harness root is already crowded.
- **`context/rules/wiki.md` as schema doc instead of `wiki/CLAUDE.md`** — the harness already auto-loads `context/rules/*.md`, the symlink at root forbids a second `CLAUDE.md`, and rules are the right home for "how this directory works."
- **Three explicit skills** — matches Karpathy's three operations and matches the harness convention of one skill per discrete intent (see `.claude/skills/{reflect,context-audit,harness-audit}`).

### Entry schema

```yaml
---
title: "GitHub Token Workflow Scope"
slug: gh-token-workflow-scope
tags: [git, github, auth, ci]
created: 2026-05-23
updated: 2026-05-23
sources:
  - raw/2026-05-23-github-docs-fine-grained-pat.md
  - memory/MEMORY.md#2026-05-22
related: [github-auth-sandbox, ci-secrets-handling]
confidence: confirmed   # confirmed | provisional | deprecated
---

# GitHub Token Workflow Scope

## Summary
<2-3 sentence synthesis>

## Detail
<bounded prose, ≤600 words>

## See Also
- [[github-auth-sandbox]]
- [[ci-secrets-handling]]
```

Cross-links use `[[slug]]` syntax (Obsidian-style, grep-friendly). One H1, then H2 sections. Hard guideline: ≤600 words per article; split via sub-articles (`gh-auth/sandbox.md`, `gh-auth/host.md`) when overflowing.

### Boundary table (the load-bearing part)

The sharp test: *Is this a fact or synthesis about a topic, intended to be read whole into agent context on demand?* If yes → wiki. Else use the surface below.

| Surface | Holds | Written by | When wiki wins instead |
|---|---|---|---|
| `context/rules/*.md` | Behavioral norms (prescriptive) | Deliberate orchestrator revision | Wiki holds **facts**, rules hold **how to behave** |
| `context/IDENTITY.md` | Cross-session operating principles | Orchestrator, deliberate | Wiki is codebase/domain knowledge; IDENTITY is "always do X" |
| `memory/MEMORY.md` | Distilled experiential lessons ("run on date X showed Y") | Orchestrator via `/reflect` | Wiki entries are **reference**; memory is **journal** |
| `memory/<topic>.md` | Ad-hoc reference notes, no schema, no retrieval | Any session | Wiki wins after a note is re-derived twice and earns a schema |
| `docs/` (Docusaurus) | Human-facing prose | Orchestrator / contributors | Wiki is LLM-readable; docs are human-readable |
| `.claude/skills/*/SKILL.md` | Executable procedures | Orchestrator | Skills are *how to do*; wiki is *what is true* |
| `wiki/raw/` | Immutable source captures (snapshots of fetched pages, papers) | Skills writing snapshots only | Same surface; raw is upstream, wiki entries are synthesis |

### Authoring + retrieval

- **Authoring**: `/wiki-ingest` is orchestrator-only. Sub-agents may *propose* by writing drafts to `memory/<today>/wiki-drafts/<slug>.md`; the orchestrator promotes via `/wiki-ingest --from-draft`. This preserves the concurrency invariant from `context/rules/memory.md` (only the orchestrator writes to tracked knowledge surfaces).
- **Retrieval**: `/wiki-query <topic>` greps frontmatter `tags`+`title`+`slug`, returns matching file paths, then reads the top match(es) whole into context. **No embeddings, no vector DB** — matches Karpathy's stance and the harness's "short feedback loops / no speculative infrastructure" principle (see `context/IDENTITY.md`).
- **Index**: `wiki/README.md` carries a generated table of every entry (slug + title + tags) so an orchestrator session can scan all of `wiki/` from one read. Regenerated by `/wiki-lint` on every run.
- **Auto-load**: `wiki/` is NOT auto-loaded. Only the small `wiki/README.md` index could be optionally surfaced; defer that decision to `/context-audit` after the corpus has a few entries.

### What `raw/` is for in *this* harness — **Fetch-as-raw**

`wiki/raw/` is the persistent home for `WebFetch` snapshots, currently ephemeral and lost across sessions. `/wiki-ingest` writes the snapshot at `wiki/raw/<yyyy-mm-dd>-<slug>.md` (URL header + fetched body), then authors/updates the corresponding `wiki/<slug>.md` entity page citing that snapshot in its `sources:` frontmatter. This interlocks with existing tools (`WebFetch`, `/reflect`) without inventing a new capture surface, and gives every wiki entry a concrete, immutable provenance trail.

---

## Task Breakdown (recommended ordering)

| # | PR | Scope | Dep | Model |
|---|---|---|---|---|
| 1 | `wiki/` scaffold + `context/rules/wiki.md` rule + `wiki/README.md` index template | New directory, schema doc, boundary table, gitignore for `wiki/raw/*` (track only `README.md`) | — | Haiku |
| 2 | `/wiki-ingest` skill | Reads a source (URL/path/paste), writes/updates entity pages, snapshots to `wiki/raw/`, logs to daily log | 1 | Sonnet |
| 3 | `/wiki-query` skill | grep on frontmatter tags+title+slug, returns + reads matches | 1 | Sonnet |
| 4 | `/wiki-lint` skill (manual-only, no cron) | Health check: stale (>90 days, `confidence: deprecated`), orphaned (no inbound `[[links]]`), contradictions (TBD heuristic), regenerates `wiki/README.md` index | 2, 3 | Sonnet |
| 5 | Bootstrap corpus (optional, deferred) | Seed articles from existing recurring facts on first real `/wiki-ingest` runs; do not pre-seed in PR | 2 | n/a |
| 6 | Register skills in `AGENTS.md` skills table + `CHANGELOG.md` entry under `[Unreleased]` | Cross-surface wiring | 2, 3, 4 | Haiku |

PRs 2 + 3 can land in parallel after 1. PR 4 depends on the index format established by PRs 2+3.

---

## Verification

End-to-end smoke test once PRs 1-4 are merged:

1. `cd /home/sandbox/harness`
2. `/wiki-ingest` against a known URL (e.g. the Karpathy gist itself) → confirm a new `wiki/<slug>.md` exists with valid frontmatter, `wiki/raw/<date>-<slug>.md` holds the snapshot, daily log gets an `OP` entry.
3. `/wiki-query karpathy` → confirm the entry is returned, content is read into the response.
4. `/wiki-lint` → confirm no false positives on a fresh corpus, `wiki/README.md` index is regenerated.
5. Manually edit a wiki entry to set `confidence: deprecated`, re-run `/wiki-lint` → confirm it surfaces the entry.
6. `git status` should show only the expected new files (no leakage into other surfaces).

Quality gates (no automation; manual reviewer judgment in first PR review):
- Every wiki entry < 600 words; longer entries are split.
- No content duplicates `context/rules/*.md`, `context/IDENTITY.md`, or `memory/MEMORY.md` — links instead.
- Every entry has at least one `sources:` reference.

---

## Critical Files

- `/home/sandbox/harness/context/rules/memory.md` — must compose with this; do not duplicate
- `/home/sandbox/harness/context/rules/directory-readme.md` — `wiki/README.md` follows this
- `/home/sandbox/harness/AGENTS.md` (CLAUDE.md symlink target) — skills table additions land here
- `/home/sandbox/harness/CHANGELOG.md` — `[Unreleased]` entry per PR
- `/home/sandbox/harness/.gitignore` — add `wiki/raw/*` exemption for `README.md`

## Git Workflow

Per `context/rules/git.md`: one issue per PR, `skill/<issue#>-<short-desc>` branch off `development`, `<type>: <description>` commits, PR title `FROM <branch> TO development`, `Closes #<issue#>` in body, `CHANGELOG.md` `[Unreleased]` entry in the same commit. Run `/ci-status` after each push.

Suggested issue prefixes per PR: `skill` (PRs 2, 3, 4), `task` (PRs 1, 6).
