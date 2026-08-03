# Implementation Plan: Default Image Utilities

Issue: [#703](https://github.com/mifunedev/openharness/issues/703)
Branch: `feat/703-default-image-utils`
Base: `origin/development@b0288f37`

## Approach

Install the requested diagnostics in the existing Debian Bookworm system-package layer, prove their presence both while building and at runtime as the unprivileged `sandbox` user, then document the user-visible image contract. Preserve all unrelated image and sandbox behavior.

## Dependency graph

```text
US-001 Image packages
  ├──> US-002 Runtime smoke + contract tests
  ├──> US-003 Documentation + changelog
  └──> US-004 Verification, implementation audit, PR audit, CI
US-002 ────────────────────────────────────────────────> US-004
US-003 ────────────────────────────────────────────────> US-004
```

## Work units

1. **US-001 — Image packages**
   - Add `lsof`, `htop`, and `inetutils-telnet` to the existing first apt install layer.
   - Retain `--no-install-recommends`, the single update/install operation, index cleanup, Debian Bookworm base, and all existing image runtime configuration.
   - Add build-time `command -v` checks for `lsof`, `htop`, and `telnet`.
2. **US-002 — Runtime verification**
   - Extend the successful `docker exec -u sandbox` smoke assertion to resolve and run/version all three commands while retaining Herdr and writable-state checks.
   - Extend Vitest fixtures to record the command wiring and cover a runtime-assertion failure that emits diagnostics and tears down.
3. **US-003 — User documentation**
   - Add all three tools to the canonical installation Utilities table.
   - Identify telnet as an insecure plaintext diagnostic client supplied by `inetutils-telnet`, not a secure shell.
   - Add an Unreleased/Added changelog entry linked to issue #703.
4. **US-004 — Verification and delivery**
   - Run focused static/tests, build the image, inspect packages and commands as `sandbox`, and run the full boot smoke where feasible.
   - Run repository gates, eval, adversarial implementation audit, deterministic PR audit, push, create a ready PR, and wait for required CI.

## Constraints and non-goals

No telnet server/daemon, port, service, runtime apt install, package profile, base image change, compose change, host-process visibility claim, or new multi-architecture promise. Do not install transitional package `telnet`; `/usr/bin/telnet` must come from `inetutils-telnet`.

## Verification plan

- `pnpm vitest run .oh/scripts/__tests__/sandbox-boot-smoke.test.ts`
- `bash -n .oh/scripts/sandbox-boot-smoke.sh`
- `shellcheck .oh/scripts/sandbox-boot-smoke.sh`
- `hadolint .devcontainer/Dockerfile`
- Docker build from the repository Dockerfile
- Container run as `sandbox`: `dpkg-query` for exact packages, `command -v`, and version execution for every utility
- `.oh/scripts/sandbox-boot-smoke.sh` against a built image/compose stack if feasible
- Frozen install and all actual root/CLI/CI scripts, compose config checks, security audit, pin checks, and `.oh/evals/run.sh`
