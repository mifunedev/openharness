# PRD — `/deploy-check`: a local and CI instrument for validating a deployment

Issue: [#937](https://github.com/mifunedev/openharness/issues/937) · slug
`deployment-provisioning-guard` · branch `task/937-deployment-provisioning-guard`
· base `development` · repo `mifunedev/openharness`.

## Knowledge Context

- **Base commit**: `4fbca95432dd39cfb2e45a4baba1c7cf2082cf33`
- **Queries**: `sandbox deployment image boot`, `compose env provisioning`,
  `release versioning ghcr`, `evals probes oracles`, `docs gating drift`
- **Knowledge used**: `[[compose-env-boundary]]`, `[[sandbox-dependency-installs]]`,
  `[[release-versioning]]`, `[[audit-architecture]]`,
  `[[pattern-wiki-ungated-check-drift]]`, `[[pattern-evals-unexercised-oracle]]`,
  `[[pattern-evals-prose-literal-pinning]]`, `[[pattern-evals-pipefail-early-exit]]`
- **Grounded against**: `.oh/scripts/sandbox-boot-smoke.sh`,
  `.oh/scripts/docker-compose.sh`, `.oh/scripts/verify-sandbox-image.sh`,
  `.devcontainer/docker-compose.image-only.yml`, `.devcontainer/entrypoint.sh`
  (lines 103-181), `.github/workflows/release.yml`,
  `.github/workflows/sandbox-boot-guard.yml`,
  `.github/workflows/sandbox-compatibility.yml`,
  `.github/workflows/ci-harness.yml`, `.oh/skills/eval/run.sh`,
  `.oh/evals/probes/sandbox-boot-guard-ci.sh`,
  `.oh/evals/probes/oh-image-only-deploy.sh`, `.oh/evals/probes/eval-ci-gate.sh`,
  `.oh/evals/RESULTS.md`, `docs/deployment-prebuilt-image.md`,
  `.oh/knowledge/source/audit-architecture.md`
- **Conflicts discovered**: five, none contradicting a recalled page — all are
  constraints grounding revealed that the source plan did not anticipate.
  1. **The `BOOT_SMOKE_COMPOSE` seam cannot take a bare compose file.**
     `sandbox-boot-smoke.sh:16` runs `bash "$COMPOSE" "$@"`, so it invokes a
     *script*. `.oh/scripts/docker-compose.sh` additionally hardcodes
     `-f .devcontainer/docker-compose.yml` and injects `--env-file $REPO_DIR/.env`.
     Per `[[compose-env-boundary]]`, that dotenv carries the rendered
     `OH_SANDBOX_IMAGE`, `OH_PULL_POLICY`, and `SANDBOX_NAME` for the *local*
     flavor, so reusing it would silently boot the locally built image under the
     operator's own project name. The new driver must therefore pass its
     environment explicitly and read no repository dotenv.
  2. **The smoke deadline must clear the healthcheck's own unhealthy deadline.**
     `docker-compose.image-only.yml:27-32` sets `start_period: 600s`,
     `interval: 30s`, `retries: 3` — a 690s deadline.
     `sandbox-boot-guard-ci.sh:64-83` already derives and enforces exactly this
     relationship for the bind flavor, and the guard must not pin a shorter one.
  3. **A healthy container is not evidence that provisioning succeeded.**
     `entrypoint.sh:176-181` runs `provision-defaults.sh` under
     `timeout "${OH_PROVISION_DEFAULTS_TIMEOUT:-240}"` and, on failure, logs a
     WARNING and continues. Health therefore cannot be the oracle;
     `verify_default_catalog` must be, which is why it is reused rather than
     re-derived.
  4. **`[[pattern-evals-unexercised-oracle]]` forbids shipping the probe green.**
     Its REGRESSION branch must be driven against a deliberately broken input
     before the probe counts, and a SKIPPED guard that can fire in the normal
     environment leaves the probe unverified for the same reason.
  5. **`[[pattern-evals-prose-literal-pinning]]` constrains how the probe asserts.**
     Pin short, wrap-safe fragments; use `grep -qxF` where the pinned text is a
     whole line, because a substring pin can survive deletion of the block it
     guards.

  `[[pattern-wiki-ungated-check-drift]]` does not conflict — it is the direct
  precedent. `docs/deployment-prebuilt-image.md` ships a section titled
  "Manual live-host smoke checklist (non-gating)", which is that pattern's exact
  shape, and this task applies the pattern's own prescribed workaround.

## Expected Knowledge Impact

- **Impact**: REQUIRED
- **Expected entries**: `compose-env-boundary` (gains the second compose driver
  and the deployment guard as a consumer of the image-only flavor),
  `audit-architecture` (gains `/deploy-check` in the list of independent
  instruments that sit outside the nine audit targets),
  `sandbox-dependency-installs` (the boot-time provisioning path acquires its
  first published-image oracle), plus any `pattern-*` page `/wiki compile` writes
  from this run's retro
- **Affected source paths**: `.oh/skills/deploy-check/**`, `.oh/scripts/**`,
  `.oh/evals/probes/**`, `.oh/evals/RESULTS.md`,
  `.oh/evals/decisions/skill-impact.md`, `.github/workflows/**`,
  `docs/deployment-prebuilt-image.md`
- **Reason**: the change introduces a new operator-facing skill, a second compose
  entry point beside `docker-compose.sh`, gives the previously untested image-only
  flavor a live runner, and retires a documented non-gating manual procedure — all claims the
  named pages currently make differently.

## Plan Reconciliation

- **Source plan**: `.claude/plans/i-would-like-to-velvety-diffie.md` (operator
  written and approved; handing it to `/spec` is the commitment gate).
- **Intent preserved**: YES
- **Material deviations**: one, operator-directed and therefore already approved.
  Mid-run the operator extended the scope: *"This is NOT ONLY meant to be CI. I
  would like a skill (use /builder skill) that becomes a pointer for use locally to
  validate features without polluting my main harness sandbox."* The written plan
  treated CI as the instrument and had no operator-facing door. R0 adds
  `/deploy-check` as the primary entry point, demotes the workflow to its second
  consumer, and makes sandbox isolation an explicit requirement rather than an
  incidental property of unique naming. Nothing in the plan is removed. Every other claim the plan leans on was verified at
  the base commit: `compose()` invokes a script (`sandbox-boot-smoke.sh:16`); the
  image-only compose file is already parameterised on `OH_SANDBOX_IMAGE`,
  `OH_PULL_POLICY`, `SANDBOX_NAME`, `OH_HOME_MOUNT`; `verify-sandbox-image.sh`
  takes an arbitrary ref; the seed branch logs `no checkout bind at`
  (`entrypoint.sh:150`); `ci-harness.yml:130` already shellchecks
  `.oh/scripts/*.sh`; the eval runner caps probes at 30s
  (`.oh/skills/eval/run.sh:16`); and `workflow_run` appears in no workflow today.
- **Constraints discovered during grounding**: the five recorded above, plus two
  smaller ones. `verify-sandbox-image.sh` requires `jq` on the runner
  (`verify-sandbox-image.sh:139`) in addition to `sandbox-boot-smoke.sh:101`'s
  requirement. And `sandbox-boot-guard-ci.sh:180` asserts `release.yml` does not
  reference `sandbox-compatibility`, confirming the plan's decision to trigger
  the new workflow with `workflow_run` rather than by editing `release.yml`.

## Context

`ghcr.io/mifunedev/openharness:latest` is the artifact most users consume, and
nothing verifies it. Three gaps:

1. **No CI job boots the image-only flavor.** Every live boot in CI routes
   through `docker-compose.sh` → `docker-compose.yml`, which bind-mounts the
   checkout, so `entrypoint.sh:121` always takes the `if` branch.
   `seed_workspace_volume` is exercised only by the in-process simulation inside
   `oh-image-only-deploy.sh`.
2. **No test anywhere runs the published image.** `sandbox-boot-guard.yml`,
   `sandbox-compatibility.yml`, and `release.yml` each verify a locally built
   tag; none pulls a published GHCR ref.
3. `docs/deployment-prebuilt-image.md` documents its live checklist as manual and
   non-gating.

A manual run against v0.6.0 confirmed the path works today, so this is not a bug
fix — it converts a one-off validation into a repeatable instrument and closes
the window in which a broken published image ships unnoticed.

## Goals

| Goal | Evidence |
| --- | --- |
| The published image is booted, not just built | `deployment-guard.sh` pulls and boots `${OH_SANDBOX_IMAGE:-ghcr.io/mifunedev/openharness:latest}` |
| The image-only seed branch runs in CI at least once per release | the guard asserts `no checkout bind at` in `docker logs` |
| Boot-time provisioning is asserted on the published artifact | `verify_default_catalog` runs for both `harness` and `tool`, reused unchanged |
| The manual non-gating checklist is retired | the phrase `non-gating` no longer appears in `docs/deployment-prebuilt-image.md`, which points at the guard instead |
| The wiring cannot be silently deleted | tier-A probe `deployment-guard-ci.sh`, driven red before it is trusted |
| An operator can validate a deployment locally without touching their sandbox | `/deploy-check` boots a throwaway stack under its own project name, own home volume, and own Docker config; it never reads or writes the checkout's `oh.json`, `.env`, or the operator's own container |
| The instrument is safe on a shared daemon | one unique compose project name owns every created resource; no `prune` verb anywhere |
| The instrument grows without being rewritten | scenarios are named arguments to one runner; adding one is a case branch plus assertions, not a second instrument |

## Non-goals

- **Auth flows.** `gh auth`, `claude auth`, and Pi device auth are out of scope
  and are not exercised.
- **A 10th `/audit` target.** `audit-architecture.md:33` keeps instruments that
  execute readiness floors outside the audit taxonomy; a 10th target would also
  require lockstep edits across five files plus two probes that pin the
  nine-target list verbatim.
- **A new `.oh/evals/` scoreboard leg.** The CI job is the pass/fail record for
  the published image and git history is the time series; a local run reports to
  the operator's terminal.
- **Replacing `oh sandbox` / `oh shell`.** `/deploy-check` never manages the
  operator's own sandbox and offers no way to attach to a long-lived one. It
  creates a container, asserts, and destroys it.
- **Teaching `docker-compose.sh` about the image-only flavor.** It is the
  lifecycle door for the flavor `oh` manages; a branch for one caller is cost
  without a second consumer.
- **Multi-arch or MicroSandbox coverage.** The published image is single-arch;
  that caveat is unchanged.

## Requirements

### R0 — `/deploy-check`, the operator-facing skill

The instrument's primary door is a skill at `.oh/skills/deploy-check/SKILL.md`,
authored through `/builder skill`. CI is its second consumer, not its purpose.

- **Argument shape**: `/deploy-check [scenario] [--image <ref>] [--local] [--keep]`.
  Default scenario `provisioning`. `--image` overrides the ref; `--local` targets
  the locally built `sandbox-<name>` tag instead of GHCR; `--keep` skips teardown
  for interactive triage and prints the exact cleanup command it did not run.
- **Isolation is the contract.** The skill states, and the runner enforces, that a
  run never touches the operator's own sandbox: a unique compose project name, a
  volume created and destroyed with the run, its own `DOCKER_CONFIG`, no bind of
  the operator's checkout, no read or write of the checkout's `oh.json` or `.env`,
  no published port, and no `prune` verb. The pre-run and post-run resource
  inventories must match.
- **Scenarios are named arguments to one runner**, not separate instruments.
  `provisioning` is the only scenario this task ships; the skill documents how a
  second one is added (a case branch plus its assertions) so the extension point
  is real rather than promised.
- **It composes, it does not fork.** The skill's procedure invokes
  `.oh/scripts/deployment-guard.sh`; it re-implements none of the assertions and
  contains no second copy of the boot sequence. It is the door, and the script is
  the mechanism — the same relationship `oh` has to `docker-compose.sh`.
- A `PROPOSED` record is appended to `.oh/evals/decisions/skill-impact.md` with the
  next `SI-nnnn` id, per the `/builder` shared protocol.

### R1 — `.oh/scripts/deployment-compose.sh`

A forwarding driver satisfying the `BOOT_SMOKE_COMPOSE` seam. Forwards its argv
to `docker compose -f .devcontainer/docker-compose.image-only.yml`. It reads no
repository dotenv (constraint 1). It isolates the Docker credential helper by
exporting a `DOCKER_CONFIG` pointing at an empty scratch directory, because a
`credsStore` the environment cannot execute makes an anonymous pull of a public
image fail with `error getting credentials - err: exit status 255`.
`OH_DEPLOY_DOCKER_CONFIG` overrides the scratch directory.

### R2 — `BOOT_SMOKE_FLAVOR` in `.oh/scripts/sandbox-boot-smoke.sh`

One switch, defaulting to `bind`. On `image-only`, skip `verify_bind_ownership`
and nothing else: there is no host checkout to compare against, so the assertion
is meaningless rather than merely redundant. The skip is keyed on the flavor
variable, never on detecting an absent checkout, so a future bug cannot silently
disable the check on the bind flavor. An unrecognised value is an error, not a
silent default. The success line names the flavor.

### R3 — `.oh/scripts/deployment-guard.sh`

The mechanism both `/deploy-check` and CI call. Ordered:

1. Resolve `IMAGE=${OH_SANDBOX_IMAGE:-ghcr.io/mifunedev/openharness:latest}`;
   accept a positional override.
2. Preflight: `docker` and `jq` present; no existing container, volume, or
   network already matches the run's unique project name — abort before touching
   the daemon if one does.
3. `docker pull "$IMAGE"`, then `bash .oh/scripts/verify-sandbox-image.sh "$IMAGE"`.
4. `sandbox-boot-smoke.sh` with `BOOT_SMOKE_FLAVOR=image-only`,
   `BOOT_SMOKE_COMPOSE=.oh/scripts/deployment-compose.sh`, a unique
   `SANDBOX_NAME`, `OH_PULL_POLICY=never` (pinning the exact object step 3
   inspected), and a timeout that clears the 690s healthcheck deadline
   (constraint 2).
5. Post-boot assertions against the same container, accumulated rather than
   fail-fast, so one multi-minute boot reports every defect:
   - `docker logs` contains `no checkout bind at` and not `checkout bind detected at`
   - `/home/sandbox/harness/.oh/.image-seeded` exists
   - `~/.gitconfig` carries the `GIT_USER_NAME`/`GIT_USER_EMAIL` passed in
   - `docker inspect`: exactly one mount, a volume at `/home/sandbox`; no
     published ports; no `/var/run/docker.sock` bind; not privileged
   - the persist-and-install contract: an entry that is `kind:"optional"` and
     `installed:false` becomes `install.<id>=true` in `oh.json` **and** a live
     binary, after `oh harness install`. Assert the pre-state first, or the
     check passes vacuously.
6. Teardown removes only this project's own resources, asserts nothing matching
   the run name survives, and fails the run if a resource leaked. `trap` covers
   `EXIT INT TERM`. **No `prune` verb appears anywhere in the script.**

### R4 — `.oh/evals/probes/deployment-guard-ci.sh`

Tier A, sub-second, hermetic. It cannot run the provision under the 30s cap, and
it must not restate the static contract `oh-image-only-deploy.sh` already owns.
It asserts the instrument's wiring and host-safety invariants: the workflow
invokes `deployment-guard.sh` on both a post-release trigger and
`workflow_dispatch`; the guard invokes `verify-sandbox-image.sh` and
`sandbox-boot-smoke.sh` and still passes `BOOT_SMOKE_FLAVOR=image-only`; the
guard matches no `prune` verb and no bulk `docker rm -f $(`; the guard traps
`EXIT INT TERM`; `sandbox-boot-smoke.sh` still calls `verify_bind_ownership` on
the bind path. Assertions pin short wrap-safe fragments, using `grep -qxF` for
whole lines (constraint 5). Its SKIPPED guard must not be able to fire in the
repository that normally runs it (constraint 4).

### R5 — `.github/workflows/deployment-guard.yml` (the second consumer)

`workflow_run` on completion of the workflow named `Release`, gated on
`conclusion == 'success'`, plus `workflow_dispatch` with an `image` input
defaulting to `ghcr.io/mifunedev/openharness:latest`. One job,
`permissions: contents: read`, `timeout-minutes: 20`, installs `jq` if absent,
runs `link-providers.sh --init`, then `bash .oh/scripts/deployment-guard.sh`. It
must fail loudly rather than skip when Docker or the network is unavailable — a
silent skip is exactly the failure mode this closes.

### R6 — `docs/deployment-prebuilt-image.md`

Replace the "Manual live-host smoke checklist (non-gating)" section with a
pointer to `/deploy-check`, the guard script, and the workflow. Correct the line that names the boot-time
defaults as "Claude Code, Codex, Pi": the catalog is the source of truth and the
same boot installs more than three. No CI lint change is needed —
`ci-harness.yml:130` already globs `.oh/scripts/*.sh`.

## Risks

- **Runner Docker.** The job needs a daemon and outbound network to GHCR and npm.
  On a self-hosted `vars.CI_RUNNER` that is not guaranteed; failing loudly is the
  requirement.
- **Boot install pulls live upstream packages.** An upstream npm break turns the
  job red with nothing in this repo changed. That is a true signal about the
  deployment path; triage starts with `docker logs`.
- **A ~5 minute Docker job on every release.** Accepted: it runs after
  publication on `workflow_run`, so it never holds the release pipeline, and a
  flake is answered by a re-run against an immutable already-pushed image.
