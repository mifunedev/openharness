---
title: "A short-circuiting reader turns a successful match into a failed pipeline"
slug: pattern-evals-pipefail-early-exit
kind: pattern
tags: [evals, probes, bash, pipefail, sigpipe, false-failure, shell]
created: 2026-09-01
updated: 2026-09-01
sources:
  - .oh/evals/probes/knowledge-source-freshness.sh@fcbeedea
  - .oh/skills/wiki/references/lint.md@fcbeedea
  - .oh/tasks/repo-knowledge-loop/evidence.md@fcbeedea
confidence: provisional
---

# A short-circuiting reader turns a successful match into a failed pipeline

## Relevant Source Files
- `.oh/evals/probes/knowledge-source-freshness.sh` — the probe where the defect
  appeared, and the capture-then-match form that fixes it.
- `.oh/skills/wiki/references/lint.md` — the same check written as procedure,
  carrying the warning so the next author meets it before writing the pipeline.
- `.oh/tasks/repo-knowledge-loop/evidence.md@fcbeedea` — the run that produced the
  observation.

## Summary
Under `set -o pipefail`, a reader that exits as soon as it is satisfied kills the
writer with SIGPIPE, and the pipeline's status becomes the writer's 141 rather
than the reader's 0. The assertion then reports **not found** at exactly the
moment it found what it was looking for, and it does so intermittently, because a
writer that finishes before the reader exits produces the correct answer.

## Detail
**Symptom.** A shell assertion of the form `<producer> | grep -q <pattern>`
reports failure while the same pattern demonstrably matches the producer's output
when run by hand. In this harness it appeared as a pinned-provenance check
insisting that a path was absent from a commit tree that plainly contained it; the
same two commands, run separately, matched immediately. Roughly two debug cycles
went into the pattern and the escaping before the pipeline itself was suspected.

**Root cause.** `grep -q` exits on its first match by design. That closes the read
end while the producer is still writing, the producer takes SIGPIPE and exits 141,
and `pipefail` propagates the highest non-zero status — so the pipeline is false
*because* the match succeeded. The failure is load-dependent: a producer whose
output fits the pipe buffer finishes first and the pipeline returns 0, which is
why the shape survives review and passes on small fixtures. Every ingredient is
individually correct — `pipefail` catches real producer failures, `-q` avoids
buffering a large tree, `set -e` stops on error — and the defect exists only in
their combination.

**Workaround.** Capture the producer's output into a variable, then match against
the capture:

```bash
tree="$(git ls-tree -r --name-only "$sha" 2>/dev/null || true)"
grep -qxF "$path" <<<"$tree"
```

The producer runs to completion, its own failure is still handled explicitly, and
the match is a plain exit status. Where capture is genuinely too large, terminate
the pipeline with `|| true` and test a captured count instead of relying on the
pipeline's status. Do not reach for `set +o pipefail` around the line: that
disarms the guard for real producer failures in the same statement.

## See Also
- [[pattern-evals-unexercised-oracle]]
- [[pattern-evals-prose-literal-pinning]]
