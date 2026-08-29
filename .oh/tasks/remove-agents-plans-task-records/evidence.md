# Evidence — remove agent definitions, plans, handoffs and task records

## Protected-path deletions

`.oh/agents/advisor.md` is deleted. It was listed in `.claude/protected-paths.txt`
under "Norms folded into skills" as the advisor delegation and
recursive-decomposition norm.

The whole `.oh/agents/` pack is removed in this change: advisor, architect,
critic, designer, implementer, pm. The provider surfaces that pointed into it
(`.claude/agents`, `.codex/agents`) are removed with it, and the pack is dropped
from `required_files` and `provider_links` in `.oh/scripts/link-providers.sh`
and from `.claude/protected-paths.txt`.

The sub-agent entries `.claude/agents/architect.md`, `.claude/agents/critic.md`,
`.claude/agents/implementer.md`, and `.claude/agents/pm.md` are removed from the
protected list for the same reason: they resolved through the deleted symlink.

## Probe changes

- `skills-vendored` no longer asserts `.claude/agents` and `.codex/agents` are
  symlinks.
- `audit-stale-references` no longer requires the deleted
  `.oh/tasks/archive/2026-07-27/audit-consolidation/` files.
- `slack-admin-command-surface` no longer requires the deleted
  `.oh/tasks/slack-admin-command-surface/root-package-audit.md`.
