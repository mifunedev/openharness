# Source: in-repo capture — the four files introduced by issue #746

Capture date: 2026-08-12 (UTC). Captured from the working tree of branch
`feat/746-firstmate-executor` at commit `17f04920` (`17f04920bcb8184340ef377830b5fc7d7383238f`).
Verbatim excerpts read directly out of the four new repository files that the
`build-executor-ladder.md` wiki entry cites. This file is **provenance**, not a
restatement of the entry: it records what the source said at capture time so a
later reader can tell drift from synthesis.

## Captured source files

| Path | Introduced at | Size at capture |
| --- | --- | --- |
| `.oh/scripts/lib/session-runner.sh` | `ad9b5d4d` (US-001) | 647 lines |
| `.oh/skills/firstmate/templates/session-prompt.md` | `86b1928b` (US-002) | 236 lines |
| `.oh/scripts/firstmate.sh` | `e970f885` (US-003) | 529 lines |
| `.oh/skills/firstmate/SKILL.md` | `bf276399` (US-004) | 323 lines |

Adjacent files read but not captured here (they were edited, not created, by
this branch): `.claude/skills/ship-spec/SKILL.md` (Stage 1 toggle at `:59`,
Stage 10 "Opt-in (`firstmate`)" at `:379`), `.oh/skills/autopilot/SKILL.md`
(`:429`), `.oh/skills/spec/references/execute.md` (`:61`),
`.oh/skills/t3/references/sandbox-processes.md` (`:13`, added by US-008 in this
same commit range).

## `.oh/scripts/firstmate.sh` — header, naming contract (lines 2–28)

```
# .oh/scripts/firstmate.sh — the `firstmate` executor entrypoint.
#
# Launches ONE long-lived First-Mate session over the whole `.oh/tasks/<slug>/`
# task graph, where ralph launches 50 fresh processes each holding one story.
# The session manager is resolved by the shared ladder in
# `.oh/scripts/lib/session-runner.sh` (herdr -> tmux -> foreground); the slug and
# four-file validation come from `.oh/scripts/lib/task-contract.sh`; the session
# prompt is rendered from `.oh/skills/firstmate/templates/session-prompt.md`.
#
# `.oh/scripts/ralph.sh` is UNTOUCHED and stays the default executor. firstmate
# is opt-in, reached only via `--executor=firstmate`.
#
# Naming contract (PRD section 5)
#   herdr agent    firstmate-<slug>
#   tmux session   agent-firstmate-<slug>
#   herdr log      /tmp/firstmate-<slug>.log
#   tmux log       /tmp/agent-firstmate-<slug>.log
#   lock           /tmp/firstmate-<slug>.lock   (atomic mkdir launch-claim)
#   rendered prompt /tmp/firstmate-<slug>.prompt.md
#   terminal       the whole line `STATUS: COMPLETE` in progress.txt
```

Other observed anchors in the same file: `render_session_prompt` at `:236`, the
cross-executor guard `tmux has-session -t "$slug"` at `:321`, the atomic
`mkdir "$lock"` launch-claim at `:342`, `--kill` at `:381`, and the sentinel
short-circuit printing `✓ STATUS: COMPLETE is already present in %s — nothing to
launch.` at `:430`.

## `.oh/scripts/lib/session-runner.sh` — pinned herdr 0.7.4 facts (lines 62–85)

```
# herdr 0.7.4 facts this file is pinned to (all live-verified 2026-08-12)
#   * `herdr status` prints `status: running` and `compatible: yes` under its
#     `server:` block. There is no single "healthy" flag, so those two literals
#     ARE the whole health predicate.
#   * `herdr agent start <name> [...] --no-focus -- <argv...>` replies with an
#     `agent_started` payload whose pane id is at `.result.agent.pane_id`.
#     Observed shape (PRD section 15 Q0, captured 2026-08-12):
#       {"result":{"agent":{"cwd":"/home/ryaneggz",
#                           "foreground_cwd":"/home/ryaneggz",
#                           "pane_id":"w5:p4", ...}},"type":"agent_started"}
#   * `herdr agent get <name>` is the liveness oracle: exit 0 (`agent_info`) =
#     live, exit 1 (`agent_not_found`) = gone. It is REQUIRED here, not banned.
#   * There is NO `agent stop` / `agent kill` verb — `herdr agent --help` lists
#     only list/get/read/send/rename/focus/wait/start/attach/explain. Teardown
#     is `herdr pane close <pane_id>`; a stop/kill verb would fail silently
#     inside a trap.
#   * herdr panes may be HOST processes: the container's herdr CLI drives the
#     host's server over a mounted socket. That is why herdr eligibility
#     carries the execution-context gate below.
```

Session budget, `:100` and `:171`:

```
RUNNER_DEFAULT_TIMEOUT_MS=14400000
...
# Accepts a POSIX integer > 0. Rejects 0, negative, non-numeric, empty and
# absurdly large values: the default applies and the rejection is logged.
resolve_timeout_ms() { # [slug]
```

Teardown, `:584`:

```
# Closes the session. herdr's teardown verb is `pane close` — 0.7.4 has no
# `agent stop` / `agent kill`, and a nonexistent verb inside a trap would fail
# silently.
runner_teardown() { # <mode> <slug>
```

Other observed anchors: the nesting guard
`if [ "${HERDR_ENV:-}" = "1" ] || [ -n "${HERDR_PANE_ID:-}" ]; then` at `:323`;
the health predicate greps for `status: running` / `compatible: yes` at
`:337–338`; `runner_probe_fingerprint` at `:277` (probe pane closed on both
verdicts at `:299`); `runner_detect` at `:370`; `runner_launch` at `:430`;
`runner_verify_cwd` at `:479`; `runner_alive` at `:509`.

## `.oh/skills/firstmate/templates/session-prompt.md` — contract header (lines 1–48)

```
<!-- FIRSTMATE SESSION-PROMPT TEMPLATE — CONTRACT HEADER (US-002)

The template body uses these three placeholder tokens and NO OTHER:
  <slug>    the task-folder slug — the directory name under `.oh/tasks/`
  <branch>  the git branch the work lands on — `prd.json`'s `branchName`.
  <issue>   the GitHub issue number, BARE DIGITS (no `#`).

NOTATION — `{curly braces}` are NOT placeholders. Curly-brace text marks
runtime-fill text the SESSION writes while it runs.

2. STEP-ORDER EQUIVALENCE — ORDERED ANCHOR-KEYWORD LIST (recorded verbatim)
Derived at authoring time from `.oh/prompts/advisor/implement.yml` and
`.oh/prompts/advisor/pr.yml` (both files are ZERO-DIFF — this template is a
derivative, not an edit).
  ANCHOR 1: `dependency graph`      <- implement.yml:23 / pr.yml:23
  ANCHOR 2: `/compact`              <- implement.yml:24 / pr.yml:24
  ANCHOR 3: `acceptanceCriteria`    <- implement.yml:25 / pr.yml:25 (first half)
  ANCHOR 4: `passes: true`          <- implement.yml:25 / pr.yml:25 (second half)
  ANCHOR 5: `/audit implementation` <- implement.yml:27
  ANCHOR 7: `/retro`                <- implement.yml:28 / pr.yml:33
```

Body anchors observed: the per-story cycle at `:115–132` (commit with a
`Submitted-by:` trailer → validate → flip `passes: true` → append the progress
entry), "**The First Mate flips `passes: true` — never the delegate.**" at
`:156`, and the resume semantics at `:200–204` ("Never re-implement a story
whose commit already exists").

## `.oh/skills/firstmate/SKILL.md` — section inventory at capture

```
:21  Name disambiguation table (executor vs. First Mate role charter)
:39  The executor contract
:69  Usage
:106 The runner ladder
:123   herdr eligibility — a zeroth guard plus three conjuncts
:155 Naming contract
:166 Session budget
:185 Watch matrix
:209 Recovery matrix
:232 Kill a wedged firstmate session
:277 Concurrency
:290 Configuration
:307 Related
```

## Capture limitations

- **No live run is captured here.** Every claim about runtime behavior in these
  files was, at capture time, backed by unit tests (`session-runner.test.ts`,
  `firstmate.test.ts`) and by the live `herdr` CLI probing recorded in the
  file headers — not by an end-to-end executor run. The live per-mode smoke is
  US-010; the wiki entry marks the affected claims `PROVISIONAL PENDING US-010`
  until then.
- The `pane_id` JSON shape above is quoted from the source file's own header
  comment, which records it as observed against the pinned herdr 0.7.4 in this
  sandbox on 2026-08-12. It was not re-fetched during this capture.
