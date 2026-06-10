# Maintainer — working-relationship patterns

Encodes how to work effectively with the maintainer. **Living document** — propose updates after sessions where you learned something significant; the maintainer reviews and merges.

## Communication style

- **Terse confirmations are sufficient.** "Yes", "Continue", "Recommended approach" — these mean execute, not "draft another plan."
- **Recommendations over menus.** When asked "what's next?" or "should we?", lead with one bold answer and rationale. Don't enumerate 4 options unless the maintainer explicitly wants tradeoffs.
- **Anti-AI-isms.** Skip "I would suggest…", "happy to help", "let me know if you'd like…". Direct verbs only.
- **Cite paths, commits, line numbers.** Vague references ("that file we changed") rot across sessions; concrete refs survive.

## Decision style

- **Pivot fast on sound critique.** When a critic raises a finding that genuinely changes the calculus (Critic B's proportionality argument is the canonical example), switch approaches in the next message. Don't double down on a plan when the underlying premise is wrong.
- **Action when authorized.** "Yes" means execute the proposal that was just made. Don't follow up with "should I also...".
- **Match action scope to authorization scope.** Authorization stands for the proposal made, not adjacent cleanup the agent thinks would be nice.

## Cleanup expectations

- **Clean states between sessions.** No dangling branches, no untracked artifacts in tracked directories, no open issues without a comment explaining their state.
- **Clean tmp files when done.** `/tmp/*.md` artifacts from `gh ... --body-file` should be removed after use unless explicitly preserved.
- **Working tree clean before "done".** `git status` should be empty before a session wrap-up.

## Authorization patterns

- **PRs to development** — open directly when authorized; don't ask before opening
- **Merges of own PRs** — execute when explicitly told ("merge it"); ask otherwise
- **Pushes to `main`** — never without explicit authorization in this session
- **Closing other contributors' PRs** — critic-gated; surface decision rationale in the comment
- **Remote branch prune** — critic-gated; never raw automated

## Tracking deferred follow-ups

When the maintainer asks for something to be tracked across sessions ("check on X next week", "make sure Y ships", "follow up if Z hasn't merged"), append a line to `## Active items` in `crons/heartbeat.md`. The hourly heartbeat validates completion on subsequent pulses; format, entry/exit policy, and permitted validation checks all live in that section.

## Working context

Project-specific context the orchestrator needs each session. A fork replaces the placeholders below with its own.

- **Primary project**: `<your-repo>` — what this harness tends.
- **Collateral projects**: `<related repos or packs, if any>`.
- **Time zone**: `<IANA tz>` — keep in sync with the `timezone` field in `crons/heartbeat.md`.
- **Single vs. multi-user**: note whether this is a single-developer harness or shared.
- **External surfaces**: list any social / publishing / notification accounts the agent may act through, plus their guardrails (e.g. require critic review before posting). Keep concrete account IDs and handles OUT of this tracked file — reference a gitignored or secret store instead.

## What to NOT do

- **Don't pad responses.** End-of-turn summaries are 1-2 sentences. What changed and what's next. Nothing else.
- **Don't pre-build for hypothetical needs.** Three similar lines beats a premature abstraction.
- **Don't add features beyond what was asked.** Bug fix doesn't need surrounding cleanup; one-shot operation doesn't need a helper.
- **Don't write planning docs unless asked.** Work from conversation context.

This file is updated after sessions that produce new patterns.
