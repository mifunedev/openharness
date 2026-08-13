# Critique — registry-drift-lint (issue #758)

Two adversarial critics ran in parallel against `prd.md` and `prd.json` before any
code existed: critic A on the implementer lens (buildability and correctness),
critic B on the user and reviewer lens (scope, honesty, adoption). Both verified
claims by running commands against the live registry checkout and against the
pre-fix tree at registry commit `036a53f`. Neither modified the registry.

The First Mate adjudicates. Delegates do not self-certify, and a critic finding is
not automatically accepted — each one below records the decision and the reason.

## Option A / B / C

Neither critic argued for issue Option A or Option B. Both accepted Option C as
the right choice and attacked the execution. Option C stands, as the issue
recommends. No option substitution occurred, silent or otherwise.

## Blocking findings, and what changed

### 1. `KNOWN` suppressed the exit code, so the check was green while a real defect stood

Raised by critic B (HIGH 1). **Accepted, plan changed.**

The first draft let a `KNOWN` exception zero the exit code. That satisfied
acceptance criterion 5 — nothing is silently fixed — by breaking acceptance
criterion 1, which requires the check to *fail*. Live `master` names
`` `/retro` `` at `skills/ste/SKILL.md:280`, and the registry ships `reflect`,
not `retro`. A check that exits 0 in the presence of that line is the exact
failure this issue exists to prevent.

`KNOWN` no longer touches the exit code. It records that a human triaged the
finding and wrote down why it stands, so the output can separate a known backlog
from something new. Only `ALLOW` suppresses. The delivered check exits 1 against
live `master`, and says why.

### 2. Keying exceptions on the matched token re-admitted historical defect 3

Raised independently by critic A (HIGH 1), critic B (HIGH 2), and by the advisor
before either critic reported. **Accepted, plan changed, and the fix is stronger
than the one all three of us proposed.**

The human repair of defect 3 did not delete the `.oh/` path. It kept the path and
made the sentence conditional. So `skills/ste/SKILL.md` cites
`.oh/skills/retro/references/memory-protocol.md` both at `036a53f:285` (the
defect) and at `master:282` (the accepted repair). An exception keyed on
`(file, matched token)` cannot tell them apart, so the entry required to green
`master` would have whitelisted the defect the issue was filed over.

All three of us proposed the same workaround: run the historical proof with an
empty exception list. Measurement found a better fix. Keying on a hash of the
whole source line separates them outright:

```
master   skills/ste/SKILL.md:282  ->  01ede414c12b
036a53f  skills/ste/SKILL.md:285  ->  27bf235ad29e
```

Different keys. The shipped exception list therefore still reports all three
historical defects at `036a53f`, so US-006 proves rejection against the real
production configuration rather than against a weakened one. The workaround is
not needed and is not used. Hashing also makes the record immune to `|`
characters in source lines, which matters because real findings sit inside
Markdown table rows.

### 3. Zero scanned files was an open fail-open

Raised by critic A (HIGH 3). **Accepted, plan changed.**

The plan named four exit-2 conditions and missed the one that matters most. A
registry whose skill folders contain no `*.md` or `*.sh` scanned nothing and
exited 0, which is indistinguishable from a pass. Critic A also demonstrated two
Bash mechanics that produce the same silence: `mapfile < <(find /nonexistent)`
leaves an empty array with status 0 because process substitution failure is
invisible to `set -e`, and `printf | while read; do arr+=(); done` loses the
array with the subshell.

Added: exit 2 when the scanned-file count is zero, a test for a skill folder
holding no scannable file, and a requirement that the run always prints the
scanned counts so a green run that read nothing is visually impossible.

### 4. The check had nowhere to be run

Raised by critic B (HIGH 3). **Accepted, new story added (US-007).**

Searching this repository for `mifunedev/skills` returns no hit under
`.oh/skills/`. No skill, runbook, or procedure describes publishing to the
registry. The registry has no CI. The probe is SKIPPED unless someone opts in.
So on the day the next skill is published, nothing invokes this check and the
defect class is caught the same way it was last time — by a human who thought to
look.

`.oh/skills/builder/references/skill.md` gains a publishing step naming the
command as a required gate before a registry pull request. It is the procedure a
skill author already reads, it is tracked, and it is provider-portable.

## Accepted with modification

### 5. Packaging — the contract would not ship

Raised by critic A (MEDIUM 8). **Accepted, placement changed.**

`.oh/manifest.json` includes `scripts/**` and `evals/**` and excludes `docs/**`.
The original placement put the linter and probe inside the shipped payload and
the exceptions file outside it, so an installed harness would carry a fail-closed
script whose exception file could never exist — a permanent hard error created by
packaging, not by any registry state.

The contract and exception list move from `.oh/docs/registry-portability.md` to
`.oh/scripts/registry-portability.md`, beside the script that reads it and inside
the shipped payload. `.oh/scripts/README.md` is the precedent for prose there.
`.oh/docs/README.md` gains an index entry, because critic B correctly noted that
every other reviewer-facing document is indexed and an unindexed one is not
findable.

### 6. `DANGLING-REF` — kept, against critic B's advice

Critic B (LOW 10) called the rule scope drift that under-earns, on the evidence
that it produced one true positive and one false positive. **Partially rejected.**

Re-measurement with critic A's anchoring fix changes the arithmetic. The rule
finds four genuine hits, not one: `skills/ship-spec/SKILL.md` instructs the
reader to run `scripts/ralph.sh` at lines 262, 309, and 340, and that skill ships
exactly two files, `LICENSE` and `SKILL.md`. That is verbatim "a path an
installer will not have", which is acceptance criterion 1's own wording. The rule
stays.

The single false positive, `skills/harness-context/SKILL.md:23`, names the
harness repository's own directory layout rather than a sibling file. It is
carried as one `ALLOW` entry with that reason.

Critic B's alternative suggestion — scan `template/`, which every new skill
author copies from — is a good idea and is recorded as a follow-up rather than
folded in. It is outside `skills/` and outside what the issue asked for.

### 7. Registry-side pointer — declined, and the cost recorded

Critic B (MEDIUM 7) proposed adding a line to the registry's pull request
template so a reviewer working inside `mifunedev/skills` is pointed at this
contract. **Declined for scope**: it is a second repository and a second pull
request. Critic B's own alternative is taken instead — the sweep records that the
registry side is deliberately left unpointed, and why, so the gap is visible
rather than implied.

## Accepted as written

| # | Critic | Finding | Change |
|---|---|---|---|
| 8 | A MEDIUM 5 | `DANGLING-REF` substring-fired inside `.oh/` paths, double-reporting four hits | Anchor the match at the start of the backticked span; never re-report a path already reported by `OH-PATH` |
| 9 | A MEDIUM 6 | `HARNESS-SKILL` missed any invocation carrying arguments, and the registry already writes `` `/interview <text>` `` | Read the first whitespace-delimited token inside a backticked span |
| 10 | A MEDIUM 7 | Staleness was checked tree-wide while suppression was per-file, so a dead entry could survive forever | Scope staleness to the file the entry names |
| 11 | A MEDIUM 7 | Substring suppression had no minimum specificity, so `.oh/` as the matched text would mute a whole file | Resolved by whole-line hashing — a partial string cannot be a key |
| 12 | A LOW 10 | Findings printed registry-relative paths while exceptions used skill-relative ones | One path space, registry-root-relative, in both; the linter prints a paste-ready exception stub per finding |
| 13 | A LOW 11 | A stale entry and a real finding both exited 1, so the probe reported an improvement as a regression | Stale entries warn by default; `--strict-exceptions` makes them fail |
| 14 | A LOW 12 | US-006 named no read-only extraction method for a checkout the brief forbids modifying | `git archive <commit> \| tar -x` into a scratch directory |
| 15 | A + B | US-002 required five exception fields while US-003 asserted four | US-003 references the US-002 format instead of restating arity |
| 16 | A MEDIUM 9 | US-005's "covers every skill folder" pushed toward an 18-row table naming three retired-vocabulary folders | The report states the scanned count and enumerates only folders with findings; a new criterion runs the guarding probe after the artifacts are force-added |
| 17 | B MEDIUM 4 | The stated limitations were the comfortable ones | Added: `.claude/` paths (79 references across 15 of 18 skills), multi-word routes, and client built-in commands |
| 18 | B LOW 9 | 17 versus 18 was never reconciled | The sweep states the arithmetic: 17 pre-existing plus `ste` |
| 19 | A | Missing criteria | Deterministic sorted output; the linter's own output carries no retired-vocabulary token, so evidence can quote it verbatim; the probe's environment variable is documented |

## Corrections to the critics

- Critic B reported `.claude/` references across 16 of 18 skills. Measured: **15**.
  The finding stands; the count is corrected in the limitations section.
- Critic A reported seven `DANGLING-REF` hits on `master`. Four were the
  substring artifact it identified in its own MEDIUM 5. After that fix the count
  is four, across two skills.
- Critic A noted `shellcheck` is absent from this sandbox and concluded the
  criterion could only be checked by pushing. A static binary was fetched, so the
  gate is verified locally before the push.
- Critic B classed `skills/reflect/SKILL.md:148` (`/update-config`) as an open
  finding. It is a Claude Code built-in command, so an installer on that client
  does have it. Reclassified `ALLOW`, with that reason recorded.

## Day-one state of the delivered check

Measured, not predicted. Registry `master` at `1d11ab6`, 18 skill folders, 31
files, 14 findings:

- **8 `ALLOW`** — intentional and safe: three example-prose lines and three
  runtime-guarded lines in `ste`, one harness-layout enumeration in
  `harness-context`, one client built-in in `reflect`.
- **5 `KNOWN`** — real, reported, unrepaired: three `scripts/ralph.sh`
  instructions in `ship-spec`, `` `/retro` `` and the bare `.oh/` pointer in
  `ste`.

The check exits **1** on live `master`. That is the correct steady state: the
registry does carry portability defects today, acceptance criterion 5 forbids
repairing them here, and a green check would be a lie.

## Verdict

**APPROVED to build**, with findings 1 through 4 folded into the plan as blocking
changes, 5 through 19 folded in as written, and findings 6 and 7 recorded as
reasoned partial rejections. Both critics independently confirmed the rule set
reproduces all three historical defects at exactly the claimed coordinates, and
both confirmed the retired-vocabulary constraint holds against real data.
