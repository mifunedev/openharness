---
title: "The implementation audit's promotable gate classifies the pushed head, not the audited tree"
slug: pattern-audit-remote-head-verdict
kind: pattern
tags: [audit, spec, promotable, head-mismatch, ci, gh]
created: 2026-09-03
updated: 2026-09-03
sources:
  - .oh/skills/audit/scripts/pr-classify.sh@2c955907
  - .oh/skills/spec/references/execute.md@2c955907
  - .oh/tasks/sandbox-registry/evidence.md@b2fcc812
confidence: provisional
---

# The implementation audit's promotable gate classifies the pushed head, not the audited tree

## Relevant Source Files
- `.oh/skills/audit/scripts/pr-classify.sh@2c955907` — reads the PR's `statusCheckRollup`, `mergeable`, and `mergeStateStatus` from GitHub; it never compares `headRefOid` to the local `HEAD`.
- `.oh/skills/spec/references/execute.md@2c955907` — step 10 requires the head comparison before the undraft, but step 5 (the implementation audit) does not.
- `.oh/tasks/sandbox-registry/evidence.md@b2fcc812` — the run: gate 3 `promotable: true` while the remote head was the scaffold commit.

## Summary
Gate 3 of `/audit implementation` asks GitHub whether the PR is promotable. GitHub
answers about the commit it has. If the owner audits before pushing — the normal
order when the tail is meant to finish before one push — the gate returns a green
verdict about a head that contains none of the code being audited.

## Detail
**Symptom.** `/audit implementation` reports gate 3 PASS with
`promotable: true, ci: PASS, mergeable: MERGEABLE` on a branch whose local
`HEAD` is many commits past the PR's remote head. In #950 the remote head was the
scaffold commit `31e9b3f9` (task folder only) while the local head `2c955907`
carried the whole implementation; the verdict was true and irrelevant.

**Root cause.** The classifier is a read of GitHub state and has no notion of the
local tree; the route binds `--branch` for the task-graph and slop gates but the
promotable gate keys on `--pr`. The workflow's head check lives only at the
undraft (step 10), where it correctly blocks — so the mismatch cannot promote a
wrong tree, but it can let an implementation audit *pass* on CI evidence that
has nothing to do with the implementation.

**Workaround.** Either push the audited head before running the implementation
audit (accepting that a later evidence commit re-enters step 10 anyway), or read
gate 3 in the implementation audit as "the PR is not *already* blocked" rather
than as CI evidence for this tree, and rely on the fresh `/audit pr` at step 10
for the promotable claim. A route change that makes gate 3 print
`headRefOid != HEAD — CI evidence is for another tree` instead of a verdict
belongs to a `/builder` proposal, not to this page.
