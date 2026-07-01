# Trajectory input

## Run pnpm security audits in CI

## Goal
Run pnpm security audits in CI so lockfile vulnerabilities fail checks before merge/release.

## Acceptance Criteria
- CI has a pnpm audit gate using the repo's pinned pnpm version.
- Release validation mirrors the audit gate.
- Local script exists for parity.
- A regression probe guards the CI audit wiring.
