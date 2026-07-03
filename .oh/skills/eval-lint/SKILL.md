---
name: eval-lint
description: |
  Score every eval probe (.oh/evals/probes/*.sh) and capability benchmark task
  (.oh/evals/capability/tasks/CB-*.md + repo-orientation) across seven
  anti-Goodhart failure modes and emit a KEEP/GROOM/CUT matrix. Read-only by
  default — like /skill-lint, it only reads and prints; it never mutates a probe
  or capability file. Deterministic file/grep/git/stat scoring, no LLM judgment.
  TRIGGER when: asked to lint the eval suite, groom the probes, check for
  Goodharted / stale / duplicate / always-SKIP probes, audit the capability
  benchmark tasks, "eval lint", or before/after adding probes.
argument-hint: "all | probes | capability | <probe-or-task-id>"
---

# Eval Lint

Score every eval **probe** and **capability benchmark task** across seven
deterministic anti-Goodhart failure modes and produce a **KEEP / GROOM / CUT**
verdict for each. No LLM judgment — verdicts come from file stats, grep counts,
git history, and the last `/eval` scoreboard only.

The probe suite is now ~75 probes. Once the harness can improve itself it can
also *overfit its own probes* — so the probes and capability tasks need the same
cheap, high-value grooming pass that `/skill-lint` gives skills. `/eval-lint` is
that pass. It is a **skill/report, not a probe**: it must not add machinery to
the very suite it grooms.

**Read-only by default.** This skill only reads and prints. It never edits,
deletes, or rewrites a probe or capability file. After any run,
`git status --porcelain .oh/evals/` MUST be empty. Grooming and cutting are
follow-up edits a human (or a separate task) applies deliberately — never a side
effect of the lint.

## Instructions

### 1. Parse target

Arguments received: `$ARGUMENTS`

| Argument | Scope |
|----------|-------|
| `all` (default, or empty) | All probes **and** all capability tasks |
| `probes` | `.oh/evals/probes/*.sh` only |
| `capability` | `.oh/evals/capability/tasks/CB-*.md` + `repo-orientation` only |
| `<probe-or-task-id>` | A single probe id (e.g. `skill-paths`) or task id (e.g. `CB-001`) |

### 2. Discover targets

Two target classes, discovered from the neutral `.oh/evals/` source tree:

- **Probes** — every `.oh/evals/probes/*.sh`. Id = basename without `.sh`.
- **Capability tasks** — every `.oh/evals/capability/tasks/CB-*.md` plus the
  `repo-orientation` workload at `.oh/evals/capability/repo-orientation/`. Id =
  the `CB-NNN` prefix (or `repo-orientation`).

> Concrete copy-pasteable discovery + scoring driver blocks and a sample matrix
> live in **§ Scoring procedure** below.

### 3. Score each target against the seven failure modes

Each target is checked against seven named failure modes. Every check emits a
**flag** (raised or clear); three checks are **fatal** (a single hit is enough to
CUT). All signals are deterministic — same inputs, same flags.

---

#### Check 1 — stale

*The probe/task guards a lesson, issue, or path that no longer exists, or has
rotted while what it guards moved on.*

Signal: read the probe's `# source:` header (and any bare path in the body) and
verify each cited file/path still resolves (`[ -e "$path" ]`); a capability
task's `datasets:` refs and "most-recent real instance" pointer must resolve
too. Secondary signal: file mtime age via `stat -c %Y` — a very old probe whose
guarded target changed *more recently* is drifting.

Groomable (refresh the source pointer / re-anchor the assertion), not fatal.

#### Check 2 — duplicate

*Two targets assert the same invariant — redundant machinery.*

Signal: a normalized-body hash collision (strip shebang, comments, and
whitespace, then hash), an identical `# source:` issue reference shared by two
probes, or an identical set of asserted paths/strings. An **exact** normalized
duplicate is **fatal** (one of the pair is dead weight); a near-duplicate is
groomable (merge or differentiate).

#### Check 3 — always-SKIP-in-CI

*The probe reports `SKIPPED` (exit 2) every run — it never actually asserts
anything in CI, so it guards nothing.*

Oracle: **cross-reference `.oh/evals/RESULTS.md`** — the per-probe status column
from the last `/eval` — **not a guess** from `grep 'exit 2'`. A probe whose
RESULTS.md status is `SKIPPED` (and which has no environment path to ever run)
is **fatal**: a permanently-skipped probe is a green light that can never turn
red.

#### Check 4 — asserts-implementation-detail-not-user-outcome

*The probe pins a brittle internal implementation detail (an exact private
variable name, an internal line, a hardcoded impl string) instead of a
user-visible contract or behavior.*

Signal: the probe greps into implementation files for narrow literal strings or
line-number references rather than asserting a documented contract/output. Such
a probe breaks on harmless refactors and passes on real regressions.

Groomable — rewrite to assert the user outcome, not the mechanism.

#### Check 5 — no-longer-held-out

*A capability benchmark task (or its fixtures) has been tuned-to / special-cased,
violating the held-out discipline in `.oh/evals/capability/README.md`.*

Signal: the task's guarded assertion is now baked into the very file it inspects,
or the benchmark manifest (`repo-orientation/tasks.json`, a task's fixtures) is
referenced by non-eval harness code — evidence the harness was special-cased *to*
the benchmark. Per the capability README, special-casing the harness to ace a
task corrupts the instrument. **Fatal** — a no-longer-held-out task measures
nothing.

#### Check 6 — too-easy/too-narrow/special-cased

*A probe that trivially passes (a tautology), tests a single hardcoded literal,
or is special-cased so it can never meaningfully fail.*

Signal: an unconditional `exit 0`, a single assertion over one hardcoded path, a
suspiciously tiny body, or a guard that special-cases the exact path it checks.
A probe that cannot fail is indistinguishable from no probe.

Groomable — broaden the case or add the assertion it is missing.

#### Check 7 — machinery-growth-without-capability-movement

*The meta check: the probe count keeps growing while the capability suite score
stays flat — the "redirect" signal in `.oh/evals/capability/README.md`.*

Signal: count probes now vs. an earlier git revision, compared against the
capability `RESULTS.md` suite-score delta over the same span. Growing floor
machinery with a flat ceiling means the harness is busy but not *better*. This
is a **suite-level advisory** annotated in the report footer, not a per-row
flag.

---

### 4. Compute the verdict — KEEP / GROOM / CUT

Tally each target's raised flags from checks 1–6 (check 7 is a suite-level
footer note, not a per-row flag). `fatal` checks are **3 (always-SKIP)**,
**2 (exact duplicate)**, and **5 (no-longer-held-out)**.

| Condition | Verdict |
|-----------|---------|
| 0 flags | **KEEP** |
| 1–2 non-fatal flags | **GROOM** |
| Any fatal flag, **or** 3+ flags | **CUT** |

- **KEEP** — the target guards a real, still-held invariant/capability and earns
  its place. No action.
- **GROOM** — fixable in place: refresh a stale source pointer, rewrite an
  implementation-detail assertion into a user-outcome one, merge/differentiate a
  near-duplicate, or broaden a too-narrow case. Keep after grooming.
- **CUT** — remove or fully redesign: a probe that only ever SKIPs, an exact
  duplicate, or a benchmark task the harness has been tuned to. **CUT is a
  recommendation only** — this skill never deletes anything.

### 5. Emit report

Print today's date as `YYYY-MM-DD` (`date +%F`), then a summary line, the
KEEP/GROOM/CUT matrix (one row per target, worst verdict first), and the
per-target recommendations. The concrete emit block and a sample matrix are in
**§ Scoring procedure**. Close with the check-7 suite-level machinery-growth
footnote.

### 6. Memory Protocol

Append to `.oh/memory/YYYY-MM-DD/log.md` where today = `date -u +%Y-%m-%d` (use
`.oh/scripts/locked-append.sh` for the write):

```markdown
## [Eval Lint] — HH:MM UTC
- **Result**: OP
- **Action**: scored N probes + M capability tasks
- **Keep**: K | **Groom**: G | **Cut**: C
- **Observation**: [one sentence — top finding]
```

See `.oh/skills/retro/references/memory-protocol.md` for the canonical
Memory Improvement Protocol.

## Scoring procedure

> **US-002 fills this section** with the copy-pasteable discovery + scoring
> driver blocks (skill-lint idiom) that loop over every probe and capability
> task, run checks 1–7, cross-reference the `.oh/evals/RESULTS.md` SKIPPED
> oracle, and emit the KEEP/GROOM/CUT matrix — plus a sample matrix and the
> `git status --porcelain .oh/evals/` read-only proof. Until then, the check
> definitions in § 3 and the verdict thresholds in § 4 are the contract.

## Guidelines

- Scoring is fully deterministic — run the same commands twice and get the same
  verdicts. Do not adjust a verdict on content quality or subjective judgment.
- The always-SKIP oracle is **real data**: read the `status` column of
  `.oh/evals/RESULTS.md` (written by the last `/eval`), never a guess from
  `grep 'exit 2'`. A probe can legitimately `exit 2` in *this* environment yet
  assert normally elsewhere; only a probe RESULTS.md records as persistently
  `SKIPPED` is a true always-SKIP finding.
- **Read-only, always.** Never edit, move, or delete a probe or capability file.
  If a run leaves `git status --porcelain .oh/evals/` non-empty, the run is a
  bug — it mutated state it was only allowed to read.
- **CUT is advisory.** A `CUT` verdict is a recommendation for a human/follow-up
  task, mirroring `/skill-lint`'s `DELETE`. Deleting a hard capability task to
  inflate the suite score is the cardinal sin the capability README forbids —
  this skill flags, it does not act.
- Do not Goodhart the linter itself: `/eval-lint` is markdown-driven and ships
  no probe of its own. It must **not** be registered under `.oh/evals/probes/`
  or `link-providers.sh` — adding a probe for it grows the machinery it exists
  to groom.
- For the single-target mode (`$ARGUMENTS` = a probe or task id), run all seven
  checks and emit the same matrix for just that target, plus its recommendation.

## Reference

### Target classes

| Class | Root | Id |
|-------|------|----|
| Probe | `.oh/evals/probes/*.sh` | basename without `.sh` |
| Capability task | `.oh/evals/capability/tasks/CB-*.md` | `CB-NNN` prefix |
| Repo-orientation | `.oh/evals/capability/repo-orientation/` | `repo-orientation` |

### The seven failure modes

| # | Failure mode | Fatal? | Fix |
|---|--------------|--------|-----|
| 1 | stale | no | refresh source pointer / re-anchor assertion |
| 2 | duplicate | exact dup → yes | merge or differentiate |
| 3 | always-SKIP-in-CI | yes | run it or remove it |
| 4 | asserts-implementation-detail-not-user-outcome | no | assert the user outcome |
| 5 | no-longer-held-out | yes | restore held-out discipline or retire |
| 6 | too-easy/too-narrow/special-cased | no | broaden the case |
| 7 | machinery-growth-without-capability-movement | suite footer | redirect, don't add machinery |

### Probe status oracle (from `.oh/evals/RESULTS.md`)

Exit-code semantics written by `/eval`: `0=PASS`, `1=REGRESSION`, `2=SKIPPED`,
`124=TIMEOUT`, other=`ERROR`. `SKIPPED` does not count toward pass-rate — and a
*persistently* `SKIPPED` probe is a check-3 CUT candidate.

### Verdict thresholds

| Flags | Verdict | Action |
|-------|---------|--------|
| 0 | KEEP | Earns its place — no action |
| 1–2 non-fatal | GROOM | Fixable in place — refresh/rewrite/broaden/merge |
| Any fatal, or 3+ | CUT | Remove or redesign (advisory — never auto-applied) |

### Related skills

- `/skill-lint` — the sibling grooming pass this skill mirrors (skills ↔ evals).
- `/eval` — writes the `.oh/evals/RESULTS.md` status oracle check 3 reads.
- `/benchmark` — consumes the capability ceiling check 7 watches for movement.
