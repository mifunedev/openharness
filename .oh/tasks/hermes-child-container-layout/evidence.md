# Hermes layout implementation evidence

Status: benchmark N/A (not applicable), per operator direction. The benchmark
assesses no applicable Hermes correction outcome and does not block this PR.
Runtime, implementation audit, regression floor, and implementation-head CI pass.
This classification correction does not change the PR's draft status.

Audited implementation head: `465075d642c35834d26a1e745ec4ab58deaf405f`.
PR: https://github.com/mifunedev/openharness/pull/970
Issue: https://github.com/mifunedev/openharness/issues/969
Audit run: `audit-20260905T045951Z-1417917` — `AUDIT-PASS`.
The earlier `audit-20260905T044647Z-1375379` returned `AUDIT-FAIL` for one redundant
test. The owner removed it; the second audit found no remaining simplification.
Independent source review: `4682d22b-7939-440`.

## Why this is better than not doing it

The baseline wrote Hermes configuration outside the workspace and hid shared skills.
The corrected installation uses `~/harness/.hermes` and immediately exposes both
shared and native skills. The baseline assertion exited 1; the corrected assertion
exited 0. The real loader changed the shared fixture from absent to readable while
retaining the native fixture.

The fresh candidate listed 89 skills. Native fixture creation preserved hashes for
121 canonical files, including the shared test fixture. Restart and container
recreation preserved configuration and native/synthetic sentinels byte-for-byte.

The cost is one image environment default, Hermes-specific install reconciliation,
a scoped additive-link mode, tests, and a reusable opt-in smoke scenario. The change
removes the duplicate bootstrap linker. The capability benchmark is N/A for this
correction. The runtime measurements establish the functional benefit; the unchanged
1.44 capability score neither measures nor disproves that benefit.

## What the plan asked for

Reproduce the reported layout failure before correction. Keep the program separate
from runtime state. Merge discovery through an additive canonical link without
replacing native skills or moving credentials. Verify fresh/repeated installation,
launch modes, persistence, isolation, documentation, and independent review.

The operator explicitly approved direct `docker run` with no host bind mounts and
copy-in of candidate artifacts. That amendment replaces the original host-only
provisioning prerequisite for this experiment, not the product lifecycle rules.

## What was built

- The image sets `HERMES_HOME=/home/sandbox/harness/.hermes`.
- Installation selects the container workspace rather than leaking a host checkout path into Docker argv.
- Managed installation validates the launch home before mutation, reconciles shared skills, installs with the target-local home, verifies the executable, and reconciles again.
- Repeated installation repairs integration without reinstalling an existing executable.
- Unset, relative, and conflicting homes fail rather than reporting irreproducible launch success.
- The canonical linker preserves foreign links, occupied slots, linked runtime parents, native skills, and other provider surfaces.
- Ordinary provider linking in another worktree does not claim ownership of the image-global Hermes home.
- CI uses normal image-only Compose boot and built-in health waiting. It runs real discovery before and after repeat installation, then checks a login shell after restart.

## Where the implementation diverged, and why

1. The operator approved direct Docker test provisioning without host binds. Copy-in and Docker-managed volumes replaced the original host-only test prerequisite.
2. Published latest and the checkout use different boot topologies. The experiment tested both rather than treating latest as current-source systemd evidence.
3. CI initially raced D-Bus startup. The final workflow uses existing Compose health waiting, not a new polling framework.
4. The graph originally placed final audit gates inside a story that the audit required to be complete. The gates moved to the PRD's finalization section; the change retained every promotion requirement.
5. The explicit no-host-bind instruction excludes real checkout bind coverage. Copied checkout/payload coverage does not prove host UID remapping or cross-device behavior.

## What remains unverified

- The capability benchmark is N/A for this correction, not a failed requirement or a waived gate. No capability-suite improvement is claimed.
- Current-head CI and PR classification remain separate verification requirements; their observed outcomes belong in the PR body.
- Local eval retains the pre-existing `skills-vendored` red because this session lacks `cc-safety-net` on PATH. No safety bypass was set. The current-source container's provider check passes.
- The public website has a follow-up ticket, not an implemented website change.
- The experiment did not test live models, account authentication, gateways, dashboards, SSH login, or arbitrary profile migration. Those are outside the approved correction.
- The initial run did not capture original streamed installer bytes. The post-run served script matches the installed revision's script.
- The experiment did not exercise host binds, host UID remapping, or cross-device auth migration. The synthetic atomic test checks only same-filesystem replacement, not live authentication.
- The experiment retained every test resource. Teardown still requires operator consent.

## Proof by gate

### Artifacts and provenance

| Artifact | Observed identity |
|---|---|
| Planning/source base | `372581cd96ba2931b8328cff59cbdeeae9a9043f` |
| Public latest image digest | `sha256:4a5598c21d2f941d767191813a1c5cfb06078f0f4f3a16c7357f9651035fdec0` |
| Public latest local image ID | `sha256:093f5ec72ea4e94bddb0ff44612c55b5a7a75714b529c9168be4870cbc278dd2` |
| Public latest CLI | `0.7.0`; native entrypoint with `sleep` PID 1 |
| Hermes | `v0.21.0`, upstream `79445a496c86a19332ad786494b8384d2167e2d0` |
| Post-run served installer SHA-256 | `5854b15670b51a8daae8f59ddfa917062de9f74be261eb73b4b8d719710f8968` |
| Installed revision's `scripts/install.sh` SHA-256 | Same checksum as the post-run served installer |
| Full current-source image | `sha256:a40b0203d9add0843aa2203624027faf3c760cd176c3dc22e1df850a882d5379`, built from `7610c7c4` |
| Final correction | `27568a18`; subsequent relative-home guard copied into the current-source test container and tested |

The original installer response streamed through the catalog pipeline. Its exact
baseline bytes were not retained. The post-run checksum comparison above does not
claim otherwise. Both candidate installations resolved the same Hermes revision.

### Observed commands and results

Baseline:

The supported installation command completed with exit 0:
`docker exec -u sandbox -w /home/sandbox/harness oh-hermes-layout-20260905032825 bash -lc 'oh harness install hermes'`.

The separate path observation printed:

```text
UID=1000 HOME=/home/sandbox HERMES_HOME= OH_PROJECT_ROOT=/home/sandbox/harness
/home/sandbox/.local/bin/hermes
Hermes Agent v0.21.0 (2026.8.31) · upstream 79445a49
Install directory: /home/sandbox/.local/lib/hermes-agent
```

Trimmed real-loader output:

```text
  "home": "/home/sandbox/.hermes",
  "config_exists": true,
  "listing_success": true,
  "count": 54,
  "shared_listed": false,
  "native_listed": true,
  "shared_view": {
    "success": false,
    "error": "Skill 'oh-layout-shared' not found.",
```

The observation invoked installed Hermes `get_hermes_home`, `skills_list`, and
`skill_view` through its own virtual environment. The observation did not substitute a filesystem
listing or a fake executable for discovery.

The new tracked oracle also rejects the baseline's still-unset home:

```text
OH_HERMES_SMOKE=1 bash /home/sandbox/hermes-install-smoke.sh
exit: 1
AssertionError: /home/sandbox/.hermes
```

Fresh latest-derived candidate installation from `/tmp`:

```text
docker exec -u sandbox -w /tmp oh-hermes-candidate-969 oh harness install hermes
exit: 0
Hermes OK: .hermes/skills/openharness -> .oh/skills
hermes: installed
```

Real candidate smoke output:

```json
{"atomic_replace":true,"canonical_files_unchanged":121,"cwd":"/tmp","home":"/home/sandbox/harness/.hermes","native":"oh-layout-smoke-native","result":"PASS","shared":"oh-layout-smoke-shared","skill_count":89,"uid":1000}
```

The same smoke passed in a fresh Bash login shell and an interactive Zsh login
shell. Repeat installation reported `already installed`. SHA-256 comparisons of
`config.yaml`, the native fixture, and the synthetic atomic file showed no difference
after restart.

Full current-source image:

The build used `git archive 7610c7c4c33c2f3daa8eb84c81bb7916cd6d5963` as its
context, `.devcontainer/Dockerfile`, and tag `oh-hermes-current:969`. The build exited 0.

Selected observed commands and output:

```text
$ docker exec oh-hermes-current-969 ps -p 1 -o comm=
systemd
$ docker exec oh-hermes-current-969 systemctl is-active openharness-bootstrap.service openharness-cron.service
active
active
$ docker exec oh-hermes-current-969 systemd-run --quiet --pipe --wait --collect --uid=sandbox /usr/bin/printenv HERMES_HOME
/home/sandbox/harness/.hermes
```

The boot monitor also printed `sandbox healthcheck ok`.

Fresh supported installation, real discovery, repeat installation, login-shell
smoke, and restart also passed in that systemd container. Root metadata checks
confirmed `/.hermes`, `/root/.hermes`, and `/home/sandbox/.hermes` were absent.

Recreation reused only the test's named home volume. The previous container remains
stopped; the new container became active with identical preserved state hashes:

```text
/oh-hermes-current-969 ID=6b729c2c0e26d1f9ec993e87c0436ea99ac9709a162b6480583e0dd2812814db State=running
/oh-hermes-current-969-retained ID=6d5afb8678f03587237fba02ceff31c9b7d322f97f5ad09eb1bf4cd83b405485 State=exited
```

Additional checks:

- Unset and relative launch homes returned exit 1 before installation success.
- A copied `.oh/`-only project under `/tmp/oh-payload-fixture` reconciled successfully without creating `.claude/`.
- A duplicate shared/native skill name produced an upstream collision error on unqualified read. `openharness/oh-layout-duplicate` remained readable. Neither file replaced the other.
- The duplicate experiment added one more disposable shared fixture, so later canonical hash counts were 122 rather than 121.
- Shared-link reads emitted an upstream trust warning but returned `success: true`. No trust or safety feature was disabled.

### Definition-of-done mapping

| Gate | Evidence |
|---|---|
| D1 | Latest-image path/discovery failure, immutable image identity, upstream revision, and labeled installer hashes. |
| D2 | Fresh supported installs as UID 1000 passed in latest-derived and current-source containers. |
| D3 | Direct `/tmp` and login-shell checks resolve the project home; unintended runtime homes are absent. |
| D4 | Actual Hermes listing and reading pass for shared and native fixtures. |
| D5 | Filesystem collision tests, canonical hashes, duplicate-read errors, and preserved sentinels pass. |
| D6 | Shell modes, systemd environment, restart, and retained-volume recreation pass. |
| D7 | Image-seeded and copied payload contexts pass; actual host binds remain explicitly excluded. |
| D8 | Docker metadata shows only test volumes, no socket/bind/ports, and no live state sharing. Other-provider tests pass. |
| D9 | New tracked smoke exits 1 against the baseline home defect and 0 against candidates. |
| D10 | 924 final tests, typecheck/build, source-image build, six implementation-head CI checks, local eval delta, and documentation/index checks pass. Capability benchmark: N/A for this correction. |
| D11 | Correlated implementation audit: AUDIT-PASS, no residual simplification findings. |

### Automated checks

- `pnpm run build:harness`: exit 0.
- `pnpm run typecheck`: exit 0.
- `pnpm test`: 59 files, 924 tests passed after removing one redundant test; the prior 925-test run also passed.
- Bash syntax, `git diff --check`, and affected Hermes prose checks: exit 0.
- Wiki index regeneration and `wiki-readme-index.sh`: PASS.
- Canonical eval: exit 0 across 138 probes after exposing the already-installed Python interpreter on the invocation's PATH. The initial attempt failed two interpreter-dependent probes; both passed on retry. One pre-existing `skills-vendored` red remains, with unchanged delta.
- The image-only container cannot satisfy the Git-tracking assertion inside `skills-vendored.sh`; it has no `.git` directory. Its actual canonical provider `--check` returned exit 0. That result does not claim Git tracking inside the image.
- Exact correction-head CI: all six checks passed after the startup-race correction.

CI evidence for `27568a18`:

- Compatibility: https://github.com/mifunedev/openharness/actions/runs/33944352750
- Harness checks and eval: https://github.com/mifunedev/openharness/actions/runs/33944352792
- Full image build/boot validation: https://github.com/mifunedev/openharness/actions/runs/33944352754

An earlier CI attempt failed because `systemctl` ran before the D-Bus socket existed.
The correction reuses `docker compose up --wait` with the existing image-only
Compose file. The subsequent optional-harness installation job passed in 2m35s.

### Correlated implementation audit

Observed terminal lines:

```text
- **Verdict**: AUDIT-PASS
- **Gates**: graph 8/8, artifact contract satisfied · eval 0 · promotable true, evidenceComplete true · ui n/a · slop +1088/-171 (residual 0)
SIMPLICITY-RESIDUAL: 0
AUDIT-EVIDENCE: AUDIT-PASS
audit -- run-id=audit-20260905T045951Z-1417917 target=implementation state=complete verdict=AUDIT-PASS exit=0 started=2026-09-05T04:59:51Z finished=2026-09-05T05:01:09Z
```

The audit reused the commit-keyed eval record at `465075d6`. It reported no TypeScript
function newly over CCN 10. Shell branch points were a proxy, not a CCN measurement.
The simplify counter did not decrease after evidence additions; the auditor still
found zero concrete residuals.

### Benchmark decision

Observed scores: current `suite score = 1.44`; base `suite score = 1.44`.
Regression floor: `runnerExit=0`, no new regressions, one disclosed pre-existing red.

Classification: **N/A — not applicable to this Hermes correction**.

The existing capability benchmark does not assess the runtime-home and shared-skill
discovery behavior changed by this PR. Its unchanged score does not indicate a
failed correction. The targeted runtime checks, regression floor, CI, and audits
remain the applicable verification evidence.

The operator directed this classification correction. It supersedes the earlier
NOT-BENEFICIAL label and removes the resulting benchmark hold and waiver request.
No waiver, passing capability score, or rollback is necessary. General benchmark
policy and the scoreboard remain unchanged.

### Actual Knowledge Impact

| Page | State | Reason |
|---|---|---|
| `compose-env-boundary` | UPDATED | Added the sandbox-internal Hermes default and install/link postconditions; no Compose setting added. |
| `fresh-machine-setup` | UPDATED | Added home separation, immediate integration, legacy-container requirements, and persistence distinctions. |
| `oh-cli-portable-lifecycle` | NOT-AFFECTED | Registry, bundled asset staging, lifecycle routing, and update ownership remain unchanged. |
| `sandbox-dependency-installs` | NOT-AFFECTED | The changed entrypoint region removes only duplicate Hermes linking; the pnpm fingerprint/install paths retain their behavior. |

The two updated pages retain source-backed structure and advance `verified_at` to
the checked correction commit. The generated index matches their frontmatter.
The public-site follow-up is https://github.com/mifunedev/openharness-web/issues/41;
the ticket is not a claim that the website already changed.

`/spec retro` reported five hypotheses and nominated no new probe. `/wiki compile`
patched the existing `pattern-evals-unexercised-oracle` with pinned baseline/candidate
corroboration. Existing workaround text and provenance remain intact. The index,
schema, related links, source resolution, and pattern-persistence checks passed.
The source-resolution check disclosed 27 older pins unverifiable in this clone depth.

### Independent source review

The first review found host/container path confusion, worktree home conflicts, and
false success on old unset-home environments. Each finding received a code correction
and regression coverage. A second read-only review found no concrete remaining bug
in the reviewed implementation. That review did not claim CI or pipeline completion.

### Retained resources

Containers:

- `oh-hermes-layout-20260905032825`
- `oh-hermes-candidate-969`
- `oh-hermes-current-969`
- `oh-hermes-current-969-retained` (stopped)

Volumes:

- `oh-hermes-layout-20260905032825-home`
- `oh-hermes-candidate-969-home`
- `oh-hermes-current-969-home`

Candidate image tags: `oh-hermes-candidate:969`, `oh-hermes-current:969`.
The experiment did not change the existing `oh-sbx-local` runtime configuration,
installed harnesses, or credentials. Source edits and test dependencies remain in the
isolated worktree inside that sandbox. The experiment copied no live runtime state
into the test containers.
