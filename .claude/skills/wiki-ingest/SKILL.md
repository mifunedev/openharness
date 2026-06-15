---
name: wiki-ingest
description: |
  Capture a source (URL or file path) or promote a sub-agent draft into the
  harness wiki. For URL/path ingest: WebFetch or reads the source, writes an
  immutable snapshot to wiki/raw/<yyyy-mm-dd>-<slug>.md, then writes or
  updates the corresponding wiki/<slug>.md entity page following the schema and
  body-merge rules in context/rules/wiki.md. For draft promotion: resolves the
  most-recent draft from memory/*/wiki-drafts/<slug>.md (by ISO date in parent
  dir name, not mtime), checks staleness, then promotes to wiki/<slug>.md.
  Write operations are orchestrator-only; sub-agents propose drafts to
  memory/<today>/wiki-drafts/<slug>.md and the orchestrator promotes via
  --from-draft. Always logs to memory/<today>/log.md per the Memory
  Improvement Protocol.
  TRIGGER when: asked to ingest a URL or file into the wiki, "add to wiki",
  "capture this page", "snapshot this source", or promoting a sub-agent draft
  via --from-draft.
argument-hint: "<url|path> [--slug <override>] | --from-draft <slug> [--allow-stale]"
---

# Wiki Ingest

Snapshot a source and write or update a wiki entity page. This is the only authorized path for writing to `wiki/`. Sub-agents may not call this skill directly for write operations — they propose drafts to `memory/<today>/wiki-drafts/<slug>.md` and the orchestrator promotes via `--from-draft`.

The canonical schema, slug derivation rules, and body-merge strategy all live in `context/rules/wiki.md`. This skill defers to those rules — it does not redefine them.

## Argument interface

Two and only two invocation forms are supported:

```
/wiki-ingest <url|path> [--slug <override>]
/wiki-ingest --from-draft <slug> [--allow-stale]
```

No other forms are documented or supported. `argument-hint` frontmatter above encodes this for skill-metadata consumers.

### Form 1: Source ingest

```
/wiki-ingest <url|path> [--slug <override>]
```

- `<url|path>` — a `https://` URL or an absolute/relative file path.
- `--slug <override>` — optional for file paths and URL paths with a meaningful last segment; **required** for gist/UUID URLs (see § Slug derivation).

### Form 2: Draft promotion

```
/wiki-ingest --from-draft <slug> [--allow-stale]
```

- `--from-draft <slug>` — promote the most-recent draft for `<slug>` from `memory/*/wiki-drafts/<slug>.md`.
- `--allow-stale` — bypass the 7-day staleness gate (see § Draft promotion).

## When to use

- Capturing a new source: page, article, gist, local file.
- Re-ingesting a source to refresh an existing wiki entry (update path).
- Promoting a sub-agent draft to a tracked wiki entry.
- Researching a broader topic from a seed link or "add to wiki" request; see `references/official-docs-research-wiki.md` for the official-docs research pattern.
- Running concurrent wiki ingests or preserving unrelated branch state; see `references/concurrent-ingest-worktrees.md` for the isolated-worktree pattern.

## When NOT to use

- `/wiki-query` — for searching and reading existing entries into context.
- `/wiki-lint` — for health checks, index regeneration, stale/orphan reporting.
- Direct `Edit` tool writes to `wiki/<slug>.md` — use only for manual `confidence` field upgrades or small factual corrections that do not require a new snapshot.

## Instructions

### 1. Parse arguments

Parse `$ARGUMENTS` to determine the invocation form:

- If the first token is `--from-draft`, the form is **draft promotion** (§ 5).
- Otherwise, the first token is `<url|path>` and the form is **source ingest** (§ 2–4).

Extract `--slug <override>` and `--allow-stale` flags if present.

### 2. Ensure wiki/raw/ exists

Before any file write, run:

```bash
mkdir -p wiki/raw/
```

`wiki/raw/` is gitignored (only `wiki/raw/README.md` is tracked). On a fresh clone the directory may not exist. This step is mandatory — never assume the directory is present.

### 3. Slug derivation

Slug derivation follows `context/rules/wiki.md` § 3 verbatim. Summary for reference (the rule document is authoritative):

1. **URL — last non-UUID segment**: take the URL path, strip trailing slashes, split on `/`, take the last segment. If that segment matches `/^[0-9a-f-]{8,}$/i` (UUID or bare hash), proceed to rule 3.
   - `https://example.com/foo/bar` → `bar`
   - `https://docs.github.com/en/authentication/token-scopes` → `token-scopes`
2. **Lowercase kebab-case**: lowercase the segment; replace non-`[a-z0-9]` runs with a single `-`; strip leading/trailing `-`.
3. **Gist / UUID URLs**: if the last path segment is a UUID or hash (e.g., `https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f`), `--slug <override>` is **required**. Exit with an error if it is absent:
   ```
   ERROR: URL path segment "442a6bf555914893e9891c11519de94f" is a UUID/hash.
   Re-run with --slug <override>, e.g.:
     /wiki-ingest <url> --slug karpathy-llm-wiki
   ```
4. **Social / share URLs**: if the URL host is a known social platform (`linkedin.com`, `x.com`, `twitter.com`, `threads.net`, `facebook.com`, `instagram.com`), OR the last path segment contains a run of ≥ 10 consecutive digits (an embedded share/activity ID), OR the slugified segment would exceed 60 characters, the segment contains no meaningful label. `/wiki-ingest` MUST require `--slug <override>` and exit with an error if it is absent:
   ```
   ERROR: URL segment is a social/share URL with no meaningful label (social host, >=10-digit share/activity ID, or >60-char slug).
   Re-run with --slug <override>, e.g.:
     /wiki-ingest <url> --slug inspectable-agent-harness
   ```
5. **File paths**: use the basename without extension, slugified per rule 2. `--slug <override>` is optional; if absent, the basename is used.
6. **Charset constraint**: the final slug must match `[a-z0-9-]+`. Reject before any file is written.

If `--slug <override>` is provided, use it directly (still validate charset).

### 4. Source ingest

#### 4a. URL ingest

1. WebFetch the URL to retrieve the page body.
   - For LinkedIn/social pages, inspect embedded metadata and JSON-LD (`articleBody`, `headline`, `comment`, `og:description`, `twitter:description`) when the visible DOM is gated or duplicated. Capture useful comments only when they materially clarify the source claim; keep the wiki page bounded and point to the raw snapshot for the full capture.
2. Normalize the displayed source URL before writing synthesized wiki/log text:
   - Strip common tracking-only query params (`utm_*`, `rcm`, `fbclid`, `gclid`, etc.) when they are not needed for retrieval.
   - If preserving a raw fetched URL for provenance, redact secret-like/tracking values in human-facing summaries/logs (e.g. `rcm=[REDACTED]`).
3. Get today's UTC date:
   ```bash
   TODAY=$(date -u +%Y-%m-%d)
   ```
4. Ensure `wiki/raw/` exists (§ 2).
5. Write snapshot to `wiki/raw/<yyyy-mm-dd>-<slug>.md`:
   ```
   # Source: <url>

   <fetched body>
   ```
   The header line `# Source: <url>` is mandatory. Prefer the normalized/redacted URL in this header unless the exact retrieval URL is essential to reproduce the fetch. The fetched body follows on the next line after a blank line. Snapshots are immutable once written — do not overwrite an existing snapshot. If `wiki/raw/<today>-<slug>.md` already exists, generate a unique path (e.g., append `-2`, `-3`).
6. Proceed to § 6 (write or update `wiki/<slug>.md`).

#### 4b. File path ingest

1. Read the file at `<path>`.
2. Get today's UTC date: `TODAY=$(date -u +%Y-%m-%d)`.
3. Ensure `wiki/raw/` exists (§ 2).
4. Write snapshot to `wiki/raw/<yyyy-mm-dd>-<basename>.md` (same format as URL ingest, but use `# Source: <path>` as the header). The snapshot filename uses the basename of the path unless `--slug` overrides the slug; if `--slug` is used, the snapshot filename uses the slug.
5. Proceed to § 6.

### 5. Draft promotion (`--from-draft`)

1. Glob for draft files: `memory/*/wiki-drafts/<slug>.md`. Exclude any file named `<slug>.md.skip`.
2. Sort matches by the **ISO date component in the parent directory name** (`memory/YYYY-MM-DD/`) — take the lexicographically greatest date. Do **not** use filesystem mtime (unreliable across git checkout and Docker volume mounts).
3. If no matches, exit:
   ```
   ERROR: no draft found for slug "<slug>" under memory/*/wiki-drafts/.
   ```
4. **Staleness check**: compute the difference between today's UTC date and the most-recent draft's parent directory date. If the draft date is more than 7 days older than today:
   - Without `--allow-stale`: exit with status STALE:
     ```
     STALE: draft memory/<date>/wiki-drafts/<slug>.md is <N> days old (threshold: 7 days).
     Re-run with --allow-stale to promote anyway.
     ```
   - With `--allow-stale`: log a warning and continue.
5. Read the draft file content.
6. The draft file is the "source" for § 6. Snapshot path is the draft file path itself (use it as the `sources:` entry, not a new `wiki/raw/` file — drafts are already a captured artifact).
7. Proceed to § 6.

### 6. Write or update wiki/<slug>.md

Check whether `wiki/<slug>.md` already exists.

#### 6a. New entry (create)

Write `wiki/<slug>.md` with valid frontmatter per `context/rules/wiki.md` § 2:

```yaml
---
title: "<Derived or provided title>"
slug: <slug>
tags: []
created: <TODAY>
updated: <TODAY>
sources:
  - raw/<yyyy-mm-dd>-<slug>.md
related: []
confidence: provisional
---

# <Title>

## Summary
<2-3 sentence synthesis of the source>

## Detail
<Bounded prose from the source, ≤ 600 words total for the entry>

## See Also
```

Field notes:
- `title`: derive from the source's H1 heading, page `<title>` tag, or filename. Keep it human-readable.
- `tags`: derive from the source content. Leave as `[]` if no clear tags are evident.
- `created`: set to today's UTC date. Never updated after initial creation.
- `updated`: set to today's UTC date.
- `sources`: list the new snapshot path (relative to `wiki/`, e.g., `raw/2026-05-24-karpathy-llm-wiki.md`). For `--from-draft`, use the draft file path.
- `confidence`: always `provisional` on creation. Never set to `confirmed` autonomously — that is the orchestrator's manual action.
- `## See Also`: leave the section header present but empty if no cross-links are evident. Do not omit the section.

#### 6b. Existing entry (update)

When `wiki/<slug>.md` already exists, apply the body-merge strategy from `context/rules/wiki.md` § 7 verbatim:

1. **Replace `## Summary`**: overwrite the entire `## Summary` section (from `## Summary` heading to the next `##` heading) with the new summary from the fresh source.
2. **Replace `## Detail`**: overwrite the entire `## Detail` section in-place with new detail prose.
3. **Append to `sources:`**: append the new snapshot path to the `sources:` list. Do not remove prior entries — the full provenance trail is preserved.
4. **Append to `## See Also`** (deduplicated): extract `[[slug]]` candidates from the new source and append any not already present. Do not remove existing cross-links.
5. **Update `updated:`**: set `updated:` to today's UTC date.
6. **Do NOT touch `created:`**: `created:` is immutable after initial creation.
7. **Do NOT concatenate bodies**: the prior `## Summary` and `## Detail` content is replaced, not appended. The entry stays ≤ 600 words.

Use the `Edit` tool to perform in-place section replacement. Extract the canonical frontmatter first using the locked command from `context/rules/wiki.md` § 6:

```bash
awk '/^---$/{f=!f; next} f{print}' wiki/<slug>.md
```

### 7. Regenerate the wiki index when the entry is part of a deliverable

`wiki/README.md` is the human/LLM index and is owned by `/wiki-lint`, not by hand edits. After creating or updating a tracked `wiki/<slug>.md` entry for a user-facing deliverable (especially when the user asked to "add to the wiki", or when you will commit/push the wiki change), run `/wiki-lint` or follow its atomic regeneration protocol so the index includes the new entry before finalizing. Remember that `wiki/raw/*` snapshots are gitignored by design; the tracked deliverable is usually `wiki/<slug>.md` plus the regenerated `wiki/README.md`, while the raw snapshot remains local provenance unless policy changes.

If you cannot run the full `/wiki-lint` skill, do not hand-maintain the table casually: enumerate `wiki/*.md`, extract frontmatter with the canonical `awk '/^---$/{f=!f; next} f{print}'` command, sort by `updated:` descending, write `wiki/README.md.tmp`, validate it is non-empty and contains `| Slug | Title | Tags | Updated |`, then atomically rename it to `wiki/README.md`. Log the lint/index refresh separately per `/wiki-lint`'s Memory Improvement Protocol.

### 8. Orchestrator-only write gate

This skill's write operations (`wiki/raw/` snapshots and `wiki/<slug>.md` writes) are **orchestrator-only**. The orchestrator is the only session authorized to write to tracked wiki surfaces.

Sub-agents may propose new entries by writing drafts to `memory/<today>/wiki-drafts/<slug>.md`. The draft format is free-form markdown (no required frontmatter). The orchestrator then reviews and promotes via:

```
/wiki-ingest --from-draft <slug>
```

This gate preserves the concurrency invariant from `context/rules/memory.md`: only the orchestrator writes to tracked knowledge surfaces. A sub-agent that bypasses this by writing directly to `wiki/` is out of scope — the orchestrator may revert such writes.

### 9. Memory Improvement Protocol

Always run this step, regardless of outcome. Get the current UTC time:

```bash
date -u +%H:%M
TODAY=$(date -u +%Y-%m-%d)
mkdir -p "memory/$TODAY"
```

Append to `memory/<UTC-date>/log.md`:

```markdown
## /wiki-ingest -- HH:MM UTC
- **Result**: OP | STALE | FAIL
- **Source**: <url or path or draft slug>
- **Slug-Created**: <slug> | —
- **Slugs-Updated**: <slug> | —
- **Snapshot-Path**: <wiki/raw/yyyy-mm-dd-slug.md> | <memory/.../wiki-drafts/slug.md> | —
- **Observation**: <one sentence on what was ingested or why the run failed>
```

Field guidance:
- `Source`: the URL, file path, or `--from-draft <slug>` argument.
- `Slug-Created`: the slug if a new `wiki/<slug>.md` was created; `—` if the run was an update or failed.
- `Slugs-Updated`: comma-separated slugs if existing pages were updated; `—` if no updates or if a failure prevented writes.
- `Snapshot-Path`: path to the snapshot written (relative to harness root), or `—` on STALE/FAIL.
- `Result`: `OP` for a completed ingest (create or update), `STALE` if the run exited on the staleness gate without `--allow-stale`, `FAIL` for any other error that prevented wiki writes.

Then apply the qualify/improve pass per `context/rules/memory.md` § Write:
- Did the ingest reveal a slug derivation edge case not covered by `context/rules/wiki.md` § 3?
- Did the body-merge produce an unexpected result worth capturing?
- If yes, propose a `memory/MEMORY.md` addition.

## Anti-patterns

- **Monolithic ingest scripts when a safety gate is likely** — avoid bundling network fetch, raw snapshot write, wiki synthesis, and log append into one large `execute_code` call. If approval or shell-safety friction appears, split the ingest into auditable steps: fetch/snapshot with a small `terminal` command, create or update `wiki/<slug>.md` with `write_file`/`patch`, then append the memory log separately. The invariant is the same (raw snapshot + bounded synthesized entry + log), but smaller tool calls are easier to approve, verify, and recover.
- **Consent-gated write recovery** — if a multi-file ingest is blocked by a consent/approval gate, report exactly which files would be written and wait for explicit approval. Prefer splitting the approved recovery into the smallest direct file operations (`write_file` for the wiki entry/raw snapshots, `patch`/append for the log) rather than wrapping all writes in `execute_code`; approval state may not carry cleanly into a monolithic script retry. If the tool explicitly says not to retry or not to attempt the same outcome via another tool, stop and report the blocker. Otherwise, after approval, complete the intended ingest and verify the synthesized wiki entry, the raw snapshot size, and the log entry before declaring success. Do not treat the pre-approval fetch metadata as an ingest; no wiki operation is complete until raw snapshot + entity page + log all exist.
- **Writing directly to `wiki/` from a sub-agent context** — always use the draft path + `--from-draft` promotion. The orchestrator is the sole writer.
- **Hardcoding today's date in `--from-draft` resolution** — glob `memory/*/wiki-drafts/<slug>.md` and sort by the ISO date in the directory name, not by mtime and not by assuming today.
- **Using mtime for stale detection** — mtime is unreliable across git checkouts and Docker volume remounts. Always derive staleness from the ISO date in the parent directory name.
- **Omitting `mkdir -p wiki/raw/`** — `wiki/raw/` is gitignored and may not exist on a fresh clone. Always create it before writing.
- **Concatenating bodies on update** — the body-merge strategy replaces `## Summary` and `## Detail` in-place; it does not append. Bodies that grow unbounded exceed the 600-word cap and dilute the entry.
- **Setting `confidence` to anything other than `provisional` on create** — the orchestrator manually upgrades to `confirmed`; `/wiki-lint` flags `deprecated` candidates; `/wiki-ingest` never sets either of those values.
- **Touching `created:` on update** — `created:` is immutable. Only `updated:` changes on re-ingest.
- **Skipping the log entry** — every invocation (OP, STALE, FAIL) appends a log entry. No exceptions.

## Reference

### Canonical rules referenced by this skill

| Rule | Section | What this skill defers to it for |
|------|---------|----------------------------------|
| `context/rules/wiki.md` | § 2 Entry schema | Frontmatter fields, body layout, ≤600-word cap |
| `context/rules/wiki.md` | § 3 Slug derivation | URL/path-to-slug algorithm; UUID/hash error path |
| `context/rules/wiki.md` | § 6 Frontmatter extraction | Canonical `awk` command for reading frontmatter on update |
| `context/rules/wiki.md` | § 7 Body-merge strategy | Exact merge steps for existing entry updates |
| `context/rules/memory.md` | § Write — MIP | Daily log format and qualify/improve loop |

### Smoke test (manual QA only)

This smoke test is not run in CI. Run it manually after the skill is committed, before US-003's smoke test:

```
/wiki-ingest https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f --slug karpathy-llm-wiki
```

Expected outcome:
- `wiki/raw/<today>-karpathy-llm-wiki.md` exists with `# Source: https://gist.github.com/...` header.
- `wiki/karpathy-llm-wiki.md` exists with valid frontmatter, `confidence: provisional`, and the snapshot path in `sources:`.
- `memory/<today>/log.md` has an `## /wiki-ingest -- HH:MM UTC` entry with `Result: OP`.

This smoke test MUST run and its commit must land before US-003's smoke test runs.

## Handoff

`wiki-ingest` is the representative skill of the **compound** node in the executable loop (`context/rules/loop.md` § 2, § 4) — the node that promotes durable knowledge (this skill + `MEMORY.md` promotion + probe-minting). On a **successful** completion (a `wiki/<slug>.md` entry written or updated, i.e. § 9's `Result: OP`), after the § 9 log entry, emit exactly one terminal line as the **final line of output**:

    STATUS: COMPOUND-DONE

Routes (must match `context/rules/loop.md` § 2):

| STATUS | Next node |
|--------|-----------|
| `COMPOUND-DONE` | `compress` |

The `/autopilot` runner reads this token to route to `compress`. Emitting nothing is read as failure, never success (invariant 5) — a STALE or FAIL exit is silent on this token. When invoked standalone, the trailing `STATUS:` line is harmless.
