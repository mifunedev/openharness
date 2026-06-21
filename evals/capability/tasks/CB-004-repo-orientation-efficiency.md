---
id: CB-004
slug: repo-orientation-efficiency
title: "Orient in the repository with fewer tokens and tool calls"
axes: [success, cost-time, unattended]
skills: [/eval, /benchmark, /context-audit]
created: 2026-06-19
---

# CB-004 · Repo orientation efficiency

## Task
Given a fresh session and a common repository-orientation question, find the first correct source path faster and with less context waste by using `context/REPO_MAP.md` instead of raw filesystem scans or broad vendor/generated/runtime reads. The capability under test is whether startup-loaded repo guidance improves the whole harness's navigation efficiency, not merely whether the file exists.

## Success signal
- The repo-map contract probe is green: `bash .claude/skills/eval/run.sh --probe repo-map-contract` exits 0.
- `evals/capability/repo-orientation/tasks.json` defines the held-out workload mix, including no-orientation sessions that still pay startup cost.
- An A/B run compares at least 6 paired tasks with and without `context/REPO_MAP.md` loaded, covering no-orientation, light-orientation, and deep-orientation classes.
- The A/B report tracks total input tokens, tool calls before the first relevant file, time to correct path, accidental reads under disregard paths, and answer correctness.
- `scripts/repo-orientation-benchmark-score.mjs --report <report.json>` returns PASS: correctness equal or better, orientation median tool calls drop ≥20%, orientation median time drops ≥15%, poison-path reads do not increase, and expected token delta is ≤0 after counting repo-map startup cost.

## Rubric
| Axis | PASS | PARTIAL | FAIL |
|------|------|---------|------|
| success | Contract probe green and scorer PASS for a 6+ paired-task A/B report that covers the workload mix and shows equal/better correctness, lower median orientation time/tool calls, no increase in poison-path reads, and expected token delta ≤0 | Contract probe, manifest, and scorer exist, but no completed A/B report yet, or the scorer verdict is mixed/inconclusive | Contract probe fails, repo map is not startup-loaded, scorer is absent, or A/B scorer returns FAIL |
| cost-time | Benchmark can be completed in one planned pass with no retries and a bounded task set | Manual tally or one retry needed to complete the A/B comparison | Repeated retries, unclear instrumentation, or unbounded measurement effort |
| unattended | Benchmark run and report complete without human steering after task launch | One human nudge needed to clarify a route or metric | Human must manually author results or decide which evidence counts |

## Evidence basis
PR #462 adds the repo map, startup-load hook, source-map command, disregard/search routes, and the explicit performance caveat plus acceptance metric. The deterministic `repo-map-contract` probe guards the structural floor. The held-out workload lives in `evals/capability/repo-orientation/tasks.json`; the scorer lives in `scripts/repo-orientation-benchmark-score.mjs`. The total-system optimization claim requires that scorer to PASS on a real A/B report; until that run exists, the honest score is PARTIAL rather than PASS.

The manifest includes orientation and no-orientation tasks so the benchmark accounts for sessions that pay startup cost but do not benefit from repo navigation.

## Scoring method
Run paired sessions or scripted agent trials for the same task set: baseline without `context/REPO_MAP.md` in startup context, treatment with it. Record per task: first relevant path, correctness, input tokens, tool-call count before that path, elapsed time, and any reads under disregard paths. Write the report as JSON with `runs[]` entries carrying `task`, `variant` (`baseline` or `treatment`), `correct`, `inputTokens`, `toolCallsToFirstRelevantFile`, `elapsedSeconds`, and `poisonPathReads`. Score it with:

```bash
node scripts/repo-orientation-benchmark-score.mjs \
  --manifest evals/capability/repo-orientation/tasks.json \
  --report <report.json>
```

PASS requires expected-value savings across the workload mix after counting repo-map startup cost. Do not count a raw `tree` or vendor/generated/runtime read as a successful low-cost route.
