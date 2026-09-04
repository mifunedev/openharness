---
name: wiki
description: |
  Dispatch harness knowledge-base operations: ingest, query, lint, or compile.
  This skill owns procedures; .oh/knowledge/ owns tracked source pages, patterns,
  and raw snapshots. Queries exclude local scratch. Canonical schema:
  .oh/skills/wiki/references/schema.md. Procedures:
  references/{ingest,query,lint,compile}.md.
  TRIGGER when: "add to wiki", "capture this page", "snapshot this source",
  "ingest <url|path>", or promoting a sub-agent draft -> ingest; "what does the
  wiki say about X", "find knowledge entries for X", "look up X in the wiki",
  or recalling tracked knowledge before planning -> query; "lint the wiki",
  "regenerate the knowledge index", "which pages need review" -> lint;
  "compile the retro into patterns", "what did this run teach",
  "record this lesson as a pattern" -> compile.
argument-hint: "ingest <url|path> [--slug <override>] | ingest --from-draft <slug> [--allow-stale] | query <topic> [--patterns] | lint [--dry-run] | compile [--from <path>] [--task <slug>] [--dry-run]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, WebFetch
---

# Wiki

One parameterized skill over the harness knowledge base. The first token of
`$ARGUMENTS` selects the operation; the remainder is that subcommand's argument
string. This dispatcher holds the routing logic and the rules shared by all four
operations; the full per-subcommand procedure lives in `references/`.

**Two surfaces, one owner each.** `.oh/knowledge/` owns the **data**; this skill
owns the **procedure**. No knowledge page lives under `.oh/skills/wiki/`, and no
schema rule lives anywhere but `references/schema.md`.

## Subcommands

| Subcommand | Argument form | Purpose | Reference |
|------------|---------------|---------|-----------|
| `ingest` | `<url\|path> [--slug <override>]` · `--from-draft <slug> [--allow-stale]` | Capture a source or promote a draft into an entity page (the only authorized write path) | `references/ingest.md` |
| `query` | `<topic> [--patterns]` | Frontmatter OR-search over tracked knowledge; read the top matches into context (≤3 entity, ≤5 pattern) | `references/query.md` |
| `lint` | `[--dry-run]` | Six correctness checks + atomic `.oh/knowledge/README.md` index regeneration | `references/lint.md` |
| `compile` | `[--from <path>] [--task <slug>] [--dry-run]` | Consolidate a `/retro` report into `kind: pattern` entries (create or patch) | `references/compile.md` |

## Dispatch

Parse `$ARGUMENTS`: the first whitespace-delimited token is the subcommand; the
rest is the subcommand's argument string.

```bash
ARGUMENTS="${ARGUMENTS:-}"
SUB="${ARGUMENTS%% *}"          # first token
REST="${ARGUMENTS#"$SUB"}"      # everything after it
REST="${REST# }"               # trim one leading space
```

Route on `$SUB`, then follow the matching reference document end-to-end (its
instructions are authoritative — this dispatcher does not restate them):

| `$SUB` | Action |
|--------|--------|
| `ingest` | Read `references/ingest.md`; execute it with `$REST` as its argument string. |
| `query` | Read `references/query.md`; execute it with `$REST` as the `<topic>`. |
| `lint` | Read `references/lint.md`; execute it with `$REST` (only `--dry-run` is recognized). |
| `compile` | Read `references/compile.md`; execute it with `$REST` as its argument string. |
| anything else (incl. empty) | Print the usage line from `argument-hint` and exit 0. Do not guess a subcommand. |

## Shared rules

These hold across all four subcommands; the reference docs assume them.

- **Knowledge root**: entity pages at `.oh/knowledge/source/<slug>.md`, pattern
  pages at `.oh/knowledge/patterns/pattern-<subsystem>-<mode>.md`, immutable
  external snapshots at `.oh/knowledge/raw/<yyyy-mm-dd>-<slug>.md`. Both entry
  globs are flat and do not descend.
- **Tracked by default**: `source/`, `patterns/`, and `raw/` are committed like
  any other repository content — a plain `git add`, no `-f`, no whitelist.
  `.oh/knowledge/local/` is the only ignored tier.
- **`local/` is never an input**: no query path and no `/spec` flow reads it. A
  page one machine can see must not inform a plan another machine cannot
  reproduce. Promotion goes through `ingest`.
- **The repository outranks the knowledge base**: a page is orientation, not
  authority. Re-ground material claims against the sources a page cites before
  relying on them.
- **Canonical schema**: frontmatter fields, the three kinds, provenance forms,
  freshness, slug derivation, the word cap, cross-links, the confidence
  lifecycle, and the body-merge strategy all live in
  `.oh/skills/wiki/references/schema.md`. The reference docs and this dispatcher
  defer to it — they never redefine it.
- **Frontmatter extraction** (canonical, used identically by every consumer):
  ```bash
  awk '/^---$/{f=!f; next} f{print}' .oh/knowledge/source/<slug>.md
  ```
- **One freshness implementation**: `.oh/skills/wiki/scripts/knowledge-impact.sh`
  decides dependency-aware invalidation. `lint` calls it with `--verified`;
  `/spec execute` calls it with `--changed <paths>`. Nothing reimplements it.
- **Orchestrator-only write gate**: `ingest` writes (snapshots + entity pages),
  `compile`'s pattern-page writes, and `lint`'s index regeneration are
  orchestrator-only. Sub-agents propose drafts to
  `$TMPDIR/oh-wiki-drafts/<slug>.md`; the orchestrator promotes via
  `/wiki ingest --from-draft <slug>`. A sub-agent that writes directly to
  `.oh/knowledge/` is out of scope and may be reverted.
- **Index reflects the tracked entry set**: `.oh/knowledge/README.md`'s Index
  table is generated state owned by `lint`, sorted by `updated:` descending.
  Never hand-edit it.

## When NOT to use

- A topic that is a **behavioral norm** ("always do X") → a rule/skill, not
  knowledge.
- A **session journal** entry ("this run showed Y") → the run's report. A
  *recurring failure mode* the run revealed is different: that is a
  `kind: pattern` entry, written by `compile`, named for the mode not the run.
- A **proposal decision record** → `.oh/evals/decisions/skill-impact.md`, not a
  knowledge page.
- **Human-facing prose** → `docs/` (knowledge pages are LLM-readable synthesis).
- Full-text body search → direct `grep`; `query` is intentionally
  frontmatter-only.

## See Also

- `.oh/skills/wiki/references/schema.md` — canonical schema and authoring rules
- `.oh/skills/wiki/references/ingest.md` · `query.md` · `lint.md` · `compile.md` — full procedures
- `.oh/skills/wiki/scripts/knowledge-impact.sh` — dependency-aware invalidation
- `.oh/knowledge/README.md` — the generated index
- `.oh/evals/decisions/skill-impact.md` — the skill-change ledger the proposer reads
- `.oh/evals/probes/wiki-readme-index.sh` — drift guard for the generated index
