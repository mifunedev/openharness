# Adversarial Plan Critique

Date: 2026-08-03
Scope: `plan.md`, `prd.md`, and `prd.json` before implementation

## Critic A — Implementer lens

### Alignment checks

- **PASS:** All four PRD stories map one-to-one to Ralph stories with identical IDs, dependency order, and concrete acceptance criteria.
- **PASS:** The plan modifies only the canonical implementation, smoke test and test contract, canonical installation doc, changelog, and task evidence.
- **PASS:** Package selection is exact: `inetutils-telnet`, never transitional `telnet`; the command-level contract remains `/usr/bin/telnet`/`telnet`.
- **PASS:** Docker constraints explicitly preserve Bookworm slim, `--no-install-recommends`, existing apt layer and cleanup, unpinned policy, user/runtime configuration, ports, and entrypoint.
- **PASS:** Runtime checks are explicitly unprivileged and non-interactive; `lsof -v`, `htop --version`, and `telnet --version` are suitable version probes.
- **PASS:** The test plan covers both the command wiring and the more important failure behavior: diagnostics plus EXIT teardown.

### Findings

1. **LOW — Test fixture must distinguish health failure from runtime-command failure.** The current fake Docker implementation keys only on exec count. The implementation should add an explicit runtime failure mode and a Docker argv log so tests prove command wiring rather than merely successful call count.
   - **Mitigation incorporated:** US-002 and `plan.md` require command recording plus a runtime-assertion failure case.
2. **LOW — Full boot smoke can collide with an operator stack.** It should run through the repository wrapper and preserve teardown semantics; local execution must first inspect stack state and use the existing bounded script rather than ad hoc lifecycle commands.
   - **Mitigation incorporated:** US-004 allows an exact feasibility blocker and requires evidence; no acceptance criterion is waived silently.

## Critic B — User/security lens

### Alignment checks

- **PASS:** The user-visible outcome is immediate availability in the default image, not a runtime install or optional profile.
- **PASS:** Documentation must state telnet is plaintext and not a secure shell; no server, daemon, service, or exposed port is introduced.
- **PASS:** The plan makes no host-process visibility promise for containerized `lsof`/`htop` and no new architecture promise.
- **PASS:** Package/version policy remains consistent with existing unpinned Debian Bookworm packages.
- **PASS:** Delivery includes a ready, non-draft PR targeting `development`, required CI, and no merge.

### Findings

1. **MEDIUM — A command-presence-only smoke would not prove utility executability.** `command -v` alone can pass for a broken binary or inaccessible runtime.
   - **Mitigation incorporated:** PRD FR-4 and US-002 require successful version execution as user `sandbox` for every command.
2. **LOW — Telnet wording could be misconstrued as remote-shell guidance.** The canonical table must call it a plaintext diagnostic client supplied by `inetutils-telnet`, and explicitly say it is not SSH/a secure shell.
   - **Mitigation incorporated:** US-003 and FR-6 require this exact distinction.

## Cross-artifact traceability

| Requirement | Plan | PRD | Ralph JSON | Result |
|---|---|---|---|---|
| Exact packages and apt hygiene | US-001 | US-001, FR-1..3 | US-001 | Aligned |
| Runtime sandbox-user checks | US-002 | US-002, FR-4..5 | US-002 | Aligned |
| Docs and security warning | US-003 | US-003, FR-6 | US-003 | Aligned |
| Full gates, audits, ready PR/CI | US-004 | US-004 | US-004 | Aligned |
| Non-goals | Constraints | Non-Goals | Story criteria/notes | Aligned |

## Gate decision

**APPROVED** — no unmitigated high-severity findings. The one medium finding is explicitly closed by executable version checks in both PRD and Ralph acceptance criteria. Implementation may begin.
