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

## 5. The gates, and what running them properly caught

The first pass through this build performed `/audit implementation`, `/audit pr`,
`/retro`, and `/benchmark` by hand rather than invoking them, and reported READY on
that basis. Running them for real changed the outcome:

| Gate | Run id | Verdict |
|---|---|---|
| `/audit pr 938` | `audit-20260901T042757Z-2363846` | **PR-AUDIT-PROMOTABLE** — `promotable: true`, `evidenceComplete: true`; confirmed the hand classification |
| `/audit implementation` (1st) | `audit-20260901T042753Z-2363518` | **AUDIT-FAIL (gate 2)** — the PR was returned to draft |
| `/audit implementation` (2nd, clean root) | `audit-20260901T043443Z-2414777` | **AUDIT-PASS** — gate 1 9/9 · gate 2 rc=0, 139 probes, zero REGRESSION · gate 3 `promotable: true` · gate 4 n/a · gate 5 no blocking finding (`netAdded 1742`, rounds=0) |
| `/spec retro` | — | RETRO-DONE, 8 hypotheses, 1 promotion (`pattern-shared-runner-owns-teardown`) |
| `/benchmark` | — | **NOT-BENEFICIAL** — see below |
| `/audit implementation` (3rd, after the CI removal and the repair) | `audit-20260901T185327Z-1047052` | **AUDIT-FAIL (gate 5)** — 3 blocking simplifications, ~117 removable lines |
| `/audit implementation` (4th) | `audit-20260901T190538Z-1133824` | **AUDIT-FAIL (gate 4)** — the gate's own preflight could not run |
| `/audit implementation` (5th) | `audit-20260901T193105Z-1651666` | **AUDIT-PASS** — all five gates; gate 4 ran the browser preflight for real |

### Gate 4 — the gate was broken, and fixing it was the work

Gate 4 failed with `FAIL gate4: Chromium launch`. The unit was fine; **the gate
could not pass for any unit**. Two independent defects, both reproduced against an
identical fixture root:

1. **The isolated `HOME` hid the browser.** The preflight runs `agent-browser`
   under a throwaway `HOME`, but Playwright resolves its cache at
   `$HOME/.cache/ms-playwright`, and the preflight is forbidden from downloading.
   Fixed by capturing the cache before overriding `HOME` and passing
   `PLAYWRIGHT_BROWSERS_PATH` through, so the profile stays isolated and the
   executable stays reachable. An absent cache now fails closed naming the path
   and the install command instead of surfacing as an opaque launch error.
2. **The daemon socket overflowed the unix path limit.** `agent-browser` opens
   `$XDG_RUNTIME_DIR/agent-browser/<session>.sock`, falling back under `HOME`.
   With `XDG_RUNTIME_DIR` unset and `HOME` under `AUDIT_TMP_ROOT`, that path
   exceeds the 107-byte `sun_path` limit and the daemon silently fails to start —
   which is why the first symptom seen was `Daemon failed to start` and only the
   second was `Executable doesn't exist`. Fixed with a short isolated runtime
   directory under `TMPDIR`, plus an explicit length assertion before launch.

Measured on one fixture root: **pre-fix exit 1 (`FAIL gate4: Chromium launch`),
post-fix exit 0, absent cache exit 1** with the new message. The 5th audit then
ran the real preflight — `about:blank` opened and closed, repo snapshots
identical — so the fix is confirmed in the audit's own path, not only in a
fixture.

**The existing probe passed through all of this.** `audit-implementation-behavior.sh`
mocks `agent-browser` with a script that exits 0, so its oracle never touched the
daemon or the cache — `[[pattern-evals-unexercised-oracle]]` again, in the
subsystem that enforces it. The probe now records the environment the preflight
hands the browser and asserts the cache is passed through, `XDG_RUNTIME_DIR` is
set, the derived socket path fits, and an absent cache fails closed without
launching. It supplies its own cache fixture, so it does not require a real
browser install. **Four fault injections, four caught, baseline green.**

Deliberately **not** changed: the applicability oracle at
`implementation-gates.sh:45` is `grep -qi 'agent-browser\|Verify in browser'`,
which false-positives here because US-010 installs that CLI. Narrowing it risks
silently skipping real UI verification, which the route's own tie-break calls the
worse failure. A false positive now costs one `about:blank`.

### Gate 5 residuals (disclosed, non-gating)

The 5th audit passed gate 5 on the monotone rule (`netAdded` 1711 → 1782 did not
strictly fall) with `SIMPLICITY-RESIDUAL: 4`. Three were applied anyway because
they are unambiguous: an uncalled `has_re()` in the probe, four environment
variables restated in `deployment-guard.sh` that a single `export` now covers, and
a `clear_marker()` wrapper with one call site. **The fourth was not applied and is
the operator's to judge:** replacing the ten-line `awk`/`grep` read of the
healthcheck window with `docker compose config --format json | jq`. It is
structurally better, but it reorders the script — the compose driver must be fully
configured before the timeout is derived — and swaps a pure text read for a
subprocess in the preflight path. That is a change, not a trim, and the loop had
already terminated.

### Gate 5 round 1 — the simplify loop

The audit was right and all three findings were applied without argument.

- **F1 — 98 explanatory comment lines against `AGENTS.md` non-negotiable #5.** The
  three new scripts ran a 21% comment ratio where `docker-compose.sh` has 0 in 180
  lines. Removed, plus the same violation in the three files this branch modified,
  which the finding did not name but the constraint covers. What survives is the
  probe's machine-read `# tier:`/`# source:`/`# desc:` header (read by
  `eval/run.sh:50,108`) and a usage/env line per script. No invariant was lost with
  them: each is stated in an `ok:`/`fail:` message, and the rationale lives in the
  commit messages, this document, and the skill.
- **F2 — the three-scope Docker enumeration appeared four times.** Replaced by
  `docker_names()` over a `container|volume|network` case plus
  `names_matching_run()` driven by one `SCOPES` list, so the collision check and
  the leak check are now provably the same query rather than two hand-kept copies.
- **F3 — three one-line `printf` functions called 9 times in a subshell.** Now
  three plain variables.

`netAdded` **1830 → 1711**, a strict reduction, so the monotone stop rule does not
end the loop; `deployment-guard.sh` went 363 → 307 lines with comments 56 → 4.
Re-verified after the rewrite: **16/16 fault injections caught** with a green
baseline (the workflow injections replaced by one asserting a CI leg cannot
reappear), shellcheck clean, both healthcheck marker branches exercised, and
`/eval` 139 probes with no new green→red.

### `/benchmark` — NOT-BENEFICIAL, and it is right

- **Signal 1 (regression floor): CLEAR.** `eval-result.json` records `a6b8d18c`
  while HEAD is `a01b744b`, so the record was correctly not inherited; the suite
  was re-run at HEAD in a clean root — 139 probes, exit 0, zero REGRESSION rows.
- **Signal 2 (capability ceiling): FLAT.** `suite score = 1.44` on this branch and
  `1.44` on `development`. No capability task credits this change: CB-001 scores
  unattended autopilot, CB-002 the `/spec` pipeline to a ready PR, CB-005 the
  retro→pattern→probe loop. None covers deployment readiness.

Per the rubric, *"score flat AND the change only added machinery with no capability
task crediting it"* → **NOT-BENEFICIAL — machinery without benchmark movement.**

This is reported as the gate found it, not softened. The honest reading is that it
is a **gap in the instrument, not a claim that the change is worthless**: the
benchmark has no task that exercises "can the harness tell whether its own
published artifact works", so the axis this change moves is unmeasured — which is
precisely the `CB-004` failure mode the scoreboard already records, where machinery
stood for two months at `Δ +0.00` because no measurement was ever taken. Adding
such a task is the named follow-on; asserting a hold without one would be exactly
the Goodharting the gate exists to prevent.

`/benchmark` is read-only and names the remediation rather than performing it:
`git revert a01b744b..084dfaa0` is the revert command for this change, and the
call is the operator's. Note also that `/audit eval-quality` grooming was **not**
run this cycle, so the instrument's own sharpness was not checked.

The `AUDIT-FAIL` was correct and caught two things the hand check did not:

1. **`eval-result.json` was stale** — it records `084dfaa0` while HEAD was
   `8d5fce99`, so gate 2 could not inherit it and ran the 139-probe suite itself.
   This is `[[pattern-spec-self-staling-reuse-record]]` behaving exactly as that
   page describes: the record is valid only for readers running before it is
   committed, and a reader that finds it stale is behaving normally.
2. **A real defect in this branch.** `compose-env-boundary.md`'s `verified_at`
   bump to `084dfaa0` was edited into the working tree but **never staged**, so
   commit `084dfaa0` carried the old `1c5f3723` while this document already
   claimed the bump had landed. The evidence doc was wrong about the diff. Fixed
   in the follow-up commit. Nothing in the hand-run gates would have caught it —
   only re-deriving the state from the committed tree did.

Gate 2's remaining finding is the `compose-config-path-parity` red, which the
audit independently attributed to the authoring checkout's untracked machine-local
root dotenv rather than to the branch — the same conclusion reached by the worktree
test above, reached independently. It still failed closed, which is the correct
behavior for a dirty audit root.

**The clean-root re-run, and why its scoreboard was not adopted wholesale.** A
detached worktree of `a6b8d18c` with no dirty files runs 139 probes with **zero**
non-PASS rows — that is the evidence behind the committed `PASS` row for
`compose-config-path-parity`. But its `RESULTS.md` is not simply better: a bare
worktree has no installed dependencies, so `drift-check-cron-staleness-glob`,
`oh-compose-env-wiring`, `oh-destroy-guard`, and `oh-init-headless-config` each
degrade `PASS → SKIPPED` there. Adopting it would hide four exercised oracles to
correct one row — the failure mode `[[pattern-evals-unexercised-oracle]]` names,
where a SKIPPED that fires in the environment which normally runs the probe leaves
the subject unexercised while the suite stays green. The committed scoreboard is
therefore the authoring-checkout run with the one environment-caused row corrected,
and `eval-result.json` records both runs and this tradeoff.

## 6. Closing the `--local` gap, and the two defects that surfaced

The guard shipped with a documented gap: it pulled unconditionally, so the one
image an operator most wants to check — the one they just built — was the one it
could not check. `bash .oh/scripts/deployment-guard.sh oh-pnpmfix:test` failed at
`FAIL: could not pull oh-pnpmfix:test`.

### What `--local` does, and what it deliberately does not do

`--local` (or `OH_DEPLOY_LOCAL=1`) takes an image already on the daemon:

```text
ok: --local: oh-local:test is already on this daemon (3a0484a57f64 built 2026-09-02T00:54:18Z); not pulling
```

An absent ref fails with a message naming the ref. It does **not** fall through
to a pull, and the default path does **not** fall back to a local image when a
pull fails. That asymmetry is the point: an automatic fallback would validate
whatever stale object happens to be on the daemon and report it as the published
image, which is worse than failing. `--local` is how an operator says "the object
I built is the one I mean", and the guard prints the id and build time so a
months-old object is visible rather than assumed fresh.

The probe covers all four halves — the flag, the presence assertion, the retained
default pull, and the absence of a pull-failure fallback — and each was driven red
before being trusted:

| Injection | Result |
|---|---|
| delete the `--local` case arm | REGRESSION |
| rename the arm's variable (`LOCAL=1` → `L=1`) | REGRESSION |
| break the presence check | REGRESSION |
| add `docker pull ... \|\| true` fallback | REGRESSION |
| break the default pull | REGRESSION |
| strip `--local` from the skill | REGRESSION |

The first spelling of the flag assertion — `has "$guard" '--local'` — passed the
"delete the case arm" injection, because `--local` still appeared in the usage
line, the header, and the failure message. `[[pattern-evals-unexercised-oracle]]`
again, and caught only because the injection was actually run. Pinned to
`--local) LOCAL=1` instead.

### Defect 1 — a local build bakes the working tree, dirty files included

The first live `--local` run failed:

```text
sandbox boot smoke failed: default tool 'herdr' was not provisioned into the home mount at boot
sandbox boot smoke failed: default tool 'cloudflared' was not provisioned into the home mount at boot
```

Not a defect in the image recipe. The Dockerfile does `COPY . /opt/oh-seed/`, and
the image-only boot seeds the child's control plane from it — so the **uncommitted**
`oh.json` in the authoring checkout (`hermes=true`, `agentBrowser=true`, both
`false` at HEAD) rode into the image. The child dutifully opted into hermes, whose
installer prompts on a tty:

```text
Install ffmpeg for TTS voice messages? [Y/n] [entrypoint] WARNING: default provisioning did not complete
```

It blocked until the entrypoint's 240s `timeout` fired, and everything after it in
the catalog — `herdr`, `cloudflared` — was never reached. `</dev/null` on the
install (line 161) was not enough; the installer reaches past it.

This is the *correct* answer to what was in that image, which is why it is
reported rather than suppressed: the instrument discriminated instead of passing
vacuously. It is also the caveat that belongs with `--local`, and both the skill
and `docs/deployment-prebuilt-image.md` now carry it.

### Defect 2 — a killed provision reported healthy

Watching that failure produced something that is *not* an artifact. The container
went healthy while herdr and cloudflared were absent:

```text
{"Status":"healthy",...,"Output":"sandbox healthcheck ok\n"}
```

The marker this PR added to stop exactly that was written only by `mark_failed()`
at the **end** of `provision-defaults.sh` — lines a SIGTERM never reaches. Boot
provisioning runs under `timeout`, so a kill part-way through an install is not an
edge case; it is the likeliest failure. The fix inverts the default: write the
marker before the first install, remove it only after a clean completion.

`US-010`'s original criterion — "writes a marker when a requested install is
missing and removes it on a clean run" — was satisfied by the old code and still
too weak. The criterion is now stated in terms of the kill, and `US-010` carries
the amendment rather than a new story pretending the first pass was complete.

`.oh/evals/probes/provision-marker-fail-closed.sh` exercises the real script with
a stub `oh` — one run that hangs and is killed, one that completes — and was
driven red both ways:

| Injection | Result |
|---|---|
| remove the start-of-run mark | REGRESSION (killed run left no marker) |
| never clear on success | REGRESSION (clean run held the sandbox unhealthy) |

### Not done, and why

- **A per-install `timeout`.** One blocking installer starving every later catalog
  entry is a real weakness independent of the dirty `oh.json` — any default could
  hang the same way. Isolating each install would bound the blast radius. It
  changes provisioning behavior for every sandbox, is not needed to close the
  `--local` gap, and belongs to whoever decides that policy.
- **Making the hermes installer non-interactive.** Upstream behavior reached
  through a `curl | bash` installer; opt-in, and not this PR's subject.

### The confirming run

A clean detached worktree of `be948bc0` — `git status --porcelain` empty,
`oh.json` at HEAD with every opt-in `false` — built to `oh-clean:test` and
validated with `--local`:

```text
ok: --local: oh-clean:test is already on this daemon (...); not pulling
ok: image contract verified (nothing baked that must be installed at boot)
ok: image-only boot smoke passed (health, Herdr runtime, boot-provisioned harnesses and tools)
...
deployment guard: all checks passed for oh-clean:test
guard rc=0
```

Same guard, same flag, same daemon, opposite verdict from the dirty-tree build —
which is the discrimination the plan's step 5 asked for, reached without needing
an old published tag. It also re-validates the whole branch (the `PNPM_HOME`
move, the healthcheck marker, the fail-closed inversion) on an image built from
the branch rather than on `:latest`.

Host inventories were byte-identical before and after both runs; both test images
were removed afterwards.
