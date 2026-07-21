---
name: teach
argument-hint: "<task-slug-or-branch> [--wiki <slug>] [--dry-run]"
description: |
  Post-implementation communication and learning pass. Reads the completed task
  artifacts and relevant wiki entry, revises or proposes wiki updates when the
  implementation changed the provisional model, then teaches the operator the
  final mental model with verification evidence and understanding checks.
  TRIGGER when: /teach invoked, "teach me this change", post-implementation
  understanding, operator communication, or after implementation/audit when the
  maintainer needs the final model rather than another build step.
---

# Teach

`/teach` is the post-implementation communication pass. It turns a completed change into operator understanding: first align the shared wiki model with what actually shipped, then teach from that updated model.

It is **not** an implementation, audit, retro, or merge gate. `/teach` does not write application code, fix the PR, run reviews, mark PRs ready, or promote session lessons to memory. Those jobs belong to the implementation executor, `/audit implementation` or `/audit pr`, `/retro`, and the PR workflow. `/teach` communicates what is now true and checks that the operator can use that understanding.

## When to use

- `/teach <task-slug>` after a Ralph/ship-spec task reaches implementation completion and audit/eval evidence is available.
- `/teach --wiki <slug>` when the relevant knowledge model is known and should be checked before teaching.
- "teach me this change" or "explain what shipped" after a non-trivial harness change.
- Post-implementation operator communication: converting PR artifacts into a concise mental model, consequences, caveats, and checks.

## When NOT to use

- **Before implementation is complete.** Use `/ship-spec`, `/delegate`, or `scripts/ralph.sh` to finish the task first.
- **To decide promotability.** Use `/audit implementation <slug>` for one implementation or `/audit pr <N>` for one PR.
- **To capture session lessons.** Use `/retro` for falsifiable hypotheses and memory promotion.
- **To create a new research wiki entry from an external source.** Use `/wiki ingest` for source capture; `/teach` may revise an existing task-relevant entry or propose edits.

## Instructions

### 1. Resolve scope

Arguments received: `$ARGUMENTS`

Identify:
- **Task slug or branch** — prefer `.oh/tasks/<slug>/` when present. If a branch is given, derive the slug from its trailing segment only after checking for an exact `.oh/tasks/<slug>/` match.
- **Relevant wiki slug** — use `--wiki <slug>` if provided. Otherwise search likely wiki entries by task terms and by changed conceptual surface. If no relevant entry exists, say so and propose the one entry that should be created via `/wiki ingest` or manual wiki authoring; do not fabricate a source-backed entry.
- **Mode** — `--dry-run` reports the proposed wiki changes and teaching output without writing.

### 2. Read evidence before teaching

Read the task artifacts first:

1. `.oh/tasks/<slug>/prd.md` — intended goals, non-goals, and acceptance criteria.
2. `.oh/tasks/<slug>/progress.txt` — implementation chronology, files changed, commits, and Codebase Patterns.
3. `.oh/tasks/<slug>/prd.json` — story pass state and branch name when present.
4. `.oh/tasks/<slug>/critique.md` — critic findings and mitigations when present.
5. Eval/audit/verification evidence when present: `.oh/evals/RESULTS.md`, targeted probe output in `progress.txt`, `/audit implementation` or `/audit pr` notes, CI status, and commit/PR evidence.
6. The relevant wiki entry (`.oh/skills/wiki/corpus/<wiki-slug>.md`) before drafting the teaching response.

If any required task artifact is missing, proceed only with a caveat naming the missing file. Do not invent verification evidence.

### 3. Compare shipped reality to the wiki model

Before teaching, decide whether the existing wiki model is still accurate:

- **No wiki entry exists** — propose a concise wiki entry title/slug and the evidence it should cite. Do not teach as if the wiki already contains it.
- **Wiki entry exists and remains accurate** — note `Wiki action: no change` with one sentence explaining why.
- **Wiki entry exists but the implementation changed or finalized the provisional model created during `/ship-spec`** — revise the wiki first when the change is small, source-backed by the task artifacts, and safe for the orchestrator to write. Otherwise propose a concrete patch or bullet list of revisions before teaching.

The wiki update/proposal must happen before the final teaching output. The operator should learn from the corrected model, not from stale PR archaeology.

Wiki-write boundaries:
- Keep entries within `.oh/skills/wiki/references/schema.md` schema and word cap.
- Update `updated:` when editing an existing entry; do not change `created:`.
- Preserve `sources:` provenance; if task artifacts are the evidence, cite their paths in the proposed revision text rather than pretending they are raw external snapshots.
- Do not use `/teach` for broad wiki restructures. If the model needs a new source capture, hand off to `/wiki ingest`.

### 4. Teach the final model

After the wiki step, produce exactly these sections:

```markdown
## Mental model
<Concise model of what changed and how to think about it.>

## What changed
- <Concrete shipped change, with paths/commits when useful.>

## Why it matters
<Operator-facing consequence: what this lets the harness or maintainer do differently.>

## Verification evidence
- <Tests, probes, eval/audit/CI evidence, or explicit caveat if not available.>

## Known caveats
- <Remaining limits, runtime reload requirements, stale docs, or follow-up risks.>

## Understanding checks
1. <Question that tests the main mental model.>
2. <Question that tests an operational consequence.>
3. <Optional edge-case/caveat question.>
4. <Optional verification/evidence question.>
```

Use 2-4 understanding checks. Prefer open-ended questions; multiple choice is allowed when it sharpens an edge case. Do not include the answer key unless the operator asks.

### 5. Keep the boundary sharp

`/teach` may update or propose updates to wiki/docs understanding. It must not:

- change implementation files to satisfy acceptance criteria,
- run a new implementation loop,
- mark `prd.json` stories passing,
- undraft, merge, or close PRs,
- replace `/retro` memory promotion, or
- emit a loop-routing `STATUS:` token.

## Output contract

Always include the teaching sections in § 4. Prepend a short `Wiki action:` line before them:

- `Wiki action: updated .oh/skills/wiki/corpus/<slug>.md — <summary>`
- `Wiki action: proposed update for .oh/skills/wiki/corpus/<slug>.md — <summary>`
- `Wiki action: no change — <reason>`
- `Wiki action: no entry found — proposed <slug>`

No terminal `STATUS:` line is emitted because `/teach` is a communication pass, not a loop node or gate.
