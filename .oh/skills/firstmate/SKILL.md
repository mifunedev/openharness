---
name: firstmate
description: |
  The `firstmate` build executor — launch ONE long-lived First-Mate session over a
  whole `.oh/tasks/<slug>/` task graph through the herdr → tmux → foreground runner
  ladder, where ralph launches 50 fresh single-story processes. Opt-in only, via
  `--executor=firstmate`; `ralph` stays the default. Documents the executor
  contract, the ladder and its detection gates, the naming contract, the session
  budget, the watch matrix, the recovery matrix, and the manual kill procedure for
  all three runner modes.
  TRIGGER when: launching or watching an `--executor=firstmate` build, "run
  firstmate for <slug>", a wedged or stuck firstmate session needs killing, a
  `FIRSTMATE-INCOMPLETE` line needs interpreting, a firstmate lock needs clearing,
  or the herdr/tmux/foreground degrade behavior needs explaining.
argument-hint: "<slug> [--runner herdr|tmux|foreground] [--harness claude|pi|codex] [--no-watch] | --kill <slug>"
allowed-tools: Bash, Read
---

# firstmate — the build executor

> **Name disambiguation — read this first.** Two different things in this repo
> share the name, and the overload is **intentional**: the executor runs the
> role's workflow.
>
> | | **`firstmate` — the build executor** | **First Mate — the supervisory role charter** |
> |---|---|---|
> | What | This skill: the third `--executor` arm | An operator-authored role definition |
> | Where | `.oh/scripts/firstmate.sh`, `.oh/scripts/lib/session-runner.sh`, `.oh/skills/firstmate/` | [`.oh/context/rules/first-mate.md`](../../context/rules/first-mate.md) |
> | Reached by | `--executor=firstmate` on `/ship-spec` or `/autopilot` | `.oh/prompts/advisor/*` (`plan.yml`, `implement.yml`, `pr.yml`) reference it |
> | Identity | a *session*: `firstmate-<slug>` | a *role*: adaptive decomposition, routing, supervision, verification, synthesis |
>
> The executor's session prompt is a **derivative of that charter's prompt pack**
> — `.oh/skills/firstmate/templates/session-prompt.md` follows the
> `implement.yml` + `pr.yml` step order. That is why the names match. When a
> reader says "First Mate," they mean the role; when a command says
> `--executor=firstmate`, it means this executor. Never leave which one is meant
> implicit.

## The executor contract

`firstmate` is the third build shape alongside `ralph` and `delegate-advisor`.
It is **opt-in** — reached only via `--executor=firstmate` — and **`ralph` is
still the default and is retained indefinitely** as the degraded-environment
executor.

| | `ralph` (default) | `firstmate` (opt-in) |
|---|---|---|
| Processes | up to 50 fresh ones, one story each | **one** long-lived session, whole graph |
| Context hygiene | a new process per iteration | `/compact` at every story boundary |
| Ceiling | 50 iterations | **wall clock** (`FIRSTMATE_TIMEOUT_MS`, default 4h) |
| Terminal interface | the whole line `STATUS: COMPLETE` in `progress.txt` | **identical** |

The terminal interface is the invariant across all three executors: the whole
line `STATUS: COMPLETE` in `.oh/tasks/<slug>/progress.txt`, plus the same line as
the sole content of the session's final output line (dual channel — either ends
the run).

The session loads `userStories[]` from `prd.json` ordered by `priority` into its
native task list, then per story: **implement → quality checks → commit with a
`Submitted-by:` trailer → validate against that story's `acceptanceCriteria` →
flip `passes: true` → append the progress entry → `/compact`**. The First Mate
flips `passes: true`; delegates never self-certify. An AUDIT-FAIL re-brief is
bounded at **max 3 attempts**, after which the story is marked `BLOCKED`.

Inner fan-out is `/delegate` only — the build session never launches herdr. That
is **prompt-level policy** stated by the session template and pinned by probe,
not a herdr-side guarantee.

## Usage

```bash
# launch (runner auto-resolved by the ladder), watch until the sentinel
.oh/scripts/firstmate.sh <slug>

# pin the runner — an unavailable/out-of-environment choice is a HARD ERROR
.oh/scripts/firstmate.sh --runner tmux <slug>

# pick the harness inside the session
.oh/scripts/firstmate.sh --harness pi <slug>

# launch and return immediately (see the --no-watch caveat below)
.oh/scripts/firstmate.sh --no-watch <slug>

# the operator escape hatch — tear down, clear the lock, record the outcome
.oh/scripts/firstmate.sh --kill <slug>
```

Before launching anything the script validates the slug against the slug regex
and the **four-file contract** (`prd.md`, `prd.json`, `prompt.md`,
`progress.txt`) via the shared `.oh/scripts/lib/task-contract.sh` helper, so
`firstmate` and `ralph` cannot silently diverge on what a valid task folder is.

Two guards run before the launch claim:

- **Sentinel short-circuit** — if `progress.txt` already contains the whole line
  `STATUS: COMPLETE`, the script exits 0 and launches nothing.
- **Cross-executor guard** — if a ralph tmux session for the same slug is live
  (`tmux has-session -t <slug>`), the script exits non-zero naming the
  conflicting executor and session. The sentinel only covers the
  already-complete case, never a mid-flight ralph run.

`--no-watch` deliberately **leaves the lock claimed**: with nobody watching,
nobody enforces the session budget or runs the exit path. Clear it with
`--kill <slug>`.

## The runner ladder

`--executor` (build shape) and the runner (session manager) are **orthogonal
axes**. The ladder is resolved by `runner_detect` in
`.oh/scripts/lib/session-runner.sh`, in this order:

**herdr → tmux → foreground**

The tmux and foreground rungs run the *same* First-Mate workflow — degrading the
runner is never a silent regression to the ralph loop.

| Mode | Selected when | Launch | Handle |
|---|---|---|---|
| **herdr** | the nesting guard passes **and** all three conjuncts below hold | `herdr agent start firstmate-<slug> --cwd <worktree> --no-focus -- bash -lc '… 2>&1 \| tee /tmp/firstmate-<slug>.log'` | `firstmate-<slug>` (pane id) |
| **tmux** | herdr is ineligible and `tmux` exists | `tmux new-session -d -s agent-firstmate-<slug> -c <worktree> '… \| tee …'` | `agent-firstmate-<slug>` |
| **foreground** | neither is available | supervised child, still tee'd | pid |

### herdr eligibility — a zeroth guard plus three conjuncts

0. **Nesting guard (before any probe).** If the caller is itself inside a herdr
   pane (`HERDR_ENV=1`, optionally AND-ed with a non-empty `HERDR_PANE_ID` —
   herdr 0.7.4's own in-pane markers, inherited by every child of a pane),
   `runner_detect` skips the probe-pane launch entirely, rules herdr ineligible,
   logs the reason, and degrades to tmux. The permanent detection path must never
   itself nest a pane. These markers **do not cross a container boundary**, so in
   this deployment the fingerprint gate below is the backstop.
1. `command -v herdr` succeeds.
2. `herdr status` shows **both literal fields** `status: running` **and**
   `compatible: yes`. There is no single "healthy" flag; these two literals are
   the entire health predicate. Binary-up/server-down degrades to tmux.
3. **Execution-context gate.** A short-lived probe pane emits an environment
   fingerprint (hostname, presence of `/.dockerenv`, whether the target worktree
   path resolves in that pane) and it is compared against the caller's own
   fingerprint gathered the same way. **Any mismatch ⇒ herdr is ineligible**: the
   ladder degrades to tmux and the reason — both fingerprints and which field
   differed — is written to the firstmate log. The gate closes its own probe pane
   with `herdr pane close <pane_id>` on both verdicts.

> **In this deployment the gate refuses herdr.** herdr panes are **host**
> processes while the harness runs **inside the container**, so the fingerprints
> differ and the ladder degrades to tmux. `AGENTS.md` requires all building and
> testing inside the sandbox, so this is the correct outcome, not a defect.
> Standing up an in-environment herdr server is a separate decision.

An explicit `OH_RUNNER=<x>` / `--runner <x>` naming an unavailable runner is a
**hard error, never a silent degrade**. `--runner herdr` while herdr is installed
and healthy but **out-of-environment** is likewise a hard error whose message
names the fingerprint mismatch — no override may force a silent host-side run.

## Naming contract

| Thing | Value |
|---|---|
| herdr agent | `firstmate-<slug>` |
| tmux fallback session | `agent-firstmate-<slug>` (satisfies `<category>-<identifier>`) |
| herdr log | `/tmp/firstmate-<slug>.log` |
| tmux log | `/tmp/agent-firstmate-<slug>.log` |
| launch-claim lock | `/tmp/firstmate-<slug>.lock` (atomic `mkdir`) |
| rendered prompt | `/tmp/firstmate-<slug>.prompt.md` |

## Session budget

Every firstmate session is **wall-clock bounded — never unbounded**.
`FIRSTMATE_TIMEOUT_MS` (default `14400000` = 4 hours) is the total budget, and
the **only** way any consumer obtains it is the validating `resolve_timeout_ms`
helper in `session-runner.sh`: a POSIX integer `> 0` is honoured, while `0`,
negative, non-numeric, and empty values are **rejected** (the default applies and
the rejection is logged). The same resolved value is the `--timeout` passed to
`herdr wait output` and the ceiling on the tmux/foreground poll loop, so no mode
can watch forever and herdr's `--timeout 0` semantics are unreachable by
construction.

The default is deliberately conservative — sized for a real build, so a
long-running build is never falsely marked `FIRSTMATE-INCOMPLETE`. Do not
curve-fit it down to a smoke run's observed duration. Autopilot's pass-through
inherits the cap; no unattended run may launch an unbounded session.

On expiry the session is treated as **death without sentinel** (see Recovery).

## Watch matrix

**`progress.txt` is the authority in every mode.** herdr's `wait output` match
only *triggers a re-read* of the file — the match self-heals the file the way
ralph's second channel does.

| Mode | Watch mechanism | Operator command the banner prints |
|---|---|---|
| herdr | `herdr wait output <pane> --match '^STATUS: COMPLETE$' --regex --timeout <ms>`, then re-read `progress.txt` | `herdr agent read firstmate-<slug> --lines 80` |
| tmux | bounded poll: `grep '^STATUS: COMPLETE'` + `tmux has-session` | `tmux attach -t agent-firstmate-<slug>` |
| foreground | bounded poll: same grep + `kill -0` on the child | `tail -f /tmp/firstmate-<slug>.log` |

Liveness oracle (read-only — it never claims the launch slot):

| Mode | Oracle |
|---|---|
| herdr | `herdr agent get firstmate-<slug>` **exit code** — 0 (`agent_info`) = live, 1 (`agent_not_found`) = gone |
| tmux | `tmux has-session -t agent-firstmate-<slug>` |
| foreground | `kill -0 <pid>` |

On launch the script prints the resolved runner mode, the session handle, the
harness, the log path, the budget, the rendered-prompt path, `progress.txt`, and
the watch command.

## Recovery matrix

| Situation | Behavior |
|---|---|
| Sentinel observed | teardown, lock removed, exit 0 |
| Death **without** the sentinel | `FIRSTMATE-INCOMPLETE` appended to `progress.txt`; the PR **stays draft** with a resume comment (mirrors `RALPH-INCOMPLETE`) |
| Session-budget expiry | treated as death without sentinel — same path |
| Launch failure / operator abort (`INT`/`TERM`) | same path; the abort trap is installed the moment the lock is claimed |
| **Mid-run herdr loss** | the watch **degrades to file-polling the same `progress.txt`**. The herdr **server is never restarted** |
| Stale lock after a hard crash (`kill -9`) | a lock whose slug has **no live session** is **stale and reclaimable** — the run proceeds; it never wedges the slug permanently |

**Every** non-success exit runs one terminal sequence: `runner_teardown` → remove
`/tmp/firstmate-<slug>.lock` → append a `FIRSTMATE-INCOMPLETE` line to
`progress.txt`. No exit path may leave the lock behind, because a stale lock the
oracle still believes is live would wedge that slug.

**Resume semantics.** On relaunch after `FIRSTMATE-INCOMPLETE` the session first
**re-validates the last committed story's `acceptanceCriteria`** before
proceeding. It never re-implements a story whose commit already exists, and it
flips `passes: true` only after that validation succeeds — the commit-then-
validate cycle order means a mid-story death can leave a committed-but-unvalidated
story, and reconciliation is validation, not redo.

## Kill a wedged firstmate session

Prefer the escape hatch — it does all of the below for you, for whichever runner
actually won the ladder:

```bash
.oh/scripts/firstmate.sh --kill <slug>
```

Manual procedure, per runner mode. **The herdr *server* is never stopped or
restarted** — only the one pane this slug owns.

**herdr**

```bash
herdr agent list                      # find firstmate-<slug> and its pane id
herdr pane close <pane_id>            # the teardown primitive
herdr agent get firstmate-<slug>      # confirm: agent_not_found, exit 1
```

herdr 0.7.4 has **no `agent stop` and no `agent kill` verb** — `herdr agent
--help` lists only `list/get/read/send/rename/focus/wait/start/attach/explain`.
`pane close` is the live-verified primitive (exit 0, `{"result":{"type":"ok"}}`,
after which `agent get` returns `agent_not_found`). A nonexistent verb inside a
teardown trap fails **silently**, so never reach for one.

**tmux**

```bash
tmux kill-session -t agent-firstmate-<slug>
```

**foreground**

Interrupt the process (`Ctrl-C`, or `kill <pid>` from another shell). The abort
trap routes it through the same exit path.

**Then, in every mode:**

```bash
rm -rf /tmp/firstmate-<slug>.lock
printf 'FIRSTMATE-INCOMPLETE %s — manual kill\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  >> .oh/tasks/<slug>/progress.txt
```

## Concurrency

The lock is **per-slug by design**. It closes the check-then-start TOCTOU window
between "no live agent" and "agent started" that any read-only oracle
(`agent get` included) leaves open — the oracle answers *is it alive*, the atomic
`mkdir` answers *who may start it*.

Nothing bounds a second `--executor=firstmate` build started on a *different*
slug while a first is running. **Concurrent firstmate sessions across different
slugs are unsupported and deferred.** For a single-sandbox solo operator the
guidance is: **run one at a time.** A cross-slug concurrency limit is a separate
decision.

## Configuration

| Env var | Meaning |
|---|---|
| `FIRSTMATE_TIMEOUT_MS` | session budget in ms; default `14400000` (4h). Validated only by `resolve_timeout_ms` |
| `FIRSTMATE_HARNESS` | `claude` \| `pi` \| `codex` (default `claude`); same as `--harness` |
| `FIRSTMATE_CLAUDE_FLAGS` / `FIRSTMATE_PI_FLAGS` | harness flag overrides |
| `FIRSTMATE_HARNESS_CMD` | full override of the launched command; the rendered prompt path arrives as `$FIRSTMATE_PROMPT_FILE` |
| `FIRSTMATE_BRANCH` / `FIRSTMATE_ISSUE` | override the `<branch>` / `<issue>` placeholders |
| `OH_RUNNER` | runner override; same values as `--runner` |
| `RUNNER_TMPDIR` | root for logs/lock/prompt (default `/tmp`; tests only) |

The session itself exports `FIRSTMATE_SESSION=1`, `FIRSTMATE_SLUG`,
`FIRSTMATE_TASK_DIR`, and `FIRSTMATE_PROMPT_FILE`. `FIRSTMATE_SESSION=1` is the
signal inner `/delegate` calls key off to avoid selecting the herdr runner —
**instruction, not mechanical enforcement**.

## Related

- [`.oh/scripts/firstmate.sh`](../../scripts/firstmate.sh) — the entrypoint
  (protected path)
- [`.oh/scripts/lib/session-runner.sh`](../../scripts/lib/session-runner.sh) —
  the runner ladder, shared by any executor (protected path)
- [`.oh/scripts/lib/task-contract.sh`](../../scripts/lib/task-contract.sh) — slug
  + four-file validation shared with `ralph.sh`
- [`templates/session-prompt.md`](templates/session-prompt.md) — the session
  prompt the entrypoint renders
- [`.oh/context/rules/first-mate.md`](../../context/rules/first-mate.md) — the
  **role charter** (see the disambiguation note above)
- [`.oh/skills/t3/references/sandbox-processes.md`](../t3/references/sandbox-processes.md)
  — process-management norm: managed/headless services stay tmux; agentic build
  sessions use this ladder
- `/ship-spec` Stage 10 — the `--executor=firstmate` opt-in arm
- `/herdr` — driving the herdr CLI itself
