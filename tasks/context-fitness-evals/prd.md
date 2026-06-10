# PRD: Context Fitness-Function Eval System

## 1. Introduction/Overview

The Open Harness orchestrator's steering context — `context/rules/*`, `memory/MEMORY.md`, `context/IDENTITY.md`, and skills — is **append-only**. It grows and is never safely pruned, because nothing measures whether a given line is load-bearing. The same gap leaves named fixes uncscheduled: `MEMORY.md` recorded "move `mifunedev/website` off `next dev` to a production server" on 2026-06-04, the fix was never done, and the leak cost 3.85GB of RAM again six days later. That is an **omission** failure — a known fix nobody scheduled — which a behavioral eval would not catch.

This feature gives the harness a **fitness function**: a corpus of deterministic **probes** that turn lessons into runnable, exit-code-scored checks against *real state*. A rectification is provably "done" when its probe is green; a recurrence shows up automatically as a was-green-now-red regression; and an **ablation gate** (generalizing `/context-audit`'s Tier-2 harness) can prove a context file load-bearing, finally making deletion safe. The system is a **triage**, not a hammer: most lessons are routed to the cheapest reliable correction surface (harden → hook+test, or proceduralize → skill-step+doc-lint), with behavioral evals reserved for genuine judgment residue and **deferred out of v1**.

## 2. Goals

- Make every lesson/rectification **closeable by a deterministic probe** — "done" = probe green, not a hand-flipped status.
- **Catch omission/recurrence automatically**: a was-green-now-red probe on real state is the escalation signal.
- **Make context prunable**: extend `/context-audit` Tier-2 ablation so a probe proves a rule/memory file load-bearing before anything is cut.
- **Route to the cheapest surface**: harden / proceduralize / eval (residue only); default *away* from expensive evals.
- Expose a **benchmark** — suite pass-rate over time in `evals/RESULTS.md` — as the context fitness value.
- Keep **Tier-B behavioral evals out of v1** and never hard-gate on a noisy metric.

## 3. User Stories

### US-001: Establish the `evals/` corpus and probe contract

**Description:** As the orchestrator, I need a defined home and convention for probes so every later story has a contract to target.

**Acceptance Criteria:**

- [ ] `evals/` directory created with a tracked `README.md` per `context/rules/directory-readme.md` (one-line intent, subfolder table, conventions, pointer to this PRD)
- [ ] `evals/probes/` subfolder documented; probe convention specified: a probe is `evals/probes/<id>.sh`, exit `0` = correct/desired-state-present, non-zero = regression, stderr carries a one-line human reason
- [ ] Probe header convention defined and documented: each probe declares `# tier: A|ablation`, `# source: <MEMORY.md date | rule path | skill>`, `# desc: <one line>` as comment lines
- [ ] `evals/RESULTS.md` schema defined (columns: `probe id | tier | last-run (UTC) | status | source`) with a documented append/overwrite policy
- [ ] `.gitignore` reviewed: probe scripts and `RESULTS.md` are tracked (they are the benchmark, not scratch)
- [ ] `shellcheck` passes on any sample/example probe shipped

### US-002: `/eval` runner skill

**Description:** As the orchestrator, I want one command that runs the probe suite against real state and records the result so the benchmark is a single invocation.

**Acceptance Criteria:**

- [ ] `.claude/skills/eval/SKILL.md` created; discovers `evals/probes/*.sh`, executes each, collects exit code + stderr reason
- [ ] Writes/updates `evals/RESULTS.md` with per-probe status and an explicit **delta vs. previous run** (new-fail, new-pass, unchanged)
- [ ] A green→red transition is reported as a `REGRESSION` line, naming the probe's `source`, at the top of the run summary
- [ ] Supports `--probe <id>` to run a single probe and `--tier A` to filter
- [ ] Appends a Memory Improvement Protocol log entry per `context/rules/memory.md`
- [ ] Registered in the orchestrator skills table (`AGENTS.md`, via `readlink -f CLAUDE.md`) and added to `.claude/protected-paths.txt` in the same change
- [ ] `shellcheck` / markdown structure check passes

### US-003: Seed probe `next-dev-prod` (Tier-A state probe)

**Description:** As the orchestrator, I want the recurring `next dev` leak encoded as a probe so the omission can never be silently re-paid.

**Acceptance Criteria:**

- [ ] `evals/probes/next-dev-prod.sh` inspects **real state** (running processes / tmux pane serving the public `mifunedev/website`) and exits non-zero while the public site is served by `next dev`
- [ ] Probe is self-contained: degrades gracefully (clear stderr, defined exit) when the website sandbox is not present, rather than erroring
- [ ] Header declares `# tier: A`, `# source: memory/MEMORY.md 2026-06-04`
- [ ] Running `/eval --probe next-dev-prod` records the probe in `RESULTS.md`
- [ ] `shellcheck` passes

### US-004: Harden the `/dev/tcp`-in-zsh lesson (hook + unit test)

**Description:** As the orchestrator, I want the `/dev/tcp` foot-gun blocked deterministically rather than relied on as a remembered rule.

**Acceptance Criteria:**

- [ ] A PreToolUse Bash hook (under `.claude/hooks/`) detects `/dev/tcp/` in a command and emits a non-blocking warning recommending `ss`/`curl`/`nc`
- [ ] A probe `evals/probes/devtcp-hook.sh` unit-tests the hook using the file-fixture pattern (test driver written to a script file, tokens in shell variables — per the existing hook-testing lesson) and asserts the warning fires
- [ ] The hook does **not** false-positive on substrings like `.devcontainer` or paths merely containing `dev` (explicit command-position class, not `\b`)
- [ ] Header declares `# tier: A`, `# source: memory/MEMORY.md 2026-06-10 (zsh /dev/tcp)`
- [ ] `shellcheck` passes on hook + probe

### US-005: Proceduralize `docker stats` into `/health-check` (step + doc-lint probe)

**Description:** As the orchestrator, I want the "diagnose RAM with `docker stats`, not `docker ps` Size" technique baked into the skill, with a probe that the step still exists.

**Acceptance Criteria:**

- [ ] `/health-check` (`.claude/skills/health-check/SKILL.md`) gains an explicit step: when memory is the binding constraint, run `docker stats` per-container and drop into the heaviest container's process list — **extends, does not remove** any existing ladder step
- [ ] A probe `evals/probes/health-check-docker-stats.sh` doc-lints the skill: greps for the `docker stats` step and exits non-zero if absent
- [ ] Header declares `# tier: A`, `# source: memory/MEMORY.md 2026-06-10 (docker stats vs ps Size)`
- [ ] `shellcheck` passes; `/health-check` skill still passes its own structure expectations

### US-006: Ablation gate — generalize `/context-audit` Tier-2 (shared engine)

**Description:** As a context curator, I want to run a probe with and without a target context file loaded so I can prove the file load-bearing before deleting it.

**Acceptance Criteria:**

- [ ] `/eval --ablate <context-file> --probe <id>` runs the probe with the target file present and with it removed/blanked, reporting `LOAD-BEARING` (regression on removal) or `PRUNABLE` (no change)
- [ ] Implementation **reuses** `/context-audit`'s Tier-2 ablation mechanism (shared script/module or skill invocation) — it does **not** fork or duplicate the logic; `/context-audit` existing behavior is unchanged
- [ ] Ablation never mutates tracked files in place (operates on a copy / restores afterward); verified by a clean `git status` after a run
- [ ] Result recorded distinctly from Tier-A status in `RESULTS.md` (tier `ablation`)
- [ ] `shellcheck` / markdown check passes

### US-007: Weekly cron — scheduled benchmark + regression surfacing

**Description:** As the orchestrator, I want the suite to run unattended weekly so regressions surface without a human remembering to run `/eval`.

**Acceptance Criteria:**

- [ ] `crons/eval-weekly.md` created following the existing cron spec shape (compatible with `scripts/cron-runtime.ts`), `overlap: false`
- [ ] The cron runs `/eval`, and on any `REGRESSION` writes a dated entry to `memory/<UTC-date>/log.md` naming the regressed probe and its `source` (log-only in v1; no auto-issue, no notification)
- [ ] Does not modify or remove `crons/heartbeat.md` or `crons/cleanup-tasks.md`
- [ ] A `crons/README.md` row (or equivalent) documents the new entry

### US-008: `/retro` integration — triage + register-a-probe

**Description:** As the orchestrator closing a session, I want `/retro` to route each supported lesson to its cheapest surface and attach a probe, so lessons become closeable instead of becoming bullets.

**Acceptance Criteria:**

- [ ] `/retro` (`.claude/skills/retro/SKILL.md`) gains a step that, for each `supported` promotable lesson, classifies it as `harden | proceduralize | eval` and records the chosen surface
- [ ] When a lesson is promoted to `MEMORY.md`, `/retro` proposes a probe id (or hook/skill-step) so the lesson is closeable; the recurrence check escalates a matching un-green probe instead of skip-as-duplicate
- [ ] The triage defaults *away* from behavioral evals (Tier-B is deferred); proposing a Tier-B eval requires an explicit note
- [ ] `/retro`'s existing scientific loop + propose-then-confirm gate are **preserved**, not replaced
- [ ] Markdown structure check passes

## 4. Functional Requirements

- **FR-1:** The system MUST define a probe as `evals/probes/<id>.sh` with an exit-code oracle (`0` = correct, non-zero = regression) and a declared `# tier:` / `# source:` / `# desc:` header.
- **FR-2:** Probes MUST inspect real state/artifacts (running processes, actual rule/skill files, live sandbox) — never mocks or synthetic fixtures — except hook-unit-test probes, which use the documented file-fixture driver pattern.
- **FR-3:** `/eval` MUST discover and run all `evals/probes/*.sh`, record per-probe status to `evals/RESULTS.md`, and compute a delta vs. the previous run.
- **FR-4:** `/eval` MUST flag any green→red transition as a `REGRESSION`, naming the probe's `source`.
- **FR-5:** The system MUST provide an ablation mode that runs a probe with and without a target context file and reports `LOAD-BEARING` or `PRUNABLE`, reusing `/context-audit`'s Tier-2 engine without forking it.
- **FR-6:** Ablation MUST NOT leave tracked files mutated (`git status` clean after a run).
- **FR-7:** A weekly cron MUST run `/eval` unattended and write any regression to the daily memory log (log-only in v1).
- **FR-8:** `/retro` MUST route each supported lesson to a correction surface (harden / proceduralize / eval) and attach a closeable probe, defaulting away from Tier-B.
- **FR-9:** Any new load-bearing skill/script (`/eval`, its scripts) MUST be added to `.claude/protected-paths.txt` in the same change that introduces it.
- **FR-10:** The system MUST NOT remove or alter existing behavior of `/context-audit`, `/health-check`, `/retro`, `crons/heartbeat.md`, or `crons/cleanup-tasks.md` — only extend.

## 5. Non-Goals (Out of Scope)

- **Tier-B behavioral evals** — spawning a sub-agent and LLM-judging judgment-call behavior (e.g. propose-then-confirm). Deferred until Tier-A proves the runner trustworthy.
- **Any LLM-judge oracle** in v1 (statistical, Goodhart- and fixture-drift-prone).
- **Hard CI gates** on probe results — `/eval` reports and logs; it does not block merges or fail pipelines in v1.
- **Auto-remediation** — the system flags regressions; it does not fix them automatically.
- **Sandbox application code** — this is orchestrator infrastructure only; no business/product code.
- **Auto-launching the Ralph loop** — this PRD scaffolds the task; implementation cadence is manual per `/ship-spec` v1.

## 6. Design Considerations

- Probes are plain POSIX-ish shell with exit-code semantics — the lowest-friction oracle and trivially composable by `/eval`.
- `RESULTS.md` is human-readable markdown so the benchmark is greppable and diff-friendly; deltas live in the same file's history.
- Reuse over rebuild: ablation extends `/context-audit`; the `/dev/tcp` hook follows existing `.claude/hooks/` conventions; the cron follows `crons/*.md` + `scripts/cron-runtime.ts`.

## 7. Technical Considerations

- **Orchestrator boundary:** every artifact lives in `evals/`, `.claude/skills/`, `.claude/hooks/`, `scripts/`, or `crons/` — harness infrastructure, not sandbox code (mirrors `/context-audit`, `/skill-lint`).
- **Shared ablation engine:** the exact reuse boundary with `/context-audit` Tier-2 (common module vs. skill invocation) is an open question (§9) for the implementer to resolve without duplication.
- **Probe sandbox access:** some probes (`next-dev-prod`) inspect a running sandbox; they MUST degrade gracefully when it is absent and carry a bounded timeout.
- **Hook testing:** the `/dev/tcp` hook unit test MUST use the file-fixture driver pattern (tokens in shell vars, driver written to a file) to avoid the hook scanning its own test command.
- **Gitignore:** probes and `RESULTS.md` are tracked; ablation temp copies are not.

## 8. Success Metrics

- The `next-dev-prod` probe exists and currently reports red — i.e., the omission is now *visible* rather than silent.
- ≥ 3 seed probes registered and runnable via a single `/eval` invocation, each mapped to its cheapest correction surface (1 state-probe, 1 hardened-hook, 1 proceduralized-skill).
- A green→red transition is surfaced as a named `REGRESSION` without a human re-reading `MEMORY.md`.
- At least one context file can be classified `LOAD-BEARING` or `PRUNABLE` via the ablation gate.

## 9. Open Questions

- **Probe contract & discovery:** bare `evals/probes/*.sh` convention vs. a manifest; is the comment-header metadata sufficient or is a sidecar needed?
- **Ablation reuse boundary:** exactly how to share `/context-audit`'s Tier-2 engine — extract a common script both call, or have `/eval` invoke the skill — without forking?
- **Scoreboard history & denominator drift:** append-only `RESULTS.md` vs. per-run artifacts; how is "regression" defined when probes are added/removed between runs?
- **Cron-on-regression behavior:** log-only is v1; when does it graduate to opening a tracked issue or notifying?
- **Probe execution/safety:** timeout, isolation, and orchestrator-boundary policy for a probe that touches a running sandbox.
- **`/retro` enforcement:** how strictly should the triage be enforced so lessons get the cheapest surface rather than defaulting to a bare bullet or an eval?

## 10. Critique Mitigations (binding — overrides conflicting ACs above)

Resolves the 2-critic review (`critique.md`); each item binds the implementer.

- **M-1 (A-H1/A-H3/B-H2 · US-006, FR-5 — ablation reuse boundary):** `/context-audit` Tier-2's *oracle* is `claude -p` LLM marker-scoring (SKILL.md:236,263) — that is the deferred Tier-B mechanism and is **NOT** reused. What is reused is only the **file swap/restore/trap harness** (SKILL.md:255-268: `cp $T $T.bak` → `trap 'mv $T.bak $T' EXIT` → `mv $T $T.bak` → run → restore). The ablation **oracle is the shell probe's exit code.** FR-5 amended: extract those mechanics into a shared `scripts/ablate.sh` that both `/eval` and `/context-audit` source — do not duplicate, do not reuse the `claude -p` runner.
- **M-2 (B-H2 · US-006 — restore on hard kill):** `trap … EXIT` does NOT fire on `SIGKILL`/OOM. `/eval` MUST, on startup, detect orphaned `*.bak` from a prior crashed ablation and restore them before running. Operator escape hatch documented: `git restore <file>`. Verification tightened from "clean `git status`" to **`git diff --exit-code HEAD` passes after each run.**
- **M-3 (A-H2/B-H3/B-M · protected-paths):** This PRD authorizes pre-registration. The implementation change adds bare entries `eval`, `health-check`, `retro` under "Orchestrator skills" in `.claude/protected-paths.txt` (bare names, no `.claude/skills/` prefix).
- **M-4 (B-H1/A-M · US-001, US-002 — RESULTS.md policy + first run):** `evals/RESULTS.md` = **overwrite the current-status row per probe-id; git history is the time series** (no unbounded append). On the **first run** (no prior file) every probe is `new-pass`/`new-fail`; NO `REGRESSION` without prior state. Header-extraction contract is exact: `grep -E '^# (tier|source|desc):'`.
- **M-5 (A-M/B-M · US-003 — third exit state):** Probe oracle is 3-state: `0`=PASS, `1`=REGRESSION (bad condition present), `2`=SKIPPED/not-applicable (target sandbox absent). Exit `0` on an absent sandbox is **FORBIDDEN**. `/eval` renders SKIPPED distinctly and never counts it as PASS or REGRESSION.
- **M-6 (B-M · all probes — timeout):** Every probe MUST finish within a bounded timeout (default 30s); `/eval` wraps each in `timeout` and marks a hung probe `TIMEOUT` (non-PASS).
- **M-7 (A-M · US-004 — hook wiring):** The `/dev/tcp` hook registers in `.claude/settings.json` under `hooks.PreToolUse` following the existing `deny-env-dump.sh` pattern; it is **non-blocking** (warn on stderr, exit 0) — it must not deny the command.
- **M-8 (A-M/B-M · US-007 — cron executability):** Implementer MUST first read `scripts/cron-runtime.ts` to confirm how a cron runs a skill; if skill-delegation is unsupported, the cron INLINES probe discovery+run. **Log-only-on-regression is accepted v1 behavior** (added to Non-Goals); auto-issue/notification is v2.
- **M-9 (A-M · US-008 — /retro scope split):** v1 ships ONLY the minimal triage tag (`harden|proceduralize|eval` + proposed probe id). Recurrence-escalation and deeper integration are split to a follow-up so `/retro`'s propose-then-confirm gate and scientific loop stay untouched.
- **Pre-existing issue (B-L · does NOT block):** `.claude/protected-paths.txt` lists `.claude/ICP.md` but the file is MISSING at root (only worktree copies). Protected-path integrity bug unrelated to this PRD — file separately.
