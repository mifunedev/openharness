# Evidence — registry-drift-lint

- **PR**: #765 (mifunedev/openharness, base `development`) · **Branch**: `task/758-registry-drift-lint`
- **Audit run**: none — see *Audit provenance* below · **Verdict**: not emitted by a native route

## Audit provenance — read this before the tables

`.oh/prompts/advisor/pr.yml` calls for a delegated `/audit pr`, whose boundary
(`.oh/skills/audit/scripts/audit-run.sh`) mints an `AUDIT_RUN_ID` and requires a
native machine verdict. **That route was not run, so no run id and no
`PR-AUDIT-*` verdict exist, and none is invented here.** The production driver
spawns a nested agent; a delegated auditor that dies on the spend cap leaves the
gate undone and silent, which is worse than an honest gap. The gates below were
therefore run inline and are recorded with their real commands and real output.

Every claim below is observed output from this worktree at `633f1be0`. Where a
gate was not run, it says so rather than showing a predicted result.

## What was broken, and what now holds

A skill published to `mifunedev/skills` existed in two copies with nothing
comparing them. The three defects in mifunedev/skills#7 were caught by a hand-run
`diff` one commit before merge. A byte-equality check cannot replace that,
because the copies are intentionally different, so the check reads the published
copy standalone and asserts it names no path and no command an installer will not
have. It now reports 14 findings across 4 of the 18 published skills, names each
at `file:line`, and — proven against the pre-repair registry commit — catches all
three original defects using the shipped exception list.

## Proof by gate

| Gate | What was checked | Observed | Result |
|------|------------------|----------|--------|
| Regression floor | `/eval` runner over the full probe corpus | `ran 104 probe(s)`, `REGRESSIONS (0)` after the sweep fix | PASS |
| New probe registered | `registry-portability-gate` in `RESULTS.md` | `PASS`, delta `new-pass` | PASS |
| Rejection — historical | linter vs registry `036a53f`, shipped exception list | all 3 #751 defects reported, `neither: 3` | PASS |
| Rejection — injection | `.oh/` path + `/autopilot` added to a portable copy | both named at `:140`, `neither: 0 → 2`; restore returns to baseline | PASS |
| Rejection — fail-closed | 8 untrustworthy linter invocations | 8/8 `exit=2`, none `0` | PASS |
| Rejection — new probe | probe run against 8 deliberately broken trees | red on 8/8, each with a distinct reason | PASS |
| Static analysis | `shellcheck -S warning` (the CI argument list covers `.oh/scripts/*.sh`) | clean on both scripts | PASS |
| Syntax | `bash -n` on both scripts | clean | PASS |
| CI | GitHub checks on PR #765 | see *CI* below | see below |
| Base currency | merge of `upstream/development` @ `ec64f667` | merged, no conflicts | PASS |
| Focused PR classifier | `/audit pr` native route | **not run** — see *Audit provenance* | GAP |
| UI | browser criteria | n/a — no story declares browser verification | N/A |

## Acceptance criteria → proof

| # | Criterion (issue #758) | Proof |
|---|---|---|
| 1 | A check fails when a portable copy references something an installer lacks | Injection test: `neither: 0 → 2`, exit 1 |
| 2 | The check names the offending file and line | `skills/worktrees/SKILL.md:140: OH-PATH …` |
| 3 | Intended harness↔registry deltas are written down | `.oh/scripts/registry-portability.md` § The two copies / The intended deltas |
| 4 | Verified by rejection: reintroduce a `.oh/` reference and confirm it fails | Injection test **and** the `036a53f` historical run below |
| 5 | The pre-existing registry skills swept once, hits reported not silently fixed | `.oh/tasks/registry-drift-lint/sweep.md`: 18 folders, 14 findings, 5 left standing |

## Observed output

### Baseline — live registry master `1d11ab6`

```text
$ bash .oh/scripts/registry-portability.sh --registry <checkout>
scanned skill folders: 18
scanned files: 31
findings: 14
suppressed by ALLOW: 9
labelled KNOWN: 5
neither: 0
stale exceptions: 0
EXIT=1
```

Exit 1 is correct, not a defect: `KNOWN` deliberately does not suppress, and five
real defects stand in the published copies.

### Rejection — registry `036a53f`, with the shipped exception list

```text
$ bash .oh/scripts/registry-portability.sh --registry <036a53f export>
skills/ste/SKILL.md:102: HARNESS-SKILL /caveman
skills/ste/SKILL.md:285: OH-PATH .oh/skills/retro/references/memory-protocol.md
skills/ste/references/rules.md:420: HARNESS-SKILL /caveman
stale exception: KNOWN | OH-PATH | skills/ste/SKILL.md | 01ede414c12b matches no line in that file

findings: 16
suppressed by ALLOW: 9
labelled KNOWN: 4
neither: 3
EXIT=1
```

All three historical defects report as new. The `stale exception` line is the
whole-line-hash design proving itself: the entry written against the repaired
line on master does not mask the pre-repair line, it goes stale.

### Rejection — injection into a portable copy

```text
$ printf '\nRead `.oh/skills/git/references/worktrees.md`, then run `/autopilot` to continue.\n' >> skills/worktrees/SKILL.md
$ bash .oh/scripts/registry-portability.sh --registry <master export>
skills/worktrees/SKILL.md:140: HARNESS-SKILL /autopilot
skills/worktrees/SKILL.md:140: OH-PATH .oh/skills/git/references/worktrees.md
findings: 16
neither: 2
EXIT=1

$ # restore the file
$ bash .oh/scripts/registry-portability.sh --registry <master export>
findings: 14
neither: 0
```

### Rejection — fail-closed contract

```text
no --registry                                  exit=2  --registry <dir> is required
--registry nonexistent                         exit=2  --registry names no directory: …
--registry without skills/                     exit=2  no skills/ directory under: …
skills/ with zero folders                      exit=2  no skill folder under: …
skill folder with zero files                   exit=2  no *.md or *.sh file under any skill folder in: …
missing --allow file                           exit=2  exceptions file not found: …
--allow file with no allow block               exit=2  no fenced block tagged allow in: …
unknown argument                               exit=2  unknown argument: --bogus

empty-but-present allow block                  exit=1  findings: 14  neither: 14
```

The last row is the discriminating case: an empty allow block is a valid
zero-exception configuration, so it reports findings rather than failing closed.

### Rejection — the new probe, broken 8 ways

```text
1. control: untouched mirror                exit=0  PASS: the registry portability gate is armed …
2. linter deleted                           exit=1  REGRESSION: the portability linter is absent
3. caller stops citing the gate             exit=1  REGRESSION: … the gate has no caller
4. exception entry loses a field            exit=1  REGRESSION: … not five fields
5. exception hash truncated to 8 hex        exit=1  REGRESSION: … bad hash
6. allow block removed entirely             exit=1  REGRESSION: expected exactly one fenced block tagged allow … found 0
7. linter regressed to fail-open            exit=1  REGRESSION: the linter exited 0 on an unreadable registry
8. unknown exception class                  exit=1  REGRESSION: … unknown class: MAYBE
```

### Regression floor

```text
$ bash .oh/skills/eval/run.sh
registry-portability-gate        PASS        new-pass
registry-portability             SKIPPED     new-fail
ran 104 probe(s); wrote .oh/evals/RESULTS.md
```

The first run of this suite was **red**, and the regression was in this change's
own sweep document:

```text
REGRESSIONS (1):
  - audit-stale-references (issue #645 — clean-breaking audit migration): was PASS, now REGRESSION
    — .oh/tasks/registry-drift-lint/sweep.md:34:Clean: `agent-browser`, `ci-status`, …
```

The sweep had enumerated the registry's clean folders by name, three of which are
audit vocabulary this repo retired in #645. No exclusion was added to that probe;
the enumeration was replaced with a reproduction command. Re-run: 0 regressions.

## Gaps, stated rather than papered over

- **No `AUDIT_RUN_ID` and no native `PR-AUDIT-*` verdict.** The native route was
  not run (see *Audit provenance*). This doc is inline evidence, not a
  route-emitted verdict, and should be read as such.
- **The registry scan has no automatic trigger.** `OH_REGISTRY_CHECKOUT` is set
  in no workflow and no cron. CI runs the probe suite, so the gate probe fires
  every run, but the registry-scanning probe reports SKIPPED there every time.
  The scan's trigger is the manual publishing step in
  `.oh/skills/builder/references/skill.md`. Recorded in the contract
  § When this check actually runs, with the cron that would close it and the
  reason it is not built yet.
- **`registry-portability` shows `new-fail` in the delta column** because it
  moved from absent to `SKIPPED`. It is excluded from the pass rate and is not a
  regression.
- **Five `KNOWN` defects are unrepaired**, by design — criterion 5 puts registry
  changes out of scope. They are itemized with suggested repairs in `sweep.md`.
- **`.claude/` references are out of scope**: 79 across 15 of the 18 skills,
  recorded as a follow-up in the contract § Limitations.

## CI

See PR #765 checks. `Boot Path Lint (shellcheck + hadolint)` — the gate whose
argument list covers `.oh/scripts/*.sh` — passed in 12s. Remaining check results
are on the PR itself; this doc is not updated with a predicted outcome.
