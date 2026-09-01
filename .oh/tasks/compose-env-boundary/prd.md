# PRD: Make the CLI the only install/config surface — empty the compose `environment:` block

- **Issue:** #920
- **Repo:** `mifunedev/openharness`
- **Base:** `development`
- **Branch:** `task/920-compose-env-boundary`
- **Source plan:** `.claude/plans/hazy-bouncing-alpaca.md` (operator-approved)

## Introduction/Overview

The epic `#903 → #905 → #907 → #909 → #911` set one boundary: **inside the sandbox, the CLI
provisions harnesses and tools.** `.oh/scripts/provision-defaults.sh:114-159` reads both
catalogs via `oh harness list --json` / `oh tool list --json` and installs everything
`kind:"default"` or `enabled == true` — where `enabled` comes from **oh.json, never the
environment**.

The compose files never followed. They still push eleven values through
`oh.json → config-render.ts → .devcontainer/.env → compose environment: → entrypoint.sh`,
when the consumer at the end of that pipeline sits inside the home mount next to the `oh` CLI
and can read oh.json directly.

This is not merely redundant. It has produced three defects, two of which CI now enforces:

| # | Defect | Evidence |
|---|---|---|
| 1 | **Two installers, pins duplicated.** `entrypoint.sh:544-551` installs `agent-browser@0.8.5`, duplicating `tools/catalog.ts:34-40`. `entrypoint.sh:561-608` installs Tailscale `1.102.3`, duplicating `catalog.ts:139` **including both sha256 literals**. Both are already installed by `provision-defaults.sh`. With the flag on, flavor A installs each tool twice via two paths gated on two different truths. | `AGENTS.md` bans exactly this "second unverified description" |
| 2 | **Probes pin the pre-epic design.** `tool-catalog-boundary.sh:32-51` and `tailscale-tool-boundary.sh:37-60` assert the entrypoint *must* hold the guard and the pin, and that the catalog must **agree with it**. | Correct when the choice was Dockerfile-vs-entrypoint. Now both are wrong, and these probes **fail the correct fix** |
| 3 | **Flavor B silently loses Hermes.** `docker-compose.image-only.yml` carries none of the seven flavor-A-only keys, so `INSTALL_HERMES` is never true and `entrypoint.sh:169-228` + `link-providers.sh:111` are dead there. `oh harness install hermes` yields the binary and no wiring. | The epic made the install half config-driven and left the wiring half env-driven |

`LANGFUSE_BASE_URL` and `LANGFUSE_PRIVACY_PRESET` are already **fully dead** — no runtime
consumer anywhere in the tree. So are `INSTALL_OPENCODE` / `INSTALL_GROK_BUILD`, still
rendered at `config-render.ts:31-32` after #909 deleted everything that read them.

## The rule this establishes

> A value belongs in compose `environment:` only if a process **outside** the sandbox — or the
> entrypoint **before** the control plane is readable — must act on it. Everything else lives
> in oh.json and is read through the CLI.

**Survives (must be identical in both compose files):** `SANDBOX_NAME`, `SANDBOX_PASSWORD`,
`TZ` (needed before oh.json is readable; `SANDBOX_NAME` is also the in-sandbox detection
signal) · `CC_SAFETY_NET_STRICT`, `CC_SAFETY_NET_WORKTREE`,
`CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS` (read by third-party binaries that know nothing of
oh.json) · `GIT_USER_NAME`, `GIT_USER_EMAIL`, `GH_TOKEN` (applied at boot before the first
agent session).

## Goals

1. **Finish the epic's boundary.** Make oh.json + the CLI the *only* way to say what a sandbox
   has.
2. **One description of every install.** Delete the duplicate agent-browser and Tailscale
   installers from `entrypoint.sh`; the catalogs already hold those pins.
3. **Stop compose narrating what the container can see.** Retire `OH_IMAGE_ONLY` in favour of
   detecting the checkout bind at runtime.
4. **Make the two flavors identical where they should be.** Both compose `environment:` blocks
   byte-identical; the flavors differ only where Docker forces it — `build:`,
   `image:`/`pull_policy:`, and the `..:` bind.
5. **Make the class of defect unrepeatable.** A tier-A probe over every compose file and
   overlay, plus `RETIRED_KEYS` entries that throw if a removed variable returns.

**Net effect:** adding a tool, harness, or setting stops requiring a compose edit — the same
consolidation the single `/home/sandbox` mount achieved for volumes.

## What replaces each of the eleven

| Variable | Replacement | Files |
|---|---|---|
| `INSTALL_AGENT_BROWSER` | Already installed by `provision-defaults.sh` from `install.agentBrowser`. **Delete the entrypoint installer.** | `entrypoint.sh:544-551` |
| `INSTALL_TAILSCALE` | Same, from `install.tailscale`. **Delete the installer** — and with it the second copy of the version and both sha256s. | `entrypoint.sh:561-608` |
| `INSTALL_HERMES` | Install role already gone. Gate the **wiring** on the binary existing (`command -v hermes`) — truthful, needs no config read, and fixes flavor B for free. | `entrypoint.sh:169`, `link-providers.sh:111` |
| `HERMES_HOME` | The compose value was the literal `/home/sandbox/harness/.hermes` — exactly what the existing `${HERMES_HOME:-$HARNESS/.hermes}` fallback already yields. Drop the parameter. | `entrypoint.sh:170` |
| `HERMES_DASHBOARD` | Read `hermesDashboard.enabled` from oh.json. | `entrypoint.sh:206` |
| `HERMES_DASHBOARD_PORT` | Read `hermesDashboard.port` from oh.json. | `entrypoint.sh:209` |
| `SKIP_PNPM_INSTALL` | Read `build.skipPnpmInstall` from oh.json. | `entrypoint.sh:451` |
| `CRON_AGENT_BIN` | `cron-runtime.ts` is TypeScript — import the CLI's `readOhConfig` and drop the env hop. Keep `process.env` as an override *ahead of* the config value. | `cron-runtime.ts:26` |
| `LANGFUSE_BASE_URL` | **No consumer exists.** Delete. | compose ×2, `config-render.ts:51` |
| `LANGFUSE_PRIVACY_PRESET` | **No consumer exists.** Delete. | compose ×2, `config-render.ts:52` |
| `XAI_API_KEY` | Already a registered secret (`secrets.ts:10`) in the gitignored root `.env`; `config-render.ts:60-62` **refuses to render secrets**, so this line could only ever catch a hand-edited `.devcontainer/.env`. Grok's `~/.grok/auth.json` takes precedence and now persists in the home mount. | compose ×2 |

**Every oh.json field stays.** `install.*`, `hermesDashboard.*`, `cron.agentBin`,
`build.skipPnpmInstall`, `langfuse.*` remain valid and settable — only their `.env` projection
goes. `oh config set` keeps working for all of them.

## Why `OH_IMAGE_ONLY` does not earn its place

It gates exactly two decisions, both at `entrypoint.sh:102-113`, and has exactly **one reader
in the entire tree**:

| | Decision | Real question being asked |
|---|---|---|
| D1 | skip host UID/GID sync | is there a host checkout to sync to? |
| D2 | seed the workspace from `/opt/oh-seed` | is `/home/sandbox/harness` a bind, or a directory we must populate? |

Both reduce to one question the container can answer for itself: **is `/home/sandbox/harness`
a bind mount?** Compose is telling the container something the container can see.

Verified, not assumed: `mountpoint` and `findmnt` are both at `/usr/bin` in the image, and in a
live flavor-A container `findmnt -no TARGET /home/sandbox/harness` returns the path.

| Option | Verdict |
|---|---|
| **A. Detect at runtime — `mountpoint -q /home/sandbox/harness`** | **Chosen.** One observable check replaces the flag for both decisions. Deletes the flag, the compose line, and the footgun where setting it in flavor A seeds over your checkout. Leaves the flavor-B capability fully intact. |
| B. Keep the flag | Compose keeps narrating an observable fact; blocks identical `environment:` blocks; the footgun stays. |
| C. Derive from `[ -d /home/sandbox/harness/.oh ]` | Covers D2 only — already `seed_workspace_volume`'s own internal guard. Says nothing about D1. Insufficient alone. |
| D. Delete flavor B entirely | **Rejected.** `/opt/oh-seed` stays regardless (`verify-sandbox-image.sh:114,145`, `sandbox-compatibility.yml:97,115,129`, `Dockerfile:111` all read catalogs from it), so there is **no image saving** — the only win is deleting one compose file and one probe, at the cost of a shipped capability (#609's no-checkout deploy, with its own docs page). A product decision, not a cleanup. |
| E. Invert — flavor A sets `OH_HAS_CHECKOUT=1` | Strictly worse: same information, same objection, and now the *common* path carries the flag. |

## Every file in `.devcontainer/` — keep or cut

| File | Verdict |
|---|---|
| `Dockerfile` | **Keep.** The sandbox definition. |
| `entrypoint.sh` | **Keep.** Loses ~60 lines of duplicate installer and one flag branch. |
| `docker-compose.yml` | **Keep.** Loses eleven `environment:` lines. |
| `docker-compose.image-only.yml` | **Keep** — flavor B is a shipped capability (#609) and deleting it saves no image weight. Its `environment:` block empties to match flavor A exactly. |
| `docker-compose.docker-sock.yml` | **Keep, untouched.** 16 lines, all payload: one volume mount Docker must decide before the container exists, plus a security rationale. No `environment:` block. |
| `docker-compose.ssh.yml` | **Keep the `ports:`, cut the `environment:` block.** Publishing `127.0.0.1:2222:22` is irreducibly Docker-level. Its four env vars (`SANDBOX_SSH`, `SANDBOX_SSH_PORT`, `SANDBOX_SSH_PASSWORD_AUTH`, `SANDBOX_SSH_AUTHORIZED_KEYS`) restate `access.ssh*`, which `config-render.ts:38-41` already renders — the same defect as the main file, in an overlay. `SANDBOX_SSH_AUTHORIZED_KEYS` holds *public* keys, so this moves no secret into oh.json. |
| `docker-compose.hermes-dashboard.yml` | **Cut** (operator ruling). Its one irreducible job was publishing `127.0.0.1:<port>`; retiring it means the dashboard is reachable from inside the sandbox and over cloudflared or Tailscale, not a published host port. Consistent with where #897 took T3 Code, but a real capability change — it goes in the BREAKING entry. `HERMES_DASHBOARD_HOST` / `_INSECURE` came only from this overlay; the entrypoint's existing defaults (`127.0.0.1`, no `--insecure`) take over. |
| `devcontainer.json` | **Keep, with a caveat.** It hardcodes `dockerComposeFile: ["docker-compose.yml"]`, so VS Code "Reopen in Container" bypasses `docker-compose.sh` and gets no overlays and no `.env` rendering — a second lifecycle door. This task does not close that gap but **materially narrows** it: once the entrypoint reads oh.json directly, the VS Code path gets more correct for free. |
| `seed-msg-bridge.sh` | **Keep.** Live: `gateway.sh:151`. |
| `client-slack-supervise.sh` | **Keep.** Live: `gateway.sh:166,327`. |
| `.env` | **Keep.** Generated, gitignored, operator-owned. Shrinks by ten keys. |

## User Stories

### US-001: Strip the eleven variables from the compose files

**Description:** As an operator, I want the compose `environment:` blocks to carry only values
Docker or the pre-control-plane entrypoint must act on, so adding a tool never requires a
compose edit.

**Acceptance Criteria:**

- [ ] `.devcontainer/docker-compose.yml` no longer contains `XAI_API_KEY`, `INSTALL_AGENT_BROWSER`, `INSTALL_TAILSCALE`, `SKIP_PNPM_INSTALL`, `INSTALL_HERMES`, `HERMES_HOME`, `HERMES_DASHBOARD`, `HERMES_DASHBOARD_PORT`, `CRON_AGENT_BIN`, `LANGFUSE_BASE_URL`, or `LANGFUSE_PRIVACY_PRESET`
- [ ] `.devcontainer/docker-compose.image-only.yml` no longer contains `XAI_API_KEY`, `CRON_AGENT_BIN`, `LANGFUSE_BASE_URL`, or `LANGFUSE_PRIVACY_PRESET`
- [ ] `.devcontainer/docker-compose.ssh.yml` retains its `ports:` mapping and no longer has an `environment:` block
- [ ] `.devcontainer/docker-compose.hermes-dashboard.yml` is deleted, and the branch that applies it in `.oh/scripts/docker-compose.sh` is removed
- [ ] Each modified file's header comment describes the file as it now is
- [ ] `docker compose -f <each file> config` parses without error

### US-002: Delete the duplicate agent-browser and Tailscale installers from the entrypoint

**Description:** As a maintainer, I want exactly one description of each tool install, so a
version bump cannot leave two truths in the tree.

**Acceptance Criteria:**

- [ ] The `INSTALL_AGENT_BROWSER`-guarded install block is removed from `.devcontainer/entrypoint.sh`
- [ ] The `INSTALL_TAILSCALE`-guarded install block is removed, including the pinned tarball version and **both** sha256 literals
- [ ] The ungated `install -d -o sandbox -g sandbox -m 0755 /var/run/tailscale` block is **retained** (gating it would force a reboot after `oh tool install tailscale`)
- [ ] `.oh/cli/src/lib/tools/catalog.ts` remains the sole location of the agent-browser and Tailscale pins
- [ ] Confirmed on the merged tree **before deletion** that the Tailscale catalog entry is `installUser: "sandbox"` (post-#897), so removing the entrypoint fallback does not strand the install behind #907's `stdio:"inherit"` sudo hazard
- [ ] `shellcheck .devcontainer/entrypoint.sh` passes with CI's invocation

### US-003: Read oh.json from the entrypoint and presence-gate the Hermes wiring

**Description:** As an operator, I want the entrypoint to read settings from oh.json through
the CLI, so flavor B gets the same wiring flavor A does.

**Acceptance Criteria:**

- [ ] A fenced `oh_config` helper is added to `.devcontainer/entrypoint.sh`, matching the existing `seed_home` / `seed_workspace_volume` fence convention, calling `oh config show | jq -r <filter>` as the `sandbox` user with a caller-supplied fallback
- [ ] The helper uses `oh config show`, **not** a new verb — a baked `oh` in a running container can predate a new verb, and this is the boot path
- [ ] A missing, old, or failing CLI yields the documented default and never fails the boot
- [ ] The Hermes wiring block is gated on `command -v hermes` instead of `INSTALL_HERMES`
- [ ] `HERMES_HOME` is no longer a parameter; the existing `${HERMES_HOME:-$HARNESS/.hermes}` fallback supplies the same value
- [ ] The dashboard block reads `hermesDashboard.enabled` and `hermesDashboard.port` via `oh_config`
- [ ] The root `pnpm install` gate reads `build.skipPnpmInstall` via `oh_config`
- [ ] The sshd block reads `access.ssh`, `access.sshPort`, `access.sshPasswordAuth`, and `access.sshAuthorizedKeys` via `oh_config`; the no-key/no-password warning still fires when both are absent
- [ ] `.oh/scripts/link-providers.sh` gates its Hermes branch on the binary's presence rather than `INSTALL_HERMES`
- [ ] `shellcheck` passes on every changed shell file

### US-004: Read the cron agent binary from oh.json

**Description:** As an operator, I want `cron.agentBin` honoured without a compose hop.

**Acceptance Criteria:**

- [ ] `.oh/scripts/cron-runtime.ts` resolves the agent binary from `process.env.CRON_AGENT_BIN` first, then the CLI's `readOhConfig` value, then the `"claude"` default — in that precedence order
- [ ] The env override is preserved and covered by a test
- [ ] `.oh/scripts/__tests__/cron-runtime.test.ts` passes

### US-005: Stop rendering the retired keys and make their return impossible

**Description:** As a maintainer, I want the rendered `.env` set to *be* the rule, expressed in
code, so a re-added `put()` throws instead of silently restoring the pipeline.

**Acceptance Criteria:**

- [ ] `.oh/cli/src/lib/config-render.ts` no longer emits the five `INSTALL_*` keys, `HERMES_DASHBOARD`, `HERMES_DASHBOARD_PORT`, `CRON_AGENT_BIN`, `SKIP_PNPM_INSTALL`, `LANGFUSE_BASE_URL`, or `LANGFUSE_PRIVACY_PRESET`
- [ ] Every removed key is added to `RETIRED_KEYS`, so rendering it throws
- [ ] The remaining rendered set is exactly `SANDBOX_NAME`, `TZ`, `OH_HOME_MOUNT`, `GIT_USER_NAME`, `GIT_USER_EMAIL`, `DOCKER_SOCKET`, `SANDBOX_SSH*`, `OH_SANDBOX_IMAGE`, `OH_PULL_POLICY`
- [ ] `readonly entrypointGuard?` and both of its uses are removed from `.oh/cli/src/lib/tools/catalog.ts`
- [ ] Every oh.json field survives: `oh config set install.tailscale true` then `oh config show` round-trips, with no `.env` projection
- [ ] `cd .oh/cli && npm run build && npm run typecheck` passes

### US-006: Invert the two boundary probes and retarget the parity probe

**Description:** As a maintainer, I want the probes to assert the post-epic boundary, since
they currently require the duplication and would fail the correct fix.

**Acceptance Criteria:**

- [ ] `.oh/evals/probes/tool-catalog-boundary.sh` asserts the entrypoint contains **no** `INSTALL_AGENT_BROWSER` guard and no `agent-browser@<version>` pin, with the catalog as sole truth; its `# desc:` header is rewritten (it currently names the entrypoint as ground truth)
- [ ] Its disjointness, `downloadSize`, and `--yes` gating assertions are preserved
- [ ] `.oh/evals/probes/tailscale-tool-boundary.sh` receives the same inversion for the guard, the version pin, and the sha256 cross-check
- [ ] **Every zero-exposure assertion is kept**: no `cap_add`, `devices:`, `privileged: true`, or published `3773` in any compose file; no `tailscaled` invocation or `tailscale up` on boot; no Funnel; no committed auth key
- [ ] The ungated-`/var/run/tailscale` assertion is kept and retargeted, since no guard block wraps it any more
- [ ] `.oh/evals/probes/compose-config-path-parity.sh` no longer keys on `INSTALL_HERMES` or `CRON_AGENT_BIN`; it uses surviving keys, since its subject is path resolution
- [ ] `.oh/evals/probes/config-schema-parity.sh` stays green and is confirmed to key off the field path, not the docs table's now-empty **Env var** column
- [ ] `.oh/evals/probes/default-provisioning.sh` and `.oh/evals/probes/sandbox-boot-guard-ci.sh` are left untouched — their Dockerfile `ARG INSTALL_*` bans stay correct
- [ ] Each inverted assertion is mutation-verified: re-add the guard, the pin, and a compose `INSTALL_*` line, and confirm the probe exits 1 in each case

### US-007: Add a tier-A `compose-env-boundary` probe

**Description:** As a maintainer, I want the rule enforced directly, so this class of defect
cannot return through any compose file or overlay.

**Acceptance Criteria:**

- [ ] `.oh/evals/probes/compose-env-boundary.sh` exists with `# tier: A` and a `# source:` line naming issue #920
- [ ] It runs over **every** `.devcontainer/docker-compose*.yml`, overlays included
- [ ] It fails on any `INSTALL_*` key and on `OH_IMAGE_ONLY` in any of them
- [ ] Every `environment:` key must be either in `config-render.ts`'s rendered set or one of the documented literals; anything else fails
- [ ] Overlay `ports:` and `volumes:` blocks are explicitly allowed — that is the payload only Docker can act on
- [ ] It uses the 3-state exit oracle: 0 = PASS, 1 = REGRESSION, 2 = SKIPPED when no compose file is present
- [ ] Mutation-verified: adding an `INSTALL_FOO` line, an `OH_IMAGE_ONLY` line, and an unlisted key each drive exit 1
- [ ] `bash .claude/skills/eval/run.sh --probe compose-env-boundary` reports PASS

### US-008: Update the tests that assert the retired pipeline

**Description:** As a maintainer, I want the suite to describe the new boundary rather than the
old one.

**Acceptance Criteria:**

- [ ] `.oh/cli/src/lib/__tests__/config-render.test.ts` drops assertions for the removed keys and adds `RETIRED_KEYS` throw cases for each
- [ ] `tool-catalog.test.ts` no longer references `entrypointGuard`
- [ ] `entrypoint-pnpm-install.test.ts` and `.oh/evals/probes/entrypoint-pnpm-manifest-fingerprint.sh` assert the oh.json read instead of the compose `SKIP_PNPM_INSTALL` pass-through
- [ ] `harness.test.ts`, `init.test.ts`, and `env-file.ts`'s `CONFIG_FIELD_BY_ENV_KEY` / `INSTALL_FIELDS` alias tables are updated consistently
- [ ] Root `npx vitest run` shows no new failures beyond the known 8 environmental `compose-args.test.ts` failures

### US-009: Update docs, templates, and the changelog

**Description:** As a reader, I want the documentation to describe the CLI path, since the
compose-variable instructions are now false.

**Acceptance Criteria:**

- [ ] `docs/configuration.md` blanks the **Env var** column for every field whose projection is gone; the fields stay documented
- [ ] `docs/connecting.md` no longer claims the Tailscale opt-in is "one environment variable"; it documents `oh config set install.tailscale true` (persisted, next boot) and `oh tool install tailscale` (live, no reboot)
- [ ] `docs/security-considerations.md`, `docs/harnesses/grok-build.md`, `docs/integrations/langfuse.md`, and the Hermes dashboard docs reflect the retired variables and the removed published port
- [ ] `.env.example` and `.oh/templates/.env.example` drop the retired keys
- [ ] `.oh/scripts/migrate-harness-yaml.sh` stops mapping the retired keys in both directions; the legacy shim itself stays
- [ ] `CHANGELOG.md` gains a **BREAKING** entry under `## [Unreleased]`, one sentence, ≤250 characters, linking #920, covering the eleven variables and the retired overlay's published port
- [ ] `bash .oh/evals/probes/changelog-entry-length.sh` reports no over-length entry

### US-010: Detect the sandbox flavor at runtime instead of reading a flag

**Description:** As an operator, I want the entrypoint to determine whether a checkout is bind-
mounted, so compose stops narrating a fact the container can observe.

**Acceptance Criteria:**

- [ ] `.oh/.image-seeded` is added to `.gitignore` **before** the detection change — a misdetection must not write an untracked marker into the repo
- [ ] `.devcontainer/entrypoint.sh` replaces the `OH_IMAGE_ONLY` gate with `mountpoint -q "$OH_PROJECT_ROOT"`, the bind-detected branch leading and the seed branch as the `else`
- [ ] The `elif [ -d "$HARNESS_DIR" ]` existence test is dropped as subsumed — a mountpoint necessarily exists
- [ ] Both branch bodies are otherwise unchanged
- [ ] The detected mode is logged on **both** paths, so a wrong auto-detection is visible in `oh logs`
- [ ] `OH_IMAGE_ONLY` is removed from `.devcontainer/docker-compose.image-only.yml`, and no reader of it remains in the tree
- [ ] `diff` of the two compose files' `environment:` blocks is **empty**
- [ ] This lands as a **separate commit** from US-001..US-009, so a boot regression bisects to one commit

### US-011: Retarget the image-only deploy probe and its documentation

**Description:** As a maintainer, I want the flavor-B probe to test behavior rather than
documentation prose, since a prose assertion proves nothing and blocks this task's own doc
rewrite.

**Acceptance Criteria:**

- [ ] `.oh/evals/probes/oh-image-only-deploy.sh` drops the three assertions that require `deployment-prebuilt-image.md` to contain or omit particular strings
- [ ] Every behavioral assertion is kept: gate ordering, the seed simulation, and the compose-shape checks
- [ ] The gate check targets `mountpoint`-based detection rather than the retired flag
- [ ] `docs/deployment-prebuilt-image.md` documents how flavor B is detected instead of how the flag is set, and its `docker run` recipe drops the corresponding `-e`
- [ ] Mutation-verified: removing the detection from the entrypoint drives the probe to exit 1
- [ ] `bash .claude/skills/eval/run.sh` exits 0 with no new regressions

## Functional Requirements

- **FR-1:** Compose `environment:` in both `docker-compose.yml` and `docker-compose.image-only.yml` must contain exactly `SANDBOX_NAME`, `SANDBOX_PASSWORD`, `TZ`, `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS`, `CC_SAFETY_NET_STRICT`, `CC_SAFETY_NET_WORKTREE`, `GIT_USER_NAME`, `GIT_USER_EMAIL`, and `GH_TOKEN` — and must be byte-identical to each other.
- **FR-2:** `.devcontainer/entrypoint.sh` must contain no tool or harness installer that duplicates a catalog entry.
- **FR-3:** The entrypoint must obtain every non-FR-1 setting from oh.json through the `oh` CLI, degrading to a documented default when the CLI is unavailable, never failing the boot.
- **FR-4:** Hermes wiring must run whenever the Hermes binary is present, in both flavors.
- **FR-5:** `config-render.ts` must refuse to render any retired key.
- **FR-6:** The sandbox flavor must be determined by observing whether `/home/sandbox/harness` is a bind mount, and the determination must be logged.
- **FR-7:** A tier-A eval probe must fail if any compose file or overlay reintroduces an `INSTALL_*` key, `OH_IMAGE_ONLY`, or an `environment:` key outside the rendered set.
- **FR-8:** Every oh.json field retired from the `.env` projection must remain settable and readable through `oh config set` / `oh config show`.

## Non-Goals (Out of Scope)

- **Deleting flavor B.** `/opt/oh-seed` stays regardless, so there is no image saving; retiring #609's no-checkout deploy is a product decision to raise separately.
- **`INSTALL_PYTHON_KERNEL` vs `OH_PROVISION_PYTHON`.** Two names for one concern (`Dockerfile:108-114`, `entrypoint.sh:161`), same class of defect — but a Dockerfile↔entrypoint duplication, not a compose one. Separate issue.
- **`Dockerfile:106`'s whole-repo copy into the `home` stage.** It does not ship (final derives from `base`), so there is no image cost; narrowing it to `.oh/scripts/` is a build-cache win unrelated to this change.
- **Relocating `seed-msg-bridge.sh` / `client-slack-supervise.sh` out of `.devcontainer/`.** They are gateway runtime, but their placement was a deliberate ruling (`docs/rfcs/preserved-changelog-rationale.md:47`) enforced by `oh-devcontainer-restructure.sh:30-31,54`. Overturning it would buy a naming benefit only.
- **Closing the `devcontainer.json` second-lifecycle-door gap.** This task narrows it; closing it is separate.
- **Removing any oh.json field.** Only `.env` projections go.

## Technical Considerations

- `oh config show` (`config.ts:31`) already prints resolved oh.json and ships in every released image. A new verb would not — #903's lesson is that a baked `oh` can predate one, and this is the boot path.
- `provision-defaults.sh` calls `oh <harness|tool> list --json | jq` the same way; `oh_config` mirrors that precedent rather than inventing a mechanism.
- The seed path already guards itself: `seed_workspace_volume` refuses when `$dest/.oh` exists. Detection adds a second, independent guard (`mountpoint -q` is a kernel fact, not a heuristic), and the gitignore adds a third.

## Risks

| Risk | Mitigation |
|---|---|
| `oh config show` unavailable or slow on the boot path | `oh_config` falls back to the documented default and never fails the boot; `config show` ships in every released image |
| Presence-gating Hermes changes *when* the wiring runs | First boot installs Hermes in `provision-defaults.sh` **before** the wiring block, so ordering already works; a mid-session `oh harness install hermes` wires on next boot — same as today's flag. Verify in a live container, do not assume |
| Retiring the dashboard overlay removes a published port someone relies on | Explicit BREAKING entry; cloudflared and Tailscale are already first-class alternatives |
| Deleting the Tailscale installer while `oh tool install` still carries #907's `stdio:"inherit"` sudo hazard | The catalog entry is `installUser: "sandbox"` after #897 — **confirm on the merged tree before deleting the fallback** (US-002) |
| Inverting two probes could mask a real re-bake | The Dockerfile ARG bans in `default-provisioning.sh` are untouched and cover that separately |
| **Flavor misdetection seeds `/opt/oh-seed` over a real checkout** — the worst outcome here | Three independent guards (kernel `mountpoint`, `seed_workspace_volume`'s `.oh` check, the gitignored marker) plus a logged mode on both paths. Verify by booting flavor A with detection in place and confirming zero seed activity |
| A bind that fails to mount now degrades to "seeded workspace" instead of "no checkout" | Both are broken states; the logged mode line makes which one visible in `oh logs`. The flag's failure mode was worse — set it by accident in flavor A and it seeded silently |

## Success Metrics

- Adding a tool, harness, or setting requires **zero** compose edits.
- `diff` of the two compose files' `environment:` blocks is empty.
- The boot log shows exactly **one** install line per tool on a cold flavor-A boot.
- Flavor B with `install.hermes=true` produces the same Hermes wiring flavor A does.

## Verification

1. `bash .claude/skills/eval/run.sh` — exit 0, no new regressions, new probe PASS.
2. Each inverted and new assertion mutation-verified to exit 1.
3. `cd .oh/cli && npm run build && npm run typecheck`; root `npx vitest run` — expect the known 8 `compose-args.test.ts` environmental failures and nothing new.
4. `shellcheck` over changed shell, matching CI's invocation.
5. **Live flavor A:** `oh sandbox` on a fresh home volume with `install.tailscale=true` and `install.agentBrowser=true` — each binary under `/home/sandbox/.local/bin`, sandbox-owned, prints its version, and the boot log shows **one** install line each.
6. **Live flavor B:** boot `image-only.yml` with `install.hermes=true` — `$HERMES_HOME`, the `.hermes/skills/openharness` symlink, and the provider skill pack all exist.
7. `oh compose config` on both files: no `INSTALL_*`, no `LANGFUSE_*`, no `HERMES_*`, no `OH_IMAGE_ONLY` — and `diff` the two rendered `environment:` blocks to empty.
8. **Detection, both directions.** Flavor A: boot, confirm the log says a bind was detected, `git -C ~/harness status` is clean, and **no** `.oh/.image-seeded` was written. Flavor B: boot on a fresh volume, confirm the seed ran exactly once, reboot, confirm it did not run again.
9. `oh config set install.tailscale true` → `oh config show` round-trips with no `.env` projection.
10. `oh destroy` prompt copy unchanged.
11. **sshd overlay end to end.** `oh config set access.ssh true` (+ a public key), `oh sandbox`, then `ssh -p 2222 sandbox@127.0.0.1` — the port publishes from the overlay and sshd's mode comes from oh.json. Confirm the no-key/no-password warning still fires when both are absent.

## Implementation order

Two commits, each independently bootable. **Land them separately** — the flavor detection
touches boot-critical UID logic, and a boot regression must bisect to one commit.

- **Commit 1 — the env consolidation:** US-001 → US-009.
- **Commit 2 — flavor detection:** US-010 → US-011.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: `.oh/skills/wiki/corpus/compose-env-boundary.md` (new), `.oh/skills/wiki/corpus/sandbox-dependency-installs.md` (update — its `SKIP_PNPM_INSTALL` compose pass-through claims at `:29` become false)
- **Spec alignment**: The new entry states the boundary rule from this PRD verbatim, names the surviving compose keys and why each survives, records that catalogs are the sole source of install pins, and documents runtime flavor detection replacing `OH_IMAGE_ONLY`. It must reflect this PRD's non-goals — flavor B survives, `INSTALL_PYTHON_KERNEL` is out of scope — so a later reader does not treat them as oversights. The `sandbox-dependency-installs` update must replace the compose-flag description with the oh.json read and re-cite the moved lines.
- **Acceptance criteria** (carried by US-009):
  - [ ] `.oh/skills/wiki/corpus/compose-env-boundary.md` exists with valid frontmatter (`title`, `slug`, `tags`, `created`, `updated`, `sources`, `confidence`) and the body order H1 → `## Relevant Source Files` → `## Summary` → `## Detail` → `## System Relationships` → `## See Also`
  - [ ] Every claim about repository behavior cites a source path with a line number; `## System Relationships` carries a Mermaid diagram of the oh.json → CLI → entrypoint path
  - [ ] The entry is ≤900 words (architecture allowance) and `## See Also` cross-links `[[sandbox-dependency-installs]]` and `[[oh-cli-portable-lifecycle]]`
  - [ ] `.oh/skills/wiki/corpus/sandbox-dependency-installs.md` no longer claims compose passes `SKIP_PNPM_INSTALL` into the container, and its `updated` date is bumped
  - [ ] `bash .oh/evals/probes/wiki-readme-index.sh` passes with the new entry indexed in `.oh/skills/wiki/corpus/README.md`

## Open Questions

None. The plan was approved with `OH_IMAGE_ONLY` removal (option A), the Hermes dashboard
overlay retired, and "fix, don't probe" chosen for flavor-B parity.
