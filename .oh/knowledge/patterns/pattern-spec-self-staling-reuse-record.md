---
title: "A commit-keyed reuse record goes stale the moment it is committed"
slug: pattern-spec-self-staling-reuse-record
kind: pattern
tags: [spec, evals, caching, provenance, freshness, build-cycle]
created: 2026-09-01
updated: 2026-09-02
sources:
  - .oh/skills/spec/references/execute.md@fcbeedea
  - .oh/evals/probes/eval-runs-once-per-cycle.sh@fcbeedea
  - .oh/tasks/repo-knowledge-loop/eval-result.json@fcbeedea
  - .oh/tasks/one-door/eval-result.json@c20ea4b8
  - .oh/tasks/one-door/evidence.md@c20ea4b8
confidence: provisional
---

# A commit-keyed reuse record goes stale the moment it is committed

## Relevant Source Files
- `.oh/skills/spec/references/execute.md` — publishes `eval-result.json` keyed to
  `git rev-parse HEAD` and `git add -f`s it in the same step.
- `.oh/evals/probes/eval-runs-once-per-cycle.sh` — the oracle that requires every
  reader to compare the record's `commit` against HEAD before reusing it.
- `.oh/tasks/repo-knowledge-loop/eval-result.json@fcbeedea` — the record three
  consecutive audits declined to reuse.

## Summary
A cache record that stores the commit it was measured against, and is then
committed into that same repository, can never satisfy `commit == HEAD`: writing
it moves HEAD past the commit it names. Readers that honor the freshness key
therefore always take the fallback, and the optimization the record exists for
never fires — while every artifact still reports the design as working.

## Detail
**Symptom.** A downstream reader that is documented to reuse a published result
re-derives it every time, and nothing reports a problem. In this harness
`/audit implementation` gate 2 read `.oh/tasks/<slug>/eval-result.json` on three
consecutive runs of one build, found `commit` behind HEAD each time, and ran the
127-probe suite itself — which is the contract's correct behavior on a stale
record and also its only behavior.

**Root cause.** The record is produced by `bash .oh/skills/eval/run.sh` at some
commit `C`, written with `"commit": "$(git rev-parse HEAD)"` = `C`, and then
staged and committed as `C+1`. From `C+1` onward the file asserts `C`, so the
equality the reader checks is false at every subsequent commit including the one
that introduced the file. The freshness rule itself is right — a record from an
earlier HEAD describes code no longer under test — and the guard that enforces it
is green. Nothing is broken; the reuse path is simply unreachable, and no artifact
distinguishes "the fallback fired because the branch moved" from "the fallback
always fires".

**Workaround.** State the lifetime in the contract rather than implying reuse is
the normal path: a committed reuse record is valid only for readers running
*before* it is committed, so a reader that finds it stale is behaving normally and
should say so rather than reporting an anomaly. Where reuse across commits is
actually wanted, key the record on the content it measured — the tree hash of the
inputs, or the probe-set digest — rather than on the commit that contains the
record, so writing the record does not invalidate it. Do not answer this by
relaxing the equality check to "recent enough": that reintroduces the age
heuristic the freshness rule replaced.

Corroborated in task `one-door` (#948): the record committed at `5b08c004` was
two commits stale when `/audit implementation` read it at `0fe00420`, and the
audit driver could not re-run the suite itself, so gate 2 reported the floor as
unobtainable. Workaround, appended 2026-09-02: re-run the suite at the audited
HEAD and rewrite `eval-result.json` **on disk without committing it** before the
audit; the reader then finds `commit == HEAD` and reuses the record honestly, and
the file is committed afterwards together with `evidence.md`. The reuse path is
reachable only for readers that run before the record's own commit.

## See Also
- [[plan-vs-built-reconciliation]]
- [[pattern-evals-unexercised-oracle]]
