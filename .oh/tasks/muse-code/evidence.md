# Evidence: Muse Code installation

Core PR: https://github.com/mifunedev/openharness/pull/971
Website mirror: https://github.com/mifunedev/openharness-web/pull/42
Plan: `.oh/tasks/muse-code/prd.md`

## Why this is better

The catalog previously exposed six permanently installable harnesses. Muse adds a seventh through the same command and home volume.
An operator can install, inspect, and authenticate Muse without a separate installation procedure or provider configuration system.
The production change adds one catalog entry, one secret key, and one standard provider link. No lifecycle abstraction or boot dependency was added.

## What the plan asked for

The operator confirmed that #952 was outdated and requested first-class `oh harness install muse-code` support.
The reconciled plan preserves the current install-only model and the retirement of `oh init`.
The remaining requirements cover home-local installation, profile preservation, idempotence, context/skills, authentication, documentation, and validation.

## What was built

The catalog runs Meta's native installer as `sandbox` under `$HOME/.local/bin`.
`MUSE_NO_MODIFY_PATH=1` suppresses profile edits, `MUSE_LOGIN=0` suppresses download login, and pipefail propagates fetch failures.
The existing command probes `muse --version`, skips an installed binary, and rejects a stopped sandbox without changing `oh.json`.
The standard `.agents/skills` symlink resolves to `.oh/skills` in clean clones and through bootstrap's canonical linker.
The secret allowlist accepts `META_API_KEY`; documentation distinguishes secret storage from process environment injection.

### Runtime observations

The experiment ran as the existing `sandbox` user with isolated temporary homes and an allowlisted environment containing no credentials.
The compiled branch CLI ran with `OH_EXECUTION_TARGET=local`; no Docker process was mocked in this experiment.

```text
oh harness list --json
  "id": "muse-code", "kind": "installable", "installed": false

oh harness install muse-code
installing Muse Code into the sandbox…
Installed muse to ~/.local/bin/muse
muse-code: installed — see https://github.com/mifunedev/openharness/blob/main/docs/harnesses/muse-code.md for authentication

oh harness install muse-code
muse-code: already installed (muse)

oh harness status muse-code --json
  "id": "muse-code", "kind": "installable", "installed": true

muse --version
Muse Code 1.0.3 (1.0.3-R2198.1)

UID 1000 PROFILES_UNCHANGED
PROJECT_SKILLS 34 DIAGNOSTICS 0
ECHO_EXIT 0
```

Each CLI command ran in a separate process using the same disposable home.
The experiment compared `.bashrc`, `.bash_profile`, `.profile`, `.zshrc`, and `.zshenv` byte-for-byte before and after installation.
A separate installer experiment excluded the destination from PATH and still preserved all five profiles.

```text
muse skills list --source project --workspace <worktree> --trust-workspace --json
  "id": "architect"
  "path": ".agents/skills/architect/SKILL.md"
  "scope": "project"
```

Muse's credential-free echo provider started successfully with project trust enabled and shell, filesystem writes, and web tools disabled.
This establishes startup and skill discovery; it is not evidence of authenticated model quality or instruction following.
The current configuration documentation confirms `AGENTS.md` discovery and trust requirements.
Runtime `muse login --help` confirms the browser code flow; `muse auth --help` confirms `--api-key-stdin`.

Sources checked on 2026-09-04:

- https://dev.meta.ai/install.sh
- https://api.meta.ai/muse-launcher.sh
- https://dev.meta.ai/docs/muse-code/auth.md
- https://dev.meta.ai/docs/muse-code/configuration.md
- https://dev.meta.ai/docs/muse-code/extending.md

### Tests and probes

```text
pnpm test
Test Files  58 passed (58)
Tests  916 passed (916)

Focused harness/config/secret/link tests
Test Files  7 passed (7)
Tests  178 passed (178)

pnpm run typecheck
tsc --noEmit — exit 0

pnpm run build
dist/oh.js 153.2kb — exit 0

bash .oh/scripts/link-providers.sh --check
Providers OK: .agents/.pi/.claude/.codex skills -> .oh/skills (vendored pack present)

bash .oh/evals/probes/harness-one-door.sh
PASS: no default set, install key, provisioner or boot-time off-ramp remains, and all 12 installable entries install as the sandbox user into /home/sandbox/.local, checksum their 4 downloads, and stay out of the image

bash .oh/evals/probes/no-project-agent-catalog.sh
PASS: no project-agent catalog in the tree, index, manifest, or provider wiring; --init recreates none

env -u CC_SAFETY_NET_STRICT bash .oh/evals/probes/skills-vendored.sh
PASS: skills/hooks are vendored under .oh/ (no submodule) and provider symlinks resolve from a clean clone

bash .oh/evals/probes/wiki-readme-index.sh
PASS: .oh/knowledge/README.md Index matches the tracked source/ and patterns/ frontmatter
```

The host-mode probe clears strict mode only in the child test process. It does not change installed agent hooks or sandbox configuration.
The default local eval retained the pre-existing `skills-vendored` failure: the probe's isolated PATH excludes the guard binary while inheriting sandbox strict mode.
The initial eval also lacked Python. Installing Python 3.13 and rerunning the two affected probes resolved both environmental failures.
The run covered 138 probes; the recorded aggregate lists remaining skips and pre-existing failures explicitly.

### Actual Knowledge Impact

| Page | State | Reason |
|---|---|---|
| fresh-machine-setup | NOT-AFFECTED | The new optional CLI does not change the ordered setup flow or installation-only invariant. |
| oh-cli-portable-lifecycle | NOT-AFFECTED | Registry, update, execution-target, and lifecycle contracts remain unchanged; the layout adds one canonical skill consumer. |
| managed-agents | NOT-AFFECTED | The overview's one developer/project/agent boundary remains unchanged. |
| sandbox-dependency-installs | NOT-AFFECTED | No declared dependency changed and no provisioning behavior was introduced. |

The owner read the affected entries and compared their claims with the changed source sections.
The knowledge index remains unchanged and passes its deterministic check.

## Where the implementation diverged

The operator superseded the ticket's `install.museCode`, stopped install intent, fresh-home automatic restoration, and `oh init` requirements.
Muse uses `kind: installable`, like other current permanent harnesses. A fresh home requires another explicit install command.
Sandbox bootstrap supplies provider initialization through the existing linker. No retired initialization command was restored.
No other implementation divergence remains.

## What remains unverified

No Meta account or API key was supplied. Browser authentication, stored real credentials, billing, and authenticated model execution were not exercised.
No Docker socket was available for a child-sandbox recreation experiment. Separate-process checks proved home-local persistence only.
The existing Compose home mount supports recreation persistence by construction; this change does not alter that mount.
Instruction discovery is supported by official documentation; the echo provider cannot prove model obedience to `AGENTS.md`.
The website PR remains draft until the matching CLI is released, so published documentation does not advertise an unavailable release command.
Final implementation and PR audit results are pending.
