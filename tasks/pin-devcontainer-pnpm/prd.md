# PRD: Pin devcontainer pnpm to packageManager version + drift guard

## Introduction

The devcontainer image activates a **floating** pnpm (`corepack prepare pnpm@latest --activate` in `.devcontainer/Dockerfile`) while the repository **pins** one in `package.json`'s `packageManager` field (`pnpm@10.33.0`). Every fresh image build resolves `pnpm@latest` to whatever Corepack fetches at build time, which can be a different pnpm major than the lockfile and workspace config were authored against — silently breaking `pnpm install --frozen-lockfile` and workspace (`--filter`) resolution with no build-time error.

This feature makes the existing pinned version authoritative in the Dockerfile and adds an automated guard so the two version sources can never silently diverge again. It encodes the invariant "Dockerfile pnpm version == `package.json` `packageManager` pnpm version" as a machine-checkable gate.

## Protected-path override note

`.devcontainer/Dockerfile` is listed in `.claude/protected-paths.txt` (line 43). That list guards against **deletion or deprecation** of load-bearing files. US-001 performs neither: it is a **single-line, additive hardening edit** (replacing `pnpm@latest` with the exact declared version `pnpm@10.33.0`) — no stage is removed, no behavior changes beyond making the version deterministic. This note is the explicit override required by the protected-paths gate; the file remains on the protected list after the change.

## Goals

- Make the devcontainer build resolve a deterministic pnpm version derived from committed source, not wall-clock build time.
- Keep `.devcontainer/Dockerfile`'s pnpm version and `package.json`'s `packageManager` pnpm version in lockstep, enforced automatically in CI and the release gate.
- Do not change behavior beyond the pin: keep `pnpm@10.33.0`, add no new runtime dependencies.

## User Stories

### US-001: Pin the Dockerfile pnpm version

**Description:** As the harness developer, I want the devcontainer to install the exact pnpm version the repo declares so that container builds are reproducible.

**Acceptance Criteria:**

- [ ] The `.devcontainer/Dockerfile` corepack line reads `corepack prepare pnpm@10.33.0 --activate` (the exact version from `package.json`'s `packageManager` field).
- [ ] `grep -c 'pnpm@latest' .devcontainer/Dockerfile` returns `0` (no `pnpm@latest` anywhere in the file).
- [ ] Exactly one line is changed; no other Dockerfile content is modified (verify via `git diff --stat` showing only the corepack line).
- [ ] The `boot-lint` Hadolint step passes (`hadolint` exit 0) after the edit; if the edit introduces a new warning it is fixed or added to `.hadolint.yaml` with a rationale.

### US-002: Add the drift-guard script

**Description:** As the harness developer, I want a script that detects pnpm-version drift between the Dockerfile and `package.json` so the invariant is machine-checkable.

**Acceptance Criteria:**

- [ ] `scripts/check-pnpm-pin.sh` exists with shebang `#!/usr/bin/env bash`, is executable (`chmod +x`), and uses no `jq` dependency (parse with `grep`/`sed`/`awk`).
- [ ] It accepts two optional path arguments — `--dockerfile <path>` and `--package-json <path>` — defaulting to repo-root-relative paths resolved from the script's own location (`$(cd "$(dirname "$0")/.." && pwd)`), so it is correct regardless of the caller's CWD and so tests can inject fixtures.
- [ ] It extracts the pnpm version from `package.json`'s `packageManager` field, **normalizing away any `+sha…` integrity suffix** (`pnpm@10.33.0+sha512.abc` → `10.33.0`), and from the Dockerfile's `corepack prepare pnpm@<ver>` line.
- [ ] Exit 0 when the two normalized versions match.
- [ ] Exit non-zero with a single-line message of the exact form `pnpm pin drift: Dockerfile pins pnpm@<X>, package.json declares pnpm@<Y> — update .devcontainer/Dockerfile to match` when they differ.
- [ ] Exit non-zero with a distinct, clear message if a source is unreadable, the Dockerfile `corepack prepare pnpm@<ver>` line is missing, or the Dockerfile pins a non-semver value such as `pnpm@latest`.
- [ ] `shellcheck -S warning scripts/check-pnpm-pin.sh` exits 0 (this is also enforced by the existing `boot-lint` shellcheck glob `scripts/*.sh`).

### US-003: Test the drift-guard script

**Description:** As the harness developer, I want unit tests for the guard so its behavior is regression-protected in CI.

**Acceptance Criteria:**

- [ ] `scripts/__tests__/check-pnpm-pin.test.ts` exists, following the existing `scripts/__tests__/harness-config.test.ts` convention (vitest + `spawnSync`, writing **both** a mock Dockerfile and a mock `package.json` into a temp dir and passing them via `--dockerfile`/`--package-json`).
- [ ] Case A: matching versions → exit 0.
- [ ] Case B: differing versions → exit non-zero; output contains both version strings.
- [ ] Case C: Dockerfile missing the `corepack prepare pnpm@<ver>` line → exit non-zero.
- [ ] Case D: `package.json` `packageManager` carries a `+sha512.<hash>` suffix while the Dockerfile pins the bare semver → exit 0 (suffix normalized).
- [ ] Case E: Dockerfile still pins `pnpm@latest` → exit non-zero (distinguished from the missing-line case).
- [ ] At least one case invokes the script from a non-repo-root CWD to prove path resolution is CWD-independent.
- [ ] `pnpm test:scripts` runs the new test file and all cases pass green.

### US-004: Wire the guard into CI and the release validate gate

**Description:** As the harness developer, I want CI and the release gate to run the guard so drift fails the pipeline rather than reaching a built image.

**Acceptance Criteria:**

- [ ] `.github/workflows/ci-harness.yml` `boot-lint` job gains a single new step `name: Check pnpm pin drift` running `bash scripts/check-pnpm-pin.sh`, placed **after** the existing Hadolint step so its signal is not masked by linter output. (No separate shellcheck step is added — the existing `scripts/*.sh` glob already covers it.)
- [ ] `.github/workflows/release.yml` `validate` job gains the same `Check pnpm pin drift` step. This is sufficient to gate the image build because the `release` job declares `needs: [validate]` and the workflow triggers only on tag push.
- [ ] No existing steps are removed or reordered in either workflow; both remain valid YAML.

### US-005: Record the change in the changelog

**Description:** As the harness developer, I want the user-visible reproducibility change recorded so the release notes capture it.

**Acceptance Criteria:**

- [ ] `CHANGELOG.md` gains an entry under `## [Unreleased]` (`### Fixed` or `### Changed`) describing the devcontainer pnpm pin + drift guard, linking issue #114.

## Functional Requirements

- FR-1: The devcontainer Dockerfile must pin pnpm to the exact version string declared in `package.json`'s `packageManager` field.
- FR-2: `scripts/check-pnpm-pin.sh` must parse both version sources with no external dependency, normalize the `+sha` suffix, resolve its own paths CWD-independently, accept fixture-path overrides, and return exit 0 on match / non-zero on mismatch, unreadable input, missing pin line, or non-semver pin.
- FR-3: The mismatch output must be a single line naming both versions and the file to edit, so the fix is self-evident without reading the script.
- FR-4: CI (`ci-harness.yml` boot-lint) and release (`release.yml` validate) must both invoke the guard.
- FR-5: The test file must cover match, mismatch, missing-line, sha-suffix, and `@latest` cases and run under `pnpm test:scripts`.

## Non-Goals (Out of Scope)

- Bumping pnpm from `10.33.0` to any newer version — this ticket only makes the existing version authoritative.
- Refactoring other Dockerfile stages or other toolchain pins (node, corepack version, etc.).
- Modifying `package.json` beyond reading its `packageManager` field.
- Adding the guard to the `release` job (redundant: `release` already `needs: [validate]`).
- Auto-fixing drift — the guard reports and fails; it does not rewrite either file. The fix workflow is: edit `.devcontainer/Dockerfile` to match `package.json` (which is the source of truth), exactly as the guard's error message instructs.
- Any sandbox application code — scope is `.devcontainer/`, `scripts/`, `.github/workflows/`, `CHANGELOG.md` only.

## Technical Considerations

- `packageManager` format is `pnpm@<version>[+sha<algo>.<hash>]` (Corepack standard). Extract the version after `pnpm@`, strip any `+…` suffix before comparing.
- The Dockerfile line is a compound `RUN corepack enable && corepack prepare pnpm@<version> --activate`; the guard must extract `<version>` from within that wrapping.
- Mirror `scripts/__tests__/harness-config.test.ts`: copy/write fixtures into a temp dir, run the script via `spawnSync` with explicit fixture paths, assert exit code + output.
- `release.yml`'s `release` job already declares `needs: [validate]`; gating in `validate` therefore blocks the image build with no separate `release`-job step.

## Success Metrics

- A deliberately tampered Dockerfile pnpm version causes `bash scripts/check-pnpm-pin.sh` (and therefore CI boot-lint) to fail with a self-explanatory message.
- A fresh devcontainer build installs pnpm 10.33.0 deterministically regardless of build date.
- `pnpm test:scripts` includes and passes the new guard tests.

## Open Questions

- None — the version source of truth (`package.json` `packageManager`) and the target line (`.devcontainer/Dockerfile`) are both unambiguous.

---

## Critics review (2-critic gate, advisor-model 3-step variant)

Two critics (implementer + user lens) reviewed the pre-revision PRD. **Recommendation: PROCEED** — the sole high-severity finding was the `[PROTECTED-PATH]` flag on `.devcontainer/Dockerfile`, mitigated by the explicit override note above (the change is additive hardening, not deletion/deprecation). Medium/low findings were folded into the stories before commitment: `+sha` suffix normalization (US-002/US-003 Case D), CWD-independent path resolution + fixture-path injection (US-002/US-003), the existing shellcheck glob already covering the script so no redundant step (US-004), tightened Hadolint and `grep -c` acceptance criteria (US-001), an exact self-documenting mismatch message (US-002/FR-3), distinguishing `@latest` from a missing pin line (US-003 Case E), step ordering after Hadolint (US-004), confirmation that `release needs: [validate]` makes `validate`-only gating sufficient (US-004/Non-Goals), and a CHANGELOG entry (US-005). The "harness maintainer → harness developer" persona note (low) was applied.
