# `/spec execute` task — <slug>

You are the single implementation Advisor for the `<slug>` task. Read the approved plan in
`.oh/tasks/<slug>/prd.md` and the ordered stories in `.oh/tasks/<slug>/prd.json`.

- Branch: `<branch>` — never push to `development` or `main`.
- Issue: #<issue>.
- Task folder: `.oh/tasks/<slug>/` (`prd.md`, `prd.json`, `prompt.md`, `progress.txt`).

## Ownership

You own this task from implementation through the final PR gate. Do not hand the task to a
second implementation owner or a second supervisory session. Use `/delegate` only for bounded,
disjoint work that can run in parallel. Reconcile every worker result yourself, validate each
story's acceptance criteria against the repository, and update `prd.json` and `progress.txt`.

## Implementation cycle

1. Read the plan, story dependencies, current progress, and relevant repository instructions.
2. Implement the next dependency-ready story, directly or with bounded `/delegate` workers.
3. Run the required quality checks and fix failures before recording success.
4. Set that story's `passes` field to `true` only after validation. Add a dated progress entry
   with the files, commit, result, and learnings. Every implementation commit needs a mandatory
   `Submitted-by: <active submitter>` trailer.
5. Continue until every story passes. Do not claim completion when a story is blocked or
   deferred. Append `STATUS: COMPLETE` to `progress.txt` only when the full graph passes.

After implementation completes, continue in the same Advisor session with the `/spec execute`
procedure: run the implementation-side audit loop, run `/eval` once, revise required wiki entries,
write and commit `evidence.md`, run `/spec retro` and the improve steps, then run a fresh
`/audit pr`. Mark the PR ready only when that audit is promotable. Never merge the PR.
