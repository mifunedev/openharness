# Critique — agent-template-make-commands

Generated 2026-06-12; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

```
CRITIC_A — IMPLEMENTER LENS

[SEVERITY: H] [STORY: US-001] make shell placeholder: AC says replace with `make shell <agent-name>`; <agent-name> is intentional template placeholder (correct usage) but AC conflates placeholder notation with command spelling. | CLAUDE.md "make shell portfolio-advisor" | Add SHELL_USER parenthetical + note <agent-name> is the Metadata placeholder. → MITIGATED in revision (US-001 AC adds the parenthetical + placeholder note).

[SEVERITY: M] [STORY: US-002] workspace/ also contains CLAUDE.md + .claude/; partial enumeration (AGENTS.md + startup.sh) reads as exhaustive and passes a partially-scaffolded workspace. | workspace/ listing | Scope verify to "AGENTS.md present" as minimum check, note other contents non-exhaustively. → ADDRESSED in revision.

[SEVERITY: M] [STORY: US-002] `ls ~/harness/workspace` is a container-interior command; running on host gives false-negative. | agent.md:56 | Label the verify step as run-inside-sandbox. → ADDRESSED.

[SEVERITY: M] [STORY: US-003] Metadata block preserves worktree_path/agent branch while US-001 removes the worktree narrative → orphaned field. | agent.md:28-32 | Decide: keep (reserved real convention) or remove. → RESOLVED: the agent/<name> branch + .worktrees/<name> path ARE real conventions (context/rules/git.md §Worktrees); US-001 revision reframes provisioning to note they are created MANUALLY via `git worktree add`, making Metadata coherent.

[SEVERITY: L] US-001 grep not repo-root anchored; L US-002 awk frontmatter check is wiki idiom, not GitHub-render guarantee; L * no branch/commit guidance. | — | Run ACs from repo root; treat awk as structural check; git workflow handled by ship-spec. → ACKNOWLEDGED (low).
```

## Critic B — User lens

```
CRITIC_B — USER LENS

[SEVERITY: M] [STORY: US-001] No note on SANDBOX_NAME override / default container name for `make shell`. | Makefile:2,15-18 | Add parenthetical on container name default. → ADDRESSED in revision.

[SEVERITY: M] [STORY: US-002] Verify checklist enumeration of workspace/ contents ambiguous re: .claude/. | PRD Tech Considerations | Enumerate completely or narrow to AGENTS.md. → ADDRESSED (narrowed + non-exhaustive note).

[SEVERITY: M] [STORY: US-001] worktree_path in preserved Metadata refers to flow make sandbox never creates. | agent.md:28-32 | Clean or acknowledge. → RESOLVED same as Critic A M (manual git worktree add reframe).

[SEVERITY: M] [STORY: US-001] "persistent, isolated workspace" preamble framing vs shared single sandbox of make sandbox. | agent.md:23 | Add Non-Goal acknowledging framing reconcile is deferred. → ADDRESSED (Non-Goal added).

[SEVERITY: L] host/container context for ls; L no rollback note (git revert safe); L awk wiki idiom; L no protected-path violation. | — | Cheap notes. → ACKNOWLEDGED; rollback note added to Open Questions.
```

## Synthesis

- **High-severity findings**: 1 (Critic A, US-001 placeholder clarity) — mitigated at AC level in the PRD revision (SHELL_USER parenthetical + placeholder note); not a destructive or protected-path issue.
- **Medium-severity findings**: 6 (worktree/framing coherence ×3, verify-checklist enumeration ×2, host/container context ×1) — all addressed by the PRD revision.
- **Protected-path violations**: 0. `.github/ISSUE_TEMPLATE/agent.md` is not on `.claude/protected-paths.txt`; the Makefile (protected) is explicitly out of scope.
- **Recommendation**: PROCEED (after PRD revision incorporating the findings above).
