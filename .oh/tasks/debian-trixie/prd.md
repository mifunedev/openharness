# PRD: Upgrade the Sandbox Base to Debian Trixie

## Introduction

Upgrade the Open Harness sandbox image from `debian:bookworm-slim` to `debian:trixie-slim` so the image follows Debian stable. Keep Cloudflare's package repository on its compatible Bookworm suite because the vendor does not publish a Trixie suite. Preserve the existing sandbox behavior, toolchain versions, UID ownership contract, and optional harness installers.

The implementation must reconcile current-state documentation and MicroSandbox preflight language: Trixie's glibc satisfies the measured `>= 2.39` requirement, while `/dev/kvm` remains unavailable in the default compose configuration.

## Goals

- Build the default sandbox successfully on amd64 and arm64 from Debian Trixie.
- Preserve Node, pnpm, default tool, Herdr checksum, sandbox UID, and bind-mount ownership contracts.
- Exercise every optional `INSTALL_*` Dockerfile path before release.
- Keep Docker's Debian repository on Trixie and intentionally keep Cloudflare's repository on Bookworm with an explicit HTTP 404 explanation.
- Replace stale Bookworm and two-blocker claims in active source and documentation.
- Keep the probe suite free of new regressions relative to the current `origin/development` baseline of 97 probes: 94 PASS, 0 REGRESSION, 3 SKIPPED.

## User Stories

### US-001: Move the Dockerfile to Trixie

**Description:** As a sandbox operator, I want the image to track Debian stable so its distribution packages and support runway remain current.

**Acceptance Criteria:**

- [ ] `.devcontainer/Dockerfile` uses `FROM debian:trixie-slim`.
- [ ] Docker's apt repository uses the `trixie` suite.
- [ ] Cloudflare's apt repository still uses the `bookworm` suite.
- [ ] An adjacent Dockerfile comment states that Cloudflare's Trixie suite returns HTTP 404.
- [ ] A focused deterministic test guards all three suite decisions and the exception comment.
- [ ] `CHANGELOG.md` contains one imperative issue-linked entry under `[Unreleased]` → `Changed`, no longer than 250 characters.
- [ ] Typecheck passes.
- [ ] Tests pass.

### US-002: Reconcile runtime and documentation claims

**Description:** As a sandbox user, I want runtime diagnostics and documentation to describe the Trixie image accurately so I can distinguish the cleared glibc prerequisite from the remaining KVM requirement.

**Acceptance Criteria:**

- [ ] The runtime catalog keeps the glibc `2.39` and `/dev/kvm` preflight checks but no longer calls the current image guaranteed-failing because of Bookworm/glibc 2.36.
- [ ] Runtime command comments describe measured prerequisites and the current default state accurately.
- [ ] Runtime catalog tests assert that current-base remediation stays synchronized without deleting intentional historical glibc parser fixtures.
- [ ] `.oh/evals/probes/runtime-preflight-gate.sh` guards requirements rather than stale two-blocker rationale.
- [ ] `.oh/docs/installation.md`, `.oh/docs/rfcs/rfc-runtime-support.md`, `.oh/docs/integrations/debugmcp.md`, and `.oh/docs/runtimes/microsandbox.md` describe Trixie and the remaining `/dev/kvm` blocker accurately.
- [ ] Scope remains limited to the base bump: no runtime selector, device passthrough, configuration key, or MicroSandbox installation is added.
- [ ] Typecheck passes.
- [ ] Tests pass.

### US-003: Verify the default image and ownership contract

**Description:** As a maintainer, I want reusable image and boot verification so a base upgrade cannot silently remove tools or change sandbox ownership behavior.

**Acceptance Criteria:**

- [ ] A documented `.oh/scripts/` verifier checks Trixie codename, apt suites, built-in `sandbox` UID/GID `1000:1000`, Node 22, pnpm 10.33.0, and executable version output from `gh`, Docker, Cloudflared, Herdr 0.7.4, Bun, and uv.
- [ ] The verifier validates the installed Herdr checksum against the architecture-specific Dockerfile pin.
- [ ] `sandbox-boot-smoke.sh` verifies runtime sandbox UID/GID equals the bind-mounted checkout owner and a sandbox-created marker retains host-compatible ownership.
- [ ] The existing `Validate sandbox compose and image build` job keeps its name, invokes the verifier, and completes the real compose boot smoke.
- [ ] The unchanged Bookworm base and Trixie candidate report identical `node --version` and `pnpm --version` in one-time PR evidence; permanent CI enforces Node major 22 and exact pnpm 10.33.0 rather than a transient Node patch.
- [ ] Typecheck passes.
- [ ] Tests pass.

### US-004: Validate arm64 and optional installers

**Description:** As a release maintainer, I want Dockerfile-scoped compatibility CI so both architectures and all optional installer paths are exercised before the base reaches a release.

**Acceptance Criteria:**

- [ ] A Dockerfile-path-scoped workflow builds and verifies a default arm64 image, using a native arm64 runner when available or QEMU/Buildx otherwise.
- [ ] The arm64 build executes the Dockerfile's Herdr SHA check and the reusable image verifier.
- [ ] The workflow builds one amd64 image with `INSTALL_HERMES`, `INSTALL_DEEPAGENTS`, `INSTALL_OPENCODE`, and `INSTALL_GROK_BUILD` all set to `true`.
- [ ] `hermes --version`, `deepagents --version`, `opencode --version`, and `grok --version` all succeed in the optional image.
- [ ] The compatibility workflow has read-only repository permissions and never logs into or pushes to a registry.
- [ ] `.oh/evals/probes/sandbox-boot-guard-ci.sh` guards the architecture, optional-build, verifier, and no-push contracts without adding a new probe.
- [ ] `.github/workflows/release.yml` remains unchanged; multi-platform publication is out of scope.
- [ ] Typecheck passes.
- [ ] Tests pass.

## Functional Requirements

1. FR-1: The image must use `debian:trixie-slim` while retaining the Cloudflare Bookworm apt suite.
2. FR-2: The default image must build and pass Herdr checksum verification on amd64 and arm64.
3. FR-3: The built image must retain all required default tools and the existing Node/pnpm contract.
4. FR-4: The image must retain built-in UID/GID 1000 and runtime bind-owner reconciliation.
5. FR-5: Every optional Dockerfile installer must complete and leave a usable version-reporting binary.
6. FR-6: Active runtime prose must say that Trixie clears the glibc prerequisite and default compose still lacks `/dev/kvm`.
7. FR-7: CI and evals must report no new regression from the accepted current development baseline.

## Non-Goals

- Do not add or select a runtime.
- Do not pass `/dev/kvm` into the sandbox.
- Do not add configuration keys or install MicroSandbox.
- Do not change compose topology, entrypoint ownership logic, or the release workflow.
- Do not publish a multi-platform GHCR manifest.
- Do not pin a transient NodeSource Node patch version.
- Do not restore unrelated eval probes to manufacture the issue's stale `100/0/6` count.

## Technical Considerations

- Start from the latest `origin/development`, not the stale local checkout.
- Cloudflare's Trixie repository returns HTTP 404; its Bookworm package is compatible with Trixie.
- Build and compare the unchanged base and candidate back-to-back for one-time Node/pnpm parity evidence.
- The current execution environment has no Docker daemon. Architecture, optional-image, and ownership evidence must therefore come from GitHub Actions or a Docker-capable host, not an unverified local claim.
- Prefer a separate path-scoped compatibility workflow so expensive mutable vendor installers do not run for every `.oh/**` change.

## Success Metrics

- Default amd64 compose build and boot pass.
- Default arm64 image build and inspection pass.
- All four optional installers build and report versions.
- All required default tools report versions.
- Herdr checksum validation passes on both architectures.
- Eval state has zero new regressions from `94/0/3`.
- The final PR is ready for review with evidence linked to its final HEAD.

## Open Questions

None. The operator approved the implementation plan and the current-baseline correction.

## Wiki Alignment

- **Impact**: NOT-APPLICABLE
- **Local entries**: none
- **Spec alignment**: This is a narrow distribution maintenance change. It changes no reusable harness mechanism, runtime flow, or conceptual vocabulary; active human documentation and source comments are the authoritative surfaces being updated.
- **Acceptance criteria**: No wiki update is required. Runtime and installation documentation must remain aligned with final behavior.
