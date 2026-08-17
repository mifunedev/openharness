# Evidence — firstmate-executor (US-010 live per-mode smoke)

- **Issue**: #746 · **Branch**: `feat/746-firstmate-executor` (base `development`)
- **Audit run**: n/a — this doc records the **US-010 live smoke**, not an `/audit`
  route invocation. The correlated `AUDIT_RUN_ID` + native verdict come from
  `/ship-spec` Stage 12's `/audit pr`, which runs after this doc lands.
- **Written by**: the US-010 operator (the audit routes are report-only and never
  write this file).
- **Captured**: 2026-08-12 UTC, herdr **0.7.4** (client + server, protocol 16).

## What was broken, and what now holds

`ralph` launches 50 fresh single-story processes; nothing in the harness could run
**one long-lived session over a whole `.oh/tasks/<slug>/` task graph**. US-001–US-009
built that third executor — the `herdr → tmux → foreground` runner ladder, the
`firstmate.sh` entrypoint, the session prompt, the skill, the two toggles, and two
probes — but every claim about its *runtime* behavior was still only unit-asserted.

This story ran it for real. A **tmux-mode run reached the whole line
`STATUS: COMPLETE`** in its task folder's `progress.txt`, which the executor's watch
loop observed, after which it tore the session down and removed the lock — exit 0.
The **herdr arm is refused by the execution-context gate in this deployment**, and
that refusal is itself the deliverable: herdr panes here are **host** processes, so
running the build through them would execute it outside the sandbox.

## Proof by gate

| Gate | What was checked | Observed | Result |
|------|------------------|----------|--------|
| Task graph (tmux arm) | `implementation-gates.sh gate1` over the smoke slug | `task-graph: 2/2 stories pass` | PASS |
| Terminal interface | whole line `STATUS: COMPLETE` in `progress.txt` | present, line 87 | PASS |
| Ladder degrade (herdr absent) | `command -v herdr` made to fail | `herdr is not installed … degrading to tmux` | PASS |
| Execution-context gate | probe-pane vs caller fingerprint | mismatch on all 3 fields → herdr ineligible | PASS (refusal) |
| Explicit-override hard error | `--runner herdr` while ineligible | exit **3**, no silent degrade | PASS |
| Exit paths | lock + session after each arm | no lock, no session, no pane | PASS |
| Non-destructive masking | fresh shell after every arm | `/usr/local/bin/herdr`, `status: running`, `compatible: yes` | PASS |
| Regression floor (PR branch) | `pnpm run typecheck`, 3 probes | `tsc --noEmit` clean; all `exit=0` | PASS |

## Smoke isolation — nothing here landed on the PR branch

Both arms ran in a **disposable worktree on a throwaway branch that was never
merged**: worktree `.oh/worktrees/smoke/firstmate-746`, branch
`smoke/firstmate-746-throwaway`, branched from `c33d5608`.

Smoke-run commits, which live **only** on that throwaway branch:

```
d2ec7fee task: US-002 — create smoke-artifacts/us-002.txt referencing US-001
c57c13ba task: US-001 — mark passes and record iteration 1 progress
e5d4efcc task: US-001 — create smoke-artifacts/us-001.txt
96c70854 task: US-002 — mark passes and record smoke progress   (operator; see § race below)
```

Verified on the PR branch — none of those hashes appear:

```
$ git log --oneline development..feat/746-firstmate-executor
c33d5608 task: US-009 — mark passes and record iteration 9 progress
4272aac2 task: US-009 — two new probes, zero new SKIPPED rows
… 18 more US-001…US-009 commits …
8080c7d1 feat: scaffold firstmate-executor task
```

Every smoke commit carries the mandatory trailer:

```
$ git log --format='%h %s%n    trailer=[%(trailers:key=Submitted-by,valueonly)]' c33d5608..HEAD
d2ec7fee task: US-002 — create smoke-artifacts/us-002.txt referencing US-001
    trailer=[Claude]
c57c13ba task: US-001 — mark passes and record iteration 1 progress
    trailer=[Claude]
e5d4efcc task: US-001 — create smoke-artifacts/us-001.txt
    trailer=[Claude]
```

**Two distinct throwaway slugs** were used — `fm-smoke-tmux` and `fm-smoke-herdr` —
one per runner mode, each with the full four-file contract (`prd.md`, `prd.json`,
`prompt.md`, `progress.txt`) and two stories. One slug per arm is the only shape in
which both arms are real: `firstmate.sh`'s sentinel short-circuit exits 0 without
launching anything once `STATUS: COMPLETE` is in `progress.txt`, so a shared folder
would have made the second arm a silent no-op.

## Launch context (FR-16)

Both arms were initiated from a **plain tmux session** (`firstmate-executor`), never
from inside a herdr pane. Operator attestation of the launch context, plus the
machine check:

```
$ if [ "${HERDR_ENV:-}" = "1" ]; then echo "in-herdr-pane: YES"; else echo "in-herdr-pane: no"; fi
in-herdr-pane: no
$ if [ -n "${HERDR_PANE_ID:-}" ]; then echo "pane-id: set"; else echo "pane-id: unset"; fi
pane-id: unset
$ if [ -n "${TMUX:-}" ]; then echo "tmux: inside"; else echo "tmux: outside"; fi
tmux: inside
```

`HERDR_ENV` / `HERDR_PANE_ID` are herdr 0.7.4's own in-pane markers, inherited by
every child of a pane, and are what `runner_detect`'s nesting guard keys on.

**Documented false-negative bound.** Environment does not cross a `docker exec`
boundary, so a launch reached via a container hop will not see `HERDR_ENV` even when
a herdr pane initiated it. The marker reliably detects **direct descendants of a pane
only**. It is therefore a guard, not a proof — which is why the operator attestation
above is recorded explicitly, and why the fingerprint gate (below) is the real
backstop in this split-environment deployment.

## Arm A — tmux mode (unconditional; PASSED)

**Herdr masking.** `command -v herdr` was made to genuinely fail via a
**subshell-scoped `PATH=` override with herdr's own directory (`/usr/local/bin`)
removed** — the arm that proves the Captain's "if herdr is not installed, fall back
to tmux" constraint. A stub shim that exits 127 was **not** used: it leaves
`command -v herdr` succeeding and would have exercised the binary-up/server-down
degrade instead, which is already a US-001 unit case.

```
$ MASKED=$(printf '%s' "$PATH" | tr ':' '\n' | grep -vx '/usr/local/bin' | paste -sd:)
$ ( export PATH="$MASKED"
    command -v herdr && echo "HERDR STILL FOUND (bad)" || echo "command -v herdr: FAILS (good)"
    echo "tmux:   $(command -v tmux)"; echo "claude: $(command -v claude)" )
command -v herdr: FAILS (good)
tmux:   /usr/bin/tmux
claude: /usr/bin/claude
$ command -v herdr          # parent shell, unaffected
/usr/local/bin/herdr
```

herdr lives at `/usr/local/bin/herdr` and claude at `/usr/bin/claude`, so removing
that one directory hides herdr while leaving the harness binary reachable.

**Launch and completion.** `FIRSTMATE_TIMEOUT_MS=1800000`:

```
2026-08-12T17:34:05Z
[session-runner] ladder: herdr ineligible — herdr is not installed (command -v herdr failed); degrading to tmux
[session-runner] launched tmux session agent-firstmate-fm-smoke-tmux, log /tmp/agent-firstmate-fm-smoke-tmux.log

╭─ First Mate: fm-smoke-tmux
│  runner:   tmux
│  handle:   agent-firstmate-fm-smoke-tmux
│  harness:  claude
│  log:      /tmp/agent-firstmate-fm-smoke-tmux.log
│  budget:   1800000ms
│  prompt:   /tmp/firstmate-fm-smoke-tmux.prompt.md
│  progress: …/.oh/tasks/fm-smoke-tmux/progress.txt
│  watch:    tmux attach -t agent-firstmate-fm-smoke-tmux
╰─

[session-runner] teardown: tmux kill-session -t agent-firstmate-fm-smoke-tmux

✓ STATUS: COMPLETE observed in …/.oh/tasks/fm-smoke-tmux/progress.txt — firstmate session for fm-smoke-tmux is done.
2026-08-12T17:36:56Z
```

The launch banner's four required fields — resolved runner mode, session handle, log
path, watch command — are all present, and the whole cycle (detect → launch →
watch → sentinel → teardown → lock removal) ran to exit 0.

**The session did the work, not the harness.** One session walked the whole
two-story graph, running the per-story cycle each time:

```
$ cat smoke-artifacts/us-001.txt
US-001 ok
$ cat smoke-artifacts/us-002.txt
US-002 ok
US-001 ok
$ grep -n '^STATUS: COMPLETE$' .oh/tasks/fm-smoke-tmux/progress.txt
87:STATUS: COMPLETE
```

It ran the repo's quality gates before each commit (`typecheck` clean, `lint` no-op,
`vitest` 41 files / 564 tests), validated byte-exactness with `od -c` rather than
eyeballing `cat`, wrote a full progress entry per story, and added its own
`## Codebase Patterns` entries.

**Gate:**

```
$ AUDIT_ROOT=/home/sandbox/harness/.oh/worktrees/smoke/firstmate-746 \
    bash .oh/skills/audit/scripts/implementation-gates.sh gate1 fm-smoke-tmux
task-graph: 2/2 stories pass
gate1 exit=0
```

**Exit state:**

```
$ ls -d /tmp/firstmate-fm-smoke-tmux.lock
ls: cannot access '/tmp/firstmate-fm-smoke-tmux.lock': No such file or directory
$ tmux has-session -t agent-firstmate-fm-smoke-tmux
can't find session: agent-firstmate-fm-smoke-tmux
$ wc -c /tmp/agent-firstmate-fm-smoke-tmux.log
1230 /tmp/agent-firstmate-fm-smoke-tmux.log      # non-empty
```

### Observed defect — the watch loop races the session's completion tail

`progress.txt` is the authority and it was correct, but the session was killed
**mid-tail**. The rendered prompt has the session append `STATUS: COMPLETE` as its
last instructed act (§ 6), while the final story's bookkeeping commit is part of the
per-story cycle that precedes it. `runner_watch` polls every 5 s, so it saw the
marker and ran `runner_teardown` before the session finished flushing:

- US-002's `prd.json` flip and progress entry were **written to disk but never
  committed** (`git status` showed ` M` on both). Committed afterwards by the
  operator as `96c70854` so the throwaway record was complete before teardown.
- The `claude --print` final output never reached the tee'd log — the log holds only
  the session's startup stderr, which is why it is 1230 bytes rather than a full
  transcript.

Neither breaks the terminal contract (the file-level sentinel is the interface, and
it was correct), but a real build would want the session to commit its bookkeeping
*before* appending the marker, or the watcher to grant a short drain window after the
match. **Recommended follow-up, not a US-010 blocker.**

## Arm B — herdr mode: OBSERVED GATE REFUSAL

**Which arm ran, and why:** *observed gate refusal (no in-environment herdr server)*.
A full herdr-mode run to `STATUS: COMPLETE` was **not** executed, because the
execution-context gate correctly refused herdr. This is the conditional deliverable
US-010 anticipated.

herdr is installed and healthy here — the refusal is not a availability failure:

```
$ herdr status
client:
  version: 0.7.4
server:
  status: running
  compatible: yes
  socket: /home/sandbox/.config/herdr/herdr.sock
```

**The probe pane executes on the host, not in the sandbox.** The `agent start` reply
gives it away directly — the pane ignored `--cwd` and landed in the **host** user's
home:

```
$ herdr agent start manual-fp-probe --cwd /home/sandbox/harness/.oh/worktrees/smoke/firstmate-746 --no-focus -- bash -lc '<fingerprint script>'
{"result":{"agent":{"cwd":"/home/ryaneggz","foreground_cwd":"/home/ryaneggz",
                    "pane_id":"w5:pH","name":"manual-fp-probe", …},"type":"agent_started"}}
$ ls -d /home/ryaneggz
ls: cannot access '/home/ryaneggz': No such file or directory     # not a path in this container
$ ls /home
sandbox
```

**The two fingerprints, gathered by the same snippet:**

```
caller (this container) : host=34263ba23a57   docker=yes  worktree=yes
probe pane (herdr)      : host=legion-laptop  docker=no   worktree=no
```

All three fields differ. The pane runs on the host `legion-laptop`, has no
`/.dockerenv`, and cannot resolve the target worktree path.

**The logged degrade-to-tmux reason,** read back out of the firstmate log:

```
$ cat /tmp/firstmate-fm-smoke-herdr.log
2026-08-12T17:33:07Z [session-runner] execution-context gate: probe pane w5:pK emitted no fingerprint within 15000ms
2026-08-12T17:33:07Z [session-runner] ladder: herdr ineligible — execution-context gate: no probe fingerprint
  obtained (caller[host=34263ba23a57 docker=yes worktree=yes]) — herdr cannot be proven to run in this
  environment; degrading to tmux
$ # runner_detect stdout:
RESOLVED MODE: tmux
```

Note **which** refusal branch fires here: the gate rejects via *"no probe fingerprint
obtained"* rather than *"fingerprint mismatch"*, because the short-lived
out-of-environment pane exits before its output can be read back. Both branches end
at herdr **INELIGIBLE**, so the guard holds either way; the explicit fingerprint pair
above was obtained by holding a probe pane open with a trailing `sleep`. (Reading a
held-open pane also line-wraps its output at the pane width, which would truncate a
captured fingerprint — a second reason the mismatch branch is not the one that fires
in this deployment.)

**The explicit override is a hard error, never a silent host-side run:**

```
$ .oh/scripts/firstmate.sh --runner herdr fm-smoke-herdr
[session-runner] runner override 'herdr' refused: execution-context gate: no probe fingerprint obtained
  (caller[host=34263ba23a57 docker=yes worktree=yes]) — herdr cannot be proven to run in this environment
Error: runner herdr was requested explicitly but is unavailable: …
Refusing to degrade silently: an out-of-environment herdr would run this build outside the sandbox.
Error: could not resolve a runner for fm-smoke-herdr.
EXIT CODE: 3
```

**No debris.** The gate closed its own probe pane on the refusal path, and no lock
was ever claimed:

```
$ ls -d /tmp/firstmate-fm-smoke-herdr.lock
ls: cannot access '/tmp/firstmate-fm-smoke-herdr.lock': No such file or directory
$ herdr agent list
{"result":{"agents":[],"type":"agent_list"}}
$ herdr pane list | jq -r '.result.panes[]? | "\(.pane_id) cwd=\(.foreground_cwd)"'
w5:p1 cwd=…/openharness-cloud        # the pre-existing baseline pane, untouched
```

## Non-destructive post-condition

The masking was subshell-scoped only. It never moved, renamed, deleted, copied over,
or `chmod`'d the real herdr binary; never edited `~/.bashrc`, `~/.profile`,
`/etc/environment`, or the parent shell's exported `PATH`; and never stopped,
restarted, or reconfigured the herdr server. After **every** arm had run, in a fresh
shell:

```
$ env -i HOME=/home/sandbox bash -lc 'echo "command -v herdr -> $(command -v herdr)"; herdr status | grep -E "status: running|compatible: yes"'
command -v herdr -> /usr/local/bin/herdr
  status: running
  compatible: yes
$ ls -l /usr/local/bin/herdr
-rwxr-xr-x 1 root root 19073408 Aug  8 16:43 /usr/local/bin/herdr    # mtime predates this work
```

## Teardown

`runner_teardown` was invoked for every mode on both slugs (herdr's verb being
`herdr pane close <pane_id>` — 0.7.4 has no `agent stop` / `agent kill`):

```
[session-runner] teardown: no pane id for firstmate-fm-smoke-tmux — nothing to close
[session-runner] teardown: tmux kill-session -t agent-firstmate-fm-smoke-tmux
[session-runner] teardown: no pane id for firstmate-fm-smoke-herdr — nothing to close
[session-runner] teardown: tmux kill-session -t agent-firstmate-fm-smoke-herdr
```

Both throwaway task folders were deleted (with the worktree), both locks are gone,
the disposable worktree was removed and the throwaway branch deleted:

```
$ git worktree remove .oh/worktrees/smoke/firstmate-746 && git worktree prune
$ git update-ref -d refs/heads/smoke/firstmate-746-throwaway
$ git branch --list 'smoke/*' | wc -l
0
$ ls -d .oh/worktrees/smoke
ls: cannot access '.oh/worktrees/smoke': No such file or directory
```

Confirmation that nothing lingers for either smoke slug:

```
$ herdr agent list
{"result":{"agents":[],"type":"agent_list"}}
$ tmux ls
cron-system: 1 windows (created Wed Aug 12 08:58:03 2026)
cron-watchdog: 1 windows (created Wed Aug 12 08:57:03 2026)
firstmate-executor: 1 windows (created Wed Aug 12 10:12:35 2026)
$ tmux ls | grep -c 'fm-smoke'
0
$ ls -d /tmp/firstmate-fm-smoke-*.lock
no matches found
```

The three surviving tmux sessions all predate this work: two crons and the session
this build itself runs in. The one surviving herdr pane is the pre-existing baseline.

## Session budget

| Arm | `FIRSTMATE_TIMEOUT_MS` | Note |
|-----|------------------------|------|
| tmux (`fm-smoke-tmux`) | `1800000` (30 min) — **override** | Bounded so a wedged throwaway self-terminates instead of holding the default 4 h. Recorded per US-010; the shipped default is untouched. |
| herdr (`fm-smoke-herdr`) | n/a | The gate refused before any session launched, so no budget was consumed. |

**The shipped default is unchanged at `14400000` (4 h).** `resolve_timeout_ms` remains
the single budget source and still rejects `0`, negative, non-numeric, and empty
values back to that default.

## Baseline seed — firstmate vs. ralph (PROVISIONAL)

Per PRD § 12, seeded from the only arm that produced a completed run:

| Executor | Slug | Stories | Wall clock | Outcome |
|----------|------|---------|-----------|---------|
| firstmate (tmux) | `fm-smoke-tmux` | 2/2 | **2 m 51 s** (17:34:05Z → 17:36:56Z) | `STATUS: COMPLETE`, exit 0 |
| firstmate (herdr) | `fm-smoke-herdr` | — | — | gate refusal; no run |
| ralph | — | — | — | not run this round |

**Every timing observation above is PROVISIONAL.** A 2-story throwaway on trivial
file-creation stories is **not** a valid basis for lowering `FIRSTMATE_TIMEOUT_MS`
below its 4-hour default, and it is **not** the real-build comparison a default-flip
follow-up requires — there is no ralph number beside it, and the stories carry none
of a real build's context load. It is a floor-of-the-floor datapoint only.

## Scope change — PENDING CAPTAIN REVIEW

The **execution-context gate** (US-001) is an amendment to PRD § 2 decision 6,
surfaced here rather than absorbed silently. It adds a third conjunct to herdr
eligibility: same-environment execution must be **proven** by a probe-pane
fingerprint, not assumed.

**Consequence in this deployment: herdr mode is refused, so the ladder always
resolves to tmux.** The top rung of the shipped ladder is therefore unreachable here
until a herdr server runs *inside* the container. The gate is what keeps
`AGENTS.md`'s "all building and testing happens INSIDE the sandbox" true — without
it, `--executor=firstmate` would have quietly run builds on the host.

This is a real scope change and the Captain decides it, not this PR.
