# PRD: Project-Root Seam (RFC #531 Phase 1)

## Introduction

Issue #531 ("RFC: Make OpenHarness portable via project-local `.oh` infrastructure")
proposes a 3-phase migration so OpenHarness can be installed into any existing
repository (`oh init`) instead of requiring a standalone OpenHarness checkout. Its
guiding principle: **"OpenHarness equips a repository. It should not become the
repository."**

This PRD scopes **Phase 1 only**: *"Introduce an explicit project-root concept;
remove hardcoded assumptions around the OpenHarness checkout; make compose/scripts
project-root aware."* It is a foundational, **zero-behavior-change** refactor that
unblocks Phases 2 (`oh init` + templates) and 3 (`oh update`) without shipping them.

Today the container workspace path `/home/sandbox/harness` is hardcoded as a literal
in ~20 places across `.devcontainer/docker-compose.yml`, `.devcontainer/Dockerfile`,
`.devcontainer/entrypoint.sh`, and `.oh/scripts/*`. Most scripts already use the
half-seam `${HARNESS:-/home/sandbox/harness}`, but there is no single canonical
source of truth, and the build/runtime devcontainer layer hardcodes the path
directly. This blocks ever mounting the equipped repo somewhere else (e.g. the RFC's
`/home/sandbox/project`).

## Goals

1. Introduce a single canonical project-root variable, **`OH_PROJECT_ROOT`**, defined
   once, defaulting to `/home/sandbox/harness`.
2. Keep the legacy `HARNESS` env var working as a **backward-compatible alias**
   (`HARNESS` defaults to `OH_PROJECT_ROOT`) so every existing `${HARNESS:-…}`
   reference keeps working unchanged.
3. Route the hardcoded `/home/sandbox/harness` literals in the devcontainer layer
   (compose, Dockerfile, entrypoint) and the `.oh/scripts/*` consumers **through the
   seam**, each with `:-/home/sandbox/harness` as the fallback default.
4. **Preserve the default value** (`/home/sandbox/harness`) so the running sandbox,
   the eval suite, and all unit tests behave identically — this PR changes the
   *indirection*, not the *value*.
5. Guard the seam with a deterministic eval probe so a future regression (a new bare
   literal, or removal of the canonical definition) is caught.

## Non-Goals

- **Flipping the value to `/home/sandbox/project`.** That is a deliberate follow-up;
  this PR keeps `/home/sandbox/harness` so nothing changes behaviorally. (Operator
  decision, 2026-06-26.)
- **Implementing `oh init`, `oh sandbox`, `oh shell`, or `oh update`.** Phase 2/3.
- **Creating `.oh/templates/` or extracting the devcontainer into a template.** Phase 2.
- **Generating the root `.devcontainer/` as a compatibility layer.** Phase 2.
- **Changing `harness.yaml` schema or `harness-config.sh`.** Out of scope; the seam is
  a container-path concept, not a tracked-config concept.
- **Touching `.devcontainer/devcontainer.json`'s static `workspaceFolder`.** It is a
  VS Code attach literal that cannot consume an env var; it keeps the unchanged value
  and is documented as a Phase-2 templating target.

## User Stories

### US-001: Define the `OH_PROJECT_ROOT` seam + compose wiring
As a maintainer, I need one canonical project-root variable so the bind-mount and
runtime paths derive from a single source of truth instead of a scattered literal.
- Owns: `.devcontainer/docker-compose.yml`, `.devcontainer/.example.env`.
- Establish the contract: `OH_PROJECT_ROOT` defaults to `/home/sandbox/harness`.
- In `docker-compose.yml`: pass `OH_PROJECT_ROOT` as a build `args` value and into the
  service `environment:`; route the bind-mount target (`..:${OH_PROJECT_ROOT:-/home/sandbox/harness}`),
  `HERMES_HOME`, and the healthcheck script path through `${OH_PROJECT_ROOT:-/home/sandbox/harness}`.
- In `.devcontainer/.example.env`: add a documented, commented `OH_PROJECT_ROOT=`
  reference explaining it is the project-root seam (Phase 1 of #531) and that the
  default is `/home/sandbox/harness`.
- Default preserved: a fresh build with no override mounts at `/home/sandbox/harness`.

### US-002: Route Dockerfile build-time literals through the seam
As a maintainer, I want the image build to derive its workspace path from
`OH_PROJECT_ROOT` so the build layer stops hardcoding the checkout path.
- Owns: `.devcontainer/Dockerfile` (exclusively).
- Add `ARG OH_PROJECT_ROOT=/home/sandbox/harness` early and `ENV OH_PROJECT_ROOT=${OH_PROJECT_ROOT}`
  so the value persists to the entrypoint and interactive shells.
- Route the build-time literals through `${OH_PROJECT_ROOT}`: `git config --global
  --add safe.directory`, the `workspace/` `COPY` target, the banner-source line, the
  default-`cd` shell rc line, and the devcontainer metadata `LABEL`/JSON it emits.
- Default preserved: built image is byte-equivalent in behavior when the ARG is unset.

### US-003: Make `entrypoint.sh` project-root aware
As a maintainer, I want the entrypoint to resolve the project root from the seam so
its UID/GID sync, banner wiring, Hermes setup, pnpm install, and cron launch all use
one variable.
- Owns: `.devcontainer/entrypoint.sh` (exclusively).
- At the top, establish `OH_PROJECT_ROOT="${OH_PROJECT_ROOT:-/home/sandbox/harness}"`
  and `HARNESS="${HARNESS:-$OH_PROJECT_ROOT}"`.
- Replace the hardcoded `HARNESS_DIR="/home/sandbox/harness"`, the banner-source path,
  and any other bare `/home/sandbox/harness` literals with the seam variable.
- Default preserved: with no env override, every derived path is identical to today.

### US-004: Standardize the `.oh/scripts` + devcontainer script consumers
As a maintainer, I want every script that resolves the project root to chain through
the same seam so the fallback is consistent and future-proof.
- Owns: `.oh/scripts/sandbox-healthcheck.sh`, `.oh/scripts/gateway.sh`,
  `.oh/scripts/docker-compose.sh`, `.oh/scripts/cron-runtime.ts`,
  `.oh/scripts/maintenance/restart-openharness-tmux.sh`,
  `.devcontainer/client-slack-supervise.sh`, `.devcontainer/seed-msg-bridge.sh`
  (only the ones that currently hardcode/half-seam the path).
- Change `${HARNESS:-/home/sandbox/harness}` → `${HARNESS:-${OH_PROJECT_ROOT:-/home/sandbox/harness}}`
  (and the equivalent in `cron-runtime.ts`), preserving the existing `HARNESS` override
  precedence.
- `shellcheck` clean; default preserved.

### US-005: Guard the seam with a probe + docs + CHANGELOG
As a maintainer, I want a deterministic probe and documentation so the seam is
guarded against regression and the project-root concept is discoverable.
- Owns: `evals/probes/project-root-seam.sh`, `evals/RESULTS.md` (one new row),
  `CHANGELOG.md` (`## [Unreleased]`), `.oh/README.md` (short project-root note).
- Add `evals/probes/project-root-seam.sh`: a 3-state oracle (PASS/REGRESSION/SKIPPED)
  asserting (a) `OH_PROJECT_ROOT` is defined as the seam in `docker-compose.yml`,
  `Dockerfile`, and `entrypoint.sh`; (b) the seam consumers use the
  `${OH_PROJECT_ROOT:-…}` / `${HARNESS:-${OH_PROJECT_ROOT:-…}}` pattern rather than a
  fresh bare literal in the seam'd files.
- Hand-insert the new row into `evals/RESULTS.md` (do not regenerate timestamps on
  existing rows).
- Add a `## [Unreleased]` CHANGELOG entry (`### Added` for the probe + variable,
  `### Changed` for the routing) noting it is Phase 1 of #531.
- Add a short `.oh/README.md` note introducing `OH_PROJECT_ROOT` as the project-root
  seam.

## Functional Requirements

1. `OH_PROJECT_ROOT` is the single canonical project-root variable, default
   `/home/sandbox/harness`, defined in the devcontainer build + runtime layer.
2. `HARNESS` remains a working alias defaulting to `OH_PROJECT_ROOT`.
3. Every seam'd reference carries the `:-/home/sandbox/harness` fallback so behavior is
   identical when nothing sets the variable.
4. `evals/probes/project-root-seam.sh` returns PASS against the post-change tree and
   would REGRESS if the canonical definition is removed or a bare literal is
   re-introduced into a seam'd file.
5. The full eval suite (`/eval`) and `pnpm test` stay green (no value change).

## Non-Functional / Verification

- `shellcheck` on every modified `.sh` (CI Boot Path Lint covers `.devcontainer/*.sh`).
- `pnpm run type-check` / `pnpm run test` green (covers `cron-runtime.ts` + its tests,
  which must NOT need fixture changes because the default value is unchanged).
- CI: Harness green; the sandbox-boot-guard workflow (image build + boot smoke) is the
  end-to-end proof that the seam preserves a healthy boot.

## Wiki Alignment

**Impact: NOT-APPLICABLE.** This is an internal devcontainer/scripts refactor with no
user-facing capability change and no public DeepWiki entity affected. The project-root
concept is documented inline in `.oh/README.md` (US-005), not in the wiki corpus.
No `.mifune/skills/wiki/corpus/` entry is created or required. When Phase 2 (`oh init`)
lands the user-facing portability flow, a wiki entry becomes REQUIRED — out of scope here.

## Technical Considerations

- **Why a new name, not just `HARNESS`?** Post-RFC the equipped repo is the *user's
  project*, not the harness — `OH_PROJECT_ROOT` is the forward-compatible semantic name
  for "root of the equipped repo inside the container." `HARNESS` is kept as a
  deprecated alias to avoid churning the ~8 scripts that already use it.
- **Disjoint file ownership** across US-002/003/004/005 enables safe parallel
  execution (Advisor-managed `/delegate` waves). US-001 (compose + .example.env) is the
  foundation wave; US-002/003/004 fan out in parallel; US-005 verifies last.
- **`devcontainer.json`** static `workspaceFolder` cannot consume an env var — left
  literal and documented as a Phase-2 templating target (Non-Goal).
- **No CHANGELOG/RESULTS.md contention:** only US-005 touches those shared-append
  files, avoiding the concurrent-merge conflict trap.

## Success Metrics

- All ~20 hardcoded `/home/sandbox/harness` literals in the seam'd files are routed
  through `OH_PROJECT_ROOT` (or documented as intentional static exceptions).
- `evals/probes/project-root-seam.sh` is PASS; full `/eval` suite has no new RED.
- `pnpm test` + `shellcheck` + CI: Harness green; no test fixture changes required.
- A reviewer can set `OH_PROJECT_ROOT=/somewhere/else` and trace it flowing through
  compose → build arg → entrypoint → scripts (manual trace, not a value flip in this PR).

## Open Questions

- None blocking. The value flip to `/home/sandbox/project` and `oh init` are explicitly
  deferred to follow-up PRs per the operator scoping decision (2026-06-26).
