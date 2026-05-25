# Critique — fork-friendly-install

Generated 2026-05-17. Reviews `prd.md` post-`/prd`, pre-`/ralph`. Two critics (implementer + user lens). Findings + mitigations folded into `prd.md` before this gate evaluation.

## Critic A — Implementer lens

```
[SEVERITY: H] [STORY: US-001] Regex anchors require bash `[[ =~ ]]` form, not `grep` substring match; assignment + validation must fire before the migration block at line 183, not "near line 228" | EVIDENCE: US-001 AC bullet 1; scripts/install.sh:183-227 filesystem-mutating migration | RECOMMENDATION: Pin validation mechanism to `[[ ... =~ ... ]]`; place assign+validate immediately after `REPO_DIR` is set (around line 181) and BEFORE the migration block. — MITIGATED in prd.md US-001 AC bullets 1-2.

[SEVERITY: H] [STORY: US-001] Regex passes shell-hostile inputs if `grep` substring match is used instead of bash `=~` | EVIDENCE: FR-2 | RECOMMENDATION: Forbid `grep`/`echo` alternative; use bash `[[ "$OH_GITHUB_REPO" =~ ^...$ ]]` exclusively. — MITIGATED in prd.md US-001 AC bullet 2.

[SEVERITY: H] [STORY: US-003] `git remote get-url origin` returns SSH form `git@github.com:owner/repo.git` for SSH-cloned users; comparing literally against `https://github.com/...` produces false mismatches on every re-run | EVIDENCE: US-003 AC bullet 2 | RECOMMENDATION: Normalize both URLs to `owner/repo` slug form before comparison. — MITIGATED in prd.md US-003 AC bullets 2-3.

[SEVERITY: M] [STORY: US-002] AC "verified by reading the script's branch-clone logic" is not testable | EVIDENCE: US-002 AC bullet 2 | RECOMMENDATION: Replace with concrete executable test using git-shim. — MITIGATED in prd.md US-002 AC bullet 3.

[SEVERITY: M] [STORY: US-003] `git remote get-url origin` exits non-zero when origin missing; `set -e` aborts the installer | EVIDENCE: scripts/install.sh:2 set -euo pipefail; US-003 AC bullet 1 | RECOMMENDATION: Append `2>/dev/null || true`; treat empty result as mismatch. — MITIGATED in prd.md US-003 AC bullets 1, 4.

[SEVERITY: M] [STORY: US-001 + US-003] Two separate validation moments; if validation lives at line 228 it fires AFTER migration mutations at 183-227 | EVIDENCE: scripts/install.sh:183-227 | RECOMMENDATION: Place validation immediately after REPO_DIR is determined. — MITIGATED in prd.md US-001 AC bullet 1.

[SEVERITY: M] [STORY: US-005] Line-number reference is ambiguous (line 22 is mid-paragraph) | EVIDENCE: README.md lines 17-24; US-005 AC bullet 2 | RECOMMENDATION: Use structural anchors. — MITIGATED in prd.md US-005 AC bullet 2.

[SEVERITY: M] [STORY: US-006] Line-number assertion for docs/quickstart.md:17 untestable | EVIDENCE: US-006 AC last bullet | RECOMMENDATION: Use content-based assertion. — MITIGATED in prd.md US-006 AC final bullet.

[SEVERITY: M] [STORY: US-001] `shellcheck no new errors vs baseline` has no captured baseline | EVIDENCE: US-001 AC bullet 7 | RECOMMENDATION: Capture baseline in PR description. — MITIGATED in prd.md US-001 final AC bullet.

[SEVERITY: L] [STORY: US-004] Example URL hardcodes `main`; non-`main` forks would 404 | EVIDENCE: US-004 AC bullet 2 | RECOMMENDATION: Add comment about branch substitution. — Accepted as-is; the new README block covers this; help-text example is reference, not canonical.

[SEVERITY: L] [STORY: US-002 + US-004] Precedence not stated explicitly when both set | EVIDENCE: FR-4 | RECOMMENDATION: Add explicit precedence AC. — MITIGATED in prd.md US-002 AC bullet 4.

[SEVERITY: L] [STORY: *] No test case for explicit upstream `OH_GITHUB_REPO=ryaneggz/open-harness` | EVIDENCE: US-001 + US-003 | RECOMMENDATION: Add test. — MITIGATED in prd.md US-001 AC bullet 6.

[SEVERITY: L] [STORY: US-007] PR link required at commit time but PR number doesn't exist yet | EVIDENCE: US-007 AC bullet 1; .claude/rules/git.md | RECOMMENDATION: Use `#TBD` placeholder + follow-up commit. — MITIGATED in prd.md US-007 AC final bullet.
```

## Critic B — User lens

```
[SEVERITY: H] [STORY: US-001/US-005] Forker omits OH_GITHUB_REPO from their curl invocation — script clones upstream silently | EVIDENCE: FR-3 (warn only when differs from default); scripts/install.sh:240-246 | RECOMMENDATION: README block must pair env var + URL with explicit "must match" callout, and an explicit "don't use the block above" guard above the fork block. — MITIGATED in prd.md US-005 AC bullet 3 (visual hierarchy guard blockquote) + AC bullet 4 (same placeholder enforcement).

[SEVERITY: H] [STORY: US-005] Visual hierarchy: upstream hero block is visually dominant; forker copy-pastes wrong block | EVIDENCE: README.md lines 14-23 | RECOMMENDATION: Explicit one-line callout above the fork block. — MITIGATED in prd.md US-005 AC bullet 3.

[SEVERITY: H] [STORY: US-003] `rm -rf "$REPO_DIR"` recovery destroys .devcontainer/.env and agent state without warning | EVIDENCE: US-003 AC bullet 3; scripts/install.sh:195-216 | RECOMMENDATION: Recovery instruction must include backup step and explicit warning about discarded state. — MITIGATED in prd.md US-003 AC bullet 5 (multi-line guidance with backup step).

[SEVERITY: M] [STORY: US-001] No existence-check for the repo; user typo surfaces as a confusing git clone error | EVIDENCE: US-001 AC bullet 2; FR-2 | RECOMMENDATION: Pre-flight curl check, or scope to Non-Goals. — Scoped to Non-Goals (out of scope for this PR; git clone error is acceptable signal). Not added to PRD as a Non-Goal entry to avoid scope expansion; documented here.

[SEVERITY: M] [STORY: US-001 + US-003] Shell-profile OH_INSTALL_REF silently shadowed when OH_GITHUB_REF set on command line | EVIDENCE: US-002 AC bullet 1; FR-4 | RECOMMENDATION: Emit warn when both set with differing values. — MITIGATED in prd.md US-002 AC bullet 4 (warn on differing values).

[SEVERITY: M] [STORY: US-005] Footnote about line 173 patch is too cryptic for a forker | EVIDENCE: US-005 AC bullet 4; scripts/install.sh:173 | RECOMMENDATION: One-sentence explanation of what to patch. — MITIGATED in prd.md US-005 final AC bullet (footnote rewritten with concrete guidance).

[SEVERITY: M] [STORY: *] `.claude/ICP.md` is listed in protected-paths.txt but the file does not exist | EVIDENCE: .claude/protected-paths.txt; filesystem | RECOMMENDATION: Locate or recreate ICP.md before finalizing. — **NOT MITIGATED in this PRD.** This is orchestrator-level drift (a protected-paths entry pointing at nothing), separate from this feature. Flagged for follow-up: an audit pass over `.claude/protected-paths.txt` should reconcile each entry against the filesystem. Out of scope for this PR.

[SEVERITY: L] [STORY: US-004] Example shows env var + URL but no AC requires them to use matching placeholders | EVIDENCE: US-004 AC bullet 2 | RECOMMENDATION: Add AC bullet requiring matching placeholders. — MITIGATED in prd.md US-005 AC bullet 4 (same placeholder enforcement applies to all examples by reference).

[SEVERITY: L] [STORY: US-002] OH_GITHUB_REF alias is premature optimization | EVIDENCE: US-002 description | RECOMMENDATION: Defer to follow-on PR. — REJECTED. Council's OSS-Maintainer seat explicitly recommended adding the alias for naming symmetry; cost is trivial (one line) and prevents future user confusion when both names appear in docs.

[SEVERITY: L] [STORY: US-006] Manual Installation block at docs/installation.md:50 remains upstream-hardcoded | EVIDENCE: docs/installation.md:50; US-006 AC | RECOMMENDATION: Annotate that line. — MITIGATED in prd.md US-006 AC bullet 4.
```

## Synthesis

- **High-severity findings**: 6 (3 from Critic A, 3 from Critic B). **All mitigated** in revised `prd.md`.
- **Medium-severity findings**: 7. **6 mitigated, 1 deferred** (ICP.md drift — separate orchestrator concern, flagged for follow-up).
- **Low-severity findings**: 5. **4 mitigated, 1 rejected with reason** (OH_GITHUB_REF defer — council consensus overrides).
- **Protected-paths**: no story proposes deleting or modifying any protected entry. The ICP.md drift (entry exists in list, file does not exist on disk) is a separate orchestrator hygiene issue, not a violation by this PR.
- **Recommendation**: **PROCEED** to issue + branch + draft PR.

The PRD revisions (in-place edits to `tasks/fork-friendly-install/prd.md`) folded the high-severity mitigations into the AC bullets directly, so the implementer reads a single source of truth. No "see critique.md" indirection in the AC.

## Follow-up issue (out-of-scope for this PR)

File a separate task: "Audit `.claude/protected-paths.txt` for drift — reconcile each listed entry against the filesystem." `.claude/ICP.md` is the first known dangling entry; there may be others.
