# Preserved changelog rationale

`CHANGELOG.md` was reformatted to one-sentence entries (see `/git` § Changelog).
Most compressed entries lose nothing: their detail is reachable through the
`([#N])` PR or issue link the entry keeps.

Twelve entries had **no** link, so compressing them would have destroyed the only
record. Eleven are reproduced here **verbatim**, with the version they shipped in.
The twelfth is a task decision and lives in
`.oh/tasks/ste-controlled-language/preserved-decision.md`.

This file is a record, not a live specification. Where it describes a path or a
file that has since moved or been deleted, the description is true of the version
named beside it and may not be true today. Do not repair a path or a skill name
quoted below to match the present — that would falsify the record.

For the same reason `.oh/evals/probes/audit-stale-references.sh` excludes this
file, exactly as it already excludes `CHANGELOG.md`: a skill named in a 2026-05
entry is a historical fact, not a stale reference awaiting a fix.

> Note: `.oh/memory/MEMORY.md` is gitignored, so lesson-shaped entries are kept
> here rather than there — routing them to an ignored file would have deleted
> them from the repository.


## Architecture decisions


### The `.oh/` namespace migration and the no-back-compat-symlink rule

Shipped in `[2026.7.5] - 2026-07-05`.

> **Relocate the Ralph/spec cron definitions from `crons/` to `.oh/crons/`** so the scheduled-agent surface joins the `.oh/` machinery namespace, with **no** back-compat root symlink — every consumer was repointed to the real `.oh/crons/` path: `cron-runtime.ts` reads, the `locked-append.sh` liveness logs, the cron bodies, the eval probes, and the `CRONS_DIR` default itself (`.oh/crons`) in `docker-compose.yml`/`entrypoint.sh`/`cron-runtime.ts`; `.gitignore`/`protected-paths.txt` entries moved with the dir, and the governing principle (`.oh/README.md`, `docs/roadmap.md`) reclassifies `crons/` as machinery. Paired with a `.mifune` submodule PR repointing cron-path references in the skills.


### Retiring the `.mifune` submodule — the split-source footgun

Shipped in `[2026.7.5] - 2026-07-05`.

> **Absorb the shared primitive pack into `.oh/`, retiring the `.mifune` submodule.** The skills, agents, and hooks (+ `skills.lock`) are now vendored directly under `.oh/skills`, `.oh/agents`, `.oh/hooks` and shipped through the `.oh/manifest.json` payload, so `oh init`/`oh update` lay them down in one shot with **no** submodule fetch — eliminating the split-source footgun where the CLI-vendored `.oh/` and the remote-pinned `.mifune` could diverge (a fresh `oh init` could materialize un-swept skills until the submodule was pushed). Removes `.gitmodules` + the gitlink, retargets the provider symlinks (`.claude`/`.codex`/`.pi` `/skills → ../.oh/skills`, `.claude/agents`, `.claude/hooks`, and the Hermes link), renames `.oh/scripts/ensure-mifune.sh → link-providers.sh` (provider-symlink wiring + vendored-pack validation, no git), repoints `oh init` (`init.ts` drops the submodule-materialize phase), the CI/release path filters and eval invocation, and replaces the `mifune-checkout` probe with `skills-vendored`. Supersedes the #539 submodule-mount approach.


### Reversing the `.oh/devcontainer/` move

Shipped in `[2026.7.5] - 2026-07-05`.

> **Consolidate the harness's own devcontainer back into the conventional root `.devcontainer/`**, superseding the earlier `.oh/devcontainer/` relocation in this same unreleased cycle. All six build/bootstrap assets (`Dockerfile`, `docker-compose.yml` + the hermes-dashboard overlay, `entrypoint.sh`, `client-slack-supervise.sh`, `seed-msg-bridge.sh`) now sit alongside a hand-maintained `devcontainer.json` (its `dockerComposeFile` points at the same-dir compose) in `.devcontainer/` — one conventional location, no split, no compat shim. Retires the `sync-devcontainer.sh` compat generator, simplifies the `oh init` devcontainer copy (source is the sibling `.devcontainer/`; only the consumer `/home/sandbox/harness` → `/home/sandbox/project` workspace rewrite remains), drops the whole-dir `.devcontainer/` `.dockerignore` exclusion so the entrypoint `COPY` resolves (env secrets still excluded via `**/.env*`), and repoints the CI boot-lint/hadolint globs, the `.oh/scripts` lifecycle wrappers, the `project-root-seam` / `boot-lint-glob` / `cron-watchdog` / `sandbox-boot-guard-ci` probes, and the docs. The `oh-devcontainer-restructure` eval probe is inverted to guard the consolidated layout.


### The executable harness loop (the rules tier that held it was later collapsed)

Shipped in `[2026.6.16] - 2026-06-16`.

> `context/rules/loop.md` — single source of truth for the **executable harness loop**: a decision-tree of skills where each node emits a terminal `STATUS:` token and hands off to the next, anchored to a *capability-as-outcomes* objective (a held-out capability benchmark as the progress ceiling vs. the `evals/probes` suite as the regression floor). Defines the `STATUS:` terminal-status convention, the per-skill `## Handoff` convention (distributed declaration, Advisor-centralized execution), and the six load-bearing invariants every handoff must preserve. Layer 0 of the executable-loop build; node wiring is incremental (see its § 7 build state).


### Why there is no Slack compose overlay

Shipped in `[2026.5.14] - 2026-05-14`.

> `.pi/overlays/docker-compose.slack.yml` and all references to it. The in-tree Pi extension at `.pi/extensions/slack/` reads `SLACK_APP_TOKEN` / `SLACK_BOT_TOKEN` directly from `process.env` at `session_start`, so the compose-time wiring overlay is redundant. `docs/integrations/slack.md`, `README.md`, `docs/architecture/container-runtime.md`, `docs/guide/bring-your-own-harness.md`, `.devcontainer/docker-compose.yml`, and `.devcontainer/.example.env` no longer reference the overlay; `.pi/overlays/` directory removed. Source of truth for Slack env wiring is `.pi/extensions/slack/README.md`.

### Changed


### Makefile scope — no agent-CLI targets

Shipped in `[2026.5.14] - 2026-05-14`.

> Top-level `Makefile` wrapping `docker compose -f .devcontainer/docker-compose.yml` so users type `make sandbox` / `make shell` / `make destroy` instead of the 50-character compose lines. Targets: `sandbox`, `shell`, `destroy`, `stop`, `logs`, `ps`, `restart`, `help` (default, self-documenting via awk). Uses `-include .devcontainer/.env` so `SANDBOX_NAME` flows through. No agent-CLI targets — the harness's value is sandbox isolation, agent choice (`claude` / `codex` / `pi`) happens inside `make shell`.

### Changed


## Incidents and lessons


### Postmortem: six orchestrator skills deleted in error

Shipped in `[2026.5.14] - 2026-05-14`.

> Restored six orchestrator skills removed in error during the v0.7 convergence (US-012, commit `fb71365`): `/ralph` (PRD → `prd.json` converter), `/prd` (PRD generator), `/harness-audit` (parallel-sub-agent codebase audit), `/skill-lint` (skill staleness scorer), `/delegate` (parallel execution coordinator), and `/strategic-proposal` (council-based roadmap planning). The triage rationale ("workspace-agent skills, not orchestrator") was wrong: the orchestrator actively uses the `prd.json` schema for its own task management (e.g. `tasks/openharness-v07-convergence/prd.json`), so removing the tools that produce that schema was a regression. `scripts/ralph.sh` (the runner) was kept all along — only the wrapper skills were lost. Restored from `fb71365^` unchanged; CLAUDE.md skills table updated.


### The bind-mount shadows image-time `node_modules` failure

Shipped in `[2026.5.14] - 2026-05-14`.

> `pi` failing on a fresh sandbox with `Failed to load extension "/home/sandbox/harness/.pi/extensions/slack/index.ts": Cannot find module '@slack/socket-mode'`. The in-tree Slack Pi extension imports `@slack/socket-mode`, `@slack/web-api`, and `chalk`, all declared in the root `package.json` but never installed automatically — the harness is bind-mounted, so a Dockerfile-time install would be shadowed at runtime. `.devcontainer/entrypoint.sh` now runs `pnpm install --prefer-offline` at the harness root on first boot when `node_modules/` is missing, before the cron runtime starts (which itself imports `croner` from the same `package.json`). Set `SKIP_PNPM_INSTALL=1` to opt out.


### The `set -a` band-aid — a self-declared temporary workaround

Shipped in `[2026.5.14] - 2026-05-14`.

> Slack setup docs (`docs/integrations/slack.md`, `.pi/extensions/slack/README.md`, `.devcontainer/.example.env`) now spell out the actual working flow: add `SLACK_APP_TOKEN` / `SLACK_BOT_TOKEN` / `SLACK_ALLOW_USERS` (or `SLACK_ALLOW_CHANNELS`) to `.devcontainer/.env` in Compose `KEY=value` format, then inside the sandbox run `set -a; source /home/sandbox/harness/.devcontainer/.env; set +a` before launching `pi` so the child process inherits exported vars. `pi` itself goes in a named tmux session (`tmux new-session -d -s agent-pi 'pi 2>&1 | tee /tmp/agent-pi.log'`) per `context/rules/sandbox-processes.md`. The `set -a` requirement is documented as a temporary band-aid — `.devcontainer/.env` is dual-purpose (Compose substitution + shell source), and a future change should remove the manual `set -a` step.


### Sub-agents cannot nest — why the advisor returns a briefing

Shipped in `[2026.7.5] - 2026-07-05`.

> **Replace the `/advisor` skill with an `advisor` agent.** The advisor→executor delegation-briefing pattern (formerly `.oh/skills/advisor/SKILL.md` + `references/recursive-delegation.md`) is now a single read-only sub-agent at `.oh/agents/advisor.md` (`model: opus`, `tools: Read, Glob, Grep, Bash`). Because sub-agents cannot nest, the agent's contract is to synthesize the tight 5-field briefing (and, when the task decomposes, a bounded recursive-decomposition plan) and **return** it — the caller performs the `Agent`/ralph handoff. Repointed every reference to the deleted skill in lockstep: `.oh/scripts/link-providers.sh` + `.claude/protected-paths.txt` (vendored/protected pack lists), the `advisor-monitored-loop` + `skills-vendored` eval probes and the `context-audit` recursion probe, the `/pr-audit` · `/rlm` · `/delegate` · `/harness-context` · `/ship-spec` · `/retro` skill docs, and `AGENTS.md`.


### Open loose end: the `oh.mifune.dev/install.sh` redirect target

Shipped in `[2026.5.14] - 2026-05-14`.

> `install.sh` moved to `scripts/install.sh` to colocate with `cron-runtime.ts` and `ralph.sh` per the orchestrator-scripts convention. Repo-detection logic and help-text self-references updated for the new path. **Action required for the curl-pipe URL**: update the `https://oh.mifune.dev/install.sh` redirect to `https://raw.githubusercontent.com/ryaneggz/open-harness/refs/heads/main/scripts/install.sh`.
