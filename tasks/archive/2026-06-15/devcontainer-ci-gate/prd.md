# PRD: gate the .devcontainer boot path in CI

## Introduction

The `.github/workflows/ci-harness.yml` `paths:` filters gate `packages/**`,
`scripts/**`, `.pi/**`, `crons/**`, `context/**`, and `.claude/skills/**` — but
omit the entire `.devcontainer/` boot path (`.devcontainer/**`, the `Dockerfile`
inside it, and `install/**`). A PR that breaks the 17KB `entrypoint.sh`, the 13KB
`Dockerfile`, or `install/banner.sh` merges with a green CI badge: nothing lints
or build-checks the harness's most fragile, least-tested surface.

This feature adds a `boot-lint` CI job — shellcheck on the boot shell scripts and
hadolint on the Dockerfile (with a curated ignore list) — and extends the
workflow's path triggers so the job actually fires on boot-path changes. The lint
thresholds were validated locally so the gate lands green on the first push while
still failing on genuine defects.

## Goals

- Close the CI blind spot on the `.devcontainer/` boot path and `install/` scripts.
- Lint `.devcontainer/entrypoint.sh` and `install/*.sh` with shellcheck (`-S warning`).
- Lint `.devcontainer/Dockerfile` with hadolint, gated by an explicit, documented
  ignore list of accepted dev-sandbox tradeoffs.
- Keep the new job independent of (not blocking) the existing Node lint/build/test
  job, with the same `contents: read` permissions and concurrency group.
- Land green on first push (lint baselines pre-validated this run).

## User Stories

### US-001: Extend CI path filters to cover the boot path

**Description:** As a maintainer, I want CI to trigger on `.devcontainer/` and
`install/` changes so a broken boot path can never merge with a green badge.

**Acceptance Criteria:**

- [ ] `.github/workflows/ci-harness.yml` `push.paths` block includes `".devcontainer/**"` and `"install/**"`.
- [ ] `.github/workflows/ci-harness.yml` `pull_request.paths` block includes `".devcontainer/**"` and `"install/**"`.
- [ ] `grep -c '\.devcontainer/\*\*' .github/workflows/ci-harness.yml` returns `2` (one per trigger block).
- [ ] The Dockerfile is covered transitively (it lives at `.devcontainer/Dockerfile`).
- [ ] YAML remains valid (parses without error).

### US-002: Add a curated `.hadolint.yaml` ignore list

**Description:** As a maintainer, I want hadolint's accepted dev-sandbox warnings
documented in one place so the Dockerfile gate is green-by-design yet still fails
on new, un-accepted findings.

**Acceptance Criteria:**

- [ ] A new file `.hadolint.yaml` exists at the repo root.
- [ ] It contains an `ignored:` list with exactly these rule codes: `DL4006`, `DL3008`, `DL3016`, `DL3003`, `DL3059`, `SC2016`.
- [ ] Each ignored rule carries a brief inline comment explaining the accepted tradeoff.
- [ ] A header comment notes the hadolint version the ignore list was validated against (hadolint-action v3.1.0 bundled binary; rule families are stable across hadolint 2.x).
- [ ] `hadolint --config .hadolint.yaml .devcontainer/Dockerfile` exits 0 with no output (validated: all current findings are in the ignore list).
- [ ] File parses as valid YAML.

### US-003: Add the `boot-lint` CI job

**Description:** As a maintainer, I want a dedicated job that runs shellcheck and
hadolint on the boot path so defects are caught in CI, not at sandbox rebuild time.

**Acceptance Criteria:**

- [ ] A new `boot-lint` job is added to the `jobs:` section of `ci-harness.yml`.
- [ ] The job runs on `ubuntu-latest` and checks out via `actions/checkout@v4`.
- [ ] The job lints the boot shell scripts via globs so future scripts are covered automatically: `shellcheck -S warning .devcontainer/*.sh install/*.sh` (matches `entrypoint.sh` + `banner.sh` today). A guard ensures shellcheck is present: `command -v shellcheck >/dev/null || sudo apt-get update && sudo apt-get install -y shellcheck`.
- [ ] The job runs hadolint against `.devcontainer/Dockerfile` using `config: .hadolint.yaml` via `hadolint/hadolint-action` **SHA-pinned** (`@54c9adbab1582c2ef04b2016b760714a4bfde3cf # v3.1.0`).
- [ ] The job has NO `needs:` field — it runs independently of and in parallel with the existing `ci` job.
- [ ] The job inherits the workflow-level `permissions: contents: read` and the `ci-harness-${{ github.ref }}` concurrency group (no per-job override that weakens either).
- [ ] YAML remains valid.

### US-004: Record the change in the CHANGELOG

**Description:** As a maintainer, I want the new gate noted in the changelog so the
release notes capture it.

**Acceptance Criteria:**

- [ ] One bullet added under `## [Unreleased]` → `### Added` in `CHANGELOG.md`.
- [ ] The entry is one line, imperative mood, and references `([#26](https://github.com/ryaneggz/openharness/issues/26))`.
- [ ] No versioned section is hand-edited.

## Functional Requirements

- FR-1: The CI workflow MUST trigger on changes under `.devcontainer/**` and `install/**` for both `push` (development, main) and `pull_request`.
- FR-2: The system MUST lint `.devcontainer/entrypoint.sh` and `install/banner.sh` with `shellcheck -S warning`, failing the job on warning- or error-severity findings.
- FR-3: The system MUST lint `.devcontainer/Dockerfile` with hadolint, using `.hadolint.yaml` as the ignore config, failing the job on any finding not in the ignore list.
- FR-4: The `boot-lint` job MUST NOT block or depend on the existing `ci` job; the two run in parallel.
- FR-5: The `boot-lint` job MUST NOT widen workflow permissions beyond `contents: read`.
- FR-6: The `.hadolint.yaml` ignore list MUST document each accepted rule with a comment.

## Non-Goals (Out of Scope)

- Rewriting or refactoring `entrypoint.sh`, the `Dockerfile`, or `banner.sh`.
- Fixing the accepted hadolint warnings (apt/npm version pinning, per-RUN pipefail, consecutive RUNs) — they are deliberate dev-sandbox tradeoffs captured in the ignore list.
- A full `docker build` of the image in CI (expensive; out of scope for this gate).
- Adding shellcheck/hadolint coverage to any path other than the boot path.
- Touching any `packages/`, `scripts/`, or sandbox application code.
- A pre-commit hook mirroring this gate (CI-only for v1).
- Providing hadolint signal on the six suppressed rule families (`DL4006`, `DL3008`, `DL3016`, `DL3003`, `DL3059`, `SC2016`) — these are accepted dev-sandbox tradeoffs, suppressed for the life of the gate; the gate still fails on any rule *outside* this list.
- Registering `boot-lint` as a required status check in branch protection — not done by this PR. (If added later, configure branch protection so path-filter-skipped runs satisfy the requirement, else Node-only PRs would block on a check that never fires.)
- Suppressing the existing `ci` (Node) job on devcontainer-only changes — a `devcontainer.json`-only edit also triggers `ci`; this minor overhead is accepted rather than adding per-job `if:` complexity.

**Rollback / escape hatch:** to disable the gate without reverting the whole PR, delete the `boot-lint` job block in `ci-harness.yml` and remove the `.devcontainer/**` / `install/**` entries from both `paths:` blocks. No other file needs to change; the blast radius is the job block plus two path lines. The `cancel-in-progress: true` concurrency behavior is inherited from the workflow (a rapid second push cancels an in-flight `boot-lint`; the new push re-runs it) — identical to the existing `ci` job, accepted as-is.

## Technical Considerations

- **Validated baselines (this run):** shellcheck 0.9.0 reports only 2 info-level SC2015 findings on `entrypoint.sh` (intentional `... || true`) and a clean `banner.sh`; `-S warning` excludes info/style → green. hadolint on the Dockerfile reports 16 findings, all warning/info, zero error-severity: `DL4006`×6, `DL3008`×5, `DL3016`×1, `DL3003`×1 (warnings); `DL3059`×1, `SC2016`×2 (info). All six codes are in the ignore list → 0 remaining → green.
- **Coverage note:** the Dockerfile sits under `.devcontainer/`, so the `.devcontainer/**` path filter already triggers CI on Dockerfile edits; no separate `Dockerfile` path entry is required.
- **Action pinning:** prefer `hadolint/hadolint-action@v3.1.0` (or a SHA pin) for reproducibility; `config: .hadolint.yaml`.
- **Independence:** omit `needs:` on `boot-lint` so a boot-path-only PR is gated even when the `ci` job's own path filters wouldn't otherwise run heavy Node steps.

## Success Metrics

- A PR that introduces a shellcheck warning in `entrypoint.sh` or a non-ignored hadolint finding in the Dockerfile fails CI instead of merging green.
- The `boot-lint` job is green on this PR.
- No regression to the existing `ci` job's runtime or behavior.

## Open Questions

- Should `install/banner.sh` later be joined by a glob (`install/*.sh`) if more install scripts are added? (Resolved — the shellcheck step now uses `install/*.sh` and `.devcontainer/*.sh` globs, so future scripts are covered automatically.)

## Critique Resolution

Two critics (implementer + user lens) reviewed this PRD pre-implementation. 4 High findings were raised: 1 was factually false (a claimed second `.devcontainer/banner.sh` that does not exist — only `install/banner.sh` exists and is what `entrypoint.sh:175` sources); 1 was verified and resolved (the `hadolint-action@v3.1.0` tag exists, now SHA-pinned); 2 were the same observation about inherited `cancel-in-progress` concurrency (accepted/documented — standard GitHub behavior, re-runs on the next push). **0 genuine un-mitigatable High findings → PROCEED.** All Medium findings were resolved via shell-script globs, an install-if-missing shellcheck guard, the SHA pin, and the documented Non-Goals caveats above. No protected-path violation: `.hadolint.yaml` is a new root file; the protected `entrypoint.sh`/`Dockerfile` are read by the gate, not modified. Full detail in `critique.md`.
