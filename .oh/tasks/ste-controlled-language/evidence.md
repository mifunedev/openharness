# Evidence — ste-controlled-language

- **PR**: #751 (`mifunedev/openharness`, base `development`) · **Branch**: `skill/750-ste-controlled-language`
- **Audit run**: `audit-20260813T002039Z-102048` · **Verdict**: `PR-AUDIT-PROMOTABLE`
- **Companion PR**: `mifunedev/skills` #7

An earlier boundary invocation, `audit-20260813T001326Z-80816`, returned
`PR-AUDIT-UNKNOWN` while CI was still running. That is a classifier property, not a
defect in the change: `gh` reports `conclusion: ""` for an `IN_PROGRESS` CheckRun,
which trips `malformed_item` in `pr-classify.sh:28`.

## What was broken, and what now holds

The harness governed no artifact prose. Ambiguous instructions reached the repository
and cost the next agent a guess. `/ste` adds a rule set, a word map, a worked example
corpus, and a checker that reports violations by `file:line`.

The audit found the checker itself was the risk. Four inputs made it exit 0 while it
scanned little or nothing: an unclosed fence, an unterminated frontmatter delimiter,
a mismatched fence marker, and a `--blocks` tag that matched no fence. A linter that
passes by reading nothing is worse than no linter, because a reader treats the green
exit as proof. All four now report or exit 2, and
`.oh/evals/probes/ste-checker-contract.sh` holds every one of them in CI.

## Proof by gate

| Gate | What was checked | Observed | Result |
|------|------------------|----------|--------|
| Native PR verdict | boundary route against PR 751 | `PR-AUDIT-PROMOTABLE`, boundary exit 0 | PASS |
| Classifier evidence | focused classifier JSON | `ci=PASS`, `mergeable=MERGEABLE`, `mergeStateStatus=CLEAN`, `readyForReview=true`, `evidenceComplete=true`, `flags=[]` | PASS |
| CI | 4 required checks on PR 751 | all 4 pass | PASS |
| Task graph | `prd.json` stories | 9/9 stories `passes: true` | PASS |
| Acceptance script | `verify.sh` | 76 PASS, 0 FAIL, exit 0 | PASS |
| Checker rejects | `--blocks before` on the committed fixture | exit 1, 99 findings, all six classes | PASS |
| Checker accepts | `--blocks after`, plus the four corpus files | exit 0 | PASS |
| Fail-open sweep | the four shapes the audit found | each reports or exits 2 | PASS |
| Post-merge enforcement | new probe in the suite | `ste-checker-contract PASS new-pass` | PASS |
| Probe rejects | probe run against a neutered checker | exit 1, twice, two different neuterings | PASS |
| Regression floor | full probe suite | 98 probes, 0 state changes against the pre-change baseline | PASS |
| Legacy tokens | pattern read from the probe, never typed | `git grep` exit 1, no match | PASS |
| Remote routing | branch diff against `upstream/development` | 0 paths under `.oh/memory/`, 0 `.oh/evals/RESULTS.md` | PASS |
| Registry portability | `skills-ref@0.1.5`, then `validate.sh` | `Valid skill`, `PASS — all checks passed (109 checks)` | PASS |
| Regression floor at merge-base | suite run at `72a8e7e2` | not run — needs a worktree, which changes git state | **GAP**, see below |
| UI | browser criteria | no story declares browser verification | N/A |

## Observed output

### The acceptance script

```text
$ bash .oh/tasks/ste-controlled-language/verify.sh; echo "rc=$?"
VERIFY: all checks passed
rc=0
$ bash .oh/tasks/ste-controlled-language/verify.sh 2>&1 | grep -c '^  PASS'
76
$ bash .oh/tasks/ste-controlled-language/verify.sh 2>&1 | grep -c '^  FAIL'
0
```

### The checker rejects as well as accepts

```text
$ bash .oh/skills/ste/scripts/ste-check.sh --blocks before .oh/skills/ste/references/examples.md >/dev/null 2>&1; echo "rc=$?"
rc=1
$ bash .oh/skills/ste/scripts/ste-check.sh --blocks before .oh/skills/ste/references/examples.md 2>/dev/null | awk '{print $2}' | sort | uniq -c | sort -rn
     41 VAGUE
     18 HEDGE
     14 PASSIVE
     13 WORD
      7 LONG
      6 COMPOUND
$ bash .oh/skills/ste/scripts/ste-check.sh --blocks after .oh/skills/ste/references/examples.md; echo "rc=$?"
ste-check: no findings in 1 file(s).
rc=0
```

### The four fail-open shapes, after the fix

```text
$ bash ste-check.sh $S/unclosed.md; echo "rc=$?"
$S/unclosed.md:3: FENCE unclosed fenced block; lines after this one were not scanned
rc=1

$ bash ste-check.sh $S/rule.md >/dev/null 2>&1; echo "rc=$?"      # leading --- horizontal rule
rc=1
$ bash ste-check.sh $S/front.md >/dev/null 2>&1; echo "rc=$?"     # real frontmatter, still skipped
rc=0

$ bash ste-check.sh $S/mixed.md >/dev/null 2>&1; echo "rc=$?"     # ``` inside a ~~~ block
rc=0

$ bash ste-check.sh --blocks nosuchtag …/examples.md; echo "rc=$?"
ste-check: no fenced block tagged "nosuchtag" in 1 file(s); nothing was scanned
rc=2
```

Each of the four returned `rc=0` before the fix.

### The probe fails when the checker is neutered

```text
$ bash .oh/evals/probes/ste-checker-contract.sh; echo "rc=$?"
PASS: the /ste checker rejects, accepts, and refuses to pass vacuously
rc=0

# Neuter 1 — force a clean exit regardless of findings.
$ sed -i 's/^if \[ "$findings" -gt 0 \]; then$/if false; then/' .oh/skills/ste/scripts/ste-check.sh
$ bash .oh/evals/probes/ste-checker-contract.sh; echo "rc=$?"
REGRESSION: --blocks before on the before-fixture: exit 0, expected 1
rc=1

# Neuter 2 — disable only the unclosed-fence report.
$ sed -i 's/      if (in_fence == 1) {/      if (0) {/' .oh/skills/ste/scripts/ste-check.sh
$ bash .oh/evals/probes/ste-checker-contract.sh; echo "rc=$?"
REGRESSION: unclosed fence must not exempt the rest of the file: exit 0, expected 1
rc=1
```

### The regression floor

```text
$ bash .oh/skills/eval/run.sh; echo "rc=$?"
ran 98 probe(s); wrote /home/sandbox/harness/.oh/evals/RESULTS.md
rc=0
$ grep -E '^ste-checker-contract' after.txt
ste-checker-contract             PASS        new-pass
$ diff <(awk '{print $1,$2}' baseline.txt) <(awk '{print $1,$2}' after.txt)
89a90
> ste-checker-contract PASS
98c99
< ran 97
---
> ran 98
```

The only difference against the baseline captured before this branch is the added
probe. No probe changed state.

### The registry copy

```text
$ npx --yes skills-ref@0.1.5 validate ./skills/ste/
Valid skill: ./skills/ste/
$ ./scripts/refresh-checksums.sh
UPD ste — sha256:9a92be… -> sha256:a3a4bb0912d9ae841e17de3b22fcb75a8377426dc8a5fe72bb7f4f621ddea436
Updated 1 checksum(s) in registry.json.
$ ./scripts/validate.sh
OK  ste: 301 lines
OK  ste: no $CLAUDE_SKILL_DIR
OK  ste: no deny-list keys
OK  ste: checksum matches (sha256:a3a4bb0912d9ae841e17de3b22fcb75a8377426dc8a5fe72bb7f4f621ddea436)
PASS — all checks passed (109 checks)
```

## Acceptance criteria → proof

| Story | Criterion | Proof |
|-------|-----------|-------|
| US-001 | 53 rules across 9 sections | `verify.sh` "rules.md '### ' rules = 53", "'## ' headings = 10" |
| US-002 | 150 or more mappings, both columns backticked | `verify.sh` "entry rows = 198 (min 150)", "every entry row backticks both word columns" |
| US-003 | 20 or more pairs, 13 domains, all six classes fire | `verify.sh` "before fences = 24", "distinct **Domain:** labels = 13", six "detector X fires" lines |
| US-004 | exit 0 / 1 / 2, six classes, writes nothing | the fail-open block above, plus `verify.sh` "examples.md unchanged by a scan" |
| US-005 | under 500 lines, both headings, self-application | `verify.sh` "SKILL.md = 299 lines (< 500)", "checker on SKILL.md -> rc=0" |
| US-006 | one `AGENTS.md` row, one CHANGELOG line | `verify.sh` "AGENTS.md /ste rows = 1", "CHANGELOG '### Added' links issue 750" |
| US-007 | probe suite, legacy tokens, routing guard | the regression-floor block above; `verify.sh` "no legacy tokens", "no .oh/memory/ path" |
| US-008 | registry validation | the registry block above |
| US-009 | both PRs, follow-up issues | PR 751, `mifunedev/skills` PR 7, issues 752 and 753 |

## Gaps and non-gating findings

- **GAP — no merge-base probe run.** The runner's `unchanged` column compares against
  the working-tree `RESULTS.md`, which an earlier run on this branch had already
  overwritten. Running the suite at `72a8e7e2` needs a worktree, which changes git
  state, so the audit did not do it. Against the committed merge-base scoreboard four
  rows differ, and the audit traced each to state outside this diff: two probes are
  absent from that stale committed scoreboard although both probe files exist at
  `72a8e7e2`; `next-dev-prod` moved `REGRESSION`→`SKIPPED` because no website process
  is running; `cc-safety-net-wiring` moved `SKIPPED`→`REGRESSION` on `.pi/npm/package.json`,
  which is untracked per `.pi/.gitignore:3`. The strongest independent evidence is
  PR 751's `Eval Probe Regression Gate`, which passes on a clean clone.
- **Non-gating pre-existing red.** `cc-safety-net-wiring` fails on an untracked file
  outside this diff. It is red in the baseline captured before the branch.
- **`shellcheck` is absent** from this sandbox, and `.oh/skills/ste/scripts/` sits
  outside the CI shellcheck glob at `.github/workflows/ci-harness.yml:126`. The script
  is gated on `bash -n` plus the contract probe instead. Widening the glob would edit
  `.github/workflows/**`, which is outside this change.
- **`awk` coverage.** The checker was exercised on `mawk 1.3.4` only. `gawk` is not
  installed in this sandbox.
- **Fixed after the audit, in this branch**: the four fail-open paths; two PASSIVE
  false-positive classes (`is indeed`, `is speed`) and one bare-hostname false
  positive; `--blocks ''` accepted silently; the finding path expanding escape
  sequences through `awk -v`, replaced with `FILENAME`; `prd.json` committed with all
  nine stories `false`; this evidence file, which the PR body linked before it existed.
