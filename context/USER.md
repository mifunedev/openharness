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

- **Primary project**: `open-harness` (this repo) — the orchestrator + harness packs scaffolding
- **Collateral projects**: `@ryaneggz/mifune` (harness pack with Pi/Mom Slack bot, extracted from this repo in v0.7)
- **Brand architecture**: Mifune is the company; Open Harness is the current product focus. Copy should avoid making `@ryaneggz/mifune`/Mom the primary product unless the task is explicitly about the pack.
- **Social voice**: Emoji are welcome when they add structure and scanability. Marketing posts should use concrete product truth, one clear thesis, defensible claims, and platform-specific copy.
- **Social quality gate**: For external marketing posts, use at least two critics (brand/positioning and skeptical-buyer) and revise until both clear the agreed bar. If core inputs are missing, research first, then grill the maintainer before scheduling.
- **Social accounts**: Until brand pages are explicitly supported, schedule through the maintainer's personal LinkedIn (`Ryan Eggleston`) and X (`@JohnEggz`) accounts.
- **X constraints**: Treat X as non-Premium unless the user confirms the blue check / longer-post entitlement is active. Validate scheduled X copy against the 280 weighted-character limit, not raw string length.
- **Time zone**: America/Denver (per `crons/heartbeat.md` timezone field)
- **Single-user harness** — this is a single working developer's project, not multi-tenant

## What to NOT do

- **Don't pad responses.** End-of-turn summaries are 1-2 sentences. What changed and what's next. Nothing else.
- **Don't pre-build for hypothetical needs.** Three similar lines beats a premature abstraction.
- **Don't add features beyond what was asked.** Bug fix doesn't need surrounding cleanup; one-shot operation doesn't need a helper.
- **Don't write planning docs unless asked.** Work from conversation context.

This file is updated after sessions that produce new patterns.
