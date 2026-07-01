# PRD: Exercise Sandbox Boot Health

## Introduction

Add a bounded sandbox boot smoke test to the CI boot guard so devcontainer changes prove entrypoint and healthcheck behavior, not just image buildability.

## Goals

- Start the sandbox service in the sandbox boot guard workflow after compose validation and image build.
- Verify the container reaches the compose healthcheck or that `scripts/sandbox-healthcheck.sh` succeeds inside the container.
- Emit actionable diagnostics when boot or health fails.
- Always tear down CI containers and volumes.

## User Stories

### US-001: Add a boot smoke test helper

**Description:** As a maintainer, I need a reusable bounded helper so the workflow can wait for the sandbox container health status and report diagnostics on failure.

**Acceptance Criteria:**

- [ ] Add a script that starts from the repository root and validates a compose project/container name supplied by CI.
- [ ] Wait loop has a bounded timeout and recognizes `healthy`, `unhealthy`, and missing-container states.
- [ ] On failure, print `docker compose ps`, container health inspect output, and recent logs.
- [ ] Script always attempts compose teardown in a cleanup trap.
- [ ] Tests pass.

### US-002: Wire sandbox boot guard to exercise health

**Description:** As a maintainer, I want the sandbox boot guard workflow to run the sandbox long enough to exercise `.devcontainer/entrypoint.sh` and the configured healthcheck.

**Acceptance Criteria:**

- [ ] `.github/workflows/sandbox-boot-guard.yml` invokes the boot smoke test after the existing image build/config validation.
- [ ] The workflow uses CI-safe settings such as an isolated compose project name and `SKIP_PNPM_INSTALL=1` to stay bounded.
- [ ] The guard does not publish images, log in to external services, or perform release side effects.
- [ ] Script tests pass.

## Functional Requirements

- FR-1: The guard must run an actual compose service/container, not only `docker build`.
- FR-2: The guard must fail if the sandbox healthcheck reports `unhealthy` or never becomes healthy within the timeout.
- FR-3: Failure output must include enough diagnostics to debug boot issues without rerunning locally.
- FR-4: Cleanup must run on success and failure.

## Non-Goals

- No publishing release images.
- No GitHub login, Slack bridge login, or external service setup.
- No changes to sandbox application code.

## Technical Considerations

- Prefer a small script under `scripts/` so the workflow remains readable and can be unit tested with stubbed `docker`/`bash` commands.
- Reuse `scripts/docker-compose.sh` for compose invocation so harness.yaml/.env/config overlays remain canonical.
- Use environment defaults that avoid long dependency installs in CI, while still proving entrypoint and healthcheck wiring.

## Success Metrics

- A broken entrypoint/healthcheck path fails `sandbox-boot-guard` before merge.
- The workflow remains bounded and cleans up all CI containers/volumes.

## Open Questions

- Should CI require the full default healthcheck, or should the helper support an explicit fast path if the default healthcheck grows too expensive?
