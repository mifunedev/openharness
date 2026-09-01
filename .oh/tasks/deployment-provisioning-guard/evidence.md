# Evidence — deployment-provisioning-guard

Task: `.oh/tasks/deployment-provisioning-guard/` · issue
[#937](https://github.com/mifunedev/openharness/issues/937) · PR
[#938](https://github.com/mifunedev/openharness/pull/938) · branch
`task/937-deployment-provisioning-guard`.

## 0. Why this is better than not doing it

**Before.** Zero assertions ran against `ghcr.io/mifunedev/openharness:latest` —
the artifact the deployment docs and the blog post tell users to pull. Verified at
the planning base `4fbca95`:

- No CI job booted the image-only flavor. `sandbox-boot-guard.yml:159` and
  `release.yml:210` both call `sandbox-boot-smoke.sh`, whose default
  `BOOT_SMOKE_COMPOSE` is `.oh/scripts/docker-compose.sh`, which hardcodes
  `-f .devcontainer/docker-compose.yml`. That file bind-mounts the checkout, so
  `entrypoint.sh:121` always took the `if` branch. **The `else` branch —
  `seed_workspace_volume`, the whole no-checkout deployment — ran in no CI job at
  all**, only in an in-process simulation inside `oh-image-only-deploy.sh`.
- No workflow, script, or probe ran `docker pull` on a published ref. All three
  image workflows verify a locally built tag.
- `docs/deployment-prebuilt-image.md:288` shipped a section titled
  **"Manual live-host smoke checklist (non-gating)"** — six unchecked boxes.

**After.** 32 assertions run against the published image on every successful
release and on demand, locally or in CI. The observed run against `:latest`
(commit `084dfaa0`) printed 32 `ok:` lines and exit 0 in ~6 minutes.

**The number that matters most is the negative one.** Against
`ghcr.io/mifunedev/openharness:0.5.1` the same command exits 1 and names 6 failed
assertions, including `entrypoint did not log 'no checkout bind at'` and
`seed marker /home/sandbox/harness/.oh/.image-seeded is missing`. A green result
therefore means something: the oracle discriminates rather than passing on
anything that boots.

**Cost.** +3 scripts, +1 skill, +1 probe, +1 workflow; ~5–10 minutes of runner
time per release, after publication, so it holds nothing up. Two knowledge pages
updated, one ledger record.

**Claimed, unmeasured:** that this catches a *future* break. It cannot be measured
until one happens. What is measured is that the instrument distinguishes a good
published image from a bad one today.

## 1. What the plan asked for

Convert a one-off manual validation of the published image into an instrument
that can be repeated and improved — and, per the operator's mid-run instruction,
one whose primary door is **local**: *"This is NOT ONLY meant to be CI. I would
like a skill (use /builder skill) that becomes a pointer for use locally to
validate features without polluting my main harness sandbox."*

Scope: resource provisioning (container, volume, network) and internal
provisioning (defaults installed at boot). Auth flows explicitly out of scope, and
none is exercised.

## 2. What was built

### `/deploy-check` — the local door

`.oh/skills/deploy-check/SKILL.md`. `[scenario] [--image <ref>] [--local]
[--keep] [--run <token>]`, default scenario `provisioning`. It adds **no
assertions**; it selects a scenario, resolves the image, runs the guard, and
reads the result. The skill documents how a second scenario is added — a case
branch in the runner plus its assertions — so the extension point is real.

Validated: the mirror resolves (`.claude/skills` is a symlink to `.oh/skills`;
`link-providers.sh --check` exits 0 and the skill is listed by the harness), the
frontmatter carries all four fields with correct delimiters, and every path,
command, and sibling skill it names exists. Its `--local` resolution command finds
`sandbox-openharness:latest` and `sandbox-oh-sbx-remote:latest` on this daemon.

### `.oh/scripts/deployment-guard.sh` — the mechanism

Both consumers call it. Observed run against `:latest`:

```
deployment guard: image=ghcr.io/mifunedev/openharness:latest run=oh-depguard-live1 timeout=990s (healthcheck deadline 690s)
ok: pulled ghcr.io/mifunedev/openharness:latest
ok: base distribution is Debian trixie
ok: built-in sandbox user is 1000:1000
ok: node is major 22 (v22.23.2)
ok: pnpm is exactly 10.33.0
ok: no harness is baked into the image (claude-code codex pi opencode grok-build hermes t3code )
ok: no default tool is baked into the image (herdr cloudflared )
ok: every baked-in tool is present (docker-cli gh )
ok: image contract verified (nothing baked that must be installed at boot)
ok: image-only boot smoke passed (health, Herdr runtime, boot-provisioned harnesses and tools)
ok: entrypoint took the no-bind seed branch
ok: no checkout bind was detected, as the image-only flavor requires
ok: seed marker .oh/.image-seeded exists in the home mount
ok: GIT_USER_NAME and GIT_USER_EMAIL reached the sandbox gitconfig
ok: exactly one mount, the home volume at /home/sandbox
ok: no host port is published
ok: the host Docker socket is not mounted
ok: the container is not privileged
ok: install of 'opencode' persisted to oh.json
ok: install of 'opencode' landed in the running container
ok: 'opencode' resolves under /home/sandbox/.local (/home/sandbox/.local/bin/opencode)
ok: teardown removed every resource named for oh-depguard-live1
ok: containers inventory is unchanged by this run
ok: volumes inventory is unchanged by this run
ok: networks inventory is unchanged by this run

deployment guard: all checks passed for ghcr.io/mifunedev/openharness:latest
```

The nested boot smoke reported the flavor it ran:

```
sandbox boot smoke ok [image-only]: sandbox (de314dea464b…) passed
bash /home/sandbox/harness/.oh/scripts/sandbox-healthcheck.sh, Herdr runtime,
no bind-ownership check on this flavor, and boot-provisioned harness and tool checks
```

`timeout=990s (healthcheck deadline 690s)` is derived from the compose file's
`start_period + interval × retries`, not pinned — a `start_period` bump cannot
silently make the guard time out before the boot it measures.

### `BOOT_SMOKE_FLAVOR` — one switch, not a fork

`sandbox-boot-smoke.sh` gained `FLAVOR=${BOOT_SMOKE_FLAVOR:-bind}`, a validating
`case`, and `if [ "$FLAVOR" = "bind" ] && ! verify_bind_ownership`.
`verify_default_catalog` — the provisioning oracle — is reused byte-for-byte.
Unrecognised values are an error, not a silent default:

```
$ BOOT_SMOKE_FLAVOR=bogus bash .oh/scripts/sandbox-boot-smoke.sh
sandbox boot smoke failed: BOOT_SMOKE_FLAVOR='bogus' is not one of: bind, image-only
exit=2
```

### Host safety — measured, not asserted

Run on a daemon shared with 13 pre-existing containers (langfuse, oh-cloud,
postgres, `oh-sbx-remote`), 34 volumes, 10 networks.

| Test | Result |
|---|---|
| Full pass run | inventories byte-identical before/after (containers, volumes, networks) |
| Failing run (`:0.5.1`) | exit 1, inventories identical |
| **Interrupt** — `kill -TERM` on the process group 10s after the container came up | exit 1, no `oh-depguard-int` container, volume, or network survives; inventories identical |
| **Collision** — `--run langfuse-clickhouse-1` | aborts in preflight: `run token … already names existing resources: container langfuse-clickhouse-1`; `diff` against the pre-run container list is empty, so the daemon was not touched |

The script contains no `prune` verb and no force-remove over a command
substitution; the probe enforces both against code, not comments.

### Discrimination — the oracle is not vacuous

`bash .oh/scripts/deployment-guard.sh ghcr.io/mifunedev/openharness:0.5.1` → exit 1:

```
FAIL: verify-sandbox-image.sh rejected ghcr.io/mifunedev/openharness:0.5.1
FAIL: image-only boot smoke failed — see its diagnostics above
FAIL: entrypoint did not log 'no checkout bind at' — this boot did not take the seed branch
FAIL: seed marker /home/sandbox/harness/.oh/.image-seeded is missing — the control plane was not seeded from /opt/oh-seed
FAIL: the sandbox gitconfig carries '' <>, not the identity the guard passed in
FAIL: no kind:"optional" harness is both un-enabled and uninstalled, so the persist-and-install check would pass vacuously
deployment guard: 6 check(s) failed for ghcr.io/mifunedev/openharness:0.5.1
```

Note the last line: the vacuity guard on the install check fired rather than the
check passing silently — which is the failure mode
`pattern-evals-unexercised-oracle` warns about.

### `deployment-guard-ci.sh` — driven red before it was trusted

Tier A, 16 assertions, sub-second. It carries a `DEPLOY_GUARD_PROBE_ROOT`
override so its REGRESSION branch stays reachable rather than being exercised
once by hand. **20 fault injections, 20 caught, baseline green on an unmodified
copy:**

| Injection | Caught |
|---|---|
| workflow no longer invokes the guard | ✔ |
| skill no longer invokes the guard | ✔ |
| `workflows: ["Release"]` → `["Other"]` | ✔ |
| `workflow_dispatch:` deleted | ✔ |
| `packages: write` added | ✔ |
| guard drops `verify-sandbox-image.sh` | ✔ |
| guard drops `sandbox-boot-smoke.sh` | ✔ |
| `BOOT_SMOKE_FLAVOR=image-only` → `bind` | ✔ |
| guard drops `docker pull` | ✔ |
| `trap teardown EXIT INT TERM` → `EXIT` | ✔ |
| `docker system prune -f` added | ✔ |
| `docker rm -f $(docker ps -aq)` added | ✔ |
| driver unpinned to the bind compose file | ✔ |
| driver gains `--env-file` | ✔ |
| smoke flavor default flipped to `image-only` | ✔ |
| bind-path `verify_bind_ownership` disabled | ✔ |
| each of the 4 guarded files deleted | ✔ (4) |

## Actual Knowledge Impact

`knowledge-impact.sh --changed` reported **no** page `NEEDS-REVIEW` (no changed
path appears in any page's declared `sources:`). The union is therefore the three
pages `Expected Knowledge Impact` named:

| Page | State | Action |
|---|---|---|
| `compose-env-boundary` | **UPDATED** | Added a "two drivers, and the dotenv is what separates them" paragraph explaining why `deployment-compose.sh` exists and cannot reuse `docker-compose.sh`; declared both drivers as sources; corrected the flavor-B non-goal, which said flavor B merely "survives" and is now the flavor a live guard boots; added the driver to the diagram. `verified_at` advanced to `084dfaa0` after re-reading the cited claims in `config-render.ts:37,49` (rendered set unchanged) and `provision-defaults.sh:129,135` (catalog read unchanged), and after `compose-env-boundary.sh` passed. |
| `audit-architecture` | **UPDATED** | `/deploy-check` added to the list of instruments that stay outside the nine audit targets, with the reason. `updated:` advanced; **`verified_at:` deliberately NOT advanced** — the edit adds one sentence about a new sibling instrument and did not involve re-reading the audit skill sources the page's claims rest on. Advancing it would launder staleness into freshness. |
| `sandbox-dependency-installs` | **NOT-AFFECTED** (the page describes the root `pnpm install` manifest-fingerprint gate; this change touches `provision-defaults.sh`'s consumers, not that gate, and none of its declared sources moved) | none — the planner predicted impact here and the diff says otherwise |

`.oh/knowledge/README.md` regenerated; `bash .oh/evals/probes/wiki-readme-index.sh`
→ `PASS`.

`SI-0004` appended to `.oh/evals/decisions/skill-impact.md` as `PROPOSED`, citing
`[[pattern-wiki-ungated-check-drift]]` and `[[pattern-evals-unexercised-oracle]]`.

**New pattern compiled from this run's retro:**
`[[pattern-shared-runner-owns-teardown]]` — a reusable runner's own `EXIT` trap
destroys the subject its next caller needs, and it fires on the *successful* exit
too, which is why the plan read the trap as a benefit. Divergence 2 below is the
instance; the page records the seam-based workaround and the two rules that make it
honest (cover `INT`/`TERM`, and assert the leak).

## 3. Where it diverged from the plan, and why

1. **A `/deploy-check` skill was added and CI was demoted to the second
   consumer.** Operator instruction mid-run. Recorded in `prd.md` under Plan
   Reconciliation; R0 and US-004 were added and the remaining stories renumbered.
   Nothing in the approved plan was removed.
2. **The guard neutralises the boot smoke's own teardown.** The plan said
   "teardown is inherited from the smoke script's `trap`". That is wrong: the
   smoke tears down on exit, including a *successful* exit, so the container the
   guard's post-boot assertions need would already be gone. The guard therefore
   passes `BOOT_SMOKE_DOWN_ARGS="ps -q"` — the existing tuning seam, pointed at a
   read-only command — and owns teardown itself, with its own trap and its own
   leak check. No edit to `sandbox-boot-smoke.sh` beyond the one flavor switch.
3. **`docker inspect` is read through narrow `--format` templates, not `jq` over
   the whole object.** The first implementation captured the full inspect JSON.
   A repository guard rejected it: a bare inspect re-exposes `Config.Env`. The
   assertions are now four one-field templates, which is also less code.
4. **The persist half is asserted through the CLI's own `enabled` field rather
   than by parsing `oh.json`.** `oh harness list --json` computes `enabled` from
   `oh.json` via `installFieldPath`, and the JSON does not expose `harnessKey`.
   Reading `enabled` asserts the same fact without duplicating the CLI's
   id→field mapping in shell.
5. **The doc fix landed differently than planned.** The plan said the line naming
   "Claude Code, Codex, Pi" was wrong because `herdr` and `cloudflared` also
   install. It is not wrong — those are *tools*, and the sentence is about
   harnesses. It is incomplete, so it now names the `kind:"default"` set from both
   catalogs and points at the catalogs as the source of truth.
6. **`sandbox-dependency-installs` was predicted to need an update and does not**
   (see the table above). The planner's prediction, not the diff, was wrong — the
   gate this step exists for.

## 4. What remains unverified

- **The `workflow_run` trigger has never fired.** No workflow in this repository
  used `workflow_run` before, and it only fires from the **default branch** after
  a `Release` run completes. It cannot be exercised from this PR. First real proof
  is the release after this merges; the `workflow_dispatch` path is the fallback
  if it does not. Manual dispatch also cannot be tested until the workflow file is
  on the default branch.
- ~~The bind flavor was not booted locally.~~ **Resolved by CI, not delegated.**
  `CI: Sandbox Boot Guard` run
  [33469542069](https://github.com/mifunedev/openharness/actions/runs/33469542069)
  booted the bind flavor on this branch and printed both halves:

  ```
  sandbox boot smoke: sandbox user, bind mount, and sandbox-created files all resolve to 1001:1001
  sandbox boot smoke ok [bind]: sandbox (e4d25c21ffa4…) passed …, Herdr runtime, bind-ownership,
  and boot-provisioned harness and tool checks
  ```

  So `verify_bind_ownership` still runs on the default flavor, and the new success
  line reports the flavor correctly on both paths.
- **The skill was executed by hand, not re-invoked for a second live boot.** Its
  procedure — resolve the image, run the guard, read the result — is exactly the
  commands run above, and the skill adds no assertions of its own. Its cheap paths
  (path validity, frontmatter, `--local` tag resolution, provider mirror) were
  checked directly. A second six-minute boot through the Skill tool would have
  exercised the same script.
- **`--keep` was not exercised.** It only skips teardown and prints a cleanup
  command; on a daemon carrying production containers, deliberately leaving a
  container behind to prove it stays behind was not worth the risk of a missed
  cleanup.
- **Only `provisioning` exists.** The scenario argument is documented as the
  extension point but has one value, so the extensibility claim is design, not
  demonstration.
- **A CI runner may not have Docker.** The workflow fails loudly rather than
  skipping, by design; whether `vars.CI_RUNNER` can run it is unknown until it
  runs there.
- **Eval floor:** see `.oh/tasks/deployment-provisioning-guard/eval-result.json`
  for the suite result keyed to the commit it ran against, including any
  pre-existing red carried forward.
