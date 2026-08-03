# Audit consolidation active-reference inventory

## Policy

Command used before and after migration:

```bash
git grep -n -E '/(pr-audit|harness-audit|context-audit|skill-lint|eval-lint|drift-check)|\.oh/skills/(pr-audit|harness-audit|context-audit|skill-lint|eval-lint|drift-check)|auditor\.md' -- \
  ':!CHANGELOG.md' ':!.oh/evals/RESULTS.md' ':!.oh/evals/datasets/**' ':!.oh/tasks/**' \
  ':!.oh/evals/probes/audit-stale-references.sh' ':!.oh/evals/probes/audit-dispatcher-contract.sh'
```

Historical changelog entries, immutable datasets, generated scoreboards, archived/current migration task definitions, and the stale-reference probe's own forbidden-pattern declaration are migration-definition evidence, not active advertised/invoked references.

## Before — 2026-07-17

- 268 tracked occurrences before exclusions/classification.
- Active occurrences covered source skills and agents, provider prompts/templates, crons, workflows/docs, capability tasks, and probes.
- Canonical destinations: implementation callers → `/audit implementation`; focused PR workflow gates → `/audit pr`; queue triage → `/audit prs`; surveys/quality/drift → their explicit target; multi-surface routing → `/audit full`.

Representative active owners included `.oh/agents/advisor.md`, `.oh/agents/auditor.md`, `.oh/context/REPO_MAP.md`, `.oh/crons/{autopilot,heartbeat,prompt-miner}.md`, `.oh/skills/{ship-spec,autopilot,spec,sync,watchdog,benchmark,eval,health-check,wiki}/`, `.pi/prompts/execute.md`, `.oh/templates/`, `.github/workflows/`, capability tasks CB-001/CB-004, and audit-related eval probes.

## After — 2026-07-17

- 0 active legacy invocations/paths under the policy above.
- Explicit migration definitions remain only in `CHANGELOG.md`, this task's approved artifacts, immutable datasets/generated history, and `.oh/evals/probes/audit-stale-references.sh`.
- `.oh/evals/probes/audit-stale-references.sh` deterministically enforces the zero-active-reference result.
- Parent protected-path commit `6ea7be3f1984c5d5cfc5822fdf26780026375b14` is an ancestor of the consolidation head; `.claude/protected-paths.txt` is unchanged by the child implementation.
