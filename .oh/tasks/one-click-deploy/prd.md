# PRD — one-click-deploy

Issue: #553 (`feat: add one-click hosted deployment from README`)
Branch: `feat/553-one-click-deploy`

## Summary

Add a Railway-style one-click hosted deployment path for Open Harness that a new user can discover from the README, while explicitly scoping the hosted mode around Railway's lack of host Docker socket / privileged sandbox support.

## Motivation

Open Harness currently has a strong local Docker/devcontainer path, but new users who expect a hosted "Deploy" button must still understand Docker Compose, host provisioning, and local setup before trying it. A Railway entry point should reduce activation friction without pretending that a PaaS can run every local sandbox feature.

## Goals

- Add a README deploy button / hosted deploy entry point.
- Add Railway config-as-code and deploy assets that boot a smoke-testable Open Harness service on Railway.
- Document required environment variables, persistence, and platform constraints.
- Guard the config with a deterministic probe so README/config drift is caught.

## Non-goals

- Do not replace the local Docker/devcontainer setup.
- Do not require users to fork the repo just to try the hosted path.
- Do not commit any provider tokens or secrets.
- Do not redesign the runtime around nested Docker or privileged containers.

## User stories

### US-001 — README one-click entry point

As a new Open Harness user, I want a prominent one-click hosted deploy entry point in the README, so I can launch a hosted trial before committing to local self-hosting.

Acceptance criteria:

- README includes a Railway deploy button or equivalent one-click hosted deploy link near the install path.
- README distinguishes hosted Railway mode from full local Docker/devcontainer mode.
- README links to detailed hosted deployment docs.

### US-002 — Railway hosted-smoke deployment assets

As a new Open Harness user, I want repository-owned Railway config and startup assets, so the deploy button boots a predictable smoke-testable service.

Acceptance criteria:

- Root `railway.json` uses Railway config-as-code with the JSON schema and a custom Dockerfile path.
- The Railway Dockerfile builds a minimal Open Harness hosted-smoke image from this repo without requiring a host Docker socket.
- The Railway start command binds to `$PORT` and serves a status endpoint/page confirming the container booted.
- The hosted mode does not claim full local sandbox parity.

### US-003 — Hosted deployment docs

As a self-hosting evaluator, I want explicit hosted-mode requirements and limits, so I know what works on Railway and when to switch to the local path.

Acceptance criteria:

- Docs name required/optional env vars without secret values.
- Docs explain that Railway does not provide the host Docker socket / privileged container surface needed for nested sandbox lifecycle operations.
- Docs explain the supported smoke-test experience and the path to full local setup.
- Docs mention persistence expectations and safe credential handling.

### US-004 — Drift guard

As a maintainer, I want a deterministic probe for the Railway deploy surface, so future README/config changes do not silently break the one-click path.

Acceptance criteria:

- An eval probe verifies `railway.json`, deploy assets, README link, docs link, and `$PORT` binding contract.
- The probe exits PASS on the implemented surface and REGRESSION when any required artifact/link/contract is missing.
- `evals/RESULTS.md` is refreshed for the new probe.

## Wiki Alignment

Impact: NOT-APPLICABLE

Local entries: none. This is public deployment documentation/config, not a durable internal wiki concept.

DeepWiki comparison: no existing hosted Railway deployment surface was found in the repo search. The implementation should add repo-local docs and a deterministic probe rather than a wiki entry.
