# PRD — prompt-miner symlink-safe CLI entrypoint (#663)

**Issue:** [#663](https://github.com/mifunedev/openharness/issues/663) ·
**Branch:** `task/663-prompt-miner-symlink-guard` ·
**Base:** `upstream/development` @ `afe43273`

---

## Problem

`mine-traces.mjs` exits 0 with zero stdout and zero files written when invoked
through `.claude/skills/prompt-miner/scripts/mine-traces.mjs` — the exact path
`SKILL.md` Step 1 and `.oh/crons/prompt-miner.md` both prescribe.

`.claude/skills` is a tracked directory symlink to `../.oh/skills` (mode `120000`,
created by `.oh/scripts/link-providers.sh`). Node resolves symlinks for
`import.meta.url` but **not** for `process.argv[1]`, so the guard at
`mine-traces.mjs:1140`:

```js
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { main(); }
```

never matches and `main()` is never called.

Reproduced on `development` before the fix:

```
node .claude/skills/prompt-miner/scripts/mine-traces.mjs --hours 24 --dry-run  → exit 0, ZERO stdout
node .oh/skills/prompt-miner/scripts/mine-traces.mjs   --hours 24 --dry-run  → full JSON dataset
```

**The decisive fact:** the repo already fixed this pattern twice and
`mine-traces.mjs` was the last holdout. Both siblings carry a comment naming this
exact bug:

| File | Guard form |
|---|---|
| `.oh/skills/rlm/scripts/query-context.mjs:377` | `path.basename(process.argv[1] \|\| "") === "query-context.mjs"` |
| `.oh/skills/weigh/scripts/score-trajectories.mjs:521` | `(process.argv[1] \|\| "").endsWith("score-trajectories.mjs")` |

> *"Do NOT use `import.meta.url === pathToFileURL(argv[1])` … the guard silently
> no-ops (see memory: prompt-miner-engine-symlink-guard-bug)."*
> — `score-trajectories.mjs:517-522`

Neither existing prompt-miner probe could catch it: `prompt-miner-schema-compat.sh:14`
and `prompt-miner-weakness-record.sh:16` both hardcode `SKILL_DIR="$ROOT/.oh/skills/..."`
— the **real** path — so both stayed green while the documented path was inert.
The blind spot, not the one instance, is what this PRD closes.

---

## Council verdict: PARTIAL-GO

`.oh/prompts/advisor/plan.yml` — architect ‖ pm ‖ designer in parallel, then two
adversarial critics.

| Seat | Verdict |
|---|---|
| architect | GO — basename-exact form, `mine-traces.mjs` only, extend the probe surface |
| pm | GO as a bug fix; **mis-scoped** as a "prompt-miner is fixed" signal |
| designer | GO + an `ENGINE-ERROR` tag, an `else`/`exit(70)` branch, and a `SKILL.md:92` path change |
| **critic 1** (implementer lens) | **PARTIAL-GO** — P2 REFUTED (H), P5 REFUTED (H) |
| **critic 2** (value/evidence lens) | **NO-GO** — capability framing refuted |

**Synthesis: PARTIAL-GO.** Ship the guard and the probe. Cut the two elements the
critics refuted by construction. State the ceiling plainly rather than let the fix
read as "prompt-miner works now."

### Cut — both refuted, not merely doubted

| Element | Why it dies |
|---|---|
| **`else` branch calling `process.exit(70)`** | Critic 1 built the exact patch and ran it: importing `mine-traces.mjs` as a library from any file not named `*.test.mjs` prints the guard message and exits **before the importer's next line runs**. `process.exit()` is not catchable around a static or dynamic import. The module deliberately exports `DEFAULT_WEIGHTS`, `classifyLine`, `scoreSession`; today's test file survives only by accidentally being named `.test.mjs`. **SEVERITY: H.** |
| **Repoint `SKILL.md:92` off `${CLAUDE_SKILL_DIR}`** | Justified on "`CLAUDE_SKILL_DIR` is unset — verified", but that was measured in a bare shell, which never exercises skill-body injection. `.oh/skills/builder/references/skill.md:112` lists it under *Arguments and dynamic context* alongside `$ARGUMENTS`/`$0`/`$1` — i.e. among CLI-populated values; it does not use the literal phrase "CLI-injected", so treat that as a paraphrase, not a quotation. Shipping the change would abandon a convention critic 2 counted at exactly **7** skills (blog, cloudflared, prompt-miner, retro, rlm, t3, weigh) on an unverified premise. **SEVERITY: H.** |
| **`ENGINE-ERROR` result tag** | Not refuted, but its justification largely evaporates once the guard is fixed, and `SKILL.md:69` defines a closed four-value outcome set. Deferred, not rejected. |

---

## What this does NOT fix

Stated here, in the PR body, and in the `#663` close comment — because the single
most likely misreading of this PR is "prompt-miner is fixed."

Measured 2026-08-03, live, on the real corpus:

| Window | Sessions scanned | Largest stratum | Floor (`markers.md:57`) |
|---|:--:|:--:|:--:|
| 24h | 9 | `other` = **6** | ≥ 10 |
| 168h (7d) | 14 | `other` = **9** | ≥ 10 |

`.oh/crons/.cron.log` across the cron's whole history: **19 `NO-CORPUS` + 4
`NO-SESSIONS`, zero `MINING-COMPLETE`.** No marker has ever been mined.

Markers are stratified by session type and require `sessions_supporting ≥ 10`
within a **single** stratum. Even a 7-day window measured *during* a five-agent
council run — an artificially inflated corpus — tops out at 9. **The cron will
still print `NO-CORPUS` tomorrow.** This PR converts a silent zero into an
articulate zero; that is worth doing and it is not a capability gain.

Four companion defects cap the corpus. They are filed as **two** issues rather
than four, and not smuggled into this one:

**[#692](https://github.com/mifunedev/openharness/issues/692) — the corpus floor
is structurally unreachable.** The three engine defects below are one coherent
unit: they all under-collect sessions, they share one fix session, and they share
one verification (*does the ceiling actually move?*). Splitting them would let
each be closed without ever answering that question. The issue therefore demands a
**decision** — fix collection and re-measure, restratify the floor, or re-scope
the skill around what it demonstrably produces — not just a patch.

| Defect | Location (verified 2026-08-03) |
|---|---|
| `--hours` filters on session **start**, dropping resumed sessions and every subagent trace beneath them | `mine-traces.mjs:922-924` — `const ref = agg.firstTs \|\| agg.lastTs` |
| Enumeration hardcodes one Claude project directory | `mine-traces.mjs:817` |
| `isSidechain` never handled — subagent turns folded into the parent vector | zero occurrences in the engine |

**[#693](https://github.com/mifunedev/openharness/issues/693) — worktree log-loss.**
A different surface with a different fix, so it stands alone.
`render-log-entry.sh:47` falls back to `git rev-parse --show-toplevel`, which
under `worktree: true` is the *ephemeral* worktree. The cron body implements the
correct `CRON_WORKTREE` → shared-root mapping at `.oh/crons/prompt-miner.md:102`,
but only for its own liveness line and only as a local variable it never exports —
so Step 4 survives the reap and Step 5's daily-log entry does not. Logged three
times (`.cron.log` 07-10, 07-14, 07-19) and hand-recovered each time.

**[#694](https://github.com/mifunedev/openharness/issues/694) — the reaper logs
`WORKTREE_DIRTY` forever.** Found by critic 2 auditing `.cron.log` as a primary
source, and filed on the PR's own logic: if defect discovery is the stated reason
to keep this cron enabled, an open defect its log has been shouting for 15
consecutive days cannot go unfiled. `.oh/worktrees/cron/cron-prompt-miner-0718-0500`
exists on disk with **no** `.git/worktrees/` entry, so `git status` errors with
`fatal: not a git repository` — and the runtime maps that failure into the *dirty*
branch, preserving the orphan for "manual salvage" on every fire since 07-19. A
`git status` failure is being read as evidence of uncommitted work; those are
opposite conditions. Cron-runtime scope, not engine scope, so it is separate from
both.

---

## `/audit eval-quality` Check 7 — the straight verdict

**It trips the raw signal.** `+1` probe, `+0` capability movement:
`git diff upstream/development...HEAD -- .oh/evals/capability/` is empty, and none
of the four tracked capability tasks (CB-001…CB-004) measures prompt-miner at all,
so the ceiling instrument was never wired to this cron in the first place.

Two things keep that from being a stop: Check 7 is defined at
`.oh/skills/audit/references/eval-quality.md:122-131` as a **suite-level advisory,
not a per-row flag** — there is no per-PR gate it fails — and the disclosure it
exists to induce is what this PRD does at length rather than what it omits. The
honest reading is that #692, not this PR, is where capability movement has to come
from.

## The honest counter-argument

Critic 2 returned **NO-GO**, and its strongest point survives: `.cron.log:43`
(07-19) reads *"REPEAT BLOCKER (3rd day)… **Ran via `.oh/` real path to
recover**"* — the cron agent diagnosed this bug and routed around it. Production
has not been silently failing; it has been loudly diagnosed and worked around for
23 days. The urgency framing in the issue is overstated.

One fact keeps this above the bar: **the workaround is a recurring tax, not a
fix.** `.cron.log` names this bug on 07-10, 07-18, 07-19 and 07-20 — four separate
days of an agent rediscovering it, with 07-19 reading *"REPEAT BLOCKER (3rd day)."*
Critic 2 attempted to falsify that and could not.

> ### Correction — a causal claim this PRD made and had to withdraw
>
> An earlier draft argued a second fact: that on 2026-07-22 the workaround failed
> and the no-op "wrote a wrong record" into durable memory, evidenced by
> `.oh/memory/2026-07-22/log.md` recording `NO-SESSIONS / scanned=0` while issue
> #663's body describes the same 11:03 UTC run as `NO-CORPUS (3 sessions)`.
>
> **The discrepancy is real; the attribution was wrong.** Both primary sources give
> the same cause for that run, and it is not the symlink no-op:
>
> - `.cron.log:61` — `NO-SESSIONS scanned=0 (2 long-lived sessions active in-window but firstTs predates 24h window)`
> - `.oh/memory/2026-07-22/log.md:6` — *"0 sessions started in-window; 2 long-lived sessions were active but firstTs predates the 24h window"*
>
> That is the `withinWindow` defect — **#692 material, not #663.** Why the two
> records disagree on session count is unestablished, and this PRD no longer claims
> to know. Withdrawn rather than softened, because it was cited as load-bearing.
>
> This is `IDENTITY.md:8` — asserting a remembered proxy instead of the measured
> cause — committed inside a document that cites it. Caught by the adversarial pass,
> which is what the pass is for.

The strongest case for shipping is neither the cron nor urgency: it is that
`mine-traces.mjs` was the last of three engines still carrying an anti-pattern its
own siblings document as forbidden, and **no probe existed to catch instance #4.**

**Reproducibility caveat:** `.oh/crons/.cron.log` is gitignored and exists only in
the main checkout, not in this worktree or in a fresh clone. Every claim drawn from
it above is therefore checkable only on a host that has run the cron.

---

## User stories

### US-001 — The documented invocation path runs ✅

`mine-traces.mjs` uses the symlink-safe basename guard, matching the stricter of
the two in-tree precedents (`rlm`, exact `===`, over `weigh`'s `.endsWith`).

**Acceptance criteria**
- `node .claude/skills/prompt-miner/scripts/mine-traces.mjs --dry-run --no-git --fixtures-dir <fixtures>` exits 0 with a parseable dataset and `sessionsScanned > 0`.
- The real `.oh/skills/...` path produces the same result.
- The now-unused `pathToFileURL` import is removed (it had exactly one call site).
- A header comment names the failure mode, issue #663, and both sibling precedents.
- `node --test .oh/skills/prompt-miner/scripts/__tests__/mine-traces.test.mjs` — 19/19 pass; importing the module as a library still does not invoke `main()`.

### US-001b — The basename guard's residual limitation is documented ✅

Critic 1 demonstrated (SEVERITY: M) that the basename form trusts `basename(argv[1])`
globally rather than file identity: a *different* file named `mine-traces.mjs` that
imports this module would fire `main()` — and without `--dry-run`, `writeReports()`.
Verified: no such file exists in the repo.

**Deliberately not "fixed."** A realpath comparison would be both symlink- and
collision-safe, but adopting it here alone would leave three sibling engines with
three different guards — re-creating the divergence this PR exists to end. The
limitation is recorded in the engine header instead, with the instruction to change
all three together or none.

### US-002 — A probe catches the blind spot, not just the instance ✅

`.oh/evals/probes/prompt-miner-symlink-entrypoint.sh`, tier A.

**Acceptance criteria**
- **Behavioral guard:** builds its own `ln -s "$ROOT/.oh/skills" "$TMP/skills"` — reproducing the provider layout rather than depending on `.claude/skills` being materialized — invokes the engine through it, and asserts exit 0, non-empty stdout, parseable JSON, `sessionsScanned > 0`.
- **Static guard:** no *executable* line under `.oh/skills/**/*.mjs` compares `import.meta.url` with `===` **in either operand order**, nor hands `process.argv` to `pathToFileURL(`. Comment lines are excluded — all three engines carry the comparison inside a warning comment naming this bug.
- Hermetic: `--fixtures-dir` + `--no-git`; no network, no real traces.
- Honest `exit 2` when node, the skill dir, the fixtures, or symlink support is absent.
- Falsifiability evidence in the PR body: four scripted mutations, each reverted.

> **Round 2 — the static guard was evadable and the critic proved it.** The first
> version matched only `import\.meta\.url[[:space:]]*===`, so
> `pathToFileURL(process.argv[1] || "").href === import.meta.url` — functionally
> identical — passed the probe with the live defect in the tree. Critic 1 appended
> exactly that line to `rlm/scripts/query-context.mjs` and got `exit 0`. Fixed by
> matching both operand orders **and** adding a second, mechanism-level pattern
> (`pathToFileURL\([^)]*process\.argv`) that also catches the line-split form the
> operand-order regex cannot see. Re-verified: forward order, reverse order,
> reverse-order-with-line-split, and the restored pre-fix guard all now `exit 1`;
> the three comment-only occurrences still `exit 0`.

### US-003 — The cron file stops contradicting itself ✅

`.oh/crons/prompt-miner.md:5` is `enabled: true`; the body claimed *"this cron
ships `enabled: false`."*

**Resolved toward the tracked state — deliberately, against the council's initial
lean.** The evidence for disabling looks strong (23 days, zero markers, a floor
the corpus cannot reach) and is misleading: **this cron filed #663.** Its realized
value has been defect discovery, not marker mining. Disabling it would remove the
instrument that found the bug this PR fixes.

Critic 2 attacked this as ratifying drift — the thing `/audit drift` exists to
catch — and produced the archaeology that settles it in the opposite direction:
`enabled: true` was set by a **dedicated, deliberate commit**, `feat: enable the
prompt-miner daily cron (#277)`, landed 2026-06-25 (in forward-sync `85d42384`,
body line 622) — roughly five weeks before this PR. The code was the intentional,
older, tracked state and the doc paragraph simply never caught up. Fixing the doc
to match is correcting stale prose, not ratifying drift.

Critic 2 also corroborated the authorship claim circumstantially: issue #663's
`createdAt` is `2026-07-22T11:03:12Z`, **two seconds** after `.cron.log`'s 07-22
result line at `11:03:10`.

**Acceptance criteria**
- The body describes the actual `enabled: true` state and the flip-to-`false` kill switch.
- The frontmatter is named as the single source of truth.
- `schedule`, `timezone`, `enabled`, `preflight` and every cap unchanged — no behavior change.

### US-004 — The ceiling is on the record ✅

Critic 2 verified that at council time **zero** companion issues existed —
`gh issue list --label prompt-miner` returned only #663 — so "file follow-ups" was
an unexecuted promise. Filed before this PR opened, not after.

**Acceptance criteria**
- Companion issues filed against `mifunedev/openharness`, labeled `prompt-miner`, before #663 is closed → [#692](https://github.com/mifunedev/openharness/issues/692), [#693](https://github.com/mifunedev/openharness/issues/693), [#694](https://github.com/mifunedev/openharness/issues/694).
- Scoped by fix session and verification rather than one-per-defect: #692 bundles the three engine collection defects (one fix, one question — *does the ceiling move?*), #693 is a helper-resolution fix, #694 is cron-runtime.
- The PR body and the #663 close comment carry the measured ceiling table and state plainly that `NO-CORPUS` is unchanged.

#694 was added in round 2. Critic 2 pointed out the PR was arguing "keep the cron
because its realized value is defect discovery" while leaving an open defect its
own log had been shouting for 15 consecutive days unfiled. That is the argument
failing to pay its own bill.

---

## Guards

| Guard | Result |
|---|---|
| Always-loaded token delta | **0** — `git diff --stat -- AGENTS.md .oh/context/ .oh/memory/` empty |
| Net new executables | **1** (the probe) · new skills **0** · new CI jobs **0** |
| `SKILL.md` frontmatter / agent `description:` touched | none |
| `bash .oh/skills/eval/run.sh` | 90 PASS / 3 SKIPPED / 1 REGRESSION — `next-dev-prod`, pre-existing and `unchanged`; **no green→red** |
| Regression count vs baseline | Baseline `upstream/development` carried **2** REGRESSIONs; this run shows **1**. Stated because "no green→red" alone would let a reader credit this PR for the improvement: `cc-safety-net-wiring` went REGRESSION→SKIPPED for an unrelated environmental reason (see below), not because anything here fixed it. |
| Engine unit tests | 19/19 pass |

Two probes moved to `SKIPPED` in this worktree and both were diagnosed, not
assumed: `autopilot-preflight-gate` needs a gitignored `harness.yaml` that exists
only in the main checkout, and `cc-safety-net-wiring` needs a binary absent
outside the built sandbox image (its static wiring half passed). Neither touches
any file in this diff.
