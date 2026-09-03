# PRD: One door for harness and tool installs

**Issue:** [#948](https://github.com/mifunedev/openharness/issues/948) · **Prefix:** `task` · **Repo:** `mifunedev/openharness` · **Base:** `development`
**Source plan:** `.claude/plans/happy-watching-sloth.md` (approved by the operator in this session)

## Introduction

`oh harness install <id>` and `oh tool install <id>` (PRs #821, #906, #908) are the first-class door for putting a coding harness or a tool into the sandbox. The boot path still installs a "default" set into every fresh home mount with no operator action: harnesses `claude-code`, `codex`, `pi` and tools `herdr`, `cloudflared`, all `kind: "default"`, run by `.oh/scripts/provision-defaults.sh` from `entrypoint.sh`. Around it sit switches: `install.*` keys in `oh.json`, `--persist-only` / `--no-persist` / `--defaults`, the `install.sh` and `oh init` "Optional installs" prompts, the `OH_PROVISION_DEFAULTS` off-ramp, and the provision-failed marker the healthcheck reads.

Operator decision: the CLI is the only door. Nothing installs at boot; no `install.*` keys; no persist flags; no off-ramps. A harness or tool enters the sandbox only through the verb, lands in `~/.local` in the home volume, and persists because that volume persists. `kind: "baked-in"` tools (`gh`, `docker-cli`) stay in the image. `--yes` on `oh tool install` stays: it confirms a download size, it does not switch behaviour. After `oh shell`, a fresh sandbox has no `herdr` until `oh tool install herdr`.

## Goals

- A fresh sandbox from the PR-head image provisions nothing at boot and still passes its healthcheck.
- Both verbs shrink to `list`, `install <name>`, `status [name]`, `--json` (`--yes` kept on `oh tool install`); install is probe → install → report with no `oh.json` step.
- No `install.*` key, no `harnessKey`/`toolKey`, no `kind: "default"`, no provisioner, no marker, no `OH_PROVISION_DEFAULTS` anywhere in the tracked tree except negative-assertion guards.
- Verifiers and probes prove the new state and bite when it regresses; CI stays green.
- Docs and root context describe only the door.

## Definition of Done

| # | Done means | Proof |
|---|---|---|
| D1 | Before evidence: a child sandbox from `ghcr.io/mifunedev/openharness:latest` provisions claude-code, codex, pi, herdr, cloudflared with no operator action | `docker logs` + `oh harness list` / `oh tool list` excerpts in `evidence.md` and the PR body |
| D2 | After evidence: a child from the PR-head image provisions nothing; every installable entry shows `INSTALLED no`; healthcheck passes | same excerpts |
| D3 | The door works inside the child: `oh tool install herdr && herdr --version` and `oh harness install pi && pi --version` exit 0 | excerpt |
| D4 | `git grep -nE '<switch strings>' -- . ':!CHANGELOG.md' ':!.oh/tasks' ':!.oh/logs'` returns only negative-assertion guards: `.oh/evals/probes/harness-one-door.sh`, `.oh/evals/probes/runtime-preflight-gate.sh`, `.oh/cli/src/__tests__/runtime-catalog.test.ts` | one grep, allowlist compared |
| D5 | No catalog entry with an `installArgv` is in the image | `verify-sandbox-image.sh <after-image>` PASS |
| D6 | `npm --prefix .oh/cli run typecheck`, `npm --prefix .oh/cli run build`, `pnpm test`, `/eval` with no new REGRESSION | exit codes |
| D7 | `harness-one-door.sh` PASS on the head; REGRESSION when one D4 string is re-added in a scratch copy | fault injection output |
| D8 | CI green: `sandbox-boot-guard`, `sandbox-compatibility`, unit suites | `/audit pr` promotable |
| D9 | Docs describe only the door; `AGENTS.md` lifecycle names `oh tool install herdr` before `herdr` | grep over `docs/ README.md AGENTS.md .oh/cli/README.md .oh/install/` + read of `docs/harnesses/overview.md`, `docs/installation.md` |
| D10 | Untouched: parent working-tree `oh.json`, untracked `migrate-dotenv-settings.sh`, `provision-python.sh`, everything under `.oh/skills/` except two stale lines (see Plan Reconciliation) | `git status` on the parent unchanged; branch diff |
| D11 | Landed per `/git` and `/spec`: issue #948, branch `task/948-one-door` in `.worktrees/`, draft PR to `development` undrafted only after `/audit pr` promotable, CHANGELOG Unreleased entry, evidence.md | PR URL |

Switch strings for D4: `kind: "default"`, `harnessKey`, `toolKey`, `INSTALL_FIELDS`, `--persist-only`, `--no-persist`, `--defaults`, `install\.(opencode|grokBuild|hermes|agentBrowser|tailscale)`, `OH_PROVISION_DEFAULTS`, `provision-defaults`, `provision-failed`, `OH_PROVISION_MARKER`, `_opt_install`.

## User Stories

### US-001: Catalogs and CLI verbs expose one door

**Description:** As an operator, I want `oh harness` and `oh tool` to install only when I ask, with no default set and no persist flags, so that the verb is the only way a harness or tool enters the sandbox.

**Acceptance Criteria:**

- [ ] `.oh/cli/src/lib/harnesses/catalog.ts`: `HarnessKind = "installable" | "on-demand"`; `harnessKey`, `defaultHarnesses`, `optionalHarnesses` removed; every `installArgv`, `verifyArgv`, pin, and sha unchanged
- [ ] `.oh/cli/src/lib/tools/catalog.ts`: `ToolKind = "baked-in" | "installable"`; `toolKey`, `defaultTools` removed; pins and shas unchanged
- [ ] `commands/harness.ts`, `commands/tool.ts`, `cli.ts`: parsers and help text lose `--persist-only`, `--no-persist`, `--defaults`; `oh tool install` keeps `--yes`; install = probe → install → report with no `oh.json` write; list/status drop the ENABLED column and the `enabled` JSON field; no error text promises a later boot install
- [ ] `git grep -nE '<switch strings>' -- .oh/cli` returns only `.oh/cli/src/__tests__/runtime-catalog.test.ts` (negative assertion)
- [ ] `.oh/cli/src/__tests__/harness-catalog.test.ts`, `harness.test.ts`, `tool.test.ts`, `tool-catalog.test.ts` assert the one-door shape; `install-flag-persistence.test.ts` deleted
- [ ] Typecheck passes (`npm --prefix .oh/cli run typecheck`) and `npm --prefix .oh/cli run build` succeeds
- [ ] Tests pass (`pnpm test`)

### US-002: `install.*` leaves the config surface

**Description:** As an operator, I want no `install` section in `oh.json`, the wizard, the installer, or the migrator, so that there is no second place that decides what gets installed.

**Acceptance Criteria:**

- [ ] `.oh/cli/src/lib/oh-config.ts`: `install` removed from `OhConfig`, `defaultOhConfig`, the validator, and `OH_CONFIG_FIELDS`; unknown keys in an existing `oh.json` are still tolerated (the parent's stale `install` block must not break `oh config show`)
- [ ] `.oh/cli/src/lib/env-file.ts`: `INSTALL_FIELDS`, `installFieldPath`, `isInstallFlagEnabled`, `setInstallFlag` deleted; `CONFIG_FIELD_BY_ENV_KEY` keeps only `DOCKER_SOCKET`; legacy `INSTALL_*` importers deleted
- [ ] `.oh/cli/src/commands/init.ts`: the "Optional installs" step and its prompts removed; remaining steps renumbered
- [ ] The template `oh.json` under `.oh/cli` (or `.oh/templates`) carries no `install` section
- [ ] `.oh/scripts/install.sh`: `_opt_install` block deleted; the closing banner's `oh harness install …` / `oh tool install …` lines list `claude-code`, `codex`, `pi`, `herdr`, `cloudflared`
- [ ] `.oh/scripts/migrate-harness-yaml.sh`: `install.*` mappings dropped; `.oh/evals/probes/harness-yaml-migration.sh` adjusted to match
- [ ] `.oh/cli/src/__tests__/env-file.test.ts`, `init.test.ts`, `.oh/cli/src/lib/__tests__/oh-config.test.ts`, `.oh/scripts/__tests__/install-prereqs.test.ts` updated
- [ ] Typecheck passes
- [ ] Tests pass

### US-003: Boot provisions nothing

**Description:** As an operator, I want a fresh sandbox to boot without installing any harness or tool, so that the home volume holds only what I put there.

**Acceptance Criteria:**

- [ ] `.oh/scripts/provision-defaults.sh` deleted
- [ ] `.devcontainer/entrypoint.sh`: the provisioning block (the `OH_PROVISION_DEFAULTS` gate, timeout, and call) deleted; the boot banner's `herdr` hint prints `oh tool install herdr` when the binary is absent; no other boot step assumes `herdr` exists
- [ ] `.oh/scripts/sandbox-healthcheck.sh`: the provision-failed marker block deleted; `.oh/scripts/__tests__/sandbox-healthcheck.test.ts` no longer references the marker or its timeout
- [ ] `.oh/scripts/provision-python.sh` and `.devcontainer/docker-compose.yml` `start_period` untouched
- [ ] `git grep -nE 'OH_PROVISION|provision-defaults|provision-failed' -- .devcontainer .oh/scripts` returns nothing
- [ ] Tests pass

### US-004: Verifiers, probes, and CI prove the one-door state and bite

**Description:** As a maintainer, I want the boot smoke, the image verifier, the probe suite, and CI to fail if anything installs at boot or a switch returns, so that the refactor cannot regress silently.

**Acceptance Criteria:**

- [ ] `.oh/scripts/sandbox-boot-smoke.sh`: `verify_default_catalog` replaced by a check that every entry with `kind == "installable"` reports `installed == false` after a fresh boot, for both `oh harness list --json` and `oh tool list --json`; the check fails when either catalog has no installable entry (no vacuous pass); `.oh/scripts/__tests__/sandbox-boot-smoke.test.ts` updated
- [ ] `.oh/scripts/verify-sandbox-image.sh`: `check_nothing_baked` covers every catalog entry that has an `installArgv`; its `__tests__` updated
- [ ] `.oh/evals/probes/default-provisioning.sh` replaced by `.oh/evals/probes/harness-one-door.sh` (PASS/REGRESSION/SKIPPED contract) asserting: no `kind: "default"`, no `harnessKey`/`toolKey`, no provisioner script, no `install.` key in `oh-config.ts` or the template, no `OH_PROVISION_DEFAULTS` in `.devcontainer/` or `.github/`, every installable entry absent from the Dockerfile, installs run as the sandbox user into `NPM_USER_PREFIX`, downloads carry sha256; it reports REGRESSION when any one forbidden string is re-added in a scratch copy (fault injection recorded)
- [ ] `.oh/evals/probes/provision-marker-fail-closed.sh` deleted; `tool-catalog-boundary.sh`, `tailscale-tool-boundary.sh`, `sandbox-boot-guard-ci.sh`, `runtime-preflight-gate.sh` pass against the new catalogs
- [ ] `.github/workflows/sandbox-compatibility.yml`: `-e OH_PROVISION_DEFAULTS=false` and `--no-persist` removed, jq filters select `installable`; `.github/workflows/sandbox-boot-guard.yml` comment lines 149-150 rewritten
- [ ] `bash .oh/skills/eval/run.sh` exits 0 with no new REGRESSION
- [ ] Tests pass

### US-005: Docs and root context describe only the door

**Description:** As a new operator, I want every document to tell me to run `oh harness install <id>` or `oh tool install <id>`, so that I never look for a flag, a key, or a first-boot install that no longer exists.

**Acceptance Criteria:**

- [ ] Pattern applied: "provisioned on first boot" / "default" / "set `install.<key>`" / `OH_PROVISION_DEFAULTS` / flag tables replaced by the door or deleted, in `docs/harnesses/overview.md`, `docs/harnesses/*.md`, `docs/configuration.md`, `docs/installation.md`, `docs/quickstart.md`, `docs/deployment-prebuilt-image.md`, `docs/lifecycle-commands.md`, `docs/connecting.md`, `docs/security-considerations.md`, `docs/rfcs/rfc-brain-hands-boundary.md:113`, `README.md`, `.oh/cli/README.md`, `.oh/knowledge/source/fresh-machine-setup.md` is left to the knowledge gate, `.oh/install/banner.sh` (shortcuts gated on `command -v`), `.oh/skills/t3/references/tailscale-mobile.md:86`, `.oh/skills/agent-browser/SKILL.md:70`
- [ ] `AGENTS.md` lifecycle reads `3. Run oh tool install herdr, then herdr` (wording may vary; the install precedes the run)
- [ ] `CHANGELOG.md` `## [Unreleased]` carries one `### Removed` or `### Changed` entry ≤250 chars linking #948
- [ ] `git grep -nE '<switch strings>' -- docs README.md AGENTS.md .oh/cli/README.md .oh/install .oh/skills` returns nothing
- [ ] `docs/harnesses/overview.md` and `docs/installation.md` read as one door end to end
- [ ] Typecheck passes

### US-006: Before and after evidence from child sandboxes

**Description:** As the reviewer, I want observed output from a child sandbox before and after the change, so that the PR proves the boot path changed rather than asserting it.

**Acceptance Criteria:**

- [ ] Before leg (`oh-child-before`, `ghcr.io/mifunedev/openharness:latest`): `docker logs` shows `[provision-defaults] installing` lines for claude-code, codex, pi, herdr, cloudflared; both lists show them installed (D1)
- [ ] After leg (`oh-child-after`, image built from the PR head): no provisioning lines; every installable entry `INSTALLED no`; healthcheck passes (D2)
- [ ] Inside the after child: `oh tool install herdr && herdr --version` and `oh harness install pi && pi --version` exit 0 (D3)
- [ ] `verify-sandbox-image.sh` PASS on the after image (D5)
- [ ] Both children torn down with `down -v`; no `oh-child-*` container or volume remains
- [ ] Excerpts recorded in `.oh/tasks/one-door/evidence.md` and the PR body
- [ ] Typecheck passes

### US-007: Knowledge pages match the one-door state

**Description:** As the next planner, I want the knowledge base to describe the door and nothing else, so that a future plan does not re-derive the retired provisioner.

**Acceptance Criteria:**

- [ ] `bash .oh/skills/wiki/scripts/knowledge-impact.sh --changed <actual diff>` run; every NEEDS-REVIEW page plus `compose-env-boundary`, `fresh-machine-setup`, `sandbox-dependency-installs`, `oh-cli-portable-lifecycle` ends in exactly one of UPDATED / REVERIFIED / NOT-AFFECTED (reason), recorded in `evidence.md`
- [ ] `compose-env-boundary` UPDATED: the install route is the CLI verb, `provision-defaults.sh` removed from `sources:` and the diagram; `fresh-machine-setup` UPDATED: `.devcontainer/.env` and `install.hermes` claims replaced; `updated:` and `verified_at:` advanced on every rewritten `kind: repo` page; `verified_at:` alone advanced on REVERIFIED pages
- [ ] Source-backed body shape per `.oh/skills/wiki/references/schema.md` § 3 kept
- [ ] `.oh/knowledge/README.md` regenerated; `bash .oh/evals/probes/wiki-readme-index.sh` PASS
- [ ] Typecheck passes

## Functional Requirements

- FR-1: `oh harness list --json` and `oh tool list --json` emit `kind` ∈ {`installable`, `on-demand`} / {`baked-in`, `installable`} and `installed` per entry; no `enabled` field.
- FR-2: `oh harness install <id>` and `oh tool install <id>` probe, install into `NPM_USER_PREFIX` as the sandbox user, verify with `verifyArgv`, and report; they never read or write `oh.json`.
- FR-3: `entrypoint.sh` runs no harness or tool install and reads no `OH_PROVISION_*` variable.
- FR-4: `sandbox-healthcheck.sh` passes on a fresh home volume with nothing installed.
- FR-5: `oh init` writes an `oh.json` with no `install` section; `oh config show` tolerates an existing `install` section.
- FR-6: `harness-one-door.sh` returns REGRESSION on any reintroduced switch string, PASS otherwise.

## Non-Goals

- Retuning `start_period: 600s` (follow-up in #948).
- Editing `mifunedev/openharness-web` (follow-up in #948).
- Touching the parent checkout's `oh.json`, the untracked `.oh/scripts/migrate-dotenv-settings.sh`, or `.oh/scripts/provision-python.sh`.
- Changing which tools are `baked-in`.
- Rebuilding or updating the parent sandbox's own `oh` binary.

## Technical Considerations

- Executors: Opus subagents defined in `~/.claude/agents/` (`oh-core` high, `oh-boot` high, `oh-docs` medium, `oh-fixup` low), each bounded to a file list and its own worktree; the advisor (this session) runs every gate itself, commits, and owns the PR. Model override reason: operator request, recorded here.
- Waves: 1 `oh-core` (US-001, US-002) → 2a `oh-boot` (US-003, US-004) ∥ 2b `oh-docs` (US-005) in stacked worktrees with disjoint files → merge → after image build → US-006 → US-007 → `/spec execute` tail.
- The after image must be rebuilt (`docker build -f .devcontainer/Dockerfile`) because `entrypoint.sh` is baked into the image.
- Fault injection for D7 runs against a scratch copy under the scratchpad, never inside the repository.

## Success Metrics

- Fresh-boot installs: 5 → 0 entries.
- Install surfaces: catalogs `kind: "default"`, `install.*` keys, three flags, two prompts, one env off-ramp, one marker → one verb pair.
- Healthcheck time-to-green on a fresh volume no longer includes the provisioning window (observed in the after leg).

## Open Questions

- None blocking. `start_period` retune and `openharness-web` are tracked as follow-ups on #948.

## Knowledge Context

- **Base commit**: `7dd218c056507259cf484cbbbc796d0c0e853636`
- **Queries**: `cli harness sandbox install boot evals tool`; `cli harness sandbox install boot evals tool --patterns`
- **Knowledge used**: `[[sandbox-dependency-installs]]`, `[[compose-env-boundary]]`, `[[fresh-machine-setup]]`; patterns `[[pattern-wiki-ungated-check-drift]]`, `[[pattern-wiki-external-model-over-mapping]]`, `[[pattern-spec-self-staling-reuse-record]]`, `[[pattern-evals-prose-literal-pinning]]`, `[[pattern-evals-pipefail-early-exit]]` (15 entity matches, 12 skipped above the cap; 7 pattern matches, 2 skipped)
- **Grounded against**: `.oh/cli/src/lib/harnesses/catalog.ts`, `.oh/cli/src/lib/tools/catalog.ts`, `.oh/cli/src/commands/harness.ts`, `.oh/cli/src/commands/tool.ts`, `.oh/cli/src/cli.ts`, `.oh/cli/src/lib/env-file.ts`, `.oh/cli/src/lib/oh-config.ts`, `.oh/cli/src/commands/init.ts`, `.oh/cli/src/__tests__/harness-catalog.test.ts`, `.oh/scripts/provision-defaults.sh`, `.oh/scripts/install.sh`, `.oh/scripts/sandbox-boot-smoke.sh`, `.oh/scripts/sandbox-healthcheck.sh`, `.devcontainer/entrypoint.sh`, `.devcontainer/docker-compose.image-only.yml`, `.oh/evals/probes/default-provisioning.sh`, `docs/harnesses/overview.md`, `docs/configuration.md`, `docs/installation.md`, `docs/quickstart.md`, `docs/deployment-prebuilt-image.md`, `oh.json`, `.github/workflows/sandbox-compatibility.yml`, `.github/workflows/sandbox-boot-guard.yml`
- **Conflicts discovered**: `fresh-machine-setup` says configuration lives in `.devcontainer/.env` with optional `INSTALL_*` keys and Hermes is opt-in via `install.hermes`; the source (`env-file.ts`, `oh-config.ts`, #920) moved those to `oh.json` and this task removes them. Source wins; the page is repaired at the knowledge gate. `compose-env-boundary` accurately describes the provisioner this task deletes; UPDATED at the knowledge gate.

## Expected Knowledge Impact

- **Impact**: REQUIRED
- **Expected entries**: `compose-env-boundary`, `fresh-machine-setup`, `sandbox-dependency-installs`, `oh-cli-portable-lifecycle`
- **Affected source paths**: `.devcontainer/entrypoint.sh`, `.oh/scripts/provision-defaults.sh` (deleted), `.oh/cli/src/cli.ts`, `.oh/cli/src/commands/init.ts`, `docs/quickstart.md`, `docs/installation.md`, `docs/harnesses/hermes.md`, `.devcontainer/docker-compose.image-only.yml`
- **Reason**: the task retires a runtime flow (boot provisioning) and a config vocabulary (`install.*`, `kind: "default"`) that two confirmed pages describe as current.

## Plan Reconciliation

- **Source plan**: `.claude/plans/happy-watching-sloth.md`
- **Intent preserved**: YES
- **Material deviations**: `none`
- **Constraints discovered during grounding**:
  - Three lines the plan did not list carry switch strings: `.oh/skills/t3/references/tailscale-mobile.md:86`, `.oh/skills/agent-browser/SKILL.md:70`, `docs/rfcs/rfc-brain-hands-boundary.md:113`. Leaving them would instruct a retired key, so they join US-005 as one-line edits; D10's `.oh/skills/` boundary narrows to those two lines.
  - Negative-assertion guards must contain the strings they forbid (`runtime-preflight-gate.sh:47`, `runtime-catalog.test.ts:85`, the new probe); D4 allowlists exactly those.
  - Two knowledge pages (`compose-env-boundary`, `fresh-machine-setup`) carry switch strings; the wiki write gate is orchestrator-only, so the advisor rewrites them in US-007, not an executor.
  - `/delegate` documents an Agent `thinking` parameter this provider's Agent tool does not expose; effort is carried by the documented `effort:` frontmatter key in `~/.claude/agents/*.md` (hot-reloaded), with the depth restated in each launch prompt.
  - `/spec execute` supplies the issue, branch, draft PR, and gates; the plan's waves 5–6 map onto its steps 5–10, so the PR is opened as a draft at step 3 and undrafted only after `/audit pr` classifies it promotable.
  - The published image is local (`f02005e80956`, CLI 0.6.0, `provision-defaults.sh` present in `/opt/oh-seed`), so the before leg is valid without a pull.
