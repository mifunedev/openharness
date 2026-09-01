# /wiki compile — reference

> Full procedure for the `compile` subcommand of the `/wiki` dispatcher. The
> dispatcher (`.oh/skills/wiki/SKILL.md`) routes here when the first `$ARGUMENTS`
> token is `compile`. Canonical schema: `.oh/skills/wiki/references/schema.md`.

## Contents

- [Wiki Compile](#wiki-compile) — what this subcommand is for
- [When to Use / When NOT to Use](#when-to-use)
- [Argument Interface (locked)](#argument-interface-locked)
- [Instructions](#instructions) — §§ 1-6
- [Why this is not a session journal](#why-this-is-not-a-session-journal)
- [Anti-Patterns](#anti-patterns)

# Wiki Compile

Consolidate a `/retro` report into `kind: pattern` entries under
`.oh/knowledge/patterns/` — the harness's durable record of its own failure
modes and working strategies.

This is the Wiki Maintainer role. It exists because the harness produces lessons and
discards them: `/retro` nominates probe ids and writes nothing, and no skill owns the
edit its `proceduralize` triage prescribes. `compile` is the write step that closes
that gap without touching `/retro`, whose report-only contract is guarded by
`.oh/evals/probes/retro-deterministic-contract.sh` and must stay intact.

## When to Use

- After `/retro` (including its task-scoped form, `/retro --task <slug>`) emits a
  report with at least one `supported` hypothesis at `medium` or `high`
  confidence.
- To record counter-evidence against a pattern a later run refuted.
- Before `/builder` proposes a skill change, so the proposal has a pattern to cite.

## When NOT to Use

- **`/wiki ingest`** — for an external source. `compile` never fetches a URL and
  never writes to `.oh/knowledge/raw/`.
- **A per-run note.** One page per failure mode, never one per run. See the
  anti-patterns.
- **An `inconclusive` hypothesis.** It is not knowledge yet.

## Argument Interface (locked)

```
/wiki compile [--from <path>] [--task <slug>] [--dry-run]
```

| Argument | Meaning |
|----------|---------|
| *(none)* | Consume the `/retro` report already present in the current session's context. This is the normal path — `/retro` writes no file, so its report exists only as terminal output. |
| `--from <path>` | Read the report from a file: an operator-saved copy, or a sub-agent draft at `$TMPDIR/oh-wiki-drafts/<slug>.md`. |
| `--task <slug>` | Scope to `.oh/tasks/<slug>/`. Used to derive pinned-evidence `sources:` paths and to read `prd.md`, `progress.txt`, and `evidence.md` as corroborating evidence. |
| `--dry-run` | Print the proposed create-or-patch for each target page. Write nothing. |

The interface is locked; adding a flag requires editing this reference and
`.oh/evals/probes/wiki-compile-contract.sh`.

## Instructions

### 1. Read the report

Locate the report's `## Hypotheses` table and its promotion-candidate lines, which
`/retro` emits in this exact form:

```
- <principle> [<subsystem> · <confidence> · harden|proceduralize|eval] — probe: <id> | basis: <one clause>
```

With `--from <path>`, read that file instead. With neither a `--from` path nor a
report in context, print the usage line and exit 0. Do not invent a report.

### 2. Select what is eligible

Reuse `/retro`'s own promotion bar rather than inventing a second one.

| Verdict | Confidence | Action |
|---------|-----------|--------|
| `supported` | `high` or `medium` | create or patch a pattern page |
| `refuted` | `high` | patch an **existing** pattern that asserts the refuted claim, adding counter-evidence; never create a new page |
| `refuted` | `low` | no write |
| `inconclusive` | any | **never** written |

### 3. Derive the target slug — one page per failure mode

The slug is `pattern-<subsystem>-<failure-mode>`, derived from the hypothesis's
subsystem and the mode it describes — never from the date or the run.

```
GOOD  pattern-eval-probe-provenance-decay
BAD   pattern-2026-08-31-retro-findings
```

The `<subsystem>` token is the **knowledge base's** subsystem vocabulary — the prefix a
reader would grep for (`evals`, `wiki`, `docs`, `spec`) — not `/retro`'s
five-lens taxonomy, which names where a signal was *noticed* rather than what the
page is about. A lesson noticed through the continual-learning lens about probe
behavior is `pattern-evals-...`, never `pattern-continual-learning-...`.

**Fan-out.** One retro may legitimately yield several pages when it surfaced
several distinct modes, but each additional page must carry its own root cause and
its own workaround. If two candidate pages would share a workaround, they are one
mode: merge them. If they share a mechanism but their fixes point in opposite
directions, they are two.

Enumerate existing patterns before writing:

```bash
ls .oh/knowledge/patterns/pattern-*.md 2>/dev/null
```

If a page for that failure mode exists, **patch it**. A run that surfaces three
lessons about one failure mode produces one patch, not three pages.

### 4. Create or patch

**Create** follows the pattern body layout in
`.oh/skills/wiki/references/schema.md` § 3: `kind: pattern`, `confidence:
provisional`, a required `## Relevant Source Files`, and `## Detail` carrying
`**Symptom.**`, `**Root cause.**`, and `**Workaround.**` as bold leads.

`sources:` uses the pinned-evidence form `<repo-relative-path>@<short-sha>` — for
example `.oh/tasks/<slug>/progress.txt@a1b2c3d` or `.oh/evals/RESULTS.md@a1b2c3d`.
Resolve the sha with `git rev-parse --short HEAD` at the time of the observation.
When a defect was observed and fixed in the same session, pin **both** shas — the
before-state is the evidence for the symptom and the after-state is the evidence for
the workaround. Multiple `sources:` entries are expected, not exceptional.

**`/wiki compile` MUST NOT write a `raw/` snapshot of a `/retro` report.** `raw/`
holds snapshots of external sources. Persisting retro reports there would recreate
the per-session journal tier the harness deliberately removed, wearing a new name,
and would launder around `/retro`'s report-only contract.

**Patch** applies the body-merge strategy in
`.oh/skills/wiki/references/schema.md` § 11 as amended by § 11a. This reference
does not restate those steps and must not diverge from them. The load-bearing
part of § 11a: `**Workaround.**` is append-only, and a workaround shown not to work is
annotated `(superseded YYYY-MM-DD, SI-nnnn)` rather than deleted.

### 5. Promote and reindex

Pattern pages are always staged. An untracked pattern page is invisible
provenance, and it is the knowledge base's only durable record of what a rejected
cycle taught. `.oh/knowledge/patterns/` is tracked by default
(`schema.md` § 2), so a plain `git add` is enough — the `-f` the gitignored
corpus used to need is gone with it.

```bash
git add .oh/knowledge/patterns/pattern-<name>.md
```

Then regenerate the index by running `/wiki lint` (non-dry-run) and verify:

```bash
bash .oh/evals/probes/wiki-readme-index.sh
```

`compile` never hand-edits `.oh/knowledge/README.md` — `lint` owns it.

### 6. Report

Print to the terminal and write no report file:

```
Slugs-Created:        <slug> ...
Slugs-Patched:        <slug> ...
Hypotheses-Compiled:  <n> of <m>
Skipped:              <hypothesis> — <verdict>/<confidence>
Result:               OP | DRY-RUN | FAIL
```

## Write gate

Pattern-page writes are **orchestrator-only**, the same rule that governs `ingest`
writes and `lint`'s index regeneration. A sub-agent proposes a draft at
`$TMPDIR/oh-wiki-drafts/<slug>.md`; the orchestrator promotes it with
`/wiki compile --from $TMPDIR/oh-wiki-drafts/<slug>.md`. A sub-agent that writes
directly to the corpus is out of scope and may be reverted.

## Why this is not a session journal

The `.oh/memory` tier was removed as a concept (`CHANGELOG.md`) because it held one
entry per session, keyed by date, with no consumer. Every structural property here is
the opposite:

| `.oh/memory` (deleted) | `.oh/knowledge/patterns/pattern-*.md` |
|---|---|
| One entry per session, keyed by date | One page per **failure mode**, keyed by subsystem and mode |
| Grew with every run | Grows only when a run teaches something not already recorded |
| No consumer; nothing read it | Read by the proposer role through `/wiki query --patterns` |
| Any skill could write | Orchestrator-only, through this one subcommand |
| Gitignored, unreviewable | Force-added and reviewed in the PR that lands it |

The sharp test is `/retro`'s own anti-pattern, "inventing a file to save a lesson
in". A dated per-run page fails that test. A page named for a failure mode, patched
rather than appended to, and cited by a skill proposal, passes it.

## Anti-Patterns

- **One page per run** — the single failure mode of this subcommand. A page named
  for a date is a journal entry. Name it for the failure mode and patch on repeat.
- **Snapshotting the retro report into `.oh/knowledge/raw/`** — see § 4. `raw/`
  is for external sources; `/retro` output is ephemeral by contract.
- **Compiling an `inconclusive` hypothesis** — the report already judged it not to be
  knowledge. Compiling it launders a guess into the knowledge base.
- **Deleting or blanking a pattern page because the change it motivated was
  rejected** — forbidden by `.oh/skills/wiki/references/schema.md` § 12. That
  knowledge is the rejected cycle's entire output.
- **Replacing `## Detail` wholesale** — that is § 11 behavior for entity pages.
  For a pattern it erases accumulated failure knowledge; § 11a governs instead.
- **Restating the merge steps here** — § 11 and § 11a own them. A second copy
  will drift.
- **Retired audit vocabulary in pattern prose** — the token list enforced by
  `.oh/evals/probes/audit-stale-references.sh` covers every tracked file, this
  knowledge base included. Read that probe's pattern before writing about an audit subsystem, and
  use the current route names.
- **Skipping the reindex** — a new tracked pattern page without a regenerated
  `README.md` is an immediate `wiki-readme-index.sh` regression.

## See Also

- `.oh/skills/wiki/references/schema.md` — § 2 layout and the tracked boundary, § 3 pattern body layout, § 8 confidence, § 11a merge amendment, § 12 persistence invariant
- `.oh/skills/wiki/references/query.md` — the `--patterns` read path
- `.oh/skills/wiki/references/lint.md` — index regeneration and the health checks
- `.oh/skills/retro/SKILL.md` — the report this subcommand consumes; report-only by contract
- `.oh/evals/decisions/skill-impact.md` — where the proposal a pattern motivates is recorded
