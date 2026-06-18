# Ralph task — make-harness-audit-shared-memory

Implement `tasks/make-harness-audit-shared-memory/prd.json` on branch `feat/432-make-harness-audit-shared-memory` for issue #432.

## Read first
- `tasks/make-harness-audit-shared-memory/prd.md`
- `tasks/make-harness-audit-shared-memory/prd.json`
- `tasks/make-harness-audit-shared-memory/critique.md`
- `.claude/skills/harness-audit/SKILL.md`
- `evals/probes/harness-audit-memory-path.sh`
- `context/rules/wiki.md`

## Done when
- All `prd.json` tasks have `passes: true`.
- `bash evals/probes/harness-audit-memory-path.sh` passes.
- `bash evals/probes/wiki-readme-index.sh` passes.
- `bash .claude/skills/eval/run.sh --probe harness-audit-memory-path` passes.
- `git diff --check` passes.
- Append `STATUS: COMPLETE` to `progress.txt`.

Submitted-by: Pi
