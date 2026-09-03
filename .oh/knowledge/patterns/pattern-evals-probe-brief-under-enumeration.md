---
title: "A probe brief derived from a name grep misses the probes that pin behaviour"
slug: pattern-evals-probe-brief-under-enumeration
kind: pattern
tags: [evals, probes, spec, delegate, blast-radius, briefing]
created: 2026-09-03
updated: 2026-09-03
sources:
  - .oh/tasks/sandbox-registry/progress.txt@b2fcc812
  - .oh/tasks/sandbox-registry/evidence.md@b2fcc812
  - .oh/evals/probes/oh-lifecycle-surface.sh@2c955907
  - .oh/evals/probes/oh-config-surfaces.sh@2c955907
confidence: provisional
---

# A probe brief derived from a name grep misses the probes that pin behaviour

## Relevant Source Files
- `.oh/tasks/sandbox-registry/progress.txt@b2fcc812` — the wave-2a line: nine probes briefed, sixteen red on the first suite run.
- `.oh/evals/probes/oh-lifecycle-surface.sh@2c955907`, `.oh/evals/probes/oh-config-surfaces.sh@2c955907` — two of the seven unlisted probes; neither contains the retired verb names the brief grepped for.

## Summary
When a change retires a surface, the advisor enumerates the probes an executor
must re-point by grepping the tree for the retired names. Probes that pin the
surface's *behaviour* — the verb table, where config is resolved from, the compose
bind — contain none of those names and are missed. The executor discovers them
only by running the suite, after the brief has already fixed its file list.

## Detail
**Symptom.** A probe-wave brief lists N probes; the executor's first
`bash .oh/skills/eval/run.sh` on the post-change tree reports more than N red.
In task `sandbox-registry` (#950) the brief listed nine one-line edits; sixteen
probes were red, and the seven extra ones (`oh-compose-env-wiring`,
`oh-config-surfaces`, `oh-destroy-guard`, `oh-devcontainer-restructure`,
`oh-home-mount`, `oh-lifecycle-surface`, `skills-task-tool-coupling`) asserted
behaviour the wave-1 CLI change altered — the lifecycle verb list, a `$HOME`
config-resolution rule, the `..:` bind — without naming `oh init` or `oh runtime`.

**Root cause.** The grep answers "which files mention the thing being removed",
but a probe's oracle is written against what the tree *does*, and a probe that
guards a behaviour usually does not spell the verb that implements it. The two
sets overlap only where a probe happened to quote a help string. Because the
brief is written before wave 1 lands, the advisor has no post-change tree to run
the suite against and substitutes the grep for the run.

**Workaround.** Enumerate by running, not by grepping: once the first executor's
head exists, run the suite on it (or on a scratch merge) before writing the
probe brief, and list every non-PASS row with its reason. When the brief must be
written earlier, say so in it and instruct the executor to treat the suite run as
the authoritative list and to own every probe under `.oh/evals/probes/` that the
run turns red — which is what let wave 2a absorb the seven extras without a
round trip. The static grep stays useful as the *negative* check (D6-style: no
retired name remains), not as the blast-radius list.
