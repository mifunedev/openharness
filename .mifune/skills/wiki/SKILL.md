---
name: wiki
description: |
  Dispatcher for the harness wiki knowledge base — routes the first token of
  $ARGUMENTS to one of three subcommands: ingest, query, or lint. The corpus
  lives at .mifune/skills/wiki/corpus/ (entity pages) and corpus/raw/ (immutable
  snapshots), owned by this skill and gitignored-by-default (curated entries are
  whitelisted into git with `git add -f`). Canonical schema:
  .mifune/skills/wiki/references/schema.md. Full per-subcommand procedures live
  in references/{ingest,query,lint}.md. Always logs per the Memory Improvement
  Protocol.
  TRIGGER when: "add to wiki", "capture this page", "snapshot this source",
  "ingest <url|path>", or promoting a sub-agent draft -> ingest; "what does the
  wiki say about X", "find wiki entries for X", "look up X in the wiki" -> query;
  "lint the wiki", "regenerate the wiki index", "find stale/orphaned wiki
  entries" -> lint.
argument-hint: "ingest <url|path> [--slug <override>] | ingest --from-draft <slug> [--allow-stale] | query <topic> | lint [--dry-run]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, WebFetch
---

# Wiki

One parameterized skill over the harness wiki knowledge base. The first token of
`$ARGUMENTS` selects the operation; the remainder is that subcommand's argument
string. This dispatcher holds the routing logic and the rules shared by all
three operations; the full per-subcommand procedure lives in `references/`.

## Subcommands

| Subcommand | Argument form | Purpose | Reference |
|------------|---------------|---------|-----------|
| `ingest` | `<url\|path> [--slug <override>]` · `--from-draft <slug> [--allow-stale]` | Capture a source or promote a draft into a wiki entity page (the only authorized write path) | `references/ingest.md` |
| `query` | `<topic>` | Frontmatter OR-search; read top ≤3 matches (by `updated:` desc) into context | `references/query.md` |
| `lint` | `[--dry-run]` | 5 health checks + atomic `corpus/README.md` index regeneration | `references/lint.md` |

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
| anything else (incl. empty) | Print the usage line from `argument-hint` and exit 0. Do not guess a subcommand. |

## Shared rules

These hold across all three subcommands; the reference docs assume them.

- **Corpus root**: entity pages at `.mifune/skills/wiki/corpus/<slug>.md`; immutable
  snapshots at `.mifune/skills/wiki/corpus/raw/<yyyy-mm-dd>-<slug>.md`. Create
  `.mifune/skills/wiki/corpus/raw/` before any write — it is gitignored and may be
  absent on a fresh clone.
- **Gitignore-by-default**: `.mifune/skills/wiki/corpus/*` is gitignored; the operator
  whitelists a curated entry into git with `git add -f <entry>`. `corpus/README.md`
  and `corpus/raw/README.md` are tracked directory anchors. A local-only scratch
  entry never breaks CI — the README index and the `wiki-readme-index.sh` probe are
  both built from the **git-tracked** entry set only.
- **Canonical schema**: frontmatter fields, body layout, slug derivation, the
  ≤600-word cap, cross-link convention, confidence lifecycle, and the body-merge
  strategy all live in `.mifune/skills/wiki/references/schema.md`. The reference docs
  and this dispatcher defer to it — they never redefine it.
- **Frontmatter extraction** (canonical, used identically by `query` and `lint`):
  ```bash
  awk '/^---$/{f=!f; next} f{print}' .mifune/skills/wiki/corpus/<slug>.md
  ```
- **Orchestrator-only write gate**: `ingest` writes (snapshots + entity pages) and
  `lint`'s `corpus/README.md` regeneration are orchestrator-only. Sub-agents propose
  drafts to `memory/<today>/wiki-drafts/<slug>.md`; the orchestrator promotes via
  `/wiki ingest --from-draft <slug>`. A sub-agent that writes directly to the corpus
  is out of scope and may be reverted.
- **Index reflects tracked entries**: `corpus/README.md`'s Index table is generated
  state owned by `lint`, sorted by `updated:` descending. Never hand-edit it.
- **Memory Improvement Protocol**: every invocation (OP, DRY-RUN, STALE, FAIL) appends
  a log entry per `.mifune/skills/retro/references/memory-protocol.md`, then runs the
  qualify/improve pass. The exact log shape is defined per subcommand in its reference.

## When NOT to use

- A topic that is a **behavioral norm** ("always do X") → a rule/skill, not the wiki.
- A **session journal** entry ("this run showed Y") → `memory/`, not the wiki.
- **Human-facing prose** → `docs/`, not the wiki (the wiki is LLM-readable synthesis).
- Full-text body search → direct `grep`; `query` is intentionally frontmatter-only.

## See Also

- `.mifune/skills/wiki/references/schema.md` — canonical schema and authoring rules
- `.mifune/skills/wiki/references/ingest.md` · `query.md` · `lint.md` — full procedures
- `.mifune/skills/retro/references/memory-protocol.md` — the Memory Improvement Protocol
- `evals/probes/wiki-readme-index.sh` — drift guard for the tracked corpus index
