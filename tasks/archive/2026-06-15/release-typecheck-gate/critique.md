# Critique — release-typecheck-gate

Generated 2026-06-12; reviews `prd.md` post-/prd, pre-/ralph. Two critics ran in
parallel (implementer lens + user lens). Both cross-checked
`.claude/protected-paths.txt` — no protected path is touched (the change is
limited to `.github/workflows/release.yml` and `CHANGELOG.md`).

## Critic A — Implementer lens

```
[SEVERITY: L] [US-001/US-002] Toolchain availability is NOT a risk — release.yml already
  has Checkout → Setup Node 22.x → Install pnpm → Cache pnpm store → Install
  dependencies before the insertion point. node/pnpm/deps all available.
[SEVERITY: M] [US-002] `npm --prefix packages/oh ci` has no npm-store cache in release.yml
  (parity with ci-harness, which also lacks it). Cold install adds latency/flakiness.
  Non-Goals exclude caching → record as follow-up.
[SEVERITY: M] [US-002] FR-3 line-range conflict (L80-86 vs L83-86) could mislead the copy.
  → Clarify run: value mirrors the two npm command lines; name: stated separately.
[SEVERITY: M] [US-003] AC used truncated step name "Root tests"; actual is "Root tests
  (scripts + .pi extensions)" → could produce a false gap finding. Use full name.
[SEVERITY: L] [US-003] ci-harness `boot-lint` is a SEPARATE job, not validate — out of
  scope for the scope guard; remind implementer.
[SEVERITY: L] [US-004] `### Changed` already exists (CHANGELOG.md L26) → append, don't
  create a second heading.
[SEVERITY: L] [US-004] Verify issue/PR #53 exists before linking (it does — filed this run).
[SEVERITY: L] [*] No protected-path violations. release.yml + CHANGELOG.md not on the list.
```

Edge cases noted: `--if-present` makes the workspace typecheck a silent no-op if
no package defines `typecheck` (same as ci-harness — acceptable); `npm ci` fails
if `packages/oh/package-lock.json` is stale (correct behavior); a tag pushed on a
non-PR commit still runs the new steps (the intended safety net).

## Critic B — User lens

```
[SEVERITY: L] [US-003] Scope-guard gap has nowhere to land (Open Questions = "None").
  → Record any gap in Open Questions / file a follow-up issue.
[SEVERITY: L] [US-002] No npm cache in release (parity); acceptable at single-dev,
  infrequent-release cadence. Follow-up candidate only.
[SEVERITY: L] [US-001/US-002] release `build` job is gated by `needs: [validate]`
  (release.yml L53) — already wired, PRD doesn't state it explicitly.
[SEVERITY: L] [US-004] Don't hard-code #53 if unsure; #53 confirmed filed.
[SEVERITY: L] [*] Add a concrete YAML-validity check command to ACs.
[SEVERITY: L] [*] Rollback = git revert (two-file YAML+md edit); sufficient.
[SEVERITY: L] [*] "release maintainer" persona drifts slightly from single-dev voice —
  cosmetic only.
[SEVERITY: L] [US-003] boot-lint (shellcheck+hadolint) gap warrants a follow-up issue,
  not scope expansion here.
```

## Synthesis

- **High-severity findings**: 0
- **Medium-severity findings**: 3 (all from Critic A, all PRD-clarity issues —
  now folded into prd.md: full canonical "Root tests" step name in US-003; FR-3
  line-range disambiguation; US-004 append-to-existing `### Changed`)
- **Low-severity findings**: remainder (acknowledged below)
- **Recommendation**: PROCEED

### Resolution applied to prd.md (pre-PROCEED)

1. US-003 AC now uses the full canonical step name `Root tests (scripts + .pi
   extensions)` and explicitly excludes the separate `boot-lint` job from the
   scope guard.
2. US-004 AC now says APPEND to the existing `### Changed` block (no duplicate
   heading); #53 confirmed filed.
3. FR-3 split into precise name/run mirroring (workspace = L80-81, standalone =
   L83-86); FR-5 added requiring local YAML-validity verification.

### Acknowledged low-severity risks (not blocking)

- **No npm-store cache** for `packages/oh ci` in release.yml — matches the
  existing ci-harness pattern; excluded by Non-Goals (no caching). Candidate for
  a separate follow-up if release times grow.
- **`needs: [validate]` gate** is already wired (release.yml L53); this task does
  not touch it. The new typecheck steps inherit that gate automatically.
- **`boot-lint` (shellcheck + hadolint) parity gap** between ci-harness and
  release is real but out of scope — a candidate follow-up ticket, recorded in
  prd.md Open Questions guidance rather than fixed here.
