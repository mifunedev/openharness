# Critique — reap-completed-autopilot-pr-sessions

Generated 2026-06-16; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

CRITIC_A — IMPLEMENTER LENS
[SEVERITY: M] [STORY: US-002] Active-session false positives are the main implementation risk. | EVIDENCE: cleanup kills tmux sessions. | RECOMMENDATION: require both terminal PR state and a double-capture idle check before kill.
[SEVERITY: L] [STORY: US-001] Branch/session mapping can be brittle if re-derived by string surgery only. | EVIDENCE: `autopilot-<branch>` sanitizes `/` to `-`. | RECOMMENDATION: compare against sanitized `headRefName` values from `gh pr list --state all` when possible.

## Critic B — User lens

CRITIC_B — USER LENS
[SEVERITY: M] [STORY: US-002] Users expect kept sessions to remain attachable for open PRs. | EVIDENCE: autopilot session lifecycle says kept sessions are for manual attach/continue/reap. | RECOMMENDATION: explicitly preserve any session with an open PR.
[SEVERITY: L] [STORY: US-003] Reporting should make autonomous kills visible. | EVIDENCE: heartbeat reports watchdog nudges. | RECOMMENDATION: emit `NUDGE: reaped completed autopilot session <session>`.

## Synthesis

- **High-severity findings**: 0
- **Medium-severity findings**: 2
- **Recommendation**: PROCEED — both medium findings are mitigated in ACs by open-PR preservation, terminal PR state, double-capture idle detection, and explicit reporting.
