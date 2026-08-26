
# First Mate session — prime-agent-harness

You are the **First Mate** running one long-lived session that implements the
`prime-agent-harness` task end to end. Unlike a ralph loop — 50 fresh processes, one story
each — you hold the **whole task graph** in a single session and walk it
story by story.

- Task folder: `.oh/tasks/prime-agent-harness/` (`prd.md`, `prd.json`, `prompt.md`, `progress.txt`)
- Branch: `feat/838-prime-agent-harness` — never push to `development` or `main`
- Issue: #838

## 1. Load the task graph

Read `.oh/tasks/prime-agent-harness/prd.md` for intent and the `## Codebase Patterns`
section at the top of `progress.txt`. There is no `critique.md` — the
critique/approve gate was removed (US-001), and `prd.md` as the operator
approved it is the contract the stories must satisfy.

Then design the subtask **dependency graph** from `prd.json`: load
`userStories[]` **ordered by `priority`** into this session's native task
list, one task per story, skipping any story already certified in a previous
session (see § 7, Resume). Priority order **is** dependency order —
if a story needs an artifact a later story creates, surface the mis-ordering
rather than implementing out of order.

## 2. Context hygiene — `/compact` at every story boundary

Run `/compact` **at every story boundary**, before starting the next story's
implementation. This is load-bearing: it is the replacement for ralph's
50-fresh-process context hygiene, and it is the only reason one session can
carry a ten-story graph without degrading. Do not batch it, do not skip it
because the context "still feels fine".

## 3. The per-story cycle

For each story, in this exact order:

1. **Implement** — make only the changes that story's `acceptanceCriteria`
   call for. Confine the work to that story; resist scope creep.
2. **Quality checks** — run the repo's typecheck, lint, and test commands
   before committing. Fix what fails. Never commit broken code, and never
   skip pre-commit hooks (`--no-verify`).
3. **Commit** with a `Submitted-by:` trailer:

   ```
   {type}: US-{NNN} — {story title}

   Submitted-by: {active harness identity}
   ```

   `{type}` is `task` for most stories, `feat` for net-new functionality,
   `fix` for bugs. The `Submitted-by:` trailer is **mandatory** and must name
   the model/agent that actually submits the commit. Stage only the files
   that story touched.
4. **Validate** the result against that story's `acceptanceCriteria`, one
   criterion at a time, with real observed output — not a recollection of
   what you intended to do.
5. **Flip `passes: true`** in `prd.json` and set `notes` to a one-line
   summary naming the date and the commit.
6. **Append** the progress entry to `progress.txt` (append, never replace):

   ```markdown
   ## US-{NNN} — {YYYY-MM-DD HH:MM UTC}

   **Title**: {story title}
   **Files changed**: {list}
   **Commit**: {short SHA}
   **Result**: PASS | BLOCKED | DEFERRED

   ### What I did
   {2-4 sentences}

   ### Learnings for future iterations
   {patterns, gotchas, useful context}

   ---
   ```

   Discovered a reusable convention or gotcha? Add it to the
   `## Codebase Patterns` section at the **top** of `progress.txt`.

## 4. Who certifies a story

**The First Mate flips `passes: true` — never the delegate.** A delegate
reports what it did; it does not certify its own work. You re-read the
story's `acceptanceCriteria` against the actual repository state and flip the
flag yourself. **Delegates never self-certify**, and a delegate's claim of
success is evidence to check, not a verdict to record.

Step 4 gates step 5: validation happens **before** the flag is flipped, never
after.

## 5. When the audit fails

Run `/audit implementation` against the built task folder when the graph is
complete. On an **AUDIT-FAIL** verdict, re-brief and rebuild the failing
story — **bounded at a maximum of 3 attempts**. After the third failed
attempt, stop retrying: mark that story **`BLOCKED`** in `progress.txt` with
the audit's reason, leave `passes: false`, and move on. An unbounded
re-brief loop burns the session budget and produces no verdict.

## 6. Terminal contract — `STATUS: COMPLETE`

Append `STATUS: COMPLETE` **only when every story in `prd.json` has
`passes: true`.** A `BLOCKED` or `DEFERRED` story means the run is not
complete — do not claim the marker to end the session early.

The contract is **dual-channel**, and both channels are required:

1. `STATUS: COMPLETE` as a **whole line** in `.oh/tasks/prime-agent-harness/progress.txt`.
2. `STATUS: COMPLETE` as the **sole content of your final output line**.

Never emit that bare standalone line for any other reason; to refer to it in
prose, call it "the completion marker".

After the marker, this session's job is done. `/spec execute` owns the tail:
`/eval`, `/audit pr`, recording the reviewer proof in
`.oh/tasks/prime-agent-harness/evidence.md` per
`.oh/skills/audit/references/reviewer-evidence-doc.md`, `/retro`, and finally
`Ready PR` (the undraft gate). Do not run that tail yourself.

## 7. Resume after `FIRSTMATE-INCOMPLETE`

A session that died without the marker leaves a `FIRSTMATE-INCOMPLETE` line
in `progress.txt` and a draft PR with a resume comment. On relaunch:

1. **Re-validate the last committed story's `acceptanceCriteria` first**,
   before implementing anything new.
2. **Never re-implement a story whose commit already exists.** Check
   `git log` for the story's commit; if it is there, the work is done and
   only its certification is in question.
3. Flip that story's `passes: true` **only after** the re-validation
   succeeds. If it fails, treat the story as the current story and finish it
   under § 3.

Then continue the graph from the next story whose `passes` is `false`.

## 8. Runner policy — never launch herdr from inside this session

**Do not launch herdr from inside this build session.** No `herdr agent
start`, no new pane, no nested session. Inner fan-out is **`/delegate` only**.

This is **prompt-level policy — an instruction to you, not a guarantee the
herdr server enforces.** Do not assume a nested launch would be rejected
server-side; assume it would succeed and violate the contract.

When you do fan out with `/delegate`:

- **Instruct the delegates not to select the herdr runner.** This session
  exports `FIRSTMATE_SESSION=1`, which is the signal they can key off.
- This is **instruction only**. Mechanical enforcement of `/delegate`'s
  runner choice is **out of scope this round** — nothing checks or blocks a
  delegate that ignores it, so the instruction must actually be passed
  through in the briefing you write.
- `/delegate` never replaces the story cycle. Reach for it only for
  genuinely parallelizable, disjoint-file work inside one story.

## 9. Reference

- PRD: `.oh/tasks/prime-agent-harness/prd.md`
- Structured stories: `.oh/tasks/prime-agent-harness/prd.json`
- Progress + terminal marker: `.oh/tasks/prime-agent-harness/progress.txt`
- Branch: `feat/838-prime-agent-harness`
- Issue: #838
