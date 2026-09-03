---
title: "Unit tests with a stubbed runner cannot see state a verb fails to persist"
slug: pattern-spec-stubbed-runner-state-gap
kind: pattern
tags: [spec, cli, testing, evidence, rehearsal, persistence]
created: 2026-09-03
updated: 2026-09-03
sources:
  - .oh/tasks/sandbox-registry/evidence.md@b2fcc812
  - .oh/tasks/sandbox-registry/progress.txt@b2fcc812
  - .oh/cli/src/commands/sandbox.ts@1b13bb1d
confidence: provisional
---

# Unit tests with a stubbed runner cannot see state a verb fails to persist

## Relevant Source Files
- `.oh/tasks/sandbox-registry/evidence.md@b2fcc812` — the D2 rehearsal transcript that showed an entry `oh.json` with no `image.ref` after `--image=<ref>`.
- `.oh/cli/src/commands/sandbox.ts@1b13bb1d` — the fixup that persists the explicit ref.

## Summary
A verb that both writes state and spawns a process is usually tested with the
process stubbed and the argv asserted. That proves the verb *used* the value; it
does not prove the verb *kept* it. A later verb that re-reads the persisted state
sees the default, and the only test that notices is a live run of two verbs in
sequence.

## Detail
**Symptom.** `oh sandbox install docker --image=openharness:one-door` booted the
right image (the runner received `OH_SANDBOX_IMAGE`), 895 unit tests were green,
and the registry entry's `oh.json` had `image: { mode: "image" }` with no `ref`.
Every subsequent `oh ps` / `oh restart` on that entry rendered the default
`ghcr.io/…:latest` into `compose.env`. The gap was found by rehearsing the D2
evidence leg against the wave-1 head, hours before the merge.

**Root cause.** The install tests stub the runner and assert the spawned argv,
which is where the flag's *immediate* effect lives; the persisted entry is
asserted only for the fields the wizard writes. Nothing in the test set runs a
second verb against the entry the first verb wrote, so a value that is threaded
through the environment rather than the entry looks correct to every test.

**Workaround.** Rehearse the evidence leg against the first executor head, not
only the merged head: a real `install → list → ps → restart → destroy` sequence
exercises the persisted entry as the source of truth for later verbs. In the
unit suite, for any flag that both changes a spawn and should outlive it, add the
assertion on the persisted file (`readJson(entry).image.ref === ref`), which is
what the fixup added.
