# PRD: Default Image Diagnostic Utilities

## Introduction

OpenHarness users need common process, system, and plaintext network diagnostics available immediately in the default sandbox. Add `lsof`, `htop`, and the `telnet` client supplied by Debian Bookworm's `inetutils-telnet` package without changing the sandbox's runtime or security model.

## Goals

- Ship `lsof`, `htop`, and `/usr/bin/telnet` in every default locally built sandbox image.
- Preserve the existing Debian Bookworm apt hygiene and default `sandbox` user behavior.
- Detect package/command regressions at build time, in sandbox boot smoke testing, and in unit tests for that smoke contract.
- Clearly document telnet's plaintext diagnostic-only security posture.

## User Stories

### US-001: Install diagnostic utilities in the default image

**Description:** As an OpenHarness user, I want common diagnostics baked into the default image so that I can inspect processes and test plaintext network endpoints without runtime package installation.

**Acceptance Criteria:**

- [ ] `.devcontainer/Dockerfile` adds `lsof`, `htop`, and `inetutils-telnet` to the existing first system-package apt install layer.
- [ ] The image continues to use `debian:bookworm-slim`, `--no-install-recommends`, one update/install operation for that layer, and `/var/lib/apt/lists/*` cleanup.
- [ ] The transitional `telnet` package is not installed; `dpkg-query` reports `inetutils-telnet` installed and `/usr/bin/telnet` resolves.
- [ ] A build-time guard resolves `lsof`, `htop`, and `telnet`.
- [ ] Existing users, ports, entrypoint, and unrelated image behavior remain unchanged.
- [ ] Typecheck passes.

### US-002: Verify utilities during sandbox boot smoke

**Description:** As an OpenHarness maintainer, I want runtime assertions as the `sandbox` user so that a successful image build cannot hide unusable diagnostic commands.

**Acceptance Criteria:**

- [ ] The successful boot path uses `docker exec -u sandbox` to resolve `lsof`, `htop`, and `telnet` and execute a successful version command for each.
- [ ] Existing healthcheck, Herdr version, writable state, timeout diagnostics, and EXIT teardown behavior remain covered.
- [ ] Vitest proves all utility commands are wired into the runtime assertion.
- [ ] Vitest proves runtime assertion failure emits diagnostics and still tears down.
- [ ] Focused Vitest and shell syntax checks pass.
- [ ] Typecheck passes.

### US-003: Document the image utility contract

**Description:** As an OpenHarness user, I want the bundled diagnostics documented accurately so that I understand their purpose and security limitations.

**Acceptance Criteria:**

- [ ] `.oh/docs/installation.md` lists `lsof`, `htop`, and `telnet` in the canonical Utilities table.
- [ ] Documentation states that telnet is a plaintext diagnostic client supplied by `inetutils-telnet`, not a secure shell.
- [ ] `CHANGELOG.md` adds an Unreleased/Added entry linked to issue #703.
- [ ] No documentation claims host-process visibility or new multi-architecture support.
- [ ] Typecheck passes.

### US-004: Validate and deliver a ready PR

**Description:** As an OpenHarness maintainer, I want reproducible local and CI evidence so that the default image change is safe to review.

**Acceptance Criteria:**

- [ ] Focused Vitest, `bash -n`, shellcheck, and hadolint pass.
- [ ] Docker image build passes; as user `sandbox`, `dpkg-query`, resolution, and version checks pass for all requested utilities.
- [ ] Full sandbox boot smoke passes if the local environment supports it, or a concrete blocker is recorded.
- [ ] Frozen install and actual repository lint/format/typecheck/build/test/script/security/pin/compose/eval gates are run; change-caused failures are fixed and pre-existing blockers are identified.
- [ ] Adversarial implementation audit and deterministic PR audit report PASS/PROMOTABLE.
- [ ] Commit is pushed and required GitHub CI, including Harness and Sandbox Boot Guard, passes on a ready PR targeting `development`.
- [ ] Typecheck passes.

## Functional Requirements

- **FR-1:** Install Debian Bookworm packages `lsof`, `htop`, and `inetutils-telnet` in the existing system package layer.
- **FR-2:** Do not install package `telnet`; `inetutils-telnet` must provide the `telnet` command.
- **FR-3:** Fail image build if any requested command cannot be resolved.
- **FR-4:** Fail boot smoke if any requested command cannot resolve or successfully execute its version output as `sandbox`.
- **FR-5:** Runtime assertion failures must print existing compose/container diagnostics and trigger existing teardown.
- **FR-6:** Documentation must explain each utility and warn that telnet is plaintext and is not SSH.

## Non-Goals

- No telnet server or daemon.
- No port, service, entrypoint, compose, or base-image change.
- No runtime apt installation or opt-in package profile.
- No host-process visibility guarantee for `lsof` or `htop`.
- No package pinning change beyond the repository's existing unpinned Bookworm policy.
- No new multi-architecture support promise.

## Technical Considerations

Keep the Dockerfile edit in the first apt layer to avoid extra image layers and stale package indexes. Use non-interactive/version invocations suitable for CI: `lsof -v`, `htop --version`, and `telnet --version`. The smoke test must invoke these in the same `docker exec -u sandbox` assertion that currently validates Herdr and state directories.

## Success Metrics

- All three Debian packages are installed in a newly built default image.
- All three commands resolve and return success for their version invocation as `sandbox`.
- Focused, full local, and required GitHub CI gates are green.

## Open Questions

None. The user supplied package choice, runtime checks, non-goals, and delivery constraints.
