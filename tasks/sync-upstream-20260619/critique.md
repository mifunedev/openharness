# Critique — sync-upstream-20260619 (wave 1)

Generated 2026-06-19 by the Advisor (pre-captured from the verified sync analysis,
consistent with the sync-upstream-20260618 precedent). Reviews `prd.md` /
`prd.json` before any cherry-pick, push, or PR.

## Critic A — Implementer lens

- **[SEVERITY: H] [STORY: US-002..004] Merge-commit picks need `-m 1`** | EVIDENCE: #446/#448/#450 mergeCommits (5b8db4dd/35ced5f5/619d660d) have two parents; a plain `git cherry-pick` of a merge errors "is a merge but no -m option was given" | RECOMMENDATION: each AC names `-m 1` explicitly; #452 (a5cf486) is single-parent and must NOT get `-m`. **Mitigated in prd.json.**
- **[SEVERITY: H] [STORY: US-001..004] Empty-check must reference the PR's own SHA, not `upstream/development`** | EVIDENCE: wave-1 is a *partial* day; `docs/*` (touched by deferred #456) and other files differ between a wave-1 PR's merged state and the upstream tip, so `git diff HEAD upstream/development -- <payload>` would false-BLOCK | RECOMMENDATION: every empty-check diffs `HEAD <merge-sha> -- <payload>`. **Mitigated in prd.json** (this is the key correction vs the 06-18 prompt).
- **[SEVERITY: H] [STORY: *] #462 correctly excluded** | EVIDENCE: origin commits #252/#254 modified `AGENTS.md`+`scripts/README.md`, the files #462 rewrites; a blanket `-Xours` drops #462's payload | RECOMMENDATION: defer #462 to wave 2 (3-way merge). **Mitigated: out of scope.**
- **[SEVERITY: M] [STORY: US-001] `-Xours` discards #452's RESULTS timestamp churn** | EVIDENCE: #452's diff rewrites 100 RESULTS lines (pure timestamp regen, no new probe) | RECOMMENDATION: this is desired — origin keeps its own RESULTS during the pick; US-005 hand-inserts only the 2 genuinely-new probe rows. **Mitigated.**
- **[SEVERITY: M] [STORY: US-005] RESULTS wholesale-regen risk** | EVIDENCE: memory `eval-results-new-probe-row` — regen churns 40+ rows and drops provenance | RECOMMENDATION: hand-insert exactly 2 rows, alphabetical, existing rows untouched. **Mitigated in AC.**
- **[SEVERITY: L] [STORY: US-004] new CI workflow activates on the fork** | EVIDENCE: #450 adds `.github/workflows/sandbox-boot-guard.yml` | RECOMMENDATION: expected; note in PR body that a new Actions workflow lands on the fork. **Acknowledged.**

## Critic B — User lens

- **[SEVERITY: M] [STORY: *] Partial-day scope must be transparent** | EVIDENCE: only 4 of 9 06-19 PRs ship in wave 1 | RECOMMENDATION: PR body + prd.md § Out of scope name all 5 deferrals (#462/#454/#456/#458/#463) with per-PR rationale, so the gap is not silently truncated. **Mitigated.**
- **[SEVERITY: M] [STORY: US-006] Shared-append conflict with open PR #255** | EVIDENCE: #255 (06-18 sync) is open and also edits CHANGELOG/RESULTS | RECOMMENDATION: prd.md § Base/stacking documents the expected merge-time union conflict (memory `shared-append-file-rebase-conflicts`); `/pr-audit` catches it. **Mitigated.**
- **[SEVERITY: L] [STORY: *] Worktree isolation** | EVIDENCE: shared checkout is live for crons | RECOMMENDATION: all work in `.worktrees/task/sync-upstream-20260619`. **Mitigated.**
- **[SEVERITY: L] [STORY: *] No rollback hatch named** | EVIDENCE: destructive-ish (new branch + PR) | RECOMMENDATION: fully reversible pre-merge — `git worktree remove` + `gh pr close` + `git push origin --delete`; nothing merges without review. **Acknowledged.**

## Synthesis

- **High-severity findings**: 3 (all mitigated in prd.json before any pick).
- **Medium-severity findings**: 4 (all mitigated/acknowledged).
- **Recommendation**: **PROCEED.** All high-severity items are design corrections
  already encoded in the acceptance criteria; none require human revision. No
  `.claude/protected-paths.txt` entry is touched (picks only add/extend upstream
  payloads; reconcile only appends).
