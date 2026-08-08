# Brief template

The contract for one fanout unit. A brief is the only context its executor gets
that it could not derive itself — everything here exists because omitting it cost
a real run.

## Contents

1. [Sections](#sections)
2. [Boundaries](#boundaries)
3. [Scope](#scope)
4. [Known traps](#known-traps)
5. [Verification](#verification)
6. [Definition of done](#definition-of-done)
7. [Worked shape](#worked-shape)

## Sections

Every brief has six, in this order. Omit none; an empty section means "verify
there is nothing here", not "skip it".

## Boundaries

- The worktree path and branch, stated as already checked out.
- **Named forbidden paths.** If the primary checkout runs a dev stack, forbid
  entering it and forbid binding its ports, by number.
- Sibling units running concurrently, by path, with "do not touch their branches".
- Repo-specific read prohibitions, quoted verbatim from the repo's own
  `AGENTS.md` (for example: never read a `.env*` file).
- Where task artifacts go — a **gitignored** path, verified with `git check-ignore`.
  This may contradict a generic prompt convention; say so explicitly, and say why.
- Commit, branch, and changelog conventions, deferring to `/git`.
- The closing-keyword rule: never write a GitHub closing keyword for an issue the
  PR does not fully close. GitHub matches the keyword and ignores negation, so
  "this does not close #N" closes #N. Phrase as "does not complete #N (leave it
  open)" and check `closingIssuesReferences` before marking ready.

## Scope

- The issue number and an instruction to read the whole body, not a summary.
- **Anything folded in, and why.** If two issues are one unit, the brief must
  explain the coupling — an executor that does not understand it will split the
  work back apart.
- What is deliberately excluded, so the executor does not expand into it.
- Where a product judgment is genuinely open: name the conservative option, tell
  the executor to take it and state the call in one line, rather than stalling or
  silently choosing the largest change.

## Known traps

Every non-obvious failure the orchestrator already knows about. These are cheap to
write and expensive to rediscover:

- Test doubles or overrides that are inert for structural reasons.
- Commands that exit 0 without doing anything.
- Framing corrections — if the issue text misstates the mechanism, say so and give
  the real one, so the PR does not repeat the error.
- Existing correct implementations of the same pattern, cited by path, as the
  reference to copy.

## Verification

State the exact commands. Then constrain what counts as evidence:

- **Prove each new test fails against the pre-fix code.** A test that passes before
  and after pins nothing. This single instruction has repeatedly surfaced defects
  beyond the issue as filed, including in the orchestrator's own briefing.
- **Measure, do not assert.** Where a number is the claim, compute it and show the
  before/after.
- Name what cannot be verified in this environment and require it to be stated
  plainly in the PR rather than implied.
- Never work around an environment restriction (operator-only paths, denied
  credentials). Report the gap instead.

## Definition of done

A ready-for-review PR against the base branch, CI green, `closingIssuesReferences`
matching what was actually delivered, and a report back naming: the PR number, what
was verified locally versus by CI, and anything deferred to a follow-up.

Prefer a follow-up issue over silently expanding the PR — but require the deferral
to be visible in the PR body.

## Worked shape

```markdown
# Brief — <unit>

You are the First Mate advisor. Run <plan prompt> then <pr prompt>. Delegate the
sub-agents each names. Deliverable: a ready-for-review PR against <base>.

## Boundaries — read first
- Worktree <path>, branch <branch>, already checked out. Never cd into <occupied
  checkout> — it runs the operator's dev stack on :<ports>. Siblings in <paths>.
- NEVER read a .env* file. (repo AGENTS.md, verbatim.)
- Artifacts in .claude/tasks/<slug>/ — verified gitignored. NOT .oh/tasks/, which
  this repo tracks.
- Commits per /git. Changelog entry expected to conflict with siblings; keep both.
- Never write a closing keyword for an issue this PR does not fully close.

## Scope
<issue + what is folded in and the coupling + what is excluded>

## Known traps
<the inert override, the no-op command, the corrected framing, the reference impl>

## Verification
<commands> — and prove each new test fails against the pre-fix code.

## Definition of done
<ready PR, CI green, honest closing refs, report back>
```
