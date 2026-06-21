# Shared skills symlink migration pattern

Use this when changing how Open Harness skills are shared across agent runtimes.

## Durable pattern

- Keep the tracked source of truth neutral: `.mifune/skills/*/SKILL.md`.
- Expose that source through runtime-specific paths rather than copying skills:
  - `.claude/skills -> ../.mifune/skills`
  - `.codex/skills -> ../.mifune/skills`
  - `.pi/skills -> ../.mifune/skills`
  - `.hermes/skills/openharness -> ../../.mifune/skills` when Hermes is enabled.
- For Hermes, prefer a symlink under `$HERMES_HOME/skills` over mutating `skills.external_dirs` in runtime config. Hermes scans local skills with `os.walk(..., followlinks=True)`, so a linked child directory works while keeping `.hermes/skills` runtime/profile state non-authoritative.

## Required repo-wide follow-through

When moving or renaming the canonical skill path, update all path-sensitive callers, not just the symlink:

- CI path filters and runner invocations, e.g. `.github/workflows/*` should watch/use `.mifune/skills/**` and `bash .mifune/skills/eval/run.sh`.
- Cron prompts/runbooks that invoke skill scripts, e.g. `crons/heartbeat.md`.
- Eval probes that assert exact paths or inspect skill fixtures, e.g. `eval-ci-gate` and prompt-miner fixture probes.
- Docs and runtime README files: `AGENTS.md`, `.hermes/README.md`, `docs/installation.md`, `docs/harnesses/hermes.md`, changelog.
- The governing skill docs themselves: `harness-context` and its source-of-truth references.

## Script pitfall

Skill support scripts may be executed through `.mifune/skills/...`, `.claude/skills/...`, `.codex/skills/...`, `.pi/skills/...`, or Hermes' linked `.hermes/skills/openharness/...` path. Avoid fixed-depth root derivation such as `SCRIPT_DIR/../../..`. Instead, walk upward until an invariant repo marker exists, e.g. `evals/probes`, `AGENTS.md`, or `.git`.

## Verification checklist

- `find -L <agent-skill-path> -name SKILL.md | wc -l` returns the same count for `.mifune/skills`, `.claude/skills`, `.codex/skills`, `.pi/skills`, and Hermes' linked path.
- `find .claude .codex .pi .hermes/skills -xtype l -print` is empty.
- Hermes reload/list shows Open Harness skills under the shared linked source.
- `bash -n` passes for touched shell scripts.
- `git diff --check` passes.
- Full eval suite passes after path-sensitive probes are updated.
