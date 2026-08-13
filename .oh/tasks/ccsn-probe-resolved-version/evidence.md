# Evidence — ccsn-probe-resolved-version

- **PR**: #760 (`mifunedev/openharness`, base `development`) · **Branch**: `bug/759-ccsn-probe-resolved-version`
- **Issue**: [#759](https://github.com/mifunedev/openharness/issues/759)
- **Audit run**: `<AUDIT_RUN_ID>` · **Verdict**: `<NATIVE-VERDICT>`

Every command below was executed. Every output block is real and trimmed, never
reconstructed. Where a gate was not run, or where a claim is weaker than it
looks, this document says so.

## What was broken, and what now holds

Assertion (d) of `.oh/evals/probes/cc-safety-net-wiring.sh` matched the declared
dependency range in `.pi/npm/package.json` instead of the resolved cc-safety-net
version. npm's default `save-prefix` writes `"^1.0.6"` into that boot-generated
manifest, so the tier-A probe reported `REGRESSION` on correct wiring. The
assertion now reads the resolved version from the lockfile and from the installed
package's own manifest, and reports drift that is real. The observable proof is a
single fixture on the default code path: the pre-change probe exits 1 on it and
the post-change probe exits 0, and stripping assertion (d) from the fixed probe
makes a drifted tree exit 0 — so the rejection belongs to this assertion and not
to its neighbours.

## Proof by gate

| Gate | What was checked | Observed | Result |
|------|------------------|----------|--------|
| Task graph | `prd.json` stories validated against their own acceptanceCriteria | 4/4 stories `passes: true`, marked by the First Mate after re-running the load-bearing cases personally | PASS |
| Regression floor | `/eval` runner, full suite, pre-change and post-change on the same machine | both runs `rc=0`; 96 PASS / 3 SKIPPED / 0 REGRESSION; per-probe status diff identical | PASS |
| Regression floor, re-run after merge | `/eval` runner on the merged base (§ 9) | `rc=0`; 102 probes, 99 PASS / 3 SKIPPED / 0 REGRESSION | PASS |
| Independent re-verification | Every load-bearing case re-run from scratch by a second session (§ 9) | before/after, 10-case rejection matrix, mutation, interpreter guard — all reproduced | PASS |
| Verification by rejection | 11 negative cases + a positive control + an assertion-stripped mutant | every case as expected; mutant exits 0 where the real probe exits 1 | PASS |
| Neighbouring assertions | (a),(b),(c),(e),(f) + live-binary block, textually and behaviorally | diff shows no change; with `node` off `PATH` a broken `(a)` still exits 1 naming `(a)` | PASS |
| Promotable / CI | `/audit pr` focused classifier for PR #760 | `<classifier summary>` | `<result>` |
| UI | browser criteria | n/a — no story declares browser verification | N/A |

## Observed output

### 1. The defect, reproduced against unmodified `development`

The main checkout is on `development` and carries the real, gitignored
`.pi/npm/` runtime tree.

```text
$ (cd /home/sandbox/harness && git rev-parse --abbrev-ref HEAD && bash .oh/evals/probes/cc-safety-net-wiring.sh)
development
REGRESSION: cc-safety-net wiring gaps:
  - (d) .pi/npm/package.json exists but pins a different cc-safety-net than 1.0.6
rc=1
```

Every other oracle disagreed with that verdict:

```text
$ command grep -n 'cc-safety-net' /home/sandbox/harness/.pi/settings.json
34:    "npm:cc-safety-net@1.0.6",
$ command grep -n 'npm install -g cc-safety-net' /home/sandbox/harness/.devcontainer/Dockerfile
156:RUN npm install -g cc-safety-net@1.0.6
$ command grep -n -A2 '"node_modules/cc-safety-net"' /home/sandbox/harness/.pi/npm/package-lock.json
438:    "node_modules/cc-safety-net": {
439-      "version": "1.0.6",
$ command grep -n '"version"' /home/sandbox/harness/.pi/npm/node_modules/cc-safety-net/package.json
3:  "version": "1.0.6",
$ npm ls -g cc-safety-net --depth=0
/usr/lib
`-- cc-safety-net@1.0.6
$ cc-safety-net --version
1.0.6
```

### 2. Before and after, one identical fixture, default code path

This is the load-bearing comparison. It runs in the worktree with
`CC_SAFETY_NET_PROBE_PI_NPM` **unset**, so the probe resolves `$ROOT/.pi/npm`
itself. The fixture mirrors the three real shapes: a manifest declaring
`"cc-safety-net": "^1.0.6"`, a lockfileVersion-3 lock resolving `1.0.6`, and an
installed package at `1.0.6`.

```text
$ echo "override is [${CC_SAFETY_NET_PROBE_PI_NPM-<unset>}]"
override is [<unset>]

$ git show HEAD:.oh/evals/probes/cc-safety-net-wiring.sh > .oh/evals/.fm-head-probe.sh
$ bash .oh/evals/.fm-head-probe.sh                                    # BEFORE
REGRESSION: cc-safety-net wiring gaps:
  - (d) .pi/npm/package.json exists but pins a different cc-safety-net than 1.0.6
rc=1

$ bash .oh/evals/probes/cc-safety-net-wiring.sh                        # AFTER
PASS: cc-safety-net wiring intact across providers/image/compose and live binary denies 'git reset --hard HEAD'
rc=0
```

The pre-change probe had to be extracted **inside** the worktree, because the
probe derives `ROOT` from `git rev-parse --show-toplevel` in its own directory; a
copy under `/tmp` would have resolved a bogus root and proven nothing. It was
placed outside `probes/` and dot-prefixed so no concurrent suite run could pick
it up, and deleted afterwards.

### 3. The default path really is read — not just the override

With the override still unset, the fixture's resolved version was changed to
`1.0.9`:

```text
$ printf '{"name":"cc-safety-net","version":"1.0.9"}' > .pi/npm/node_modules/cc-safety-net/package.json
$ bash .oh/evals/probes/cc-safety-net-wiring.sh
REGRESSION: cc-safety-net wiring gaps:
  - (d) .pi/npm/node_modules/cc-safety-net/package.json resolves cc-safety-net 1.0.9, not the pinned 1.0.6 — reinstall .pi/npm, or bump the pin in .pi/settings.json + .devcontainer/Dockerfile
rc=1
```

This rules out a fix that only works through the test override.

### 4. Mutation check — the exit code belongs to assertion (d)

Against the same drifted default-path tree, with assertion (d) removed:

```text
$ command sed '48,131d' .oh/evals/probes/cc-safety-net-wiring.sh > .oh/evals/.fm-mutant.sh
$ bash -n .oh/evals/.fm-mutant.sh && echo "mutant syntax ok"
mutant syntax ok
$ command grep -c 'd_check\|d_json_read\|(d)' .oh/evals/.fm-mutant.sh
0
$ bash .oh/evals/.fm-mutant.sh
PASS: cc-safety-net wiring intact across providers/image/compose and live binary denies 'git reset --hard HEAD'
mutant rc=0
```

Same root, same tree, same command shape. The only difference is the presence of
assertion (d), so the `rc=1` in section 3 is attributable to it alone. This
matters because a critic demonstrated that a bare fixture root already exits 1
with six failure lines, `(a)` through `(f)` — an exit-code-only rejection test is
satisfied even by a deleted assertion.

### 5. Fresh clone, and the real tree

```text
$ rm -rf .pi/npm                                        # fixture removed
$ bash .oh/evals/probes/cc-safety-net-wiring.sh
PASS: cc-safety-net wiring intact across providers/image/compose and live binary denies 'git reset --hard HEAD'
rc=0

$ CC_SAFETY_NET_PROBE_PI_NPM=/home/sandbox/harness/.pi/npm bash .oh/evals/probes/cc-safety-net-wiring.sh
PASS: cc-safety-net wiring intact across providers/image/compose and live binary denies 'git reset --hard HEAD'
rc=0
```

The second run reads the real `development` runtime tree — the exact state that
is red in section 1 — read-only. Its checksums were recorded before and after
every run in this document and never changed:

```text
$ sha256sum /home/sandbox/harness/.pi/npm/package.json /home/sandbox/harness/.pi/npm/package-lock.json /home/sandbox/harness/.pi/npm/node_modules/cc-safety-net/package.json
8c3384d862c86165f86ddd5892c218a214ddfa51877acc5dad72edcf0c62bf26  .../package.json
ba3d80da0cdb7cc07519e0c66bd2a29d992f1d2b212640671f73ecd0433a6aa5  .../package-lock.json
2e57b465553ba97e1e6f7a37655fc52e31cad4ca739140bb7af40d052e3d88c8  .../node_modules/cc-safety-net/package.json
```

### 6. Rejection matrix

Eleven cases. Cases 1–10 keep `ROOT` at the real worktree and vary only
`CC_SAFETY_NET_PROBE_PI_NPM`, so unrelated assertions cannot supply the exit
code. `$SP` abbreviates the scratchpad path.

| # | Case | rc | gap lines | all `(d)`? |
|---|------|----|-----------|-----------|
| 1 | drift, installed package only (`1.0.7`) | 1 | 1 | yes |
| 2 | drift, lockfile only (`1.0.7`) | 1 | 1 | yes |
| 3 | drift, both sources | 1 | 2 | yes (one per source, DD-2) |
| 4 | manifest declares exactly `1.0.6`, lock resolves `1.0.7` | 1 | 1 | yes |
| 5 | declares cc-safety-net, resolves nothing (R5) | 1 | 1 | yes |
| 6 | override names a missing directory (R1) | 1 | 1 | yes |
| 7 | override names an existing **empty** directory (R6) | 1 | 1 | yes |
| 8 | **mutant**: assertion (d) stripped, case-1 tree | 0 | 0 | — |
| 9 | positive control: lock + installed both `1.0.6` | 0 | 0 | — |
| 10 | unreadable JSON (R4) | 1 | 1 | yes |
| 11 | `node` absent from `PATH`, scratch repo root | see below | — | — |

Representative lines, verbatim:

```text
$ CC_SAFETY_NET_PROBE_PI_NPM=$SP/rej/c2-drift-lock-only bash .oh/evals/probes/cc-safety-net-wiring.sh
REGRESSION: cc-safety-net wiring gaps:
  - (d) $SP/rej/c2-drift-lock-only/package-lock.json resolves cc-safety-net 1.0.7, not the pinned 1.0.6 — reinstall .pi/npm, or bump the pin in .pi/settings.json + .devcontainer/Dockerfile

$ CC_SAFETY_NET_PROBE_PI_NPM=$SP/rej/c5-declared-unresolved bash .oh/evals/probes/cc-safety-net-wiring.sh
REGRESSION: cc-safety-net wiring gaps:
  - (d) $SP/rej/c5-declared-unresolved/package.json declares cc-safety-net ^1.0.6 but nothing resolves it (pin 1.0.6) — reinstall .pi/npm, or bump the pin in .pi/settings.json + .devcontainer/Dockerfile

$ CC_SAFETY_NET_PROBE_PI_NPM=$SP/rej/c7-empty-dir bash .oh/evals/probes/cc-safety-net-wiring.sh
REGRESSION: cc-safety-net wiring gaps:
  - (d) CC_SAFETY_NET_PROBE_PI_NPM='$SP/rej/c7-empty-dir' resolves no cc-safety-net version to check against 1.0.6 — point it at an installed .pi/npm tree

$ CC_SAFETY_NET_PROBE_PI_NPM=$SP/rej/c10-bad-json bash .oh/evals/probes/cc-safety-net-wiring.sh
REGRESSION: cc-safety-net wiring gaps:
  - (d) $SP/rej/c10-bad-json/package-lock.json is not readable JSON, so cc-safety-net 1.0.6 stays unverified — reinstall .pi/npm, or bump the pin in .pi/settings.json + .devcontainer/Dockerfile
```

Case 7 is the one a critic asked for by name: an override that only had to
*exist* could have been pointed at an empty directory to silence a tier-A
assertion. It fails instead.

### 7. The neighbouring assertions are unchanged — behaviorally, not just textually

Case 11 builds a scratch repo-root-shaped tree with correct (a),(b),(c),(e),(f)
sources and no `.pi/npm`, then runs the fixed probe with `node` absent from
`PATH`:

```text
$ PATH=$SP/rej/minbin /usr/bin/bash $SP/rej/noderoot/.oh/evals/probes/cc-safety-net-wiring.sh
SKIPPED: cc-safety-net binary not reachable (no CC_SAFETY_NET_PROBE_BIN and none on PATH — expected outside the built sandbox image); static wiring PASSED
rc=2

$ # then break the guard-wrapped command in that tree's .claude/settings.json
$ PATH=$SP/rej/minbin /usr/bin/bash $SP/rej/noderoot/.oh/evals/probes/cc-safety-net-wiring.sh
REGRESSION: cc-safety-net wiring gaps:
  - (a) .claude/settings.json Bash hook missing CC_SAFETY_NET_OFF-guarded 'cc-safety-net hook --claude-code'
rc=1
```

A missing JSON interpreter does not silence the repo-static assertions. That is
the failure mode the new `node` dependency could have introduced, and it does
not.

The textual claim is separate and also holds:

```text
$ git diff --stat HEAD~1 -- .oh/evals/probes/cc-safety-net-wiring.sh
 .oh/evals/probes/cc-safety-net-wiring.sh | 90 +++++++++++++++++++++++++++++---
 1 file changed, 84 insertions(+), 6 deletions(-)
```

The two hunks are line 23 (`PI_PKG` → `PI_NPM`) and the assertion-(d) region.
Assertions (a), (b), (c), (e), (f) and the whole live-binary block are
byte-identical.

### 8. Regression floor — the full suite, twice

The suite was run twice on this machine. Run A restored the probe to `HEAD`; run
B ran the fix with the task artifacts staged, so `audit-stale-references.sh`
could see the new tracked files.

```text
$ git checkout -- .oh/evals/probes/cc-safety-net-wiring.sh   # run A: probe at HEAD
$ bash .oh/skills/eval/run.sh
runner rc=0
   PASS 96 / REGRESSION 0 / SKIPPED 3

$ # restore the fix, stage the artifacts
$ bash .oh/skills/eval/run.sh                                 # run B: probe fixed
runner rc=0
   PASS 96 / REGRESSION 0 / SKIPPED 3

$ diff statusA.txt statusB.txt   # probe id + status, 99 rows each
IDENTICAL: no probe changed status
```

The three SKIPPED probes are `autopilot-preflight-gate`,
`debugmcp-availability` and `next-dev-prod`. They skip identically in both runs
and are unrelated to this change.

### 9. Rescue session — merge to base, and independent re-verification

The session that built this change died when the container was recreated. A second
session merged `upstream/development` in and re-ran every load-bearing case from
scratch rather than trusting the record above.

`CHANGELOG.md` and `.oh/evals/RESULTS.md` conflicted. `CHANGELOG.md` kept both
entries, newest-issue-first; `RESULTS.md` was regenerated by `/eval`, never
hand-merged.

```text
$ git merge upstream/development --no-edit
CONFLICT (content): Merge conflict in .oh/evals/RESULTS.md
CONFLICT (content): Merge conflict in CHANGELOG.md
$ git rev-list --left-right --count upstream/development...HEAD   # after resolution
0	2
$ git diff 78106b58 HEAD -- .oh/evals/probes/cc-safety-net-wiring.sh
(empty — the merge did not touch the probe)
```

**A false proof was caught and discarded.** The first attempt to reproduce the
defect ran the pre-change probe from a scratch directory. It exited 1, which looks
like the bug, but the failure lines were `(a)` and `(b)` — the probe had resolved
`$ROOT` to a bare directory with no `.claude/settings.json`. A second attempt
placed the old probe *beside* the new one so `PROBE_DIR → ROOT` resolved
identically; it then exited 0, because the pre-change probe reads no override at
all (`PI_PKG="$ROOT/.pi/npm/package.json"` is hardcoded — the override variable
arrived with this change). Only the third form is a real comparison: both probes
on the **default** path, against one fixture, with no override.

```text
$ printf '{"dependencies":{"cc-safety-net":"^1.0.6"}}' > .pi/npm/package.json     # what npm writes
$ printf '{"packages":{"node_modules/cc-safety-net":{"version":"1.0.6"}}}' > .pi/npm/package-lock.json
$ printf '{"name":"cc-safety-net","version":"1.0.6"}' > .pi/npm/node_modules/cc-safety-net/package.json

$ bash <probe at 78106b58^>                      # BEFORE
REGRESSION: cc-safety-net wiring gaps:
  - (d) .pi/npm/package.json exists but pins a different cc-safety-net than 1.0.6
rc=1

$ bash .oh/evals/probes/cc-safety-net-wiring.sh   # AFTER
PASS: cc-safety-net wiring intact across providers/image/compose and live binary denies 'git reset --hard HEAD'
rc=0
```

The rejection matrix was re-run in full. `(d)=` counts failure lines beginning
`(d)`; `other=` counts every failure line that does not — `other=0` on all ten is
what makes the exit code attributable to assertion (d).

```text
1 positive control (good tree)               exit=0 want=0 (d)=0 other=0 OK
2 lock drifted 1.0.9                         exit=1 want=1 (d)=1 other=0 OK
3 installed drifted 1.0.9                    exit=1 want=1 (d)=1 other=0 OK
4 both drifted (expect 2 (d) lines)          exit=1 want=1 (d)=2 other=0 OK
5 EXACT '1.0.6' declared, resolves 1.0.9     exit=1 want=1 (d)=1 other=0 OK
6 declared but nothing resolves              exit=1 want=1 (d)=1 other=0 OK
7 override -> missing directory              exit=1 want=1 (d)=1 other=0 OK
8 override -> empty directory                exit=1 want=1 (d)=1 other=0 OK
9 unreadable JSON                            exit=1 want=1 (d)=1 other=0 OK
10 default path (worktree fixture, good)     exit=0 want=0 (d)=0 other=0 OK
```

Case 5 is the one that answers the design question directly: a manifest declaring
the **exact** string `1.0.6` while the tree resolves `1.0.9` still fails. The
assertion reads resolution, not the declaration, so loosening the old regex would
not have reproduced this.

Mutation check, on an isolated fixture repo whose (a)–(f) all pass:

```text
$ awk 'NR<48 || NR>131' cc-safety-net-wiring.sh > mutant.sh    # assertion (d) removed
$ bash -n mutant.sh                                            # ok; 11 (a)-(f) lines retained, 0 (d) lines
$ CC_SAFETY_NET_PROBE_BIN=/bin/true bash mutant.sh             # drifted tree, resolved 1.0.9
  static failure lines: 0
$ CC_SAFETY_NET_PROBE_BIN=/bin/true bash cc-safety-net-wiring.sh
  - (d) .pi/npm/package-lock.json resolves cc-safety-net 1.0.9, not the pinned 1.0.6 — ...
  - (d) .pi/npm/node_modules/cc-safety-net/package.json resolves cc-safety-net 1.0.9, not the pinned 1.0.6 — ...
```

Interpreter guard, with `node` absent from `PATH` and assertion (a) deliberately
broken in the fixture repo. `(a)` is still named, so (d)'s dependency on `node`
cannot silently skip its neighbours:

```text
$ PATH=<node-free> bash cc-safety-net-wiring.sh
  - (a) .claude/settings.json Bash hook missing CC_SAFETY_NET_OFF-guarded 'cc-safety-net hook --claude-code'
  - (d) .pi/npm/package-lock.json unread: no node on PATH to check cc-safety-net against pin 1.0.6 — install node
  - (d) .pi/npm/node_modules/cc-safety-net/package.json unread: no node on PATH to check cc-safety-net against pin 1.0.6 — install node
rc=1
$ # control, (a) restored: only the two (d) 'no node' lines remain
```

The first run of this guard produced a misleading result worth recording: the
node-free `PATH` was built with symlinks that resolved to themselves
(`grep -> grep`), so `grep` was broken and (b), (c), (e) and (f) failed too. That
was a defect in the fixture, not the probe. Rebuilt with absolute link targets,
only (a) and the two (d) lines appear.

Regression floor on the merged base:

```text
$ bash .claude/skills/eval/run.sh
ran 102 probe(s); wrote .oh/evals/RESULTS.md
$ echo $?
0
$ command grep -oE '\| (PASS|REGRESSION|SKIPPED) ' .oh/evals/RESULTS.md | sort | uniq -c
     99 | PASS
      3 | SKIPPED
```

The three `SKIPPED` rows are the same pre-existing ones named above. The suite is
102 probes rather than 99 because the merge brought in three probes from
`development` (`execution-target-contract`, `firstmate-executor-contract`,
`session-runner-ladder`).

The worktree fixture at `.pi/npm/` was removed after these runs, so the tree that
produced the scoreboard is the tree that ships.

## Acceptance criteria → proof

| Issue #759 criterion | Proof |
|---|---|
| 1. Passes on unmodified `development`, resolved install `1.0.6` | § 5, override pointed read-only at `development`'s real `.pi/npm` → `rc=0`; and § 2 after-run over a fixture mirroring that tree on the default path → `rc=0` |
| 2. Checks the resolved version, not a declared range; a permitting range does not by itself pass | § 3 (`^1.0.6` declared, `1.0.9` resolved → `rc=1`); § 6 case 4 (declared exactly `1.0.6`, resolved `1.0.7` → `rc=1`); § 6 case 5 (declared, unresolved → `rc=1`) |
| 3. Fresh clone with no `.pi/npm/` still passes (d) | § 5 first run → `rc=0`, no `(d)` line |
| 4. Verified by rejection; names the offending file and the version found | § 6 cases 1–7 and 10, plus the § 4 mutation check that makes the rejection attributable to assertion (d) |
| 5. The message states the version it found | § 3 and § 6: `resolves cc-safety-net 1.0.9, not the pinned 1.0.6`; each line also names the file, the pin, and one remediation clause |
| 6. (a),(b),(c),(e),(f) and the live binary check unchanged in behavior | § 7 — behavioral proof with `node` stripped from `PATH`, plus the textual diff |

## Story validation

| Story | `passes` | Validated by |
|-------|----------|--------------|
| US-001 assertion (d) reads the resolved version | true | hunk-by-hunk diff review; `bash -n`; four real runs re-executed by the First Mate |
| US-002 before/after on the default path | true | § 2, § 3, § 5 — the First Mate re-ran the comparison personally rather than accepting the delegate transcript |
| US-003 verification by rejection | true | § 4, § 6 — the mutation check was re-run independently on the default path, which is stricter than the delegate's override-based run |
| US-004 scoreboard, changelog, tracked artifacts | true | § 8; `CHANGELOG.md` `[Unreleased]`/`Fixed`; `git ls-files` on the task folder |

## Gaps and non-gating findings

- **The `.oh/evals/RESULTS.md` row flip is NOT evidence of this fix.** The row
  moves `SKIPPED` → `PASS`, and run A proved why that is bookkeeping: with the
  probe **unfixed** at `HEAD`, the suite already reported `PASS` for
  `cc-safety-net-wiring` in this worktree, because the worktree has no
  `.pi/npm/` for assertion (d) to read. The flip is explained by the live binary
  being reachable on `PATH` (exit 2 → exit 0), not by the change. The scoreboard
  claim that *is* evidence is the regression floor in § 8.
- **The issue text and the committed scoreboard disagreed, and the scoreboard was
  right.** The row at `HEAD` read `SKIPPED`, dated 2026-08-03 — not `REGRESSION`.
  The `REGRESSION` in the issue is a live probe run, which reproduces only where
  `.pi/npm/` exists.
- **Three pre-existing SKIPPED probes** (`autopilot-preflight-gate`,
  `debugmcp-availability`, `next-dev-prod`) are unchanged by this work and
  non-gating.
- **`shellcheck` was not available** in this environment, so the shell gate is
  `bash -n` plus real invocations rather than a linter. CI's `boot-lint` job does
  not cover `.oh/evals/probes/*.sh` either, so this is a pre-existing coverage
  boundary, not a regression introduced here.
- **Failure-line paths under a foreign override print absolutely.** The label is
  built as `${file#"$ROOT"/}`, which only strips when the file lives under
  `ROOT`. On the default path — the only path that ships — lines read
  `.pi/npm/package-lock.json`. Under a fixture override they print the full path.
  Cosmetic; the line names the file either way.
- **`CC_SAFETY_NET_PROBE_PI_NPM` is a new test-only knob.** It cannot be used to
  disarm the assertion (§ 6 cases 6 and 7), and it breaks no existing caller
  because nothing in the repo sets the sibling `CC_SAFETY_NET_PROBE_BIN` either.
