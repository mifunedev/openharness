---
name: firstmate
description: |
  The build executor — there is exactly one. Launch ONE long-lived First-Mate
  session over a whole `.oh/tasks/<slug>/` task graph through the herdr → tmux →
  foreground runner ladder. Documents the executor
  contract, the ladder and its detection gates, the naming contract, the session
  budget, the watch matrix, the recovery matrix, and the manual teardown procedure for
  all three runner modes.
  TRIGGER when: launching or watching a build, "run
  firstmate for <slug>", a wedged or stuck firstmate session needs killing, a
  `FIRSTMATE-INCOMPLETE` line needs interpreting, a firstmate lock needs clearing,
  or the herdr/tmux/foreground degrade behavior needs explaining.
argument-hint: "<slug> [--runner herdr|tmux|foreground] [--harness claude|pi|codex] [--no-watch] | --kill <slug>"
allowed-tools: Bash, Read
---

# firstmate — the build executor

> **On the name.** `firstmate` used to be two things: this build executor, and a
> separate operator-authored **First Mate role charter** at
> `.oh/context/rules/first-mate.md`, consumed by the `.oh/prompts/advisor/` prompt
> pack. Both the charter and the pack were **deleted** in spec-simplification
> US-004 (issue #816) — a second, discoverable implementation path is a route an
> agent can be pulled onto mid-task. The executor's session prompt had been a
> derivative of that pack; the derivative became the source. So there is nothing
> left to disambiguate: `firstmate`, `First Mate`, and
> `.oh/skills/firstmate/templates/session-prompt.md` now all name one thing, and
> that template is where the role's workflow lives.

## The executor contract

`firstmate` is **the** build shape. There is no executor toggle and no
alternative arm: every build — `/spec execute`, and every `/autopilot` run that
defers to it — reaches this one path.

| | the build executor |
|---|---|
| Processes | **one** long-lived session over the whole graph |
| Context hygiene | `/compact` at every story boundary |
| Ceiling | **wall clock** (`FIRSTMATE_TIMEOUT_MS`, default 4h) |
| Terminal interface | the whole line `STATUS: COMPLETE` in `progress.txt` |

Removing every alternative removes the fallback: recovery from a misbehaving
ladder or child session is **fix-forward only**. The terminal interface is the
invariant across all three *runner* modes: the whole line `STATUS: COMPLETE` in
`.oh/tasks/<slug>/progress.txt`, plus the same line as the sole content of the
session's final output line (dual channel — either ends the run).

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
every consumer of a task folder agrees on what a valid one is.

One guard runs before the launch claim:

- **Sentinel short-circuit** — if `progress.txt` already contains the whole line
  `STATUS: COMPLETE`, the script exits 0 and launches nothing.

A second concurrent launch on the same slug is stopped by the atomic
launch-claim lock, not by an executor-name check — there is only one executor.

`--no-watch` deliberately **leaves the lock claimed**: with nobody watching,
nobody enforces the session budget or runs the exit path. Clear it with
`--kill <slug>`.

## The runner ladder

The build shape is fixed; only the runner (session manager) varies. The ladder
is resolved by `runner_detect` in `.oh/scripts/lib/session-runner.sh`, in this
order:

**herdr → tmux → foreground**

All three rungs run the *same* First-Mate workflow over the same task graph —
degrading the runner never changes what is built.

| Mode | Selected when | Launch | Handle |
|---|---|---|---|
| **herdr** | the nesting guard passes **and** all three conjuncts below hold | `herdr agent start firstmate-<slug> --cwd <worktree> --no-focus -- bash -lc '…'` — **never** piped or redirected: the child must keep a TTY | `firstmate-<slug>` (pane id) |
| **tmux** | herdr is ineligible and `tmux` exists | `tmux new-session -d -s agent-firstmate-<slug> -c <worktree> '…'`, then `tmux pipe-pane` for the log — the pipe attaches to the pane *after* it exists, so the child keeps its TTY | `agent-firstmate-<slug>` |
| **foreground** | neither is available | supervised child inheriting the caller's stdio; **no session log** — a pipe or redirect here would take the child's TTY away | pid |

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
3. **Execution-context gate.** A probe pane emits an environment fingerprint
   (hostname, presence of `/.dockerenv`, whether the target worktree path
   resolves in that pane) and it is compared against the caller's own
   fingerprint gathered the same way. **Any mismatch ⇒ herdr is ineligible**: the
   ladder degrades to tmux and the reason — both fingerprints and which field
   differed — is written to the firstmate log. The gate closes its own probe pane
   with `herdr pane close <pane_id>` on both verdicts.

   The probe pane carries a **keep-alive** so it outlives its own read. herdr
   destroys a pane the moment its command returns, and a read against a
   destroyed pane answers `pane_not_found` — so a probe that prints one line and
   exits loses the race, and the gate reports "no fingerprint" for an
   environment that actually matches (#761). The keep-alive is applied only to
   the pane invocation, never to the shared fingerprint snippet, which also runs
   in-process for the caller side. Its budget derives from
   `RUNNER_PROBE_TIMEOUT_MS`, and it is an upper bound rather than a cost: the
   gate closes the pane as soon as the read completes.

> **Whether the gate admits herdr is a property of the deployment.** It refuses
> whenever the probe pane cannot be shown to run in the caller's environment —
> which was the case while the operator config bind (#756) made the container's
> herdr CLI drive the HOST server. After #756 closed, a live re-probe measured
> caller and probe as identical. `AGENTS.md` requires all building and testing
> inside the sandbox, so a refusal is the correct outcome, never a defect — but
> a refusal that fires in a *matching* environment is one, which is what #761
> fixed.
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
only *triggers a re-read* of the file; the file, not the match, is the verdict.

| Mode | Watch mechanism | Operator command the banner prints |
|---|---|---|
| herdr | `herdr wait output <pane> --match '^STATUS: COMPLETE$' --regex --timeout <ms>`, then re-read `progress.txt` | `herdr agent read firstmate-<slug> --lines 80` |
| tmux | bounded poll: `grep '^STATUS: COMPLETE'` + `tmux has-session` | `tmux attach -t agent-firstmate-<slug>` |
| foreground | bounded poll: same grep + `kill -0` on the child | the child inherits the caller's stdio — watch the terminal it was launched from |

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
| Death **without** the sentinel | `FIRSTMATE-INCOMPLETE` appended to `progress.txt`; the PR **stays draft** with a resume comment |
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

Nothing bounds a second build started on a *different* slug while a first is
running. **Concurrent build sessions across different slugs are unsupported and
deferred.** For a single-sandbox solo operator the
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

## See Also

- [`.oh/scripts/firstmate.sh`](../../scripts/firstmate.sh) — the entrypoint
  (protected path)
- [`.oh/scripts/lib/session-runner.sh`](../../scripts/lib/session-runner.sh) —
  the runner ladder (protected path)
- [`.oh/scripts/lib/task-contract.sh`](../../scripts/lib/task-contract.sh) — slug
  + four-file validation, shared by every consumer of a task folder
- [`templates/session-prompt.md`](templates/session-prompt.md) — the session
  prompt the entrypoint renders
- [`.oh/skills/t3/references/sandbox-processes.md`](../t3/references/sandbox-processes.md)
  — process-management norm: managed/headless services stay tmux; agentic build
  sessions use this ladder
- `/spec execute` — the one build path this executor serves
- `/herdr` — driving the herdr CLI itself
