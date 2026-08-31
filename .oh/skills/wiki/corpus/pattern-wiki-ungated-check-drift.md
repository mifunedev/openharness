---
title: "Report-only checks nothing gates on stop being run"
slug: pattern-wiki-ungated-check-drift
kind: pattern
tags: [wiki, lint, evals, probes, report-only, drift, gating]
created: 2026-08-31
updated: 2026-08-31
sources:
  - .oh/skills/wiki/corpus/recursive-language-models.md@8fab04ab
  - .oh/skills/wiki/references/lint.md@8fab04ab
  - .oh/evals/probes/wiki-readme-index.sh@8fab04ab
confidence: provisional
---

# Report-only checks nothing gates on stop being run

## Relevant Source Files
- `.oh/skills/wiki/references/lint.md` — the six health checks, all report-only.
- `.oh/skills/wiki/corpus/recursive-language-models.md@8fab04ab` — carried three unresolvable links for two months.
- `.oh/evals/probes/wiki-related-slugs.sh` — the probe minted to close this instance.
- `.oh/skills/spec/references/execute.md` — where the groom triad was deliberately cut from the cycle.

## Summary
A health check that only reports, and that no gate consults, converges on never
being run at all. Its findings do not accumulate as visible debt; they accumulate as
silence, and the check's own green-looking absence is mistaken for health.

## Detail
**Symptom.** `.oh/skills/wiki/corpus/recursive-language-models.md@8fab04ab` shipped
`related: [inspectable-agent-harness, prompt-miner, repo2rlenv]` and three matching
`[[slug]]` body links. None of the three slugs has ever existed in the corpus. The
`related:` list was genuinely unchecked, but the body links were covered by `/wiki
lint` check 4, which has existed since v1 and would have reported all three. The
entry sat that way from 2026-06-27 to 2026-08-31. The check was not broken — it had
simply not been run.

**Root cause.** `/wiki lint` is report-only by design, and `/spec execute`
deliberately cut the groom triad from the per-cycle tail
(`.oh/skills/spec/references/execute.md`) on the sound reasoning that report-only
health checks "never blocked a merge" and spent cycle budget on advisory output.
That reasoning is correct about cost and wrong about consequence: removing the only
scheduled caller of a report-only check does not make it cheaper, it makes it
optional, and optional converges on never. The same shape produced a ten-week gap in
`retro lesson` probe provenance — `/retro` nominates probe ids and no skill owns the
minting, so nomination without an owner also converges on never.

**Workaround.** When a check is worth keeping but not worth gating a merge on, give
it a deterministic oracle under `.oh/evals/probes/` that fails on the *findings*
rather than on the check having been run. `wiki-related-slugs.sh` does this: it
re-derives the finding set directly and exits REGRESSION when it is non-empty, so
the condition is enforced by the suite that already runs, and the prose check
becomes documentation of the same rule rather than its only enforcement. Do not
answer this pattern by re-adding the check to a per-cycle tail — that restores the
cost the removal was right to avoid, and still depends on someone reading advisory
output.

## See Also
- [[wikiskill-experience-compilation]]
