# Evidence — health-check-host-side

- **PR**: #764 (mifunedev/openharness, base `development`) · **Branch**: `task/762-health-check-host-side`
- **Audit run**: `audit-20260814T030749Z-1949989` · **Verdict**: `PR-AUDIT-PROMOTABLE`, `flags: (none)`
  - Head at audit time: `8d853d89`. Log terminal state: `complete`, exit `0`.
  - That run audited every implementation and scoreboard change. The run could not
    audit the commit that adds this paragraph, because that commit did not exist
    yet. A comment on PR #764 carries a final confirming `/audit pr` run against the
    head that includes this file. That comment closes the correlation without
    regress.
- **Prior runs**, each recorded below because each caught something real:
  - `audit-20260813T055733Z-263366` → `PR-AUDIT-BLOCKED` — a genuine merge conflict
  - `audit-20260813T060219Z-296946` → `PR-AUDIT-PROMOTABLE` with `flags: title-convention` — a genuine title defect I dismissed before fixing it
  - `audit-20260813T063007Z-386144` → `PR-AUDIT-PROMOTABLE` — superseded by a second conflict when `development` moved again
  - `audit-20260814T025409Z-1913061` → `PR-AUDIT-PROMOTABLE` at head `71053ee8` — superseded when `development` moved a fourth time
- **Closes**: #762 · **Refs**: #756, #731

Every claim below quotes a command that ran and its real output. Nothing here is
predicted or reconstructed. Where a gate could not be executed it is recorded as a
gap, not as a pass.

## What was broken, and what now holds

`/health-check` reached the Docker daemon from inside the sandbox. #756 removed that
socket as a host-root escape path, and because the `docker` CLI is still installed
the skill did not fail once — it failed nine times per invocation, each with the
same connection error, while its memory/disk/CPU steps kept reporting the
**container's** numbers under host framing.

What holds now: a socket-less invocation makes **zero** Docker calls, emits exactly
one statement naming why and what to do instead, labels every metric with the scope
it measured, and **refuses** to render a Disk verdict for a build-shaped target it
cannot size. Docker triage is relocated to a procedure addressed to the orchestrator
at the host project root — a role root `AGENTS.md` already defines and already grants
`docker`.

## Proof by gate

| Gate | What was checked | Observed | Result |
|------|------------------|----------|--------|
| Task graph | `prd.json` 4 stories, artifact contract | 4/4 `status: completed`, `passes: true`; `prd.md` + `prd.json` + `critique.md` + `progress.txt` + this file committed under `.oh/tasks/health-check-host-side/` | PASS |
| Regression floor | `bash .oh/skills/eval/run.sh` | `ran 106 probe(s)`, rc=0, zero `REGRESSION`/`ERROR`; 4 `SKIPPED` all pre-existing | PASS |
| New behavioural probe | `health-check-socket-degrade` | `PASS: preflight resolves every endpoint, contacts no daemon when host-only, and refuses to call a dead socket available` | PASS |
| Rejection (attribution) | 11 mutations, each expected to fire its **own** assertion | `11 attributed, 0 unattributed`; both files restored byte-identical. Still binding: both files are byte-identical at `8d853d89` to the commit the harness ran against — see "Byte identity across the merges" | PASS |
| Constraining probes | the 3 probes that pin this skill | `health-check-docker-stats` PASS, `memory-log-locked-append` PASS, `audit-dispatcher-contract` PASS | PASS |
| Boot validation | `bash .oh/scripts/link-providers.sh --check` | `Providers OK: .pi/.claude/.codex skills -> .oh/skills (vendored pack present)`, rc=0 | PASS |
| Typecheck / build / test | `pnpm run typecheck`, `pnpm run build:harness`, `pnpm test:scripts` | `tsc --noEmit` clean; `dist/oh.js 79.7kb`; `Test Files 42 passed (42)`, `Tests 590 passed (590)` | PASS |
| Shellcheck | the CI glob, plus the two new scripts | CI glob rc=0; `scope-preflight.sh` and `health-check-socket-degrade.sh` rc=0. Verified by rejection: a control script with `SC2034`/`SC2154`/`SC2164` exits 1. Recorded from the build session. `command -v shellcheck` finds no binary in the current container. The CI **Boot Path Lint (shellcheck + hadolint)** job re-verifies the final head, and it passed in 23s | PASS (CI-owned) |
| CI | `gh pr checks 764` | 4/4 `pass` — Boot Path Lint 23s, Eval Probe Regression Gate 24s, Lint/Typecheck/Build/Test 37s, Validate sandbox compose 2m10s | PASS |
| Merge state | `gh pr view 764` | `mergeable=MERGEABLE`, `mergeStateStatus=CLEAN`, `isDraft=false` | PASS |
| PR audit | `audit-run.sh pr 764 -- route-driver.sh` | `promotable: true`, `evidenceComplete: true`, `flags: (none)` → `PR-AUDIT-PROMOTABLE` | PASS |
| PR title | `/git` SKILL.md:82 literal format | `FROM task/762-health-check-host-side TO development` — flag cleared on the final run | PASS (after correction) |
| Diff correctness | — | Explicitly outside `/audit pr` scope (`references/pr.md`: "Diff correctness is outside audit scope"). Covered instead by the two pre-build critics and the rejection harness. | GAP, stated |

## Acceptance criteria → proof

### AC 1 — a single clear statement, not a series of failed calls

Observed in this socket-less container:

```
$ bash .oh/skills/health-check/scripts/scope-preflight.sh
SCOPE=container
DOCKER_CLI=present
DOCKER_ENDPOINT=unix:///var/run/docker.sock
DOCKER_TRIAGE=host-only
METRICS_SCOPE=container
HEALTH-CHECK SCOPE-NOTICE: Docker triage is host-only — no Docker socket at /var/run/docker.sock (this container). The sandbox Docker socket was removed deliberately in issue #756, so steps 2 and 5 and the tier 1-4 reclaim ladder are SKIPPED here and were not attempted. Run the "Host-side Docker triage" block in .oh/skills/health-check/SKILL.md as the orchestrator at the host project root, then paste its output back into this session. Until that output arrives, Docker headroom is UNKNOWN: the memory, swap, disk and CPU figures in this report measure this container, not the Docker host.

$ bash .oh/skills/health-check/scripts/scope-preflight.sh | grep -c 'HEALTH-CHECK SCOPE-NOTICE:'
1
```

Exit status observed as `rc=0`.

**Zero Docker calls, proven rather than asserted.** A `docker` shim first on `PATH`
appends every invocation's subcommand to a sentinel. After a host-only run:

```
shim invocations: []  (must contain no 'version')
```

The sentinel is empty — the branch invoked `docker` not at all.

The nine-failure baseline it replaces, from the same container:

```
$ ls -la /var/run/docker.sock
ls: cannot access '/var/run/docker.sock': No such file or directory
$ docker ps
failed to connect to the docker API at unix:///var/run/docker.sock; check if the
path is correct and if the daemon is running: dial unix /var/run/docker.sock:
connect: no such file or directory
$ docker system df
failed to connect to the docker API at unix:///var/run/docker.sock; check if the
path is correct and if the daemon is running: dial unix /var/run/docker.sock:
connect: no such file or directory
$ command -v docker
/usr/bin/docker
```

The last line is why detection tests the endpoint and not the binary.

### AC 2 — Docker steps relocated host-side or explicitly marked host-only

Both, not one substituting for the other. `SKILL.md` carries host-only markers on
step 2, step 5, step 7 and the tier 1–4 reclaim ladder, each gated on the preflight
result, plus a `## Host-side Docker triage` section addressed to the orchestrator
with the round trip specified in both directions and an `UNKNOWN` fallback when
nobody returns. Pinned by probe assertion A9:

```
$ bash .oh/evals/probes/health-check-socket-degrade.sh   # after removing every host-only marker
REGRESSION: A9 SKILL.md carries no host-only marker
```

### AC 3 — non-Docker checks state they measure the container

`METRICS_SCOPE` is carried into step 1's reading guidance, the verdict-table header,
and the step-8 log entry. Live end-to-end run against a build-shaped target:

```
--- step 1: snapshot (labelled with METRICS_SCOPE) ---
=== MEMORY ===
               total        used        free      shared  buff/cache   available
Mem:            15Gi       5.8Gi       5.5Gi        66Mi       4.5Gi       9.7Gi
=== DISK ===
Filesystem      Size  Used Avail Use% Mounted on
overlay        1007G  116G  841G  13% /
--- steps 2, 5, 7 + reclaim ladder: SKIPPED (host-only). Docker calls issued: 0 ---
Scope: container · Docker triage: host-only
```

Note the shape of the hazard this closes: `13%` used looks like abundant headroom.
It describes the container's overlay, not the Docker host, and under `host-only` with
a build-shaped target the Disk row is now rendered `⚪ N/A` rather than green.

### AC 4 — `AGENTS.md` skills-table entry matches the new scope

`AGENTS.md:181` and `.oh/templates/AGENTS.md` each pair *container* with the
memory/disk/CPU triage and *host-only* with the Docker reclaim. The frontmatter
`description` **and** `TRIGGER` list were reworded too — both are injected into every
session, so they are the more load-bearing claim.

`CLAUDE.md` needed no separate edit, verified rather than assumed:

```
$ ls -la CLAUDE.md
lrwxrwxrwx 1 sandbox sandbox 9 ... CLAUDE.md -> AGENTS.md
```

The edit was then observed live through that symlink in this session's reloaded
context.

## Verification by rejection, with attribution

Exit 0 proves nothing, and a probe turning red proves only that *something* broke.
Each mutation was required to fire **its own named assertion**:

```
=== baseline (unmutated) must PASS ===
  rc=0 :: PASS: preflight resolves every endpoint, contacts no daemon when host-only, and refuses to call a dead socket available

=== mutations against scope-preflight.sh ===
  OK   A4   available decided without a round-trip (dead daemon passes) fired=[A4]
  OK   A2   host-only branch issues a docker call                      fired=[A2]
  OK   A3   notice emitted even when the daemon answered               fired=[A3]
  OK   A1   two notice lines in the host-only branch                   fired=[A1,A4]
  OK   A1   non-zero exit on the host-only branch                      fired=[A1,A4]
  OK   A7   terminal 'unverified' state reintroduced                   fired=[A4,A7]
  OK   A6   absent CLI classified available                            fired=[A6]

=== mutations against SKILL.md ===
  OK   A8   SKILL.md no longer invokes the preflight                   fired=[A8]
  OK   A9   SKILL.md carries no host-only marker                       fired=[A9]
  OK   A9   SKILL.md lost the docker stats step                        fired=[A9]
  OK   A8   SKILL.md no longer branches on DOCKER_TRIAGE               fired=[A8]

=== rejection summary: 11 attributed, 0 unattributed ===
  preflight restored
  SKILL.md restored
```

`A4` co-firing on three cases is a real consequence, not slippage: duplicating the
notice, exiting non-zero, and renaming the state each also break the
dead-daemon arm's own notice-count or value assertion.

**Two defects were found in the test method itself before it was trusted.** The shim
initially logged `-H`'s *value* rather than the subcommand, so the `available` arm's
`version` assertion would have passed for the wrong reason; and the absent-CLI arm
pointed `PATH` at an empty directory, which broke `bash` itself and made the arm
silently skip (`note: A6 skipped — minimal PATH could not run the preflight`). Both
were fixed before the harness was used as evidence.

## Regression floor

```
$ bash .oh/skills/eval/run.sh
ran 106 probe(s); wrote .oh/evals/RESULTS.md
$ grep -E '\| (REGRESSION|ERROR|TIMEOUT) \|' .oh/evals/RESULTS.md
(no output)
$ grep 'health-check' .oh/evals/RESULTS.md
| health-check-docker-stats    | A | ... | PASS | ...
| health-check-socket-degrade  | A | ... | PASS | issue #762 (refs #756) — /health-check degrades to one statement, not nine failures
```

Diff against the pre-change scoreboard was exactly one added row — no green→red
transition. The 4 `SKIPPED` rows (`autopilot-preflight-gate`,
`debugmcp-availability`, `next-dev-prod`, `registry-portability`) were `SKIPPED`
before this change.

The count moved from 103 to 106 because `development` kept adding probes while this
branch was open, across three merges. The probe directory held 104 files at the
original merge base `8f2a4ae8` and 105 at `4802b3ea`; this third merge added exactly
one more, `memory-dir-shared-across-worktrees.sh` (from #772), for 106. Every probe
that landed after this branch opened is green here, so the branch does not regress
later work.

`memory-log-locked-append` deserves a specific note: it asserts **two** things about
this skill — the literal `AUDIT_RUN_ID` (lines 16–18) and the literal locked-append
line (line 19). The plan's first draft named only the second; a critic caught the
omission and the probe source confirmed it. Both strings survive the rewrite.

## The blocked audit, and what it caught

The first audit run returned `PR-AUDIT-BLOCKED`, and it was right:

```
| Mergeability | CONFLICTING |
| Clean state (`mergeStateStatus`) | DIRTY |
| primaryState | conflicting-behind |
```

#760 had landed on `development` after my merge, touching `.oh/evals/RESULTS.md` and
`CHANGELOG.md`. Resolution followed the stated policy rather than improvisation:
`CHANGELOG.md` auto-merged with both entries intact (verified by counting each), and
`.oh/evals/RESULTS.md` was **regenerated** by rerunning `/eval` against the merged
base rather than hand-resolved — a hand-merged scoreboard describes neither branch.
#760's own probe was then confirmed still green on this branch
(`cc-safety-net-wiring PASS`).

## The third merge, and the union resolution

`development` moved again after `4802b3ea`, and the PR returned to
`mergeable: CONFLICTING`, `mergeStateStatus: DIRTY`. Nine upstream commits landed,
conflicting in the same two files.

`CHANGELOG.md` conflicted because both sides inserted a bullet at the top of
`### Changed`. The resolution keeps both entries, this branch's first, so the list
stays newest-first.

`.oh/evals/RESULTS.md` conflicted across the whole table. Both sides held 105 rows.
Ignoring the run timestamp, the two sides differed in exactly one row each:

```
$ diff <ours-without-timestamps> <theirs-without-timestamps>
55d54
< | health-check-socket-degrade | A |  | PASS | issue #762 (refs #756) — ...
58a58
> | memory-dir-shared-across-worktrees | A |  | PASS | .oh/scripts/oh-path (#768) |
```

Taking either side alone would have silently dropped a probe. The resolution is the
union, then a full `/eval` rerun, which rewrote the table from the probe directory
rather than trusting the hand-built union. Both rows are present and `PASS` in the
regenerated scoreboard.

## Byte identity across the merges

None of the four merges changed this branch's implementation. Blob hashes at the
audited commit `4802b3ea` and at the merged head `8d853d89`:

```
$ git rev-parse 4802b3ea:<path> HEAD:<path>
.oh/skills/health-check/scripts/scope-preflight.sh   b61e17bc → b61e17bc
.oh/evals/probes/health-check-socket-degrade.sh      4793bf75 → 4793bf75
.oh/skills/health-check/SKILL.md                     132c5851 → 132c5851
```

This matters for one specific claim. The 11-mutation attribution harness ran against
those exact bytes. Identical hashes keep that result binding on the code this PR
merges. Without them, the result would carry forward on assumption.

## Honest notes

- **`title-convention` was a correct finding about this PR, and I first dismissed it
  wrongly.** I checked the five most recent PRs, saw them all using
  `type: description`, and concluded the classifier's `^FROM .+ TO .+$` test matched
  nothing and was therefore noise. That was a sampling error. Over the last 30 PRs,
  20 use `FROM <head> TO <base>`, and `/git` SKILL.md:82 states the rule outright:
  *"Format: `FROM <source-branch> TO <target-branch>` (literal)"*. I had conflated
  it with the **commit** format (`<type>: <description>`, SKILL.md:91), which this
  PR's commits do follow. The title is now
  `FROM task/762-health-check-host-side TO development` and the flag clears. The
  classifier was right; the audit was right; my dismissal was wrong.
  Recorded rather than quietly amended, because "the checker is broken" is the most
  expensive wrong conclusion available when a checker disagrees with you.
- **`readyForReview: false` with `readyToMerge: true`** is correct, not a
  contradiction: the PR was never a draft, so there is nothing to promote *to*
  review. The remaining gate is the human merge.
- **Diff correctness was not audited** — `references/pr.md` places it outside the
  route's scope. It is covered instead by the two pre-build adversarial critics
  (`critique.md`) and by the rejection harness above.
- **The audit route performed no merge.** `/audit pr` is report-only, and it invoked
  neither `gh pr ready` nor `gh pr merge`. The merge is a separate, explicitly
  authorized step taken only after CI went green, the native verdict came back
  `PR-AUDIT-PROMOTABLE`, and the branch reported `MERGEABLE`/`CLEAN`.
- **The `103 probe(s)` figure in an earlier draft of this file was stale, not wrong
  at the time.** That figure described the first full run. Four `development`
  merges later the suite holds 106 probes. I refreshed the figure rather than leave
  it implying that a run measured this tree when no run had.
- **The fourth `development` merge (`c95caf01`, prompt-miner score clamp) merged
  clean and added no probe.** The regenerated scoreboard differs from the previous
  one by timestamps alone: every changed row is a `last-run` field, and no probe
  changed status. Verified by normalising the timestamp out of the diff and
  confirming each remaining line appears on both sides.
