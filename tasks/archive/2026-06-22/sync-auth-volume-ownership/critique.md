# Critique — sync-auth-volume-ownership

Generated 2026-06-16; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

CRITIC_A — IMPLEMENTER LENS
[SEVERITY: H] [STORY: US-001] Ambiguous `.hermes` target can cause destructive pre-sync `chown` of bind-mounted project-local Hermes state | [EVIDENCE: PRD AC “plus existing `.hermes`”; harness-context reference says Hermes state is `/home/sandbox/harness/.hermes`, not a named volume] | Specify `/home/sandbox/.hermes` legacy-only vs `$HERMES_HOME` project-local handling; forbid pre-UID-sync recursive chown of bind-mounted checkout paths.
[SEVERITY: M] [STORY: US-001] Compose auth/config volume list is incomplete: OpenCode auth volume is omitted | [EVIDENCE: `.devcontainer/docker-compose.yml` mounts `opencode-auth:/home/sandbox/.local/share/opencode`; PRD AC list omits `.local/share/opencode`] | Add `.local/share/opencode` to helper/test scope or explicitly mark it out-of-scope with rationale.
[SEVERITY: M] [STORY: US-001] Refactor could drop existing non-recursive parent ownership repairs | [EVIDENCE: `.devcontainer/entrypoint.sh` repairs `/home/sandbox/.local`, `/home/sandbox/.local/share`, `/home/sandbox/.config`; PRD AC only covers auth/config child dirs] | Add AC to preserve parent-dir repairs and avoid recursive chown of bind-mounted children when preserving EACCES fixes.
[SEVERITY: M] [STORY: US-002] Regression test can pass while using stale pre-sync numeric owner | [EVIDENCE: PRD AC separately requires “computes numeric sandbox ownership from `id -u sandbox` and `id -g sandbox`” and “helper invoked before and after” but not recomputation at call time] | Require test/assertion that the helper resolves `id -u/g sandbox` inside the helper or after UID/GID reconciliation before each chown.
[SEVERITY: L] [STORY: US-003] Wiki AC does not explicitly require schema-valid, line-cited entry | [EVIDENCE: `context/rules/wiki.md` requires frontmatter, sources, source-file list, line-cited claims, See Also; PRD AC only says “explains” invariant] | Add AC for valid frontmatter, `sources:`, `## Relevant Source Files`, line-cited claims, `## See Also`, and `bash evals/probes/wiki-readme-index.sh`.

## Critic B — User lens

CRITIC_B — USER LENS
[SEVERITY: M] [STORY: US-001] Metadata mutation has no rollback/escape hatch; entrypoint will chown credential/config mounts twice on every boot with no specified opt-out if a host/volume setup relies on different ownership. | [EVIDENCE: PRD US-001 acceptance criteria; context/USER.md single-user harness] | Add an emergency env opt-out or documented manual rollback/recovery path, plus expected logging when ownership repair runs.
[SEVERITY: M] [STORY: US-001] “Repairs” is underspecified for sensitive paths like `.ssh`: users expect ownership fixed without weakening permissions or following unsafe symlinks. | [EVIDENCE: PRD US-001 acceptance criteria] | Define repair semantics: chown only existing directories/files, do not delete, do not chmod unless explicitly required, and avoid following symlinks outside the mounted auth/config roots.
[SEVERITY: L] [STORY: US-003] Wiki requirement preserves the invariant but not operator usefulness: no acceptance criterion for symptoms, verification, or recovery commands. | [EVIDENCE: PRD US-003 and Wiki Alignment] | Require the wiki entry to include “how to recognize”, “how to verify numeric ownership”, and “what to do if auth still fails” sections.
[SEVERITY: L] [STORY: *] Protected path risk is acknowledged by scope but should stay explicit during implementation: `.devcontainer/entrypoint.sh` is protected and may be edited only because this PRD targets it; deletion/replacement would violate user expectations. | [EVIDENCE: `.claude/protected-paths.txt`; PRD US-001/US-002] | Preserve the file and make minimal in-place edits only; do not delete, rename, or replace the protected entrypoint.

## Synthesis

- **High-severity findings**: 1, mitigated in PRD before implementation by narrowing `.hermes` to `/home/sandbox/.hermes` legacy state and explicitly forbidding recursive pre-sync chown of the bind-mounted checkout or `$HERMES_HOME` under `/home/sandbox/harness`.
- **Medium-severity findings**: 5, mitigated in PRD by adding `.local/share/opencode`, preserving parent repairs, requiring owner recomputation inside the helper, logging the repair pass, documenting rollback/recovery in wiki, and defining non-destructive repair semantics.
- **Recommendation**: PROCEED — all high/medium findings are acceptance-criteria tightening, no protected-path deletion or architectural halt remains.
