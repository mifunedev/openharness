# Harness Audit source snapshot — 2026-06-18

Source files used to create `wiki/harness-audit.md`:

- `.claude/skills/harness-audit/SKILL.md` — context snapshot root resolution and key paths.
- `evals/probes/harness-audit-memory-path.sh` — regression probe for the memory-root split.
- `tasks/make-harness-audit-load-shared/prd.md` — PRD for issue #432.

Relevant excerpt from `.claude/skills/harness-audit/SKILL.md` after this change:

```bash
# Runtime observability logs may intentionally live in the shared checkout when
# a cron worktree is ephemeral. Source inspection still uses $AUDIT_ROOT.
AUDIT_LOG_ROOT="${AUTOPILOT_LOG_ROOT:-$AUDIT_ROOT}"
if [ -n "${CRON_WORKTREE:-}" ] && [ "$AUDIT_LOG_ROOT" = "$AUDIT_ROOT" ]; then
  root="$(git -C "$AUDIT_ROOT" worktree list --porcelain 2>/dev/null | awk 'NR==1 && $1 == "worktree" { sub(/^worktree /, ""); print; exit }' || true)"
  [ -n "$root" ] && AUDIT_LOG_ROOT="$root"
fi

# Recent long-term memory (runtime observability artifact; shared root in cron worktrees)
tail -40 "$AUDIT_LOG_ROOT/memory/MEMORY.md" 2>/dev/null
```
