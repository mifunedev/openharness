# `/spec execute` task — <slug>

> This is a **template**, rendered at execution time by
> `.oh/skills/spec/references/execute.md` step 4 and read by the agent that is already
> running `/spec execute`. It is never written into `.oh/tasks/<slug>/`: a persisted copy
> of a generated file drifts from the template it came from.

You are the single implementation owner for the `<slug>` task. Read the approved plan in
`.oh/tasks/<slug>/prd.md` and the ordered stories in `.oh/tasks/<slug>/prd.json`.

- Branch: `<branch>` — never push to `development` or `main`.
- Issue: #<issue>.
- Task folder: `.oh/tasks/<slug>/` (`prd.md`, `prd.json`, `progress.txt`; you add
  `evidence.md` and `eval-result.json`).
- Status file: `/tmp/spec-<slug>.state` — keep it current at every phase.

## Ownership

You own this task from implementation through the final PR gate. Do not hand the task to a
second implementation owner or a second supervisory session, and do not launch another
coding-agent process — through tmux, Herdr, a background shell, or any other runner — to do
this work. Ownership is a role, not a terminal topology. Use `/delegate` only for bounded,
disjoint work that can run in parallel. Reconcile every worker result yourself, validate each
story's acceptance criteria against the repository, and update `prd.json` and `progress.txt`.

## Re-ground before you implement

`prd.md`'s `## Knowledge Context` names the planning base commit and the
authoritative sources the plan was grounded against. Diff that base against
current HEAD, re-read every listed source that moved, and reconcile before
writing code. Knowledge pages are orientation; code and tests are implementation
truth and canonical docs/RFCs are intended-design truth. Do not load the pattern
set — that is the planner's input.

## Implementation cycle

1. Read the plan, story dependencies, current progress, and relevant repository instructions.
2. Implement the next dependency-ready story, directly or with bounded `/delegate` workers.
3. Run the required quality checks and fix failures before recording success.
4. Set that story's `passes` field to `true` only after validation. Add a dated progress entry
   with the files, commit, result, and learnings. Every implementation commit needs a mandatory
   `Submitted-by: <active submitter>` trailer.
5. Continue until every story passes. Do not claim completion when a story is blocked or
   deferred. Completion is structured state, not prose: the task is done when
   `jq -e 'all(.userStories[]; .passes == true)' .oh/tasks/<slug>/prd.json` exits 0.

## Tail

After implementation completes, continue in this same session with the `/spec execute`
procedure, in this order: the implementation-side audit loop; `/eval` once; the Actual
Knowledge Impact gate (`knowledge-impact.sh --changed <actual diff>`, then resolve every
impacted page to UPDATED / REVERIFIED / NOT-AFFECTED); write and commit `evidence.md`;
`/spec retro <slug>`; `/wiki compile`; optional non-gating context compaction; `/benchmark`;
then run a fresh `/audit pr`. Mark the PR ready only when that audit is promotable. Never merge
the PR. Report `READY` or `DRAFT-BLOCKED(<gate>)` and mirror it into the status file.
