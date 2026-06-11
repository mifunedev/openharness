# PRD: Make /ci-status repo-agnostic

## Introduction

The `/ci-status` skill (`.claude/skills/ci-status/SKILL.md`) hardcodes the upstream repo `mifunedev/openharness` in every `gh api repos/mifunedev/openharness/...` call. This harness runs from the fork `ryaneggz/openharness`, so `/ci-status` queries the wrong repo and reports nothing for the actual branch/PR. (Observed while shipping PR #17 — CI status had to be checked manually with `gh pr checks <N> --repo ryaneggz/openharness`.) This PRD makes the skill derive its target repo at runtime so it works from any checkout — fork or upstream — with no hardcoded owner/name.

## Goals

- Remove every hardcoded `mifunedev/openharness` reference from the skill.
- Derive the target repo at runtime from the current checkout, with an optional explicit `--repo owner/name` override.
- Prefer a PR-first status path (`gh pr checks` / `gh pr view`) that captures `pull_request`-triggered and fork-branch workflows the branch-runs API can miss.
- Preserve the existing branch-runs flow as the no-PR fallback, parameterized on the derived repo.
- No behavior change for a correctly-configured upstream checkout.

## User Stories

### US-001: Parameterize the repo and add a PR-first status path

**Description:** As an agent running `/ci-status` from a fork, I want the skill to derive its target repo at runtime and check an open PR's checks directly, so that CI status is reported for the real branch/PR instead of failing silently against the wrong upstream repo.

**Acceptance Criteria:**

- [ ] Step 1 of the skill derives `REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)`, and honors an explicit `--repo owner/name` override when the user passes one (uses it instead of deriving). The skill states that `gh repo view` resolves the checkout's `origin` repo — i.e. the repo the branch/PR actually lives in.
- [ ] **(mitigates H1 / Critic B M)** Step 1 includes an empty-`$REPO` guard: if `$REPO` is empty after derivation, the skill halts with a diagnostic (e.g. `ERROR: could not derive repo — is gh authenticated? Try: gh auth login`) instead of issuing a `repos//...` call.
- [ ] **(mitigates H2 / Critic A M)** The skill derives the PR number explicitly before any `gh pr checks` call: `PR_NUMBER=$(gh pr list --head "$BRANCH" --state open --repo "$REPO" --json number --jq '.[0].number')`. The instructions state that when multiple open PRs share the head branch (stacked PRs) the first/most-recent is used; an empty `PR_NUMBER` means "no open PR" and routes to the branch-runs fallback.
- [ ] **(mitigates Critic A M)** A PR-first status path is added as an explicit, ordered instruction step: when `PR_NUMBER` is non-empty the skill uses `gh pr checks "$PR_NUMBER" --repo "$REPO"` (and/or `gh pr view "$PR_NUMBER" --repo "$REPO" --json statusCheckRollup`) **before** any `gh api repos/$REPO/actions/runs` call. The step ordering (PR path first, branch-runs fallback second) is visible in the numbered instruction sequence, not just a grep-able string.
- [ ] **(mitigates Critic B M)** The skill defines the empty-checks case: when `PR_NUMBER` is non-empty but `gh pr checks` reports no checks, the skill reports NO-RUN (reusing the existing NO-RUN diagnostic), not a false PASS.
- [ ] Every literal `repos/mifunedev/openharness/` occurrence is replaced with `repos/$REPO/` so the no-PR branch-runs fallback is parameterized, preserving the existing poll/result/failure-detail logic.
- [ ] **(mitigates Critic A/B M)** The NO-RUN diagnostic and the CI Pipeline Steps section carry a one-line caveat noting their workflow names/steps reflect *this harness's* layout and may differ in other checkouts; the repo slug is parameterized but the workflow-file names are intentionally left as instance documentation (recorded in Non-Goals).
- [ ] **(mitigates Critic A M)** When `--repo` is supplied with a value that does not match `owner/name` format, the skill emits an error before making any `gh` call.
- [ ] Prose and examples (NO-RUN diagnostic, headings) are updated to match; no behavior change for a correctly-configured upstream checkout.
- [ ] `grep -c 'mifunedev/openharness' .claude/skills/ci-status/SKILL.md` returns `0`.
- [ ] `grep 'gh repo view' .claude/skills/ci-status/SKILL.md` returns at least one hit; `grep 'gh pr checks' .claude/skills/ci-status/SKILL.md` returns at least one hit.
- [ ] **(mitigates Critic A L)** The YAML frontmatter block parses without error and the file retains a coherent numbered instruction sequence (each numbered step intact, no dangling references to removed content).

## Functional Requirements

- FR-1: The skill must compute the target repo as `REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)` unless an explicit `--repo owner/name` argument is supplied, in which case that value is used.
- FR-2: All `gh api` calls must reference `repos/$REPO/...` — no literal owner/name may remain in the file.
- FR-3: When an open PR exists for the current branch, the skill must use `gh pr checks <N> --repo "$REPO"` (and/or `gh pr view <N> --repo "$REPO" --json statusCheckRollup`) as the primary status source.
- FR-4: When no PR exists, the skill must fall back to the parameterized branch-runs API (`gh api repos/$REPO/actions/runs?branch=$BRANCH...`).
- FR-5: All prose, examples, and the NO-RUN diagnostic must be consistent with the parameterized commands.

## Non-Goals

- No changes to any other skill, rule, doc, script, cron, or wiki file. In particular, the `CLAUDE.md` Skills-table row for `/ci-status` ("After `git push` — poll CI, report pass/fail") stays accurate (this is an internal mechanism change, not a user-facing behavior change) and is intentionally left untouched.
- No change to the CI pipeline itself or to which workflows exist. The `CI Pipeline Steps` and `NO-RUN` workflow-name lists are intentionally left as instance-specific documentation of *this harness's* layout (carrying a caveat), not generalized — generalizing them is out of scope.
- No deletion of the `ci-status` skill (it is on `.claude/protected-paths.txt` — modify only).
- No new dependencies or external tooling.

## Technical Considerations

- `ci-status` is on `.claude/protected-paths.txt` — modify in place, never delete.
- `gh repo view` resolves the repo from the current git remote, so it works identically from fork or upstream.
- `gh pr checks` / `gh pr view --json statusCheckRollup` capture `pull_request`-triggered workflows and fork-head branches that `repos/<owner>/<name>/actions/runs?branch=` can miss.
- Single-file change; no cross-file coupling.

## Success Metrics

- Running `/ci-status` from the `ryaneggz/openharness` fork reports the real branch/PR status instead of empty output.
- Zero hardcoded `mifunedev/openharness` references remain.
- **Post-merge smoke test:** run `/ci-status` on a branch with a known open PR and verify the output references the fork (`ryaneggz/openharness`), not `mifunedev/openharness`.

## Open Questions

- None — the plan is fully specified.

## Critique Resolution

Two critics reviewed this PRD (`critique.md`). Both SEVERITY: H findings are mitigated at the acceptance-criteria level (gate → PROCEED):

- **H1 — `gh repo view` resolves origin, could reproduce the bug if origin is upstream.** Resolved: deriving the checkout's `origin` repo is correct by design — it is precisely the repo where the branch/PR lives. Residual risk (empty derivation → `repos//...`) is closed by an explicit empty-`$REPO` halt guard (US-001 AC), which also closes Critic B's matching M finding.
- **H2 — multi-PR / stacked-PR ambiguity for the PR-first path.** Resolved: an explicit `PR_NUMBER` derivation AC with a defined tie-break (first/most-recent open PR for the head branch; empty → branch-runs fallback).

Medium findings (empty-checks → NO-RUN mapping, `--repo` format validation, NO-RUN/CI-Pipeline instance-scope caveat) are folded into US-001 ACs. The `CLAUDE.md` Skills-table description stays accurate and is left unchanged (Non-Goals). Low findings acknowledged. No unmitigated high-severity finding remains.
