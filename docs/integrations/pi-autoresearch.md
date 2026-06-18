---
sidebar_position: 3
title: Pi Autoresearch
---

# Pi Autoresearch

Open Harness loads [`pi-autoresearch`](https://github.com/davebcn87/pi-autoresearch)
as a project-local Pi package from `.pi/settings.json`:

```json
"npm:pi-autoresearch@1.6.0"
```

Pi installs missing project packages automatically on startup after the project
is trusted. Open Harness uses this package path instead of vendoring upstream
source into `.pi/extensions/` so the integration stays small, pinned, and easy
to update.

## What it adds

`pi-autoresearch` is an autonomous optimization loop for Pi: try a change, run a
metric, log the result, keep the win or revert the loss, and repeat.

The package registers:

- Extension tools: `init_experiment`, `run_experiment`, and `log_experiment`.
- Slash command: `/autoresearch` with `off`, `clear`, and `export` subcommands.
- Skills: `/skill:autoresearch-create`, `/skill:autoresearch-finalize`, and
  `/skill:autoresearch-hooks`.
- UI: a live results widget, confidence scoring, `/autoresearch export`, and a
  fullscreen dashboard shortcut (`Ctrl+Shift+F` by default upstream).

## Start a session

From an interactive Pi session in the sandbox:

```text
/skill:autoresearch-create
```

The skill asks for or infers the optimization goal, command, metric, and file
scope. It then creates `.auto/` session files, records a baseline, and starts the
loop.

Useful controls:

```text
/autoresearch export      # open the live dashboard
/autoresearch off         # stop auto-resume; keep .auto/log.jsonl
/autoresearch clear       # delete .auto/log.jsonl and reset runtime state
/skill:autoresearch-finalize
```

Use `/skill:autoresearch-finalize` after a noisy experiment branch has useful
kept results. It groups kept experiments into clean review branches.

## `.auto/` session contract

All autoresearch runtime state lives under `.auto/` in the session working
directory. Open Harness gitignores this folder because it is scratch state.

| File | Purpose |
|------|---------|
| `.auto/prompt.md` | Objective, metric, files in scope, and what has been tried. |
| `.auto/measure.sh` | Benchmark script. It should output `METRIC name=number` lines. |
| `.auto/log.jsonl` | Append-only result log written by the tools. |
| `.auto/checks.sh` | Optional correctness backpressure after passing benchmarks. |
| `.auto/hooks/` | Optional before/after hook scripts authored with `/skill:autoresearch-hooks`. |
| `.auto/config.json` | Optional config for `workingDir` and `maxIterations`. |

Set a cap before long-running sessions:

```json
{
  "maxIterations": 20
}
```

`maxIterations` is the token-spend guardrail. Autoresearch is designed to keep
running until interrupted or capped, so do not start it on expensive workloads
without a limit and a cheap `measure.sh`.

## Verify installation

Check the project package pin:

```bash
jq '.packages[]' .pi/settings.json | grep 'pi-autoresearch@1.6.0'
```

Check package metadata without starting Pi:

```bash
npm view pi-autoresearch@1.6.0 'pi' 'version'
```

In an interactive/trusted Pi project, `pi list --approve` should include
`npm:pi-autoresearch@1.6.0`. To try the package without installing it into
settings:

```bash
pi -e npm:pi-autoresearch@1.6.0
```

Then confirm the autoresearch skill commands and `/autoresearch` command appear
in Pi's command list.

## Relationship to `/autopilot`

`pi-autoresearch` overlaps with `/autopilot` in one narrow sense: both are
autonomous loops that mutate git state, run measurements, and decide whether a
change is worth keeping.

They are not substitutes.

| Surface | Owner | Scope | Stop/guard model |
|---------|-------|-------|------------------|
| `/autopilot` | Open Harness | Scheduled harness-infra self-improvement: select an issue, build a PR, run eval/CI/PR gates, respect daily/total PR caps. | Harness caps, issue/PR dedupe, `/eval`, `/pr-audit`, `/ship-spec`, and operator review. |
| `pi-autoresearch` | Operator-invoked Pi package | Metric optimization in a chosen working directory: try ideas, benchmark, log, keep/revert, repeat. | `.auto/config.json maxIterations`, interrupt controls, optional checks/hooks, and finalization into review branches. |

The overlap points are benchmark-driven keep/revert decisions, long-running
autonomy, token spend, and git mutations. For v1, Open Harness only exposes and
documents the package. It does **not** wire `pi-autoresearch` into `/autopilot`,
`/benchmark`, `/eval`, or `/ship-spec`.

Follow-on questions before any integration:

- Can `pi-autoresearch` run held-out capability-benchmark experiments without
  bypassing `/autopilot`'s issue/PR/eval governance?
- Should `/benchmark` call autoresearch for exploratory optimization, or should
  it remain a verdict gate only?
- How would autoresearch session state be bounded by the same caps that protect
  scheduled `/autopilot` runs?

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Package is not listed | Project not trusted or packages not reconciled yet | Run `pi list --approve` or restart Pi from the trusted project root. |
| Loop runs too long | No `maxIterations` cap | Add `.auto/config.json` with a small cap and use `/autoresearch off`. |
| Results are noisy | Metric variance is high | Re-run promising experiments and use the confidence score as advisory, not proof. |
| Correctness regresses | Benchmark only measured speed/size | Add `.auto/checks.sh` with tests, typecheck, or lint. |
