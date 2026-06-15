# Critique — add-sandbox-service-healthcheck

Generated 2026-06-15; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

CRITIC_A — IMPLEMENTER LENS
[SEVERITY: H] [STORY: US-002] Slack gating is underspecified and conflicts with existing config flow | `prd.md` said “Slack tokens are configured,” but `.devcontainer/docker-compose.yml` only exposes allowlists while `.devcontainer/entrypoint.sh` reads tokens from `.devcontainer/.env` | Define exact Slack config sources and token predicates; require parsing `.devcontainer/.env` or existing config source without adding secret tokens to compose env.
[SEVERITY: M] [STORY: US-001] Success criterion is incomplete/contradictory | `prd.md` says exit `0` when required sessions are present, while another AC says exit nonzero when `system-cron` exists | Reword success AC to require all mandatory sessions present, no legacy blocker, and all enabled optional sessions present.
[SEVERITY: M] [STORY: US-003] New load-bearing script is not required to be added to protected paths | `prd.md` wires `scripts/sandbox-healthcheck.sh` into Docker health; `.claude/protected-paths.txt` requires new orchestrator-load-bearing scripts be added in the same PR | Add an AC to append `scripts/sandbox-healthcheck.sh` to `.claude/protected-paths.txt`.
[SEVERITY: M] [STORY: US-003] “Start period long enough” is not measurable | `prd.md` does not specify a minimum; `.devcontainer/entrypoint.sh` runs first-boot pnpm install before cron sessions settle | Set an explicit minimum start_period and rationale.
[SEVERITY: M] [STORY: US-003] Test coverage omits the root-to-sandbox tmux socket requirement | `prd.md` requires tmux checks as `sandbox` when Docker invokes root, but tests list does not name it | Add focused test coverage or equivalent static assertion for gosu delegation.

## Critic B — User lens

CRITIC_B — USER LENS
[SEVERITY: M] [STORY: US-002] Optional service gating is underspecified. | `prd.md` says Hermes/Slack are required when “configured,” but does not name required tmux sessions or define Slack config beyond “tokens”; existing docs require Slack allowlists too and Hermes session is `app-hermes-dashboard`. | Specify exact enabled predicates and session names: `client-slack`, `app-hermes-dashboard`, and whether Slack allowlist absence is unhealthy or merely out of scope.
[SEVERITY: M] [STORY: US-003] No rollback/escape hatch for a bad healthcheck rollout. | PRD wires Docker health automatically and docs only require inspection commands, while risk section only mitigates first-boot timing. | Add an operator escape hatch to acceptance/docs: how to run the script manually, temporarily disable/override the Compose healthcheck, and recover from false unhealthy status without changing cron behavior.
[SEVERITY: L] [STORY: US-003] “Start period long enough” is not testable. | PRD requires a conservative start period but gives no minimum or basis. | Define a concrete minimum or selection rule, then assert that value in compose wiring tests.
[SEVERITY: L] [STORY: US-001] User story actor is misaligned with maintainer/operator audience. | US-001 says “As an orchestrator,” while `context/USER.md` frames a single-user harness. | Reword US-001 as operator/maintainer-facing and keep “orchestrator” as implementation detail.

## Synthesis

- **High-severity findings**: 1
- **Medium-severity findings**: 7
- **Low-severity findings**: 2
- **Recommendation**: PROCEED after in-place PRD mitigation.

The high Slack-gating finding is mitigated in US-002 by naming `.devcontainer/.env`/environment token sources, `client-slack`, the `pi` binary predicate, and excluding allowlists from health gating. Medium/low findings are mitigated by tightening the success criterion, adding `scripts/sandbox-healthcheck.sh` to protected paths, setting `start_period: 300s`, adding root-to-sandbox delegation assertions, documenting a local-only healthcheck disable escape hatch, and rewording US-001 for the maintainer/operator audience.
