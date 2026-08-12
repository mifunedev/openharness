# PRD: `firstmate` executor — herdr-managed First-Mate build session with tmux fallback

**Issue:** #746 · **Branch:** `feat/746-firstmate-executor` · **Base:** `development` · **Repo:** `mifunedev/openharness`
**Source plan:** `.claude/plans/first-mate-delegate-the-staged-minsky.md` (Captain-approved)

---

## 1. Introduction / Overview

### Context

The Captain branched this session to fix the `/spec` process: graduate away from
`.oh/scripts/ralph.sh` (a bash loop that re-sends `prompt.md` up to 50 times to `claude --print`)
toward the workflow already declared in `.oh/prompts/advisor/*` — a single long-lived First-Mate
agent session — with **herdr** replacing raw tmux as session manager, and the session holding the
`prd.json` task graph natively ("the latest round of models does well by linking taskgraph and
prd.json"). Captain constraint received mid-planning: **if herdr is not installed, fall back to
tmux.**

Recon (3 Explore agents + PM decomposition, all verified against the repo):

- **The prompt pack is declarative but uninterpreted** — no code executes
  `.oh/prompts/advisor/{plan,implement,pr}.yml`; they are operator-authored (byte-identical edits
  only), guarded by `first-mate-charter.sh` (which hardcodes a 3-YAML array). Routing lives in
  `.oh/context/rules/first-mate.md` § Effort Scaling, enforced by `/delegate`.
- **`STATUS: COMPLETE` (whole line in `.oh/tasks/<slug>/progress.txt`) is the true public
  interface** — 5 consumers (`ralph.sh` ×2 channels, ship-spec Stage-10 watch, autopilot poller,
  cleanup-tasks cron, glossary). It is invariant.
- **Cheapest seam:** the existing `SHIP_SPEC_EXECUTOR` / `AUTOPILOT_EXECUTOR` toggles. Tier-1
  probes (`autopilot-executor-toggle.sh` ~30 exact strings, `ralph-fallback-order.sh`,
  `advisor-monitored-loop.sh`) assert the *presence* of ralph branches, not exclusivity — adding an
  executor keeps them green; flipping the default rewrites ~30 pinned strings.
- **herdr** (pinned 0.7.4, client/server, socket path agent-denied → CLI only):
  `agent start <name> --cwd --env --no-focus -- <argv>`, server-side
  `wait output --match '^STATUS: COMPLETE$' --regex --timeout`, `wait agent-status --status done`,
  `pane process-info` liveness, `worktree open` / `workspace close`. **`agent get <name>` EXISTS and
  is the liveness oracle** — live-verified against the pinned 0.7.4 in this sandbox (critique round
  1): exit 0 with an `agent_info` JSON payload for a live agent, exit 1 with `agent_not_found` for an
  absent one. Real gaps: **no file logging** (keep `| tee`), agents may never restart the server,
  `allow_nested=false`, `--no-focus` mandatory. Prior art: `/fanout`'s `--runner herdr|tmux|bg`
  ladder + `foreground_cwd` verification.
- **Protected:** `ralph.sh`, the `ralph` skill, and `sandbox-processes.md` are protected paths;
  `ralph.test.ts` (23 cases) must stay green untouched; **`CLAUDE.md` is a symlink to `AGENTS.md`**
  (`CLAUDE.md -> AGENTS.md`) — edit `AGENTS.md` only; writing `CLAUDE.md` independently (or any
  temp+rename atomic replace) severs the link permanently.
- **Norms conflict to resolve in-scope:** `sandbox-processes.md` says every long-running process is
  tmux; `AGENTS.md:212` carves interactive work into Herdr. Build sessions sit in the middle →
  rewrite as a ladder, not a cutover.

> **Reading note on the recon bullet above (critique A-H3, `[PROTECTED-PATH]`):** the plan's phrase
> "rewrite as a ladder" is quoted verbatim as recon, but the **shipped requirement is an addition,
> never a rewrite**. `.oh/skills/t3/references/sandbox-processes.md` is a protected path; US-008
> requires a pure-insertion diff (zero deleted lines) with the existing gateway rationale surviving
> verbatim. Where this document and that bullet appear to differ, US-008's ACs govern.

### What this PRD delivers

A **third build executor** (`firstmate`) that runs one long-lived First-Mate agent session holding
the `prd.json` task graph, launched through a **herdr → tmux → foreground** runner ladder, shipped
**opt-in** alongside the unchanged `ralph` default.

---

## 2. Captain decisions (locked via `AskUserQuestion`)

1. **Prompt source:** skill-owned template `.oh/skills/firstmate/templates/session-prompt.md`, a
   derivative of `implement.yml` / `pr.yml` (probe asserts step-order equivalence). **Zero bytes
   change under `.oh/prompts/`.**
2. **Rollout:** opt-in first. `--executor=firstmate` ships alongside the unchanged `ralph` default;
   the default flip is a follow-up PR after green live runs.
3. **ROUTING:** record the Luna/Sol table verbatim as target routing; today's delegations use the
   Fable/Opus block.
4. **Autopilot:** pass-through flag only (pure deferral to `/ship-spec --executor=firstmate`); its
   inline ralph fallback is untouched.

5. **Carrying a third executor indefinitely:** the operator was asked and **explicitly accepted** it —
   opt-in rollout, `ralph` retained indefinitely as the degraded-environment executor, default flip
   deferred to a follow-up. This recorded decision is the mitigation for the critique's
   audience-misalignment finding (B-H, `[STORY: *]`): three executors is a deliberate operator
   choice, not an unexamined default.

6. **Execution-context gate (ORCHESTRATOR AMENDMENT — pending Captain review at the PR gate).** Not a
   Captain-issued decision: an orchestrator extension of Captain decision-adjacent constraint *"if
   herdr is not installed, fall back to tmux"* to the case **"installed but out-of-environment."**
   Q0 (§15) is now **RESOLVED by live probe**: herdr panes are **host** processes, outside the
   sandbox, while `AGENTS.md` requires all building and testing **inside** the sandbox. Therefore
   **herdr mode is eligible only when `runner_detect` proves same-environment execution** (the
   fingerprint gate in §5's Detection row and US-001); on mismatch the ladder degrades to tmux with
   the reason logged. In **this** deployment the gate refuses herdr and firstmate runs in tmux mode;
   herdr-primary remains fully supported for deployments whose herdr server runs in-environment. The
   PR description must surface this amendment explicitly for Captain review (US-010 AC, §14).

**First-Mate-owned calls (HOW):** herdr agent name `firstmate-<slug>`; tmux fallback session
`agent-firstmate-<slug>` (satisfies `<category>-<identifier>`); logs `/tmp/firstmate-<slug>.log`
(herdr) / `/tmp/agent-firstmate-<slug>.log` (tmux). Ralph is retained **indefinitely** as the
degraded-environment executor (sunset decision deferred to the default-flip follow-up). One PR for
P1–P10; **P11 is split to its own issue.**

---

## 3. ROUTING

Recorded verbatim as target routing; today's delegations use the Fable/Opus block.

> **Not shipped by this PR.** The Luna/Sol block below is **target/aspirational routing and is NOT in
> effect** — it is planning context captured verbatim per Captain decision #3, with no story, AC, or
> FR that writes it into `.oh/context/rules/first-mate.md` or anywhere else. The **Fable/Opus** block
> is what today's delegations actually use. See Non-Goals.

```
FIRSTMATE=Luna max
ADVISOR=Sol - xhigh | max
PLAN=Sol - high | xhigh
CRITIQUE=Sol - high | xhigh
IMPLEMENT=Luna - max
AUDIT=Sol - high | xhigh
RETRO=Sol - high | xhigh
CLEANUP=Luna - max
GIT=Luna - max
---
FIRSTMATE=Fable - high | xhigh
ADVISOR=Fable - xhigh | max
PLAN=Opus - high | xhigh | max
CRITIQUE=Fable - medium | high
IMPLEMENT=Opus - low | medium
AUDIT=Fable - high | xhigh | max
RETRO=Fable - high | xhigh
CLEANUP=Opus - low | medium
GIT=Opus - low | medium
```

**Delegation for this build (today's Fable/Opus block):** P1/P2/P5/P8/P9 = IMPLEMENT Opus
low–medium workers under Fable audit; P3 = architecture — Opus plan tier with Fable (xhigh) advisor
review; P7/P11 = Opus low; audits = Fable high/xhigh.

---

## 4. Goals

- Ship a `firstmate` executor that runs **one** long-lived First-Mate session per task, holding
  `prd.json`'s `userStories[]` as the session's native task graph.
- Make the session manager a **ladder** (herdr → tmux → foreground), never a cutover — the tmux
  fallback runs the *same* First-Mate workflow, never a silent regression to the ralph loop.
- Preserve `STATUS: COMPLETE` (whole line in `progress.txt`) as the invariant public interface for
  all 5 existing consumers.
- Ship **opt-in**: `--executor=firstmate` alongside an unchanged `ralph` default; zero behavior
  change for anyone who does not pass the flag.
- Resolve the `sandbox-processes.md` ⇄ `AGENTS.md:212` norms conflict by **adding a ladder**, not by
  replacing the tmux norm for managed/headless services.
- Prove the executor with a **real** live run per runner mode — the tmux arm unconditionally to
  `STATUS: COMPLETE`, the herdr arm **conditionally** (in this deployment the deliverable is the
  observed execution-context gate refusal, §15 Q0) — each on its **own** throwaway slug, captured in
  a committed `evidence.md`.

---

## 5. Design: the `firstmate` executor

**Two orthogonal axes.** `--executor` (build shape: `ralph` | `delegate-advisor` | `firstmate`) ×
runner (session manager: **herdr → tmux → foreground** ladder). The tmux fallback runs the *same*
First-Mate workflow — never a silent regression to the ralph loop.

| Concern | Contract |
|---|---|
| Detection | herdr requires a **zeroth guard plus three conjuncts**. **Zeroth — nesting guard:** when the caller is itself inside a herdr pane (`HERDR_ENV=1`, optionally AND-ed with `-n HERDR_PANE_ID` — herdr 0.7.4's own in-pane markers, inherited by every child of a pane), `runner_detect` **skips the probe-pane launch entirely** and rules herdr ineligible (reason logged: `allow_nested=false` policy), degrading to tmux — the permanent detection path must never itself nest a pane, not just the US-010 smoke launch. Then the three conjuncts: `command -v herdr`, **and** healthy `herdr status` (binary-up/server-down degrades), **and** the **execution-context gate**. **Health predicate is pinned to literal fields:** `herdr status` must show `status: running` **and** `compatible: yes` — both literals, no other interpretation of "healthy". **Execution-context gate (§15 Q0, resolved):** `runner_detect` launches a short-lived probe pane that emits an environment fingerprint — hostname, presence of `/.dockerenv`, and whether the target worktree path resolves — and compares it against the caller's own fingerprint; **any mismatch ⇒ herdr is ineligible**, the ladder degrades to tmux and the reason is written to the firstmate log. Explicit `OH_RUNNER`/`--runner herdr` when herdr is unavailable **or out-of-environment** = hard error **naming the fingerprint mismatch** — never a silent degrade and **never a silent host-side run**. |
| Launch (herdr) | `herdr agent start firstmate-<slug> --cwd <worktree> --no-focus -- bash -lc '<harness> "/goal <rendered-prompt>" 2>&1 \| tee /tmp/firstmate-<slug>.log'`, then verify `foreground_cwd` via `pane list` (cwd flags silently lie — fanout's lesson). |
| Launch (tmux) | `tmux new-session -d -s agent-firstmate-<slug> -c <worktree> '… 2>&1 \| tee /tmp/agent-firstmate-<slug>.log'` |
| Launch (foreground) | inline `exec`, still tee'd. **The tee is NEW behavior, not ralph parity:** `ralph.sh:428-431` (the no-tmux foreground fallback) contains **no** `\| tee` — it does not log to a file today. The citation is prior art for the *fallback shape*, not for the logging. |
| Watch (herdr) | `herdr wait output <pane> --match '^STATUS: COMPLETE$' --regex --timeout <ms>`; **progress.txt stays the authority** — the match triggers a re-read and self-heals the file (ralph's 2nd channel). Liveness: `herdr agent get <name>` (exit 0 `agent_info` = live, exit 1 `agent_not_found` = gone) plus `pane process-info`. **Pane id provenance:** `runner_launch` parses the pane id out of the `herdr agent start` JSON response and exposes it via one documented accessor; the *same* id feeds `runner_verify_cwd` and this watch call. **Timeout:** `<ms>` = the validated budget returned by `resolve_timeout_ms` — the session budget (below); never a raw env expansion. |
| Watch (tmux/foreground) | Reuse autopilot's bounded bash poll verbatim (`grep '^STATUS: COMPLETE'` + `tmux has-session`) / process exit + final grep — **bounded by the same `FIRSTMATE_TIMEOUT_MS` wall clock**, so no mode can poll forever. |
| Session budget | **The session is wall-clock-bounded, never unbounded.** `FIRSTMATE_TIMEOUT_MS` (default `14400000` = 4 hours) is the total budget: it is the `--timeout` passed to `herdr wait output` in herdr mode and the ceiling on the bounded poll loop in tmux/foreground mode. **All consumers obtain it only via the validating `resolve_timeout_ms` helper** — `0`, negative, non-numeric, or empty values are rejected and the default applies (logged), so no path can watch forever or instantly expire. On expiry the session is treated as **death without sentinel** → `FIRSTMATE-INCOMPLETE`, PR stays draft with a resume comment. Contrast with ralph, whose ceiling is 50 iterations; firstmate's ceiling is wall clock. Autopilot's pass-through inherits the cap — no unattended run may launch an unbounded session. |
| Session workflow | Rendered prompt encodes: load `userStories[]` by `priority` into the native task list → per story: implement → quality checks → commit with `Submitted-by:` trailer → validate against `acceptanceCriteria` **before** flipping `passes: true` (First Mate flips; delegates never self-certify) → progress entry → **`/compact` at story boundaries** (the load-bearing replacement for ralph's 50-fresh-process context hygiene) → bounded AUDIT-FAIL re-brief (max 3, then `BLOCKED`) → append `STATUS: COMPLETE` only when all stories pass. |
| Recovery | Death without sentinel → `FIRSTMATE-INCOMPLETE`, PR stays draft + resume comment (mirrors `RALPH-INCOMPLETE`). Mid-run herdr loss → degrade watch to file-polling the same progress.txt. Never restart the herdr server. |
| Teardown (herdr) | **`herdr pane close <pane_id>`**, using the pane id `runner_launch` captured. **There is no `agent stop` / `agent kill` verb in 0.7.4** — `herdr agent --help` lists only `list/get/read/send/rename/focus/wait/start/attach/explain`. `pane close` is live-verified: exit 0 with `{"result":{"type":"ok"}}`, after which `herdr agent get <name>` returns `agent_not_found` (exit 1). |
| Exit paths | **Every** non-success exit — watch-timeout expiry, launch failure, operator abort — runs the same terminal sequence: invoke `runner_teardown` (herdr branch = `herdr pane close <pane_id>`) → remove `/tmp/firstmate-<slug>.lock` → append a `FIRSTMATE-INCOMPLETE` line to `progress.txt`. No exit path may leave the lock behind (a stale lock permanently wedges that slug). |
| Resume | On relaunch after `FIRSTMATE-INCOMPLETE`: **re-validate the last committed story's `acceptanceCriteria` before proceeding**; never re-implement a story whose commit already exists. `passes: true` is flipped only after that validation succeeds — the commit-then-validate cycle order means a mid-story death can leave a committed-but-unvalidated story, and reconciliation is validation, not redo. |
| Idempotency | `progress.txt` sentinel short-circuit + atomic `mkdir /tmp/firstmate-<slug>.lock` + `runner_alive` cross-check. **`runner_alive` uses `herdr agent get <name>`'s exit code as the liveness oracle** (live-verified 0.7.4 semantics). The `mkdir` lock is **retained** — not as a substitute oracle but as the **launch-claim guard**: any read-only oracle, `agent get` included, leaves a check-then-start TOCTOU window between "no live agent" and "agent started"; the atomic directory create is what closes it. Oracle answers *is it alive*; lock answers *who may start it*. The lock is **per-slug by design** — concurrent firstmate sessions across *different* slugs are unsupported (see Non-Goals). |
| Nesting | **Prompt-level policy, not a herdr-side enforced guarantee:** the session template forbids launching herdr from inside the build session; inner fan-out is `/delegate` only. The `allow_nested=false` provenance is **operator-reported server config** — it is not agent-discoverable (`grep -rn allow_nested` returns nothing outside this task folder, and neither `herdr status` nor `herdr config check` surfaces such a field), so the prohibition is enforced by the prompt and pinned by probe, never assumed of the server. |

### Launch strings (all three runner modes — `--no-focus` and `| tee` are mandatory)

```bash
# herdr
herdr agent start firstmate-<slug> \
  --cwd <worktree> --no-focus \
  -- bash -lc '<harness> "/goal <rendered-prompt>" 2>&1 | tee /tmp/firstmate-<slug>.log'
# then: verify foreground_cwd via `herdr pane list` (cwd flags silently lie)

# tmux
tmux new-session -d -s agent-firstmate-<slug> -c <worktree> \
  '… 2>&1 | tee /tmp/agent-firstmate-<slug>.log'

# foreground
exec <harness> "/goal <rendered-prompt>" 2>&1 | tee /tmp/firstmate-<slug>.log
```

### Naming contract

| Thing | Value |
|---|---|
| herdr agent name | `firstmate-<slug>` |
| tmux fallback session | `agent-firstmate-<slug>` (satisfies `<category>-<identifier>`) |
| herdr log | `/tmp/firstmate-<slug>.log` |
| tmux log | `/tmp/agent-firstmate-<slug>.log` |
| lock | `/tmp/firstmate-<slug>.lock` (atomic `mkdir`) |

---

## 6. Task breakdown (priority = dependency order)

| P | Story | Key contract | Class |
|---|---|---|---|
| 1 | `.oh/scripts/lib/session-runner.sh` | Sourceable lib: `runner_detect/launch/verify_cwd/alive/teardown`; ladder herdr→tmux→foreground; **execution-context gate** (probe-pane fingerprint compare, mismatch → degrade + logged reason); teardown verb `herdr pane close <pane_id>`; `--no-focus` + `\| tee` in every branch; **no `set -euo pipefail` at file scope** (caller owns shell options); vitest `session-runner.test.ts` (≥3 degrade cases + a fingerprint-mismatch case); shellcheck clean. No SKILL.md edits. | complex |
| 2 | `.oh/skills/firstmate/templates/session-prompt.md` + renderer contract | Derivative of `implement.yml`/`pr.yml` step order (mechanically pinned ordered anchor list); encodes task-graph load, per-story cycle, `/compact` discipline, bounded loop-back, dual-channel terminal contract. Renderer's home is a `render_session_prompt` function in `.oh/scripts/firstmate.sh`, tested in `firstmate.test.ts`. Zero bytes under `.oh/prompts/`. | architecture |
| 3 | `.oh/scripts/firstmate.sh` | Slug regex + four-file contract validation (ralph's error shape); sentinel short-circuit; mkdir launch-claim lock + `agent get` liveness; `render_session_prompt` from the P2 template; `--kill <slug>` escape hatch; cross-executor ralph guard; launches via P1; prints mode/handle/log/watch-cmd. Zero diff on `ralph.sh`. vitest `firstmate.test.ts`. | complex |
| 4 | `/firstmate` SKILL.md + protected-paths | Documents executor contract, ladder, watch matrix, recovery, and the executor-vs-role-charter disambiguation; adds `firstmate` + `firstmate.sh` + `lib/session-runner.sh` to `.claude/protected-paths.txt` (same PR, per its own rule); AGENTS.md skills-table row (`AGENTS.md` only — `CLAUDE.md` is a symlink). | standard |
| 5 | `/ship-spec` Stage 10 opt-in | Add `*--executor=firstmate*` arm + validation + Stage-10 "Opt-in (firstmate)" subsection. `SHIP_SPEC_EXECUTOR="${SHIP_SPEC_EXECUTOR:-ralph}"` stays byte-identical; Stages 11–13 untouched. | complex |
| 6 | `/autopilot` pass-through | Additive `*--executor=firstmate*` case arm + `firstmate` added to the **unpinned** validation list at `.claude/skills/autopilot/SKILL.md` ~L204; frontmatter argument-hint bracket **extended** to `...|ralph|firstmate]` with the probe's pinned literal updated in lockstep in the same PR (recorded deviation from the plan's "pinned string intact" line — the guarded invariant, the unchanged ralph default, stays pinned and green); `EXECUTOR=firstmate` is pure deferral (mirrors delegate-advisor) and inherits the `FIRSTMATE_TIMEOUT_MS` cap. §5 ralph fallback, dedupe, ACTIVE_MARKER untouched. | standard |
| 7 | `/spec execute` mention | One sentence naming the third executor, deferring to ship-spec Stage 10. AUDIT-FAIL loop-back text unchanged. | simple |
| 8 | `sandbox-processes.md` — add a runner ladder (never a rewrite) + AGENTS.md | **Add** a runner ladder to Source-of-Truth (managed/headless stays tmux — re-affirmed; agentic build sessions: herdr, degrade tmux `agent-` category, then foreground). Add, never replace (protected path; gateway rationale verbatim). **Pure-insertion invariant:** zero deleted lines in the diff. Edit `AGENTS.md` only; `readlink CLAUDE.md` = `AGENTS.md` and `diff AGENTS.md CLAUDE.md` = zero afterwards. CHANGELOG entry. Wiki entry disambiguates executor vs role charter. | complex |
| 9 | Probes | New `firstmate-executor-contract.sh` (script exists+executable, sentinel + tee literals, both toggles carry firstmate AND ralph arms, template↔pack ordered-anchor step-order check, `.oh/prompts/` untouched, `readlink CLAUDE.md` = `AGENTS.md`, **`ralph.sh` still exists** — converts the silent-SKIP trap into a REGRESSION tripwire). New `session-runner-ladder.sh` (ladder order, `herdr status` detection, `FIRSTMATE_TIMEOUT_MS` default literal, `--no-focus` everywhere, forbidden commands absent: `server stop`/`update`/`channel set`/`~/.config/herdr` — **`agent get` is permitted and is the liveness oracle**). `/eval` green, **no new SKIPPED rows** (baseline: 2). | complex |
| 10 | Live smoke → `evidence.md` | **Two distinct throwaway 2-story slugs, one per runner mode** (a reused folder would hit US-003's sentinel short-circuit and make the second arm a no-op). **tmux arm (unconditional):** full run to `STATUS: COMPLETE` with herdr masked off PATH via a subshell-scoped `PATH=` override (proves the Captain's fallback); `implementation-gates.sh gate1` prints `task-graph: 2/2 stories pass`. **herdr arm (conditional):** in this deployment the deliverable is the **observed execution-context gate refusal** (fingerprint mismatch + logged degrade captured in `evidence.md`); a full herdr run to `STATUS: COMPLETE` only if an in-environment herdr server exists — `evidence.md` records which arm ran and why. Both runs live in a **disposable worktree on a throwaway branch that is never merged**; the PR branch carries `evidence.md` only, no smoke-run story commits. Logs non-empty; `Submitted-by:` on commits; `FIRSTMATE_TIMEOUT_MS` recorded; teardown via `herdr pane close <pane_id>`; post-US-010 wiki confirmation pass (zero `PROVISIONAL PENDING US-010` markers left). Evidence per `reviewer-evidence-doc.md`, committed, PR-linked. | standard |
| 11 | `/ralph` skill defect fixes (**separate issue/PR**) | Fix contradictory branchName rule (`ralph/` → `<prefix>/<issue#>-<slug>`), add `schemaVersion` to example, remove stale "Amp" claim. Docs only. | simple |

---

## 7. User Stories

### US-001: `.oh/scripts/lib/session-runner.sh` — the runner ladder

**Description:** As the harness, I want a sourceable session-runner library so that any executor can
launch a long-lived agent session through the same herdr → tmux → foreground ladder.

**Acceptance Criteria:**

- [ ] New file `.oh/scripts/lib/session-runner.sh` is sourceable and defines `runner_detect`,
      `runner_launch`, `runner_verify_cwd`, `runner_alive`, `runner_teardown`
- [ ] `runner_detect` resolves the ladder in the order herdr → tmux → foreground
- [ ] herdr is selected only when `command -v herdr` succeeds **and** `herdr status` shows the two
      literal fields `status: running` **and** `compatible: yes`; any other state (including
      binary-up/server-down) degrades to tmux. Those two literals are the pinned predicate — the
      probe asserts these exact field names
- [ ] **NESTING GUARD (zeroth check, before any probe pane):** when `runner_detect` is invoked from
      inside a herdr pane — detected via herdr 0.7.4's own in-pane markers, `[ "${HERDR_ENV:-}" = "1" ]`
      (optionally AND-ed with `-n "${HERDR_PANE_ID:-}"`), which are inherited by every child of a
      pane — it **skips the probe-pane launch entirely** and rules herdr ineligible, degrading to
      tmux with the reason logged (`allow_nested=false` policy: the detection path must never itself
      nest a pane). A vitest case injects `HERDR_ENV=1` and asserts `runner_detect` returns `tmux`,
      logs the nesting reason, and **never invokes `herdr agent start`** (the probe launch is
      observably absent). Note: these markers do not cross a container boundary — in this
      deployment the fingerprint gate below is the backstop; in an in-environment install the
      markers fire and this guard is the primary protection
- [ ] **EXECUTION-CONTEXT GATE (§15 Q0, resolved) — the third conjunct of `runner_detect`'s herdr
      eligibility.** Before selecting herdr, `runner_detect` launches a **short-lived probe pane**
      that emits an environment fingerprint — hostname, presence of `/.dockerenv`, and whether the
      target worktree path resolves in that pane — and compares it against the caller's own
      fingerprint gathered the same way. **Any mismatch ⇒ herdr is ineligible**: the ladder degrades
      to tmux and the reason (the two fingerprints and which field differed) is written to the
      firstmate log. This honours both the sandbox boundary (`AGENTS.md`: all building and testing
      happens INSIDE the sandbox) and the Captain's pre-approved fallback, extended from "not
      installed" to "installed but out-of-environment"
- [ ] The probe pane is torn down by the gate itself via `herdr pane close <pane_id>` regardless of
      verdict — the gate leaves no pane behind on either the match or the mismatch path
- [ ] A vitest case covers the **mismatch path** by injecting a **fake fingerprint** (a stubbed
      probe-pane response whose hostname / `/.dockerenv` / worktree-resolution differs from the
      caller's) and asserts that `runner_detect` returns `tmux` **and** that the degrade reason was
      logged. No real herdr is required for this case
- [ ] An explicit `OH_RUNNER=<x>` / `--runner <x>` naming an unavailable runner exits non-zero with a
      hard error — it must NOT silently degrade. **`--runner herdr` / `OH_RUNNER=herdr` when herdr is
      installed and healthy but OUT-OF-ENVIRONMENT is likewise a hard error whose message names the
      fingerprint mismatch** — the override may never force a silent host-side run
- [ ] The herdr launch branch passes `--no-focus`; **all three** branches pipe `2>&1 | tee <log>`
- [ ] `runner_launch` parses the pane id from the `herdr agent start` JSON response and exposes it
      via one documented accessor; a unit test feeds a **mocked `agent start` JSON fixture** and
      asserts the returned pane id is the value consumed by both `runner_verify_cwd` and the watch
      call (the fixture's field name is documented in a comment naming where it was observed)
- [ ] `runner_verify_cwd` verifies `foreground_cwd` via `herdr pane list` after a herdr launch, using
      that same pane id
- [ ] `runner_alive` uses **`herdr agent get <name>`'s exit code** as the liveness oracle in herdr
      mode — exit 0 (`agent_info`) = live, exit 1 (`agent_not_found`) = gone; live-verified semantics
      on the pinned herdr 0.7.4. In tmux mode the oracle is `tmux has-session`. `runner_alive` is a
      read-only oracle and never claims the launch slot — the atomic `mkdir` lock does that
- [ ] **Session budget:** the wall clock is bounded by the value returned from a shared
      **`resolve_timeout_ms`** helper in `session-runner.sh` — the **only** way any consumer (the
      herdr `wait output --timeout` call, the tmux poll ceiling, the foreground poll ceiling)
      obtains the budget. The helper **validates** `FIRSTMATE_TIMEOUT_MS`: a POSIX integer `> 0` is
      accepted; `0`, negative, non-numeric, or empty values are **rejected** — the helper falls back
      to the default `14400000` (4 hours) and logs the rejection to the firstmate log. Because every
      consumer goes through the helper, a non-positive timeout can never reach `herdr wait output
      --timeout` (so herdr's `--timeout 0` semantics — whatever they are — are unreachable) nor make
      the poll loops unbounded or instantly expire. On genuine expiry the session is treated as
      death without sentinel → `FIRSTMATE-INCOMPLETE`, PR stays draft with a resume comment
- [ ] Unit tests for `resolve_timeout_ms` cover: unset (→ `14400000`), a valid override (honoured),
      **`FIRSTMATE_TIMEOUT_MS=0`**, **`=-1`**, and **`=abc`** (each → `14400000` + a logged
      rejection); plus an assertion that the tmux/foreground poll loop honours the resolved ceiling
- [ ] **`runner_teardown`'s herdr branch is `herdr pane close <pane_id>`**, using the pane id
      `runner_launch` captured and exposed via its documented accessor. **herdr 0.7.4 has NO
      `agent stop` / `agent kill` verb** — `herdr agent --help` lists only
      `list/get/read/send/rename/focus/wait/start/attach/explain`; `pane close` is the live-verified
      teardown primitive (exit 0, `{"result":{"type":"ok"}}`, after which `herdr agent get <name>`
      returns `agent_not_found` with exit 1). The tmux branch is `tmux kill-session -t
      agent-firstmate-<slug>`. The file must contain **no** `herdr agent stop` / `herdr agent kill`
      invocation — those verbs do not exist and would fail silently in a trap
- [ ] **Exit paths:** on watch-timeout expiry, launch failure, or operator abort, the library invokes
      `runner_teardown`, removes `/tmp/firstmate-<slug>.lock`, and appends a `FIRSTMATE-INCOMPLETE`
      line to `progress.txt` — no exit path may leave the lock behind
- [ ] A unit test simulates a watch timeout and asserts `runner_teardown` ran and the lock directory
      no longer exists
- [ ] The file contains none of: `herdr server stop`, `herdr update`, `herdr channel set`, writes to
      `~/.config/herdr`. (`herdr agent get` is **permitted and required** — it is the liveness
      oracle; the earlier ban rested on a premise that live verification disproved)
- [ ] **The file does NOT set `set -euo pipefail` at file scope.** It is a sourceable library, so the
      caller owns shell options — a file-scope `set` silently mutates the caller's option state for
      the rest of its execution (a pattern `shellcheck` does not flag). Strictness is scoped inside
      functions where needed. The file header states this contract explicitly ("caller owns shell
      options; this library must not mutate them"), and a vitest case sources the library from
      callers under **differing** option state (strict and non-strict) and asserts the caller's
      options are unchanged after sourcing
- [ ] Vitest suite at `.oh/scripts/__tests__/session-runner.test.ts` (**NOT** under `.oh/skills/` —
      `vitest.config.ts` includes only `.oh/scripts/__tests__/**`, `.pi/**/__tests__/**`,
      `.oh/cli/**/__tests__/**`, so tests under `.oh/skills/` never run in CI)
- [ ] That suite covers ≥ 3 degrade cases (herdr absent, herdr binary-up/server-down, tmux absent)
- [ ] `shellcheck .oh/scripts/lib/session-runner.sh` is clean
- [ ] No `SKILL.md` file is modified by this story
- [ ] `pnpm test` passes; typecheck passes

### US-002: session-prompt template + renderer contract

**Description:** As the First Mate, I want a skill-owned session prompt so that one session drives
the whole task graph with the same step order the advisor prompt pack already declares.

> **Dependency order:** this story lands **before** `firstmate.sh` (US-003) because US-003 renders
> this template. Priority order is dependency order.

**Acceptance Criteria:**

- [ ] New file `.oh/skills/firstmate/templates/session-prompt.md` exists and is a derivative of
      `.oh/prompts/advisor/implement.yml` and `.oh/prompts/advisor/pr.yml` step order
- [ ] The template instructs the session to load `userStories[]` from `prd.json` ordered by
      `priority` into the session's native task list
- [ ] Per-story cycle is encoded in this exact order: implement → quality checks → commit with a
      `Submitted-by:` trailer → validate against the story's `acceptanceCriteria` **before** flipping
      `passes: true` → append the progress entry
- [ ] The template states that the First Mate flips `passes: true`; delegates never self-certify
- [ ] `/compact` is required at every story boundary
- [ ] AUDIT-FAIL re-brief is bounded at **max 3** attempts, after which the story is marked `BLOCKED`
- [ ] `STATUS: COMPLETE` is appended only when every story has `passes: true`, and the dual-channel
      terminal contract is stated: the whole line in `progress.txt` AND as the sole content of the
      final output line
- [ ] The template forbids launching herdr from inside the build session; inner fan-out is
      `/delegate` only. This is stated as **prompt-level policy**, not as a herdr-enforced guarantee
      — the template must not claim the server rejects nesting (`allow_nested=false` provenance is
      operator-reported server config, not agent-discoverable)
- [ ] The template **instructs** inner `/delegate` calls not to select the herdr runner, and states
      that the session exports `FIRSTMATE_SESSION=1` as the signal they can key off. This is
      instruction only — **mechanical enforcement of `/delegate`'s runner choice is a Non-Goal this
      round** and the template must not imply otherwise
- [ ] **Resume semantics:** the template specifies that on relaunch after `FIRSTMATE-INCOMPLETE`, the
      session first re-validates the last committed story's `acceptanceCriteria` before proceeding;
      it never re-implements a story whose commit already exists, and it flips `passes: true` only
      after that validation succeeds
- [ ] **Placeholder-name contract (this story's whole share of the renderer, critique A-L1 + round-2
      ownership split):** the template declares, in its own header, the **closed set** of placeholder
      tokens it uses and what each means — `<slug>` (the task-folder slug), the branch name, and the
      issue number — and the template body uses **no** placeholder outside that declared set. This
      story owns only the *contract* (token names + their meanings). **Verifiable at this story's own
      completion boundary:** every placeholder token occurring in the template body appears in the
      header's declared set, and the set is exactly those three. The renderer function itself, its
      substitution behavior, and its test are **US-003's ACs** — this story references no file that
      does not exist until US-003
- [ ] **Step-order equivalence is mechanical, not interpretive (critique A-M):** at authoring time
      this story derives an **ordered anchor-keyword list** from `.oh/prompts/advisor/implement.yml`
      and `.oh/prompts/advisor/pr.yml` and records it verbatim in the template's own header comment.
      "Equivalence" means exactly: those anchors appear in the template **in the same relative
      order**. The list is hardcoded into `.oh/evals/probes/firstmate-executor-contract.sh` (US-009),
      which asserts the relative ordering — no fuzzy similarity, no free-form comparison of markdown
      against YAML. Steps the template adds beyond the pack (per-story `/compact`, bounded max-3
      AUDIT-FAIL, dual-channel terminal contract) are **additions**, explicitly out of the anchor
      list and out of the ordering assertion
- [ ] `git diff` restricted to `.oh/prompts/` produces empty output (zero bytes changed) — the probe
      asserts this alongside the ordering check
- [ ] Typecheck passes

### US-003: `.oh/scripts/firstmate.sh` — the executor entrypoint

**Description:** As the harness, I want a `firstmate.sh` entrypoint so that a task folder can be
launched as one long-lived First-Mate session with ralph-equivalent validation and idempotency.

**Acceptance Criteria:**

- [ ] New executable `.oh/scripts/firstmate.sh` validates the slug against a slug regex and the
      four-file contract (`prd.md`, `prd.json`, `prompt.md`, `progress.txt`)
- [ ] That slug + four-file validation is a **shared sourced helper** — placed in
      `.oh/scripts/lib/session-runner.sh` or a small `.oh/scripts/lib/task-contract.sh` — so the two
      executors cannot silently diverge. Independently duplicating `ralph.sh`'s message strings is
      acceptable **only** with a comment naming `ralph.sh` as the source of the wording; the shared
      helper is preferred. `.oh/scripts/ralph.sh` itself stays zero-diff either way
- [ ] Sentinel short-circuit: if `progress.txt` already contains the whole line `STATUS: COMPLETE`,
      the script exits 0 without launching anything
- [ ] Idempotency uses an atomic `mkdir /tmp/firstmate-<slug>.lock` as the **launch-claim guard**
      plus a `runner_alive` cross-check whose herdr-mode oracle is `herdr agent get <name>` (exit 0
      = live, exit 1 `agent_not_found` = gone). The lock is retained **because** any read-only
      oracle leaves a check-then-start TOCTOU window; the atomic directory create is what closes it
- [ ] **Exit paths:** launch failure, session-budget (`FIRSTMATE_TIMEOUT_MS`) expiry, and operator
      abort each invoke `runner_teardown`, remove `/tmp/firstmate-<slug>.lock`, and append
      `FIRSTMATE-INCOMPLETE` to `progress.txt`; a unit test asserts the lock is gone after a
      simulated launch failure
- [ ] **Manual escape hatch:** `firstmate.sh --kill <slug>` clears `/tmp/firstmate-<slug>.lock`,
      tears down the herdr agent / tmux session via `runner_teardown`, and appends the outcome to
      that task's `progress.txt`. It never stops or restarts the herdr server
- [ ] **Stale-lock recovery after a hard crash:** a `firstmate.test.ts` case sets up a lock directory
      with **no** live session (the `kill -9` shape) and asserts the lock is treated as **stale and
      reclaimable** — the run proceeds rather than wedging the slug permanently
- [ ] **Cross-executor guard:** the script refuses to launch when a ralph tmux session for the same
      slug is live (`tmux has-session -t <slug>`), exiting non-zero with a clear error naming the
      conflicting executor and session — the sentinel short-circuit only covers the
      already-complete case, not a mid-flight ralph run
- [ ] **Renderer home (moved here from US-002 in round 2 — the renderer's file and test both live in
      this story):** `.oh/scripts/firstmate.sh` implements `render_session_prompt`, which substitutes
      the placeholder tokens US-002's contract declares (`<slug>`, branch, issue number) into
      `.oh/skills/firstmate/templates/session-prompt.md`. It must substitute **every** token in that
      declared set and introduce no token the template does not declare
- [ ] **A dedicated `render_session_prompt` case in `.oh/scripts/__tests__/firstmate.test.ts`**
      asserts every declared placeholder is substituted and that **none survives** into the rendered
      output
- [ ] Launches via the US-001 library
- [ ] On launch it prints the resolved runner mode, the session handle, the log path, and the watch
      command
- [ ] `git diff --stat .oh/scripts/ralph.sh` produces empty output
- [ ] Vitest suite at `.oh/scripts/__tests__/firstmate.test.ts` (**NOT** under `.oh/skills/`)
- [ ] `.oh/scripts/__tests__/ralph.test.ts` is unmodified and still green
- [ ] `shellcheck .oh/scripts/firstmate.sh` is clean
- [ ] `pnpm test` passes; typecheck passes

### US-004: `/firstmate` SKILL.md + protected-paths registration

**Description:** As an operator, I want the `firstmate` executor documented as a skill so that its
contract, ladder, watch matrix, and recovery behavior are discoverable.

**Acceptance Criteria:**

- [ ] New `.oh/skills/firstmate/SKILL.md` documents the executor contract, the herdr → tmux →
      foreground ladder, the watch matrix, the recovery matrix, and the naming contract
      (`firstmate-<slug>`, `agent-firstmate-<slug>`, `/tmp/firstmate-<slug>.log`,
      `/tmp/agent-firstmate-<slug>.log`)
- [ ] `.claude/protected-paths.txt` gains the bare skill name `firstmate` under the skills section
      and **both** new script paths under the scripts section — `.oh/scripts/firstmate.sh` **and**
      `.oh/scripts/lib/session-runner.sh` (load-bearing shared infra reusable by any executor, so
      that file's own same-PR rule covers it too) — in this same PR
- [ ] The SKILL.md documents the manual **"kill a wedged firstmate session"** procedure for all
      three runner modes — herdr (**`herdr agent list` to find the agent's pane id → `herdr pane
      close <pane_id>`**; herdr 0.7.4 has **no** `agent stop` / `agent kill` verb, so `pane close` is
      the teardown primitive, live-verified), tmux (`tmux kill-session -t agent-firstmate-<slug>`),
      and foreground (interrupt the process) — each followed by removing
      `/tmp/firstmate-<slug>.lock` and appending `FIRSTMATE-INCOMPLETE`. The procedure explicitly
      states the herdr **server** is never stopped or restarted
- [ ] The SKILL.md states that concurrent firstmate sessions across different slugs are unsupported
      (the lock is per-slug by design)
- [ ] **Name disambiguation (critique B-M):** the SKILL.md opens with an explicit note distinguishing
      **"firstmate — the build executor"** (this skill: `--executor=firstmate`, the
      `firstmate-<slug>` session, `.oh/scripts/firstmate.sh`) from **"First Mate — the supervisory
      role charter"** (`.oh/context/rules/first-mate.md`, consumed by `.oh/prompts/advisor/*`), with
      a cross-reference to that charter path. The overload is intentional — the executor runs the
      role's workflow — and must be stated as such, never left implicit
- [ ] `AGENTS.md` gains a `/firstmate` row in the Skills table. **Edit `AGENTS.md` ONLY** —
      `CLAUDE.md` is a symlink (`CLAUDE.md -> AGENTS.md`) and must never be independently written
      (any temp+rename atomic replace severs it). After the edit, verify `readlink CLAUDE.md` prints
      `AGENTS.md` and `diff AGENTS.md CLAUDE.md` is empty
- [ ] No dedicated `.pi/` edit is made or needed: Pi inherits `/firstmate` automatically through the
      existing blanket symlink `.pi/skills -> ../.oh/skills`, so creating `.oh/skills/firstmate/`
      exposes it under `.pi/skills/firstmate/` with zero `.pi/` changes. This is the intended
      opt-in surface for Pi — the executor stays opt-in because it is reached only via
      `--executor=firstmate`, not because the skill is hidden from any provider
- [ ] Typecheck passes

### US-005: `/ship-spec` Stage 10 opt-in arm

**Description:** As an operator, I want `/ship-spec --executor=firstmate` so that I can opt a single
build into the First-Mate executor without changing anyone else's default.

**Acceptance Criteria:**

- [ ] `.claude/skills/ship-spec/SKILL.md` Stage 1 gains a `*--executor=firstmate*` case arm and
      `firstmate` is added to the `case "$SHIP_SPEC_EXECUTOR" in ralph|delegate-advisor)` validation
      list
- [ ] The literal line `SHIP_SPEC_EXECUTOR="${SHIP_SPEC_EXECUTOR:-ralph}"` remains **byte-identical**
      (verify with `grep -Fx 'SHIP_SPEC_EXECUTOR="${SHIP_SPEC_EXECUTOR:-ralph}"'`)
- [ ] Stage 10 gains an "Opt-in (firstmate)" subsection describing the launch + watch path
- [ ] Stages 11–13 are unmodified
- [ ] `bash .oh/evals/probes/autopilot-executor-toggle.sh` still passes — changes are additive only
      and every existing pinned string is intact
- [ ] Typecheck passes

### US-006: `/autopilot` pass-through flag

**Description:** As the autopilot runner, I want an `EXECUTOR=firstmate` arm that is pure deferral so
that autopilot gains the option without owning any new build mechanics.

**Acceptance Criteria:**

- [ ] The autopilot skill gains an `EXECUTOR=firstmate` arm that defers entirely to
      `/ship-spec --executor=firstmate`, mirroring the existing `delegate-advisor` arm
- [ ] **The executor validation list** `case "$EXECUTOR" in ship-spec|delegate-advisor|ralph)` in
      `.claude/skills/autopilot/SKILL.md` (~line 204) **gains `firstmate`** — without this exact edit
      `EXECUTOR=firstmate` fails hard with `ERROR: invalid AUTOPILOT_EXECUTOR=` even after the case
      arm and the defer logic land. **This line is NOT pinned by `autopilot-executor-toggle.sh`**, so
      the edit is probe-safe
- [ ] **The frontmatter argument-hint bracket is extended** to
      `[--executor=ship-spec|delegate-advisor|ralph|firstmate]` so the flag is discoverable where
      operators actually look
- [ ] **Probe/doc lockstep for that bracket (same PR, mandatory):** the bracket is pinned by
      `grep -Fq '[--executor=ship-spec|delegate-advisor|ralph]'` at
      `.oh/evals/probes/autopilot-executor-toggle.sh:32`. Extending the hint **breaks that
      fixed-string match**, so the probe's pinned literal must be updated to
      `[--executor=ship-spec|delegate-advisor|ralph|firstmate]` **in the same commit**. This is the
      one intentional exception to "every existing pinned string intact" — §10's lockstep matrix
      records it explicitly. Landing either edit without the other fails `/eval`
- [ ] **A new additive case arm** `*--executor=firstmate*) EXECUTOR=firstmate` is added, mirroring
      the three existing arms the probe pins (`*--executor=ship-spec*) EXECUTOR=ship-spec`,
      `*--executor=delegate-advisor*) EXECUTOR=delegate-advisor`, `*--executor=ralph*) EXECUTOR=ralph`)
      — all three of those stay byte-identical
- [ ] **Session budget inheritance:** the pass-through inherits the `FIRSTMATE_TIMEOUT_MS` cap
      (default `14400000` = 4h) — **no unattended autopilot run may launch an unbounded session.**
      Ralph's ceiling is 50 iterations; firstmate's is wall clock, and the deferral must not strip or
      override it. The autopilot docs state the cap where the arm is described
- [ ] **The autopilot path cannot disable the cap:** `FIRSTMATE_TIMEOUT_MS` may not be set to `0`,
      empty, or any non-positive/infinite sentinel from the autopilot deferral. Rejection is
      **implemented by US-001's `resolve_timeout_ms` helper** (the executor's only budget source):
      an out-of-range value is rejected there and the default `14400000` applies — the unattended
      overnight path must never be the first live use of an unbounded executor. This AC verifies the
      deferral sets no such sentinel; the enforcement mechanism itself is US-001's
- [ ] The autopilot §5 inline ralph fallback is unmodified
- [ ] Dedupe logic and `ACTIVE_MARKER` handling are unmodified
- [ ] `bash .oh/evals/probes/autopilot-executor-toggle.sh` and
      `bash .oh/evals/probes/ralph-fallback-order.sh` both pass
- [ ] Typecheck passes

### US-007: `/spec execute` names the third executor

**Description:** As a reader of `/spec execute`, I want one sentence naming the third executor so
that the decomposed workflow does not silently contradict ship-spec.

**Acceptance Criteria:**

- [ ] `.oh/skills/spec/references/execute.md` gains exactly one sentence naming `firstmate` as the
      third executor and deferring the mechanics to `/ship-spec` Stage 10
- [ ] The AUDIT-FAIL loop-back text in that file is unchanged
- [ ] `bash .oh/evals/probes/spec-family-contract.sh` passes
- [ ] Typecheck passes

### US-008: `sandbox-processes.md` — add a runner ladder (never a rewrite) + AGENTS.md + wiki

**Description:** As an operator, I want a runner ladder **added** to the process-management norm so
that agentic build sessions can use herdr without invalidating the tmux norm for managed/headless
services.

**Acceptance Criteria:**

- [ ] `.oh/skills/t3/references/sandbox-processes.md` § Source of Truth **gains an added** runner
      ladder — managed/headless processes (cron, gateways, watchdogs, dev servers, tunnels) **stay
      tmux — re-affirmed**; agentic build sessions use herdr first, degrade to a tmux `agent-`
      category session, then foreground. This is an **addition, never a rewrite**: no existing
      Source-of-Truth sentence is deleted or reworded
- [ ] **Pure-insertion invariant (machine-checked):** the diff to that file contains **zero deleted
      lines** — `git diff -- .oh/skills/t3/references/sandbox-processes.md | grep -c '^-'` returns
      exactly `1` (the `--- a/...` header is the only line starting with `-`)
- [ ] **Gateway rationale survives verbatim (machine-checked):** both of these literal substrings are
      still present in the file after the edit, each with exactly one hit —
      `grep -cF '**Interactive pty is required.**' .oh/skills/t3/references/sandbox-processes.md`
      returns `1`, and
      `grep -cF 'do not re-litigate tmux-vs-service' .oh/skills/t3/references/sandbox-processes.md`
      returns `1`
- [ ] **Edit `AGENTS.md` ONLY** — `CLAUDE.md` is a symlink (`CLAUDE.md -> AGENTS.md`) and must never
      be independently written; any tool doing atomic replace-on-write (temp+rename) instead of
      in-place truncate silently severs it and permanently breaks the alias. After the edit, verify
      `readlink CLAUDE.md` prints `AGENTS.md` **and** `diff AGENTS.md CLAUDE.md` is empty
- [ ] `CHANGELOG.md` gains an entry under `## [Unreleased]`
- [ ] **Wiki:** create `.oh/skills/wiki/corpus/build-executor-ladder.md` per
      `.oh/skills/wiki/references/schema.md` — frontmatter with `title`, `slug:
      build-executor-ladder`, `tags`, `created`, `updated`, at least one
      `sources: raw/<YYYY-MM-DD>-build-executor-ladder.md` snapshot path, `related`, and
      `confidence: provisional`
- [ ] **Wiki:** the entry body follows the schema order — `# Title`, `## Relevant Source Files`,
      `## Summary`, `## Detail`, `## System Relationships`, `## See Also` — with the two orthogonal
      axes (executor: `ralph` | `delegate-advisor` | `firstmate` × runner ladder: herdr → tmux →
      foreground) shown as a Mermaid diagram or table, and claims line-cited to
      `.oh/scripts/firstmate.sh`, `.oh/scripts/lib/session-runner.sh`,
      `.claude/skills/ship-spec/SKILL.md`, and `.oh/skills/t3/references/sandbox-processes.md`
- [ ] **Wiki:** the entry carries the same **name disambiguation** as US-004's SKILL.md —
      "firstmate the build executor" vs "First Mate the supervisory role charter"
      (`.oh/context/rules/first-mate.md`) — with an explicit cross-reference note so a future reader
      cannot conflate them
- [ ] **Wiki:** the entry states that `ralph` remains the default and that `STATUS: COMPLETE`
      (whole line in `progress.txt`) is the invariant interface across all three executors — it must
      NOT describe the default as flipped
- [ ] **Wiki:** the entry stays within the schema's architecture-entry cap of **≤ 900 words** (title
      and frontmatter excluded); verify with `wc -w` and state the final count in the PR
- [ ] **Wiki:** every entry claim about *live runtime behavior* (that the ladder degrades correctly,
      that the execution-context gate refuses an out-of-environment herdr, that a mode reaches
      `STATUS: COMPLETE`) is marked with the **exact literal marker string
      `PROVISIONAL PENDING US-010`**, because US-008 lands before the live proof. The literal is
      pinned because US-010's confirmation pass greps for it — any paraphrase defeats the check. A
      post-US-010 confirmation pass must revisit the entry and either promote those claims or
      correct them **before the PR is marked ready for review** (US-010 AC)
- [ ] **Wiki:** `## See Also` cross-links `[[audit-architecture]]` using valid `[[slug]]` syntax, and
      the raw snapshot `.oh/skills/wiki/corpus/raw/<YYYY-MM-DD>-build-executor-ladder.md` is created
- [ ] **Wiki:** the raw snapshot is real provenance, not a restatement of the entry — it follows the
      `crabbox-remote-exec-control-plane` snapshot's capture-date + provenance structure and cites
      the actual new repo files (`.oh/scripts/firstmate.sh`, `.oh/scripts/lib/session-runner.sh`,
      `.oh/skills/firstmate/SKILL.md`, `.oh/skills/firstmate/templates/session-prompt.md`) with the
      capture date and the commit hash they were captured at
- [ ] **Wiki:** `.oh/skills/wiki/corpus/README.md` index is regenerated and
      `bash .oh/evals/probes/wiki-readme-index.sh` passes
- [ ] **Wiki:** the corpus is gitignored-by-default — the entry, its raw snapshot, and the README are
      force-added with `git add -f` so they are tracked in this PR
- [ ] Typecheck passes

### US-009: two new probes, zero new SKIPPED rows

**Description:** As the harness, I want probes pinning the firstmate contract and the runner ladder
so that the additive migration cannot silently regress.

**Acceptance Criteria:**

- [ ] New `.oh/evals/probes/firstmate-executor-contract.sh` exists, is executable, and asserts:
      `.oh/scripts/firstmate.sh` exists and is executable; the `STATUS: COMPLETE` sentinel literal
      and the `| tee` literal are present; **both** toggles (`SHIP_SPEC_EXECUTOR` and
      `AUTOPILOT_EXECUTOR`) carry a `firstmate` arm **and** a `ralph` arm; `.oh/prompts/` is
      untouched
- [ ] **Step-order equivalence is asserted mechanically, not fuzzily:** the probe hardcodes the
      ordered anchor-keyword list derived from `.oh/prompts/advisor/implement.yml` and
      `.oh/prompts/advisor/pr.yml` at authoring time (the same list recorded in the US-002 template
      header) and asserts those anchors appear in `session-prompt.md` **in the same relative
      order**; it additionally asserts `git diff --quiet -- .oh/prompts/` (zero bytes changed). No
      notion of "equivalence" is left to implementer interpretation
- [ ] The probe asserts **`readlink CLAUDE.md`** prints **`AGENTS.md`** — the symlink is intact; a
      severed alias (an independently written `CLAUDE.md`) is caught as a REGRESSION rather than
      silently passing a `diff` that happens to be empty at write time
- [ ] That probe additionally asserts **`.oh/scripts/ralph.sh` still exists** — the regression
      tripwire that converts the silent-SKIP trap into a REGRESSION
- [ ] New `.oh/evals/probes/session-runner-ladder.sh` exists, is executable, and asserts: ladder
      order herdr → tmux → foreground; that the health predicate pins the two literal field names
      `status: running` **and** `compatible: yes` (not a vague "healthy" check); the
      `resolve_timeout_ms` helper exists with the `14400000` session-budget default literal **and**
      that the tmux/foreground poll loop is bounded by the same resolved value; that every exit path calls
      `runner_teardown` and removes the lock; `--no-focus` in every herdr launch; that the library
      sets no file-scope `set -euo pipefail`; and that the forbidden commands are absent —
      `herdr server stop`, `herdr update`, `herdr channel set`, and writes to `~/.config/herdr`.
      **`herdr agent get` is NOT forbidden** — it is the liveness oracle and the probe must not
      flag it
- [ ] **Teardown-verb assertions in `session-runner-ladder.sh`:** the probe greps
      `.oh/scripts/lib/session-runner.sh` and asserts (a) **`pane close` is present** — it is the
      teardown verb `runner_teardown` uses in herdr mode — and (b) **no `herdr agent stop` and no
      `herdr agent kill` invocation appears anywhere in the file**, because neither verb exists in
      herdr 0.7.4 (`herdr agent --help`: `list/get/read/send/rename/focus/wait/start/attach/explain`)
      and a nonexistent verb in a teardown trap fails silently
- [ ] **Execution-context gate assertion:** `session-runner-ladder.sh` asserts that `runner_detect`
      carries the fingerprint gate — the probe-pane fingerprint comparison is present, a mismatch
      degrades to tmux, and the degrade reason is logged — so the sandbox-boundary guard cannot be
      silently dropped; **and** that the **nesting guard** is present in `runner_detect` (the
      `HERDR_ENV` check precedes any probe-pane launch), so the no-nesting guard cannot be silently
      dropped either
- [ ] `/eval` reports both new probes as PASS
- [ ] `.oh/evals/RESULTS.md` shows **no new SKIPPED rows** — the baseline is **2**
      (`autopilot-preflight-gate`, `debugmcp-availability`)
- [ ] These existing probes remain green: `autopilot-executor-toggle.sh` (additive only, every
      pinned string intact), `first-mate-charter.sh` (unchanged — no 4th YAML),
      `advisor-monitored-loop.sh` (`.oh/agents/advisor.md` untouched this round),
      `spec-family-contract.sh`, `submitted-by-trailers.sh`, `cron-claude-codex-fallback.sh`,
      `wiki-readme-index.sh`, and `implementation-gates.sh` gate1
- [ ] `shellcheck` is clean on both new probes; typecheck passes

### US-010: live per-mode smoke (two throwaway slugs) → committed `evidence.md`

**Description:** As a reviewer, I want a real tmux-fallback run and a real herdr-arm observation —
each on its own throwaway slug, in a disposable worktree that never merges — recorded as evidence so
that the executor is proven, not merely described.

**Acceptance Criteria:**

- [ ] **TWO DISTINCT throwaway slugs — one 2-story task folder per runner mode**
      (`<tmux-smoke-slug>` and `<herdr-smoke-slug>`), each created with the full four-file contract.
      **Rationale (round-2 critique H — the single-slug short-circuit trap):** US-003's sentinel
      short-circuit exits 0 without launching anything when `progress.txt` already contains the whole
      line `STATUS: COMPLETE`. Reusing one folder for both arms would therefore make the *second* arm
      a silent no-op that proves nothing. One slug per arm is the only shape in which both arms are
      real runs
- [ ] **SMOKE-COMMIT ISOLATION:** both smoke runs execute in a **disposable git worktree on a
      throwaway branch that is NEVER merged** — not on `feat/746-firstmate-executor`. `evidence.md`
      (which *is* committed to the PR branch) references the throwaway branch name and the smoke
      commit hashes rather than carrying those commits
- [ ] **The PR branch history contains no smoke-run story commits:** verified on the PR branch with
      `git log --oneline development..feat/746-firstmate-executor` — no commit produced by either
      smoke arm appears. The only smoke artifact on the PR branch is `evidence.md` itself
- [ ] **tmux-mode arm — UNCONDITIONAL, must pass:** a real tmux-mode run over `<tmux-smoke-slug>`
      reaches the whole line `STATUS: COMPLETE` in that folder's `progress.txt`. **This is the arm
      that proves the Captain's fallback constraint** and it is not optional
- [ ] **herdr-mode arm — CONDITIONAL on an in-environment herdr server.** In **this** deployment the
      execution-context gate (US-001) refuses herdr, because herdr panes are host processes (§15 Q0,
      resolved), so the deliverable for this arm is the **OBSERVED GATE REFUSAL**: `evidence.md`
      captures the probe pane's fingerprint output, the caller's own fingerprint, the mismatch
      verdict, and the **logged degrade-to-tmux reason** read back out of the firstmate log. A full
      herdr-mode run over `<herdr-smoke-slug>` to `STATUS: COMPLETE` is executed **only if** an
      in-environment herdr server is available (e.g. a herdr server running inside the container)
- [ ] **`evidence.md` states explicitly WHICH herdr arm ran and WHY** — "observed gate refusal
      (no in-environment herdr server)" or "full herdr-mode run (in-environment server at …)" — so a
      reviewer never has to infer which proof they are looking at
- [ ] **Whichever herdr arm runs, it is initiated from a NON-herdr context** — a plain tmux session
      or a bare shell, never from inside an active herdr pane — to honour FR-16's "the build session
      must never launch herdr". `evidence.md` records the launch context explicitly (which
      shell/session the command was issued from)
- [ ] **The preflight marker is pinned to the real, live-verified variables:** the herdr-mode
      launch path refuses to start when `[ "${HERDR_ENV:-}" = "1" ]` (optionally AND-ed with
      `-n "${HERDR_PANE_ID:-}"`). These are herdr 0.7.4's **own** in-pane detection gate — the
      binary's embedded integration hook uses exactly
      `[ "${HERDR_ENV:-}" = "1" ] || exit 0` / `[ -n "${HERDR_SOCKET_PATH:-}" ] || exit 0` /
      `[ -n "${HERDR_PANE_ID:-}" ] || exit 0` — and they are inherited by every child of a pane.
      Do **not** gate on `TERM`, `COLORTERM`, `TERM_PROGRAM`, or `HERDR_SESSION`: the first three
      are too generic and `HERDR_SESSION` is set only for *named* sessions (empty in the default
      session)
- [ ] **Documented false-negative bound on that marker:** environment does not cross a `docker exec`
      boundary, so a launch reached via a container hop will not see `HERDR_ENV` even when a herdr
      pane initiated it. The marker reliably detects *direct descendants of a pane only*. Because of
      this, the env check is a **guard, not a proof** — `evidence.md` must still carry the explicit
      operator attestation line naming the launch context
- [ ] **The tmux arm's herdr masking is a subshell-scoped `PATH=` override with herdr's own directory
      (`/usr/local/bin`) REMOVED**, so that `command -v herdr` genuinely **fails** — this is the
      arm that proves the Captain's "if herdr is not installed, fall back to tmux" constraint.
      Applied **solely to the smoke child's environment**. The stub-shim variant (a `herdr` that
      exits 127) is **explicitly not accepted here**: it leaves `command -v herdr` succeeding and
      therefore exercises the *binary-up/server-down* degrade arm instead, which is already covered
      as a US-001 unit degrade case. The mechanism **never moves, renames, or otherwise disturbs the
      shared herdr binary**
- [ ] **The smoke run MUST NOT** move, rename, delete, copy-over, or `chmod` the real herdr binary at
      `/usr/local/bin/herdr`; **MUST NOT** modify any shared shell state (no edits to `~/.bashrc`,
      `~/.profile`, `/etc/environment`, or the parent shell's exported `PATH`); and **MUST NOT**
      stop, restart, or reconfigure the herdr server
- [ ] **Post-condition proving the masking was non-destructive:** after every arm has run, in a fresh
      shell, `command -v herdr` still resolves to `/usr/local/bin/herdr` and `herdr status` still
      reports `status: running` and `compatible: yes`. This check is recorded in `evidence.md`
- [ ] `AUDIT_ROOT=<repo-root> bash .oh/skills/audit/scripts/implementation-gates.sh gate1
      <tmux-smoke-slug>` prints `task-graph: 2/2 stories pass` (the script hard-requires the
      `AUDIT_ROOT` env var and the positional `<slug>`; both must appear in the recorded command).
      The same invocation is recorded for `<herdr-smoke-slug>` **only if** the full herdr arm ran
- [ ] The tmux arm's log `/tmp/agent-firstmate-<tmux-smoke-slug>.log` is non-empty; if the full herdr
      arm ran, `/tmp/firstmate-<herdr-smoke-slug>.log` is non-empty too. When the herdr arm is the
      gate-refusal form, the refusal + degrade reason is what `evidence.md` carries in its place
- [ ] Every commit produced by the smoke runs (on the throwaway branch) carries a `Submitted-by:`
      trailer
- [ ] **Teardown before the PR is marked ready (critique B-M):** after evidence capture, every arm is
      torn down — `runner_teardown` is invoked for each mode that launched, **the herdr teardown verb
      being `herdr pane close <pane_id>` (herdr 0.7.4 has no `agent stop` / `agent kill` verb)** —
      **both** throwaway task folders and **both** locks (`/tmp/firstmate-<herdr-smoke-slug>.lock`,
      `/tmp/firstmate-<tmux-smoke-slug>.lock`) are deleted, the disposable worktree is removed and
      the throwaway branch deleted, and it is confirmed that **no lingering `herdr agent list` entry
      and no lingering `tmux ls` session** for either smoke slug remains. The confirmation output is
      recorded in `evidence.md`
- [ ] **DANGLING-WIKI CONFIRMATION PASS (round-2 critique):** after the smoke runs, revisit
      `.oh/skills/wiki/corpus/build-executor-ladder.md` and **promote or correct every claim marked
      `PROVISIONAL PENDING US-010`** in light of what the runs actually showed (including the gate
      refusal, if that is the herdr-arm outcome). **Verified mechanically:**
      `grep -c 'PROVISIONAL PENDING US-010' .oh/skills/wiki/corpus/build-executor-ladder.md` returns
      **`0`** before the PR is marked ready for review
- [ ] **The PR description surfaces the §2 decision-6 orchestrator amendment** — the execution-context
      gate and the fact that herdr mode is refused in this deployment — flagged as **pending Captain
      review at the PR gate**, so the scope change is decided by the Captain and not absorbed silently
- [ ] `evidence.md` is written per `.oh/skills/audit/references/reviewer-evidence-doc.md`, committed
      to the branch, and linked from the PR description
- [ ] **`evidence.md` records the `FIRSTMATE_TIMEOUT_MS` value used** for each arm that ran (the
      `14400000` default unless overridden, in which case the override and its reason)
- [ ] **`evidence.md` marks every timing observation derived from the smoke run as PROVISIONAL** and
      states explicitly that a 2-story throwaway run is **not** a valid basis for lowering
      `FIRSTMATE_TIMEOUT_MS` below its 4-hour default; the shipped default is unchanged by
      this story
- [ ] **`evidence.md` seeds the firstmate-vs-ralph baseline** (§12): it records wall-clock duration
      and story-completion outcome for **every arm that produced a completed run** — at minimum the
      tmux arm — flagged as a throwaway-scale baseline, not the real-build comparison the
      default-flip follow-up requires. If the herdr arm was the gate-refusal form, `evidence.md` says
      so and the baseline carries the tmux number only
- [ ] Typecheck passes

---

## 8. Functional Requirements

- **FR-1:** The system must provide a sourceable `.oh/scripts/lib/session-runner.sh` exposing
  `runner_detect`, `runner_launch`, `runner_verify_cwd`, `runner_alive`, `runner_teardown`.
- **FR-2:** `runner_detect` must resolve the ladder herdr → tmux → foreground, selecting herdr only
  when `command -v herdr` succeeds **and** `herdr status` shows the literal fields `status: running`
  and `compatible: yes`. Those two literals are the whole health predicate.
- **FR-2a (execution-context gate):** `runner_detect` must additionally prove **same-environment
  execution** before selecting herdr — and before launching any probe it must run the **nesting
  guard**: if the caller is itself inside a herdr pane (`HERDR_ENV=1` / `HERDR_PANE_ID` set), herdr
  is ineligible without a probe (reason logged, `allow_nested=false`), so the permanent detection
  path never nests a pane. Past the guard, it launches a short-lived probe pane that emits an environment
  fingerprint (hostname, presence of `/.dockerenv`, resolvability of the target worktree path),
  compares it against the caller's own fingerprint, and on **any mismatch** rules herdr **ineligible**
  — degrading to tmux and logging the reason to the firstmate log. The gate closes its probe pane via
  `herdr pane close <pane_id>` on both verdicts. This is the resolution of §15 Q0: herdr panes are
  host processes, and `AGENTS.md` requires all building and testing inside the sandbox.
- **FR-3:** An explicit `OH_RUNNER` / `--runner` override naming an unavailable runner must be a hard
  error (non-zero exit), never a silent degrade. An override naming **herdr** while the FR-2a gate
  reports a fingerprint mismatch is likewise a hard error, and the message must name the mismatch —
  no override may produce a silent host-side run.
- **FR-4:** Every launch branch must tee its output to a log file; the herdr branch must additionally
  pass `--no-focus`.
- **FR-5:** After a herdr launch the system must verify `foreground_cwd` via `herdr pane list`. Its
  real job is detecting **cross-machine execution** (§15 Q0), not merely a lying `--cwd` flag — a
  mismatch must never be "fixed" by loosening the check.
- **FR-6:** The herdr watch must use
  `herdr wait output <pane> --match '^STATUS: COMPLETE$' --regex --timeout <ms>`, and on match must
  re-read `progress.txt` — `progress.txt` remains the authority and the match self-heals the file.
  `<pane>` must be the pane id parsed from the `herdr agent start` JSON response and exposed by one
  documented accessor, the same id used by `runner_verify_cwd`.
- **FR-6a (session budget):** Every firstmate session must be **wall-clock-bounded** by
  `FIRSTMATE_TIMEOUT_MS`, default `14400000` (4 hours), overridable by that env var. The value is
  obtainable **only** through the validating `resolve_timeout_ms` helper (POSIX integer `> 0`;
  `0`/negative/non-numeric/empty → rejected, default applies, rejection logged). The same resolved
  value is passed as `--timeout` to `herdr wait output` in herdr mode **and** bounds the poll loop in
  tmux/foreground mode — **no mode may watch without a ceiling**, and a non-positive value can never
  reach herdr (its `--timeout 0` semantics are unreachable by construction). On expiry the session is treated as
  death without sentinel: `FIRSTMATE-INCOMPLETE`, PR stays draft, resume comment posted (FR-14).
  Ralph's ceiling is 50 iterations; firstmate's is wall clock. The default is deliberately
  conservative — sized for a real build, so a long-running build is never falsely marked
  `FIRSTMATE-INCOMPLETE` — and must never be curve-fit down to a smoke run's observed duration.
- **FR-7:** The tmux/foreground watch must reuse autopilot's bounded bash poll verbatim
  (`grep '^STATUS: COMPLETE'` + `tmux has-session`), or process exit plus a final grep, bounded by
  the FR-6a budget.
- **FR-8:** `.oh/scripts/firstmate.sh` must validate the slug and the four-file contract using
  `ralph.sh`'s error shape, and must short-circuit to exit 0 when the sentinel is already present.
- **FR-9:** Concurrency must be guarded by an atomic `mkdir /tmp/firstmate-<slug>.lock` (the
  **launch-claim guard**) plus a `runner_alive` cross-check whose herdr-mode oracle is
  **`herdr agent get <name>`'s exit code** (0 = live `agent_info`, 1 = `agent_not_found`). The lock
  is retained alongside the oracle because any read-only oracle leaves a check-then-start TOCTOU
  window; only the atomic directory create closes it. A lock whose slug has no live session is
  **stale and reclaimable**, never a permanent wedge. The lock is per-slug only — it does not bound
  concurrency across different slugs (see Non-Goals).
- **FR-9b:** `firstmate.sh` must refuse to launch when a ralph tmux session for the same slug is
  live (`tmux has-session -t <slug>`), erroring out with the conflicting executor named, and must
  expose `firstmate.sh --kill <slug>` as the operator escape hatch (clears the lock, tears the
  session down via `runner_teardown`, records the outcome in `progress.txt`, never touches the herdr
  server).
- **FR-9a:** Every non-success exit path — watch-timeout expiry, launch failure, operator abort —
  must invoke `runner_teardown`, remove `/tmp/firstmate-<slug>.lock`, and append a
  `FIRSTMATE-INCOMPLETE` line to `progress.txt`. No exit path may leave the lock behind.
- **FR-9c (teardown verb):** `runner_teardown`'s herdr branch must be **`herdr pane close
  <pane_id>`**, using the pane id `runner_launch` captured. herdr 0.7.4 exposes **no** `agent stop`
  or `agent kill` verb (`herdr agent --help`:
  `list/get/read/send/rename/focus/wait/start/attach/explain`); `pane close` is the live-verified
  primitive (exit 0 / `{"result":{"type":"ok"}}`, after which `herdr agent get <name>` returns
  `agent_not_found`). No code path, doc, or probe may reference a nonexistent stop/kill verb.
- **FR-10:** The rendered session prompt must load `userStories[]` by `priority` into the session's
  native task list and run the per-story cycle: implement → quality checks → commit with
  `Submitted-by:` → validate against `acceptanceCriteria` → flip `passes: true` → progress entry.
- **FR-11:** The session must run `/compact` at every story boundary — this is the load-bearing
  replacement for ralph's 50-fresh-process context hygiene.
- **FR-12:** AUDIT-FAIL re-brief must be bounded at max 3 attempts, then the story becomes `BLOCKED`.
- **FR-13:** `STATUS: COMPLETE` must be appended only when all stories pass, on both channels
  (whole line in `progress.txt` and sole final output line).
- **FR-14:** Session death without the sentinel must produce `FIRSTMATE-INCOMPLETE`, leave the PR in
  draft, and post a resume comment — mirroring `RALPH-INCOMPLETE`.
- **FR-14a:** On relaunch after `FIRSTMATE-INCOMPLETE`, the session must re-validate the last
  committed story's `acceptanceCriteria` before proceeding and must never re-implement a story whose
  commit already exists; `passes: true` is flipped only after that validation succeeds.
- **FR-15:** Mid-run herdr loss must degrade the watch to file-polling the same `progress.txt`. The
  system must never restart the herdr server.
- **FR-16:** The build session must never launch herdr; inner fan-out is `/delegate` only. This is
  **prompt-level policy** enforced by the session template and pinned by probe — not a herdr-side
  guarantee. The `allow_nested=false` provenance is operator-reported server config and is not
  agent-discoverable, so nothing may depend on the server rejecting a nested launch. The session
  exports `FIRSTMATE_SESSION=1` and the rendered prompt tells inner `/delegate` calls to avoid the
  herdr runner — **instruction, not enforcement** (see Non-Goals).
- **FR-17:** `/ship-spec` must accept `--executor=firstmate` as an opt-in third arm while
  `SHIP_SPEC_EXECUTOR="${SHIP_SPEC_EXECUTOR:-ralph}"` stays byte-identical.
- **FR-18:** `/autopilot` must accept `EXECUTOR=firstmate` as pure deferral to
  `/ship-spec --executor=firstmate`, with its inline ralph fallback untouched. The deferral must
  **inherit the FR-6a session budget** — no unattended autopilot run may launch an unbounded
  session. The `firstmate` value must be added to autopilot's executor **validation list**
  (`.claude/skills/autopilot/SKILL.md` ~L204, not probe-pinned) **and** to the frontmatter
  argument-hint bracket, whose probe-pinned literal is updated in lockstep in the same PR (a
  recorded deviation from the plan's lockstep-matrix "pinned string intact" line; the invariant that
  line guards — the unchanged ralph default — stays pinned and green).
- **FR-19:** `sandbox-processes.md` must gain an **added** runner ladder in which managed/headless
  processes stay tmux and agentic build sessions prefer herdr. The edit is a pure insertion — never a
  rewrite — verified by a zero-deleted-lines diff and by the gateway rationale's literal substrings
  surviving verbatim.
- **FR-20:** Two new probes must pin the firstmate contract and the runner ladder, one of them
  asserting that `.oh/scripts/ralph.sh` still exists.
- **FR-21:** Ralph is retained indefinitely as the degraded-environment executor; the sunset decision
  is deferred to the default-flip follow-up.

---

## 9. Non-Goals (Out of Scope)

- **Flipping the default executor.** `ralph` stays the default; the flip is a follow-up PR after
  green live runs (it would rewrite ~30 pinned strings in `autopilot-executor-toggle.sh`).
- **Removing, deprecating, or sunsetting `ralph.sh` or the `ralph` skill.** Both are protected paths
  and are retained indefinitely as the degraded-environment executor.
- **Any byte change under `.oh/prompts/`.** The advisor prompt pack is operator-authored; the session
  prompt is a skill-owned derivative.
- **A 4th YAML in the First-Mate charter.** `first-mate-charter.sh` stays unchanged; step-order
  equivalence is asserted by the new probe instead.
- **Editing `.oh/agents/advisor.md` this round.** `advisor-monitored-loop.sh`'s "Monitored async
  ralph loop" row must stay accurate.
- **Changing `/autopilot`'s inline ralph fallback, dedupe logic, or `ACTIVE_MARKER`.**
- **`.pi/` mirror changes.**
- **Any `prd.json` schema drift.**
- **Restarting or updating the herdr server**, setting herdr channels, or touching
  `~/.config/herdr`.
- **Standing up an in-environment (in-container) herdr server.** §15 Q0's resolution is the
  **execution-context gate**, not a topology change: this PR ships the gate and degrades to tmux when
  it refuses. Installing or running a herdr server inside the sandbox so the herdr rung becomes
  reachable here is a **separate decision** and out of scope.
- **Nested herdr sessions.** Forbidden by prompt-level policy in the session template.
- **Multi-slug concurrent firstmate sessions.** The lock is per-slug **by design**; nothing bounds a
  second `--executor=firstmate` build started while a first is running. Concurrent firstmate sessions
  across different slugs are **unsupported and deferred** — for a single-sandbox solo operator the
  guidance (documented in US-004's SKILL.md) is: run one at a time. A cross-slug concurrency limit is
  a separate decision, not this PR's.
- **Shipping the §3 ROUTING table.** The Luna/Sol block is **planning context recorded verbatim, not
  shipped by this PR**. No story, AC, or FR writes it into `.oh/context/rules/first-mate.md` § Effort
  Scaling or anywhere else. It is **target/aspirational routing and explicitly not in effect** —
  today's delegations use the Fable/Opus block. A later reviewer must not mistake it for an
  implemented change.
- **Compatibility beyond the pinned herdr 0.7.4.** Every CLI shape this design depends on
  (`agent start` JSON, `agent get` exit codes, `wait output`, `pane list`, the `status: running` /
  `compatible: yes` fields) was verified against 0.7.4 in this sandbox. Behaviour on any other herdr
  release is **out of scope** — a version-drift guard is a separate decision.
- **`/tmp/firstmate-*.log` retention and task-folder cleanup.** The logs are **ephemeral by design**
  (tmp, unrotated, no retention policy shipped here) and task-folder cleanup **defers to the existing
  `.oh/crons/cleanup-tasks.md` cron**; this PR ships no new retention or sweeping mechanism.
- **Enforcing `/delegate`'s runner choice inside a firstmate session.** Deferred. This round only
  **instructs**: the session exports `FIRSTMATE_SESSION=1` and the rendered prompt tells inner
  `/delegate` calls to avoid the herdr runner. Nothing mechanically prevents an inner `/delegate`
  from selecting herdr — hard enforcement is a follow-up decision.
- **Token / cost budgeting.** `FIRSTMATE_TIMEOUT_MS` bounds the session by **wall clock only**.
  Metering or capping token spend (per story, per session, or per autopilot day) is **deferred** —
  no token accounting exists in the harness today, and inventing one is its own initiative. The
  wall-clock cap plus the max-3 bounded re-brief are the only budget mechanisms this PR ships.
- **Auto-merge.** The human owns the merge gate.

### Out of scope / follow-ups

- **P11 — `/ralph` skill defect fixes (separate issue and PR).** Fix the contradictory `branchName`
  rule (`ralph/` → `<prefix>/<issue#>-<slug>`), add `schemaVersion` to the example JSON, and remove
  the stale "Amp" claim. Docs only, `simple` class. **This is explicitly NOT part of #746** — file it
  as its own issue and link it from this PR.
- **Default-executor flip.** A follow-up PR after green live `firstmate` runs; it also carries the
  ralph sunset decision.

---

## 10. Probe / doc lockstep matrix

- `autopilot-executor-toggle.sh` — P5/P6/P8 are additive **with exactly one intentional exception**:
  the argument-hint literal pinned at line 32,
  `[--executor=ship-spec|delegate-advisor|ralph]`, is **intentionally extended** to
  `[--executor=ship-spec|delegate-advisor|ralph|firstmate]`, and **the probe is updated in lockstep
  in the same commit**. Every *other* pinned string stays intact. (The previous blanket claim
  "every existing pinned string intact" was wrong once the hint advertises the new flag — landing
  one side without the other fails `/eval`.)
- `first-mate-charter.sh` — unchanged (no 4th YAML); P9 adds the template↔pack derivation assertion
  in the new probe instead.
- `advisor-monitored-loop.sh` — **do not touch `advisor.md` this round**; its "Monitored async ralph
  loop" row stays accurate.
- `spec-family-contract.sh`, `submitted-by-trailers.sh`, `implementation-gates.sh` gate1,
  `cron-claude-codex-fallback.sh` — must stay green; no `prd.json` schema drift.
- `ralph.test.ts` untouched-and-green = the proof the migration is additive.
- `AGENTS.md` is the only edited file of the pair — `CLAUDE.md` is a symlink to it; check
  `readlink CLAUDE.md` = `AGENTS.md` **and** `diff AGENTS.md CLAUDE.md` = empty. `.pi` mirrors
  untouched; CHANGELOG `## [Unreleased]`.

---

## 11. Technical Considerations

- **herdr 0.7.4 gaps drive the design:** no file logging (hence `| tee` in every branch), the socket
  path is agent-denied so the CLI is the only interface, and `--no-focus` is mandatory.
- **`herdr agent get` EXISTS in 0.7.4 — live-verified, and the earlier "no has-session oracle"
  premise was false.** Observed 2026-08-12 against the pinned binary: `herdr agent get <live-name>`
  → exit 0 with a `{"result":{"agent":{…}},"type":"agent_info"}` payload; `herdr agent get
  <absent-name>` → exit 1 with `agent_not_found`. That is clean oracle semantics, so `runner_alive`
  uses it (FR-9) and it is **not** a forbidden command. The atomic `mkdir /tmp/firstmate-<slug>.lock`
  is nevertheless **retained** — not as an oracle substitute but as the launch-claim guard that
  closes the check-then-start TOCTOU window every read-only oracle leaves open.
- **herdr panes are HOST processes — Q0 in §15 is RESOLVED (execution-context gate).** Live-verified
  twice on 2026-08-12: `herdr agent start` issued from `/home/sandbox/harness` inside the container
  returns `"cwd":"/home/ryaneggz"` / `"foreground_cwd":"/home/ryaneggz"`, and a probe pane reports
  `hostname=legion-laptop`, `whoami=ryaneggz`, no `/.dockerenv` — while the orchestrator's own
  session runs in container `34263ba23a57` as `sandbox` **with** `/.dockerenv`. The container's herdr
  CLI drives the **host's** server over a mounted socket. Resolution: herdr is eligible only behind
  the FR-2a fingerprint gate, so in this deployment the ladder degrades to tmux and the herdr rung
  stays written-but-unexercised (US-010's herdr arm becomes the observed refusal). Corollary:
  `runner_verify_cwd`'s real job is detecting **cross-machine execution**, not merely a lying `--cwd`
  flag; it must be documented that way so nobody "fixes" a mismatch by loosening the check.
- **There is no `herdr agent stop` / `agent kill` in 0.7.4 — teardown is `herdr pane close
  <pane_id>`.** Live-verified 2026-08-12: `herdr agent --help` lists only
  `list/get/read/send/rename/focus/wait/start/attach/explain`; `herdr pane close <pane_id>` returns
  exit 0 with `{"result":{"type":"ok"}}` and a subsequent `herdr agent get <name>` returns
  `agent_not_found` with exit 1. Any teardown written against a stop/kill verb would fail silently
  inside a trap, so the verb is pinned in FR-9c, US-001, US-004, and the US-009 probe.
- **In-pane detection marker is `HERDR_ENV=1`** (live-verified; herdr's own embedded hook gates on
  `HERDR_ENV=1` + `HERDR_SOCKET_PATH` + `HERDR_PANE_ID`). Inherited by every child of a pane, but it
  does **not** cross a `docker exec` boundary — so it detects direct pane descendants only and is a
  guard, not a proof. `HERDR_SESSION` is unset in the default session; `TERM`/`COLORTERM`/
  `TERM_PROGRAM` are not herdr markers.
- **`allow_nested=false` provenance is operator-reported, not agent-discoverable.** `grep -rn
  allow_nested` returns zero hits outside this task folder, and neither `herdr status` nor
  `herdr config check` surfaces such a field in this sandbox. The no-nesting rule is therefore
  implemented as prompt-level policy pinned by probe (FR-16), and no code path may assume the server
  enforces it.
- **Live `herdr status` field shape** (observed 2026-08-12, herdr 0.7.4): `client.{version,channel,
  protocol}`, `server.{status,version,protocol,compatible,socket}`, `update.restart_needed`. There is
  no single "healthy" flag — hence the pinned two-literal predicate (`status: running` +
  `compatible: yes`).
- **Prior art to reuse, not reinvent:** `/fanout`'s `--runner herdr|tmux|bg` ladder and its
  `foreground_cwd` verification; autopilot's bounded bash poll; `ralph.sh:428-431`'s no-tmux
  foreground fallback **shape**. **Citation correction (critique A-M):** those lines contain **no**
  `| tee` — ralph's foreground fallback does not log to a file today, so the foreground `| tee` in
  this design is **NEW behavior**, not ralph parity. Implementers must not expect to copy a tee from
  there.
- **Vitest coverage boundary:** `vitest.config.ts` includes only `.oh/scripts/__tests__/**`,
  `.pi/**/__tests__/**`, and `.oh/cli/**/__tests__/**`. Tests placed under `.oh/skills/` never run in
  CI, so both new suites must live in `.oh/scripts/__tests__/`.
- **Protected paths touched:** `.oh/scripts/ralph.sh` (must be zero-diff),
  `.oh/skills/t3/references/sandbox-processes.md` (add-never-replace), and the `ralph` skill
  (untouched). The new `firstmate` skill and `firstmate.sh` must be *added* to
  `.claude/protected-paths.txt` in this same PR, per that file's own rule.
- **Dogfood note:** this build still runs under ralph — the P10 smoke run is `firstmate` proving
  itself.

---

## 12. Success Metrics

- `--executor=firstmate` completes a real 2-story task to `STATUS: COMPLETE` in **tmux-fallback
  mode** (its own throwaway slug), with `implementation-gates.sh gate1` reporting `task-graph: 2/2
  stories pass`. **The herdr-mode metric is conditional:** in a deployment whose herdr server runs
  in-environment, the same completion on a second throwaway slug; in **this** deployment, the
  execution-context gate's **observed refusal** (fingerprint mismatch + logged degrade to tmux) is
  the metric — `evidence.md` records which one was met and why.
- Zero behavior change for existing builds: `ralph.test.ts` untouched and green,
  `git diff --stat .oh/scripts/ralph.sh` empty, all pre-existing probes still PASS.
- `/eval` adds two PASS rows and **no new SKIPPED rows** (baseline 2).
- `readlink CLAUDE.md` = `AGENTS.md`, `diff AGENTS.md CLAUDE.md` empty, and `git diff` under
  `.oh/prompts/` empty at PR time.
- **Default-flip gate (critique B-M, premature-optimization finding):** the default-flip follow-up
  may not be scheduled on assertion alone — it requires a **recorded firstmate-vs-ralph comparison
  (wall-clock + story completion) from at least one real, non-throwaway build.** This build's
  `evidence.md` (US-010) seeds the baseline with the throwaway numbers from every arm that actually
  completed — at minimum the tmux arm; the real-build comparison is the follow-up's entry condition.

---

## 13. Verification

- `pnpm test` (new `session-runner.test.ts` + `firstmate.test.ts`; `ralph.test.ts` untouched),
  shellcheck via CI.
- `/eval`: both new probes PASS; zero new SKIPPED rows in `.oh/evals/RESULTS.md`.
- P10 `evidence.md`: a real tmux-fallback run on its own throwaway slug reaching `STATUS: COMPLETE`
  with gate1 `2/2 stories pass`, plus the herdr arm in whichever form applies (full run on a second
  throwaway slug, or the observed execution-context-gate refusal), both isolated on a never-merged
  throwaway branch; and `grep -c 'PROVISIONAL PENDING US-010'` over the wiki entry returning `0`.
- `readlink CLAUDE.md` → `AGENTS.md` and `diff AGENTS.md CLAUDE.md` → empty; `git diff` under
  `.oh/prompts/` → empty; `git diff --stat .oh/scripts/ralph.sh` → empty.

---

## 14. Execution path

Per the canonical workflow: `/spec plan` consumes the Captain-approved plan → this
`.oh/tasks/firstmate-executor/` four-file folder anchored to issue **#746** (branch
`feat/746-firstmate-executor`) → `/spec critique` (2 critics; **both must note the protected-paths
touches**) → `/spec execute` to a draft→ready PR at the human merge gate. No auto-merge; the human
owns the merge.

**PR-gate obligation (round-2):** the PR description must surface the §2 decision-6 **orchestrator
amendment** — the execution-context gate, and the fact that it refuses herdr in this deployment so
firstmate ships running tmux-mode here — explicitly flagged as **pending Captain review**. This is
carried as an AC on US-010 so it cannot be dropped at the finish line.

---

## 15. Open Questions

> ### ✅ RESOLVED — Q0: herdr panes execute on the HOST, not inside this container
>
> **Resolution: the execution-context gate (FR-2a).** herdr mode is eligible **only when
> `runner_detect` proves same-environment execution**; otherwise the ladder degrades to tmux with the
> reason logged. Recorded in §2 as **decision 6 — an orchestrator amendment pending Captain review at
> the PR gate** (US-010 carries the AC that the PR description surfaces it).
>
> **The two independent live probes (2026-08-12, pinned herdr 0.7.4).**
> 1. **Caller side:** the orchestrator's own session runs **in container `34263ba23a57`** as user
>    `sandbox`, with `/.dockerenv` present.
> 2. **Pane side:** a herdr-launched probe pane executed on host **`legion-laptop`** as user
>    `ryaneggz`, with **no** `/.dockerenv` and default cwd `/home/ryaneggz`. Independently,
>    `herdr agent start … --cwd /home/sandbox/harness` returned an `agent_started` payload reading
>    `{"agent":{"cwd":"/home/ryaneggz","foreground_cwd":"/home/ryaneggz","pane_id":"w5:p4", …}}` —
>    the host user's home, not the container path the command was issued from; a write to a
>    container-only path failed with `No such file or directory`.
>
> **Conclusion: herdr panes are HOST processes — outside the sandbox.** The container's herdr CLI
> drives the **host's** server over a mounted socket. `AGENTS.md` requires all building and testing to
> happen **INSIDE** the sandbox, so an unguarded herdr rung would run the build against the host's
> checkout, the host's toolchain, and the host's git identity.
>
> **The gate.** Before selecting herdr, `runner_detect` launches a short-lived probe pane that emits
> an environment fingerprint — **hostname**, **presence of `/.dockerenv`**, and **whether the target
> worktree path resolves** — and compares it against the caller's own fingerprint. **Any mismatch ⇒
> herdr is ineligible**: degrade to tmux, write the reason (both fingerprints, the differing field)
> to the firstmate log. The probe pane is closed via `herdr pane close <pane_id>` on either verdict.
> An explicit `OH_RUNNER=herdr` / `--runner herdr` under a mismatch is a **hard error naming the
> mismatch**, never a silent host-side run.
>
> **Why this is the right resolution, not a patch.** It honours *both* constraints simultaneously:
> the sandbox boundary (`AGENTS.md`) and the Captain's pre-approved fallback — *"if herdr is not
> installed, fall back to tmux"* — extended from **"not installed"** to **"installed but
> out-of-environment."** Same ladder, same degrade path, one more eligibility conjunct.
>
> **What this means concretely.** **In THIS deployment the gate will refuse herdr and firstmate runs
> tmux-mode.** The herdr rung ships written but unexercised here, and US-010's herdr arm becomes the
> **observed refusal** (fingerprint mismatch + logged degrade) rather than a completion run.
> **herdr-primary remains fully supported** for deployments where the herdr server runs
> in-environment — e.g. a herdr server installed and running *inside* the container — in which case
> the gate passes and the herdr rung is selected normally. Nothing about the design is host-specific;
> only this deployment's topology is.
>
> **Owner:** resolved by the orchestrator; **Captain review at the PR gate** confirms the scope
> consequence (this PR proves the First-Mate session shape on the tmux runner in this sandbox).

1. **When does the default flip?** Locked as a follow-up PR gated on green live `firstmate` runs, but
   the specific bar ("N green runs", "no `FIRSTMATE-INCOMPLETE` in M days") is not yet chosen. Owner:
   whoever plans the default-flip follow-up.
2. **What bounds a long-lived firstmate session?** **RESOLVED — chosen, not deferred:**
   `FIRSTMATE_TIMEOUT_MS`, default **`14400000` (4 hours)**, is the session's wall-clock budget. It
   is the `--timeout` for `herdr wait output` in herdr mode **and** the ceiling of the bounded poll
   loop in tmux/foreground mode, so no mode is unbounded; autopilot's pass-through inherits it
   (FR-6a, FR-18). On expiry the session is treated as death without sentinel →
   `FIRSTMATE-INCOMPLETE`, PR stays draft with a resume comment. The P10 smoke run is explicitly
   **not** the basis for this value: any timing it produces is recorded in `evidence.md` as
   provisional (along with the timeout value actually used) and may not be used to lower the default.
   Re-tuning is a follow-up with real-build evidence, not a smoke-run inference.
3. **Does the ralph sunset ever happen?** Deferred by Captain decision to the default-flip follow-up;
   ralph is retained indefinitely until then.

---

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: `.oh/skills/wiki/corpus/build-executor-ladder.md` — **create** (new entry), plus
  its raw snapshot `.oh/skills/wiki/corpus/raw/<YYYY-MM-DD>-build-executor-ladder.md` and a
  regenerated `.oh/skills/wiki/corpus/README.md` index. Local entries considered and rejected as
  homes: `audit-architecture` (adjacent — the audit half of the loop; gains a `[[...]]` cross-link,
  no rewrite), `oh-cli-portable-lifecycle` / `runtime-isolation-landscape` /
  `crabbox-remote-exec-control-plane` (substrate and CLI lifecycle, not build-loop shape),
  `managed-agents` (external Anthropic synthesis, not harness mechanism),
  `sandbox-dependency-installs` / `fresh-machine-setup` / `document-ingestion` /
  `recursive-language-models` / `molt-agentic-reinforcement-learning` (unrelated). **No existing
  entry covers the build loop or its executors** — `grep -ril 'ralph\|executor\|ship-spec\|autopilot\|herdr'`
  over the corpus hits only `crabbox-remote-exec-control-plane`, `recursive-language-models`, and
  `managed-agents`, none of which describe the harness build loop.
- **Spec alignment**: The wiki entry must record *what is true after this PR* and nothing more: three
  executors exist (`ralph` | `delegate-advisor` | `firstmate`) on one axis and a herdr → tmux →
  foreground runner ladder on an orthogonal axis; `ralph` is **still the default** and is retained
  indefinitely as the degraded-environment executor; `firstmate` is **opt-in** via
  `--executor=firstmate`; `STATUS: COMPLETE` as a whole line in `.oh/tasks/<slug>/progress.txt`
  remains the invariant interface across all three; managed/headless processes remain tmux while
  agentic build sessions prefer herdr. The PRD's Non-Goals bound the wiki too — the entry must NOT
  describe the default as flipped, must NOT describe ralph as deprecated, and must NOT describe P11
  (the `/ralph` skill defect fixes) as part of this change.
- **DeepWiki comparison**: The public DeepWiki index for `mifunedev/openharness`
  (`https://deepwiki.com/mifunedev/openharness`) **was reachable during planning**. Its page list
  includes **"Ralph Runner and Task Lifecycle"**, **"Autopilot and Ship-Spec Pipeline"**,
  **"Delegation and Parallel Execution"**, **"Skills System"**, **"Connecting to the Sandbox"**, and
  **"Glossary"** — so this change touches a subsystem DeepWiki already documents, which is itself the
  strongest argument for `Impact: REQUIRED`. **Honest limitation:** the individual page *bodies*
  could not be retrieved — the deep-page URL slug pattern was not resolvable from the index and a
  guessed URL returned only navigation chrome, so no line-level terminology diff was performed.
  Structurally identifiable gaps from the index alone: DeepWiki frames the build loop as "Ralph
  Runner", singular, with no executor axis and no runner ladder — after this PR that framing is
  incomplete, and the "Connecting to the Sandbox" / process-management framing does not yet
  distinguish managed/headless tmux from agentic-build herdr. `/spec execute` should re-attempt the
  per-page DeepWiki fetch when the deep-page URLs are resolvable and reconcile any terminology
  divergence in the same branch.
- **Acceptance criteria**: carried by **US-008** (the story that reconciles the norms conflict and
  therefore owns the operator mental model). Verbatim ACs are in US-008 above; in summary the story
  must create `.oh/skills/wiki/corpus/build-executor-ladder.md` with schema-conformant frontmatter
  (`slug: build-executor-ladder`, ≥1 `raw/` source path, `confidence: provisional`) and the schema
  section order (`## Relevant Source Files` → `## Summary` → `## Detail` → `## System Relationships`
  → `## See Also`); show both axes as a Mermaid diagram or table; line-cite
  `.oh/scripts/firstmate.sh`, `.oh/scripts/lib/session-runner.sh`,
  `.claude/skills/ship-spec/SKILL.md`, and `.oh/skills/t3/references/sandbox-processes.md`; state
  that `ralph` remains the default and `STATUS: COMPLETE` is invariant; stay within the schema's
  **≤ 900-word architecture-entry cap** (verify with `wc -w`, state the count in the PR);
  cross-link `[[audit-architecture]]`; regenerate the README index so
  `bash .oh/evals/probes/wiki-readme-index.sh` passes; and `git add -f` the entry, its raw snapshot,
  and the README, because `.oh/skills/wiki/corpus/*` is gitignored by default.
  **Sequencing caveat (critique B-M5):** US-008 lands at P8, *before* the P10 live proof, so every
  entry claim about live runtime behavior must be marked with the exact literal
  **`PROVISIONAL PENDING US-010`**, with a post-US-010 confirmation pass required before the PR is
  marked ready for review — mechanically verified by
  `grep -c 'PROVISIONAL PENDING US-010' .oh/skills/wiki/corpus/build-executor-ladder.md` returning
  `0` at that point (US-010 AC).
  **Raw-snapshot contract (critique A-L1):** the snapshot is provenance, not a restatement — it
  follows the `crabbox-remote-exec-control-plane` snapshot's capture-date + provenance structure and
  cites the new repo files (`.oh/scripts/firstmate.sh`, `.oh/scripts/lib/session-runner.sh`,
  `.oh/skills/firstmate/SKILL.md`, `.oh/skills/firstmate/templates/session-prompt.md`) with the
  capture date and the commit hash they were captured at.
