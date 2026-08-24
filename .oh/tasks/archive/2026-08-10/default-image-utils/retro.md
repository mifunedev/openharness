# Build Retrospective

## Session signals

- Direct image execution proved Debian's `dpkg-query -W telnet` can return success for an uninstalled virtual/transitional package name, while `dpkg -s telnet` correctly established absence.
- A host Docker socket does not guarantee compose bind mounts can see a container-only linked-worktree path; direct image checks can pass while a bind-mounted full smoke fails before reaching changed behavior.
- Live sandbox environment variables can contaminate tests intended to model clean CI defaults; the same suite passed with service variables unset.

## Hypotheses

| ID | Subsystem | Hypothesis | Evidence for | Evidence against | Verdict | Confidence | Promotion |
|---|---|---|---|---|---|---|---|
| H1 | docs/evidence | Package absence checks for Debian virtual package names should use installed-status evidence (`dpkg -s` or Status), not `dpkg-query -W` exit alone. | `dpkg-query -W telnet` exited 0 with blank metadata while `dpkg -s telnet` reported not installed. | This was observed for one package name only. | supported | medium | task evidence only; re-derivable package behavior |
| H2 | memory scaffolding | Full compose smoke through a host socket requires the checkout path to exist in the daemon's mount namespace. | Compose mounted an empty source and health reported the expected repository script missing; direct image checks passed. | GitHub runner topology is expected to share its workspace and may pass. | supported | high | task evidence only; environment-specific |
| H3 | continual learning | Live service variables can produce false local test failures when fixtures inherit `process.env`. | Four failures all disappeared when SSH/Slack service variables were unset; 478 tests then passed. | CI starts clean, so this does not indicate product failure. | supported | high | task evidence only; no public memory change |

## Promotion candidates

None. These observations are captured in this task's evidence and are either environment-specific or quickly re-derived; no `.oh/memory/` or identity change is appropriate for a public PR.

## Outcome

The implementation stayed within scope, direct image validation passed, and no code rework followed the self-audit. PR #704 is ready and unmerged; required Harness and Sandbox Boot Guard CI passed, and the deterministic focused classifier returned complete, promotable, clean evidence.

STATUS: RETRO-DONE
