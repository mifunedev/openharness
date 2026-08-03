# Verification Evidence

Date: 2026-08-03
Base: `origin/development@b0288f37`
Issue: [#703](https://github.com/mifunedev/openharness/issues/703)

## Focused checks

| Check | Result | Evidence |
|---|---|---|
| Frozen dependency install | PASS | `pnpm install --frozen-lockfile`; lockfile current, 162 packages installed; security preinstall found no vulnerabilities |
| Focused smoke Vitest | PASS | `pnpm exec vitest run .oh/scripts/__tests__/sandbox-boot-smoke.test.ts`; 1 file, 3 tests passed |
| Bash syntax | PASS | `bash -n .oh/scripts/sandbox-boot-smoke.sh` |
| Shellcheck | PASS | CI-equivalent `shellcheck -S warning` across all workflow globs; no warnings |
| Hadolint | PASS | hadolint 2.12.0 with repository `.hadolint.yaml` policy (`DL4006`, `DL3008`, `DL3016`, `DL3003` ignores; warning threshold); only non-gating existing info findings |
| Diff whitespace | PASS | `git diff --check` |

## Image checks

Command: `DOCKER_BUILDKIT=0 docker build -f .devcontainer/Dockerfile -t openharness-default-image-utils:test .`

Result: PASS; image ID `464320d309be`.

Runtime command used `docker run --rm --entrypoint /bin/bash -u sandbox openharness-default-image-utils:test -lc ...` and established:

- `dpkg-query -W`: `lsof 4.95.0-1`, `htop 3.2.2-2`, `inetutils-telnet 2:2.4-2+deb12u3`.
- `dpkg -s telnet` reports absent; no transitional `telnet` package is installed.
- Commands resolve as `/usr/bin/lsof`, `/usr/bin/htop`, and `/usr/bin/telnet`.
- `lsof -v`, `htop --version` (`htop 3.2.2`), and `telnet --version` (`GNU inetutils 2.4`) succeed as `sandbox`.
- `/usr/bin/telnet` resolves to `/usr/bin/inetutils-telnet`, owned by package `inetutils-telnet`.

## Full local gates

| Gate | Result |
|---|---|
| `pnpm run security:audit` | PASS; no known vulnerabilities |
| `pnpm run lint` | PASS; repository reports no root lint configured |
| `pnpm run format:check` | PASS; repository reports no root format check configured |
| `pnpm run typecheck` | PASS; `.oh/cli` `tsc --noEmit` |
| `pnpm run build:harness` | PASS; CLI bundle built |
| `pnpm test:scripts` | PASS in CI-clean environment; 39 files and 478 tests passed |
| `bash .oh/scripts/check-pnpm-pin.sh` | PASS; Dockerfile and package.json both pin pnpm 10.33.0 |
| Base compose config | PASS |
| Hermes dashboard compose config | PASS |
| `bash .oh/skills/eval/run.sh` | PASS; 95 probes run, 91 PASS/4 SKIPPED, no new regression |

The first unisolated full-test attempt inherited live sandbox variables (`SANDBOX_SSH=true` and Slack variables), causing four environment-dependent fixture failures. Re-running with those live-service variables unset—the clean CI environment—passed all 478 tests. No source change was needed.

## Full sandbox boot smoke feasibility

The bounded smoke was attempted with a unique compose project, prebuilt test image, `SKIP_PNPM_INSTALL=1`, and SSH port 32223. It could not exercise boot in this agent container because the host Docker daemon cannot see this container-only linked-worktree bind source; compose mounted an empty path, then health failed with missing `.oh/scripts/sandbox-healthcheck.sh` and host UID 0 ownership symptoms. The EXIT trap ran and `down -v --remove-orphans` removed the test stack. This is an execution-environment bind-namespace blocker, not an image failure. GitHub's Sandbox Boot Guard uses a runner workspace shared with its Docker daemon and remains the authoritative full-smoke gate.

## CI

Ready PR: [#704](https://github.com/mifunedev/openharness/pull/704), targeting `development`.

Current-head source of truth: [PR #704 checks](https://github.com/mifunedev/openharness/pull/704/checks). This PR-scoped link follows the current head; commit-specific job links are intentionally omitted because an evidence-only follow-up commit would make them stale.

| Required workflow / check | Current-head result |
|---|---|
| CI: Harness — Lint, Typecheck, Build & Test | PASS |
| CI: Harness — Boot Path Lint (shellcheck + hadolint) | PASS |
| CI: Harness — Eval Probe Regression Gate | PASS |
| CI: Sandbox Boot Guard — Validate sandbox compose and image build | PASS |

Deterministic focused PR acquisition/classification after the current-head checks completed returned `ci=PASS`, `evidenceComplete=true`, `promotable=true`, `mergeable=MERGEABLE`, `mergeStateStatus=CLEAN`, `primaryState=ready`, and `readyToMerge=true`.
