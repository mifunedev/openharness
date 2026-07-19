# `scripts/`

Orchestrator scripts that run on the **host**, not inside the sandbox.
Provisioning, Ralph execution, and the cron runtime live here.

| File              | Purpose                                                            |
| ----------------- | ------------------------------------------------------------------ |
| `install.sh`      | Curl-piped installer — bootstraps a fresh harness checkout         |
| `ralph.sh`        | Ralph loop runner: `scripts/ralph.sh [--harness=…] <taskdesc>`     |
| `link-providers.sh` | Creates/repairs the provider skill/agent/hook symlinks into `.oh/` and validates the vendored pack is present. |
| `reconcile-herdr-integrations.sh` | Idempotently installs the pinned Herdr binary's official integrations for default and installed optional agents; set `HERDR_AUTO_INTEGRATIONS=false` to opt out. |
| `repo-orientation-benchmark-score.mjs` | Scores the CB-004 repo-orientation A/B benchmark report |
| `cron-runtime.ts` | Croner runtime — scans `.oh/crons/*.md`, schedules, fires each job     |
| `prompt-miner-caps.sh` | Origin-scoped PR-cap preflight for `.oh/crons/prompt-miner.md` — execs `autopilot-caps.sh` with `AUTOPILOT_REPO=mifunedev/openharness` + `AUTOPILOT_LABEL=prompt-miner` |
| `__tests__/`      | Vitest unit tests (`vitest.config.ts` at repo root targets this)   |

## Conventions

- Bash scripts use `set -euo pipefail` and an `ERR` trap where practical so silent exits
  surface as `ERROR:` lines (see `install.sh` header for the pattern).
- TypeScript scripts are run via `tsx` from the root `package.json`
  scripts; tests run via `pnpm test`.
- Scripts here are **orchestrator-scope only**. Anything an in-sandbox
  agent needs lives under `workspace/` or `install/`. Per `CLAUDE.md`,
  application code does not belong in `scripts/`.

## Adding a script

1. Drop it in `scripts/` with a one-line purpose comment in its header.
2. Add a row to the table above.
3. If it's TypeScript, add a unit test under `scripts/__tests__/`.
4. If it's a long-running entry point, wire a `pnpm` script in the root
   `package.json` rather than expecting users to invoke it directly.
