# PRD: Correct memory.md daily-log persistence claim

## Introduction

`context/rules/memory.md` is a load-bearing rule that auto-loads into every orchestrator session. Its § Layout block (line 31) documents the daily log as:

```
  YYYY-MM-DD/
    log.md               # daily append log (gitignored directory; log.md tracked inside)
```

The phrase **"log.md tracked inside"** is false. `.gitignore:44` is `memory/[0-9]*/`, which ignores every daily-log directory, and the `.gitignore:43` comment states intent explicitly: only `memory/README.md`, `memory/MEMORY.md`, and topic notes are tracked. `git ls-files` confirms only two vestigial pre-ignore logs (`memory/2026-05-03/log.md`, `memory/2026-05-04/log.md`, committed before the ignore rule landed) remain tracked; every daily log written since is local-only. A `memory/MEMORY.md` lesson dated 2026-05-24 already named this gap, but the rule was never corrected.

This feature corrects the rule prose to match reality and adds a read-only fitness probe so the lesson cannot silently re-drift.

## Goals

- Make `context/rules/memory.md` accurately describe how daily logs persist: the `memory/YYYY-MM-DD/` directory is gitignored; daily logs are a local-only working journal; only `MEMORY.md`, `README.md`, and topic notes are tracked in git.
- State the correction exhaustively — acknowledge the two vestigial pre-ignore tracked logs so the prose is precise, not merely "untracked".
- Guard the corrected claim with a tier-A eval probe so a future edit that re-introduces a "tracked" claim (or removes the gitignore rule) flips the probe to REGRESSION.
- Record the fix in `CHANGELOG.md`.

## User Stories

### US-001: Correct the false "tracked inside" claim in memory.md

**Description:** As an agent reading `context/rules/memory.md`, I want the § Layout block to accurately describe daily-log persistence so I am not misled about which memory survives a fresh clone.

**Acceptance Criteria:**

- [ ] `context/rules/memory.md` no longer contains the string `tracked inside` (verify: `grep -c "tracked inside" context/rules/memory.md` returns `0`).
- [ ] The § Layout code block line for `log.md` accurately states the directory is gitignored and the daily log is local-only (e.g. comment reads `# daily append log (gitignored — local-only; not committed)`).
- [ ] Prose adjacent to the § Layout block (or a short note after it) states that the `memory/YYYY-MM-DD/` directory is gitignored via `.gitignore` `memory/[0-9]*/`, that daily logs are a local-only working journal, and that only `MEMORY.md`, `README.md`, and topic notes persist in git.
- [ ] That prose notes the two pre-ignore tracked logs (`memory/2026-05-03`, `memory/2026-05-04`) remain tracked as historical vestige.
- [ ] No other file under `context/` or `.claude/skills/` claims daily session logs are git-tracked (verify: `grep -rniE "log\.md.*track|track.*log\.md|tracked inside" context/ .claude/skills/` returns **0 matches** — the new probe lives under `evals/probes/`, outside this grep scope, so it cannot self-match).
- [ ] The vestigial-log note (next bullet) MUST appear inside or directly below the § Layout fenced code block — not buried elsewhere in the rule — so a reader skimming only the layout block sees the reconciliation.
- [ ] The § Layout fenced code block still renders cleanly (opening and closing triple-backtick fences intact).

### US-002: Add a tier-A probe guarding the corrected claim

**Description:** As the harness, I want a deterministic probe that fails if the false claim returns or the gitignore rule is removed, so this lesson is retained the way other lessons are.

**Acceptance Criteria:**

- [ ] `evals/probes/memory-gitignore-claim.sh` exists and is executable (`chmod +x`).
- [ ] It follows the existing probe header pattern (mirrors `evals/probes/boot-lint-glob.sh`): `#!/usr/bin/env bash`, `# tier: A`, `# source: issue #101`, `# desc: <one line>`, then `set -euo pipefail`.
- [ ] It resolves the repo root relative to `BASH_SOURCE` (not `pwd`), matching `boot-lint-glob.sh`.
- [ ] It is a 3-state oracle: exit `0` PASS, exit `1` REGRESSION, exit `2` SKIPPED.
- [ ] SKIPPED (exit 2) path: if EITHER `.gitignore` OR `context/rules/memory.md` is absent, print `SKIPPED: <which file>` to stderr and exit 2. (Guards against a false PASS on Assertion B where `grep -q "tracked inside" <missing-file>` evaluates false inside an `if`.)
- [ ] Assertion A: `.gitignore` contains an **uncommented** `memory/[0-9]*/` ignore line — skip comment lines (e.g. `grep -v '^[[:space:]]*#' .gitignore | grep -qF 'memory/[0-9]*/'`) so a commented-out `# memory/[0-9]*/` does NOT falsely PASS; REGRESSION (exit 1) if missing.
- [ ] Assertion B: `context/rules/memory.md` does NOT contain the literal `tracked inside`; REGRESSION (exit 1) if present.
- [ ] On the corrected repo, `bash evals/probes/memory-gitignore-claim.sh` exits `0` and prints a `PASS: ...` line.
- [ ] Negative test confirmed: with `tracked inside` temporarily reintroduced into `context/rules/memory.md`, the probe exits `1` (REGRESSION); with the `memory/[0-9]*/` line removed from `.gitignore`, the probe exits `1`. (Confirms the probe is not an unconditional `exit 0`.) Revert both temporary edits after confirming.
- [ ] `bash -n evals/probes/memory-gitignore-claim.sh` passes (syntax check); the probe is shellcheck-clean — run `shellcheck -S warning evals/probes/memory-gitignore-claim.sh` manually as the gate, since CI's boot-lint glob covers `.devcontainer/ install/ scripts/ workspace/` only and `evals/probes/` is intentionally NOT added (doing so would flip the `boot-lint-glob` probe to REGRESSION).

### US-003: Record the fix in CHANGELOG

**Description:** As a maintainer, I want the corrected rule recorded in the changelog per `context/rules/git.md` § Changelog.

**Acceptance Criteria:**

- [ ] `CHANGELOG.md` has a `### Fixed` subsection under `## [Unreleased]` (create it if absent, ordered per Keep a Changelog conventions).
- [ ] It contains a one-line imperative bullet describing the corrected `context/rules/memory.md` daily-log persistence claim and the new guard probe, linking issue #101.

## Functional Requirements

- FR-1: `context/rules/memory.md` § Layout must describe daily-log persistence in agreement with `.gitignore` (`memory/[0-9]*/` ignored; daily logs local-only; `MEMORY.md`/`README.md`/topic-notes tracked).
- FR-2: The correction must not change `.gitignore` behavior or remove the two vestigial tracked logs.
- FR-3: A new probe `evals/probes/memory-gitignore-claim.sh` must assert both the gitignore rule presence and the absence of the false "tracked inside" claim, using the standard 3-state oracle.
- FR-4: `CHANGELOG.md [Unreleased]` must record the fix under `### Fixed`, referencing #101.

## Non-Goals (Out of Scope)

- Changing whether daily logs are tracked — the gitignored convention is intentional and correct (`MEMORY.md` is the durable tier); only the prose describing it is wrong.
- Removing or migrating the two vestigial tracked logs (`memory/2026-05-03`, `memory/2026-05-04`).
- Editing `context/rules/directory-readme.md` — its gitignore-interaction section is a generic README-exemption pattern and is not affected (the daily-log directory has no README and is fully ignored by design).
- Any change to `crons/heartbeat.md`, `scripts/`, or runtime/cron behavior. (Heartbeat's references to `memory/<today>/log.md` are operational read/write paths, not persistence claims, so they need no correction.)
- Updating the 2026-05-24 `memory/MEMORY.md` lesson that first named this gap. Per `context/rules/memory.md` § Concurrency, existing memory entries are immutable once written ("treat existing entries as immutable"); the lesson stays as the historical record, and this PR closes the gap it identified.
- Any sandbox application code.

## Known Limitations

- The probe's Assertion B is a **string-match guard** for the exact phrase `tracked inside`, not a semantic guard — a future edit that reintroduces the false meaning with different words (e.g. "log.md is committed to git") would not be caught. This is an accepted limitation: the probe pins the specific regression that occurred, consistent with how other `evals/probes/*.sh` guard a named lesson.
- No probe asserts the two vestigial logs remain tracked (FR-2). FR-2 is enforced by review/scope, not by an automated check; adding such an assertion is deferred as unnecessary for this fix.

## Technical Considerations

- Probe pattern reference: `evals/probes/boot-lint-glob.sh` (header comments, `set -euo pipefail`, repo-root via `BASH_SOURCE`, unanchored grep, no-false-PASS-on-zero-match, 3-state exits).
- The `/eval` runner (autopilot §6 gate) executes all `evals/probes/*.sh`; the new probe must exit 0 on the corrected tree so the gate stays green (no new green→red transition).
- Keep the prose edit minimal and within the existing § Layout structure; do not restructure the rule.

## Success Metrics

- `grep -c "tracked inside" context/rules/memory.md` → `0`.
- `bash evals/probes/memory-gitignore-claim.sh` → exit 0 (PASS) on the corrected tree; exit 1 if the claim is reintroduced or the gitignore rule removed.
- `/eval` introduces **no new** REGRESSION rows beyond the pre-existing `next-dev-prod` (a host-runtime-state probe that is already red on `origin/development` and is acceptable per the 2026-06-13 `memory/MEMORY.md` lesson on the autopilot eval gate — the gate keys on the green→red *delta*, not the bare presence of a REGRESSION row). The runner may exit non-zero solely due to that pre-existing red; the new `memory-gitignore-claim` probe must be PASS.

## Open Questions

- None — scope and behavior are fully specified by the plan and verified against the live tree.

## Critic Resolution (Stage 4)

Two critics (implementer + user lens) reviewed this PRD before any code was written; full output in `critique.md`. Outcome: **PROCEED**.

- 1 high-severity finding (success-metric inaccuracy: `/eval` does not exit 0 today because `next-dev-prod` is a pre-existing red) was **mitigated at the AC level** — the Success Metrics section now scopes success to "no NEW REGRESSION beyond the pre-existing `next-dev-prod`", citing the 2026-06-13 eval-gate lesson. It is a spec-wording issue, not a code or destructive risk.
- 5 medium findings were resolved by hardening the US-002 probe ACs (dual-file SKIPPED guard, comment-line-aware Assertion A, explicit negative test, manual `shellcheck` gate that deliberately does not expand the boot-lint glob), tightening the vestigial-log note placement in US-001, and adding the MEMORY.md-immutability and heartbeat clarifications to Non-Goals.
- 4 low findings are acknowledged as Known Limitations.
- No protected-path violation; `context/rules/memory.md` is not on `.claude/protected-paths.txt`.
