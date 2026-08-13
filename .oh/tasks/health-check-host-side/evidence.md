# Evidence — health-check-host-side

- **PR**: #764 (mifunedev/openharness, base `development`) · **Branch**: `task/762-health-check-host-side`
- **Audit run**: `audit-20260813T060219Z-296946` · **Verdict**: `PR-AUDIT-PROMOTABLE`
- **Prior run**: `audit-20260813T055733Z-263366` → `PR-AUDIT-BLOCKED` (recorded below; it caught a real conflict)
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
| Regression floor | `bash .oh/skills/eval/run.sh` | `ran 103 probe(s)`, rc=0, zero `REGRESSION`/`ERROR`; 3 `SKIPPED` all pre-existing | PASS |
| New behavioural probe | `health-check-socket-degrade` | `PASS: preflight resolves every endpoint, contacts no daemon when host-only, and refuses to call a dead socket available` | PASS |
| Rejection (attribution) | 11 mutations, each expected to fire its **own** assertion | `11 attributed, 0 unattributed`; both files restored byte-identical | PASS |
| Constraining probes | the 3 probes that pin this skill | `health-check-docker-stats` PASS, `memory-log-locked-append` PASS, `audit-dispatcher-contract` PASS | PASS |
| Boot validation | `bash .oh/scripts/link-providers.sh --check` | `Providers OK: .pi/.claude/.codex skills -> .oh/skills (vendored pack present)`, rc=0 | PASS |
| CI | `gh pr checks 764` | 4/4 `pass` — Boot Path Lint 26s, Eval Probe Regression Gate 28s, Lint/Typecheck/Build/Test 37s, Validate sandbox compose 2m4s | PASS |
| Merge state | `gh pr view 764` | `mergeable=MERGEABLE state=CLEAN draft=false` | PASS |
| PR audit | `audit-run.sh pr 764 -- route-driver.sh` | `promotable: true`, `evidenceComplete: true` → `PR-AUDIT-PROMOTABLE` | PASS |
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
ran 103 probe(s); wrote .oh/evals/RESULTS.md
$ grep -E '\| (REGRESSION|ERROR|TIMEOUT) \|' .oh/evals/RESULTS.md
(no output)
$ grep 'health-check' .oh/evals/RESULTS.md
| health-check-docker-stats    | A | ... | PASS | ...
| health-check-socket-degrade  | A | ... | PASS | issue #762 (refs #756) — /health-check degrades to one statement, not nine failures
```

Diff against the pre-change scoreboard was exactly one added row — no green→red
transition. The 3 `SKIPPED` rows (`autopilot-preflight-gate`,
`debugmcp-availability`, `next-dev-prod`) were `SKIPPED` before this change.

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

## Honest notes

- **`title-convention` is a non-gating pre-existing flag.** It fires because
  `pr-classify.sh:72` tests `^FROM .+ TO .+$`, which no PR in this repository
  matches — the five most recent all use `type: description`. `promotable` is
  `($rfr or $rtm)` and does not read flags, so it did not affect the verdict. Left
  alone deliberately: contorting this title would not fix a classifier that flags
  every PR. Worth its own ticket, not this one.
- **`readyForReview: false` with `readyToMerge: true`** is correct, not a
  contradiction: the PR was never a draft, so there is nothing to promote *to*
  review. The remaining gate is the human merge.
- **Diff correctness was not audited** — `references/pr.md` places it outside the
  route's scope. It is covered instead by the two pre-build adversarial critics
  (`critique.md`) and by the rejection harness above.
- **No merge was performed and none will be.** `gh pr merge` was never invoked; the
  human owns that gate.
