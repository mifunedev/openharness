# Critique — pin-devcontainer-pnpm

Generated 2026-06-14; reviews `prd.md` post-/prd, pre-/ralph (advisor-model 3-step critic gate).

## Critic A — Implementer lens

```
[SEVERITY: H] [US-001] [PROTECTED-PATH] .devcontainer/Dockerfile is on .claude/protected-paths.txt:43; PRD modifies it with no override note. Change is additive hardening (one-line pin), not deletion → mitigable with explicit override note.
[SEVERITY: H] [US-004] guard wired to `validate`, but image is built in the `release` job; confirm `release needs: [validate]` is the only path or also gate the release job. (Verified: release.yml:64 `needs: [validate]`, tag-push-only trigger → validate gating is sufficient.)
[SEVERITY: H] [US-002] "POSIX sh" AC vs shellcheck shebang auto-detection; shellcheck -S warning without --shell=sh checks per shebang. Resolution: use #!/usr/bin/env bash, drop strict POSIX-sh ambiguity.
[SEVERITY: M] [US-002] packageManager may gain a +sha integrity suffix (corepack use rewrites it); naive @-split false-positives. Normalize suffix; add Case D test.
[SEVERITY: M] [US-003] script path resolution vs temp-fixture CWD; accept fixture-path args or env overrides so tests inject paths deterministically.
[SEVERITY: M] [US-004] existing shellcheck glob scripts/*.sh already covers the new script; do not add a redundant shellcheck step — only the drift-check invocation.
[SEVERITY: M] [US-001] hadolint "same warning count" escape hatch is unverifiable in CI; require boot-lint hadolint exit 0.
[SEVERITY: L] [US-003] distinguish "pin line absent" from "pin line present but @latest" — add a case.
[SEVERITY: L] [*] no CHANGELOG.md [Unreleased] entry; git.md requires one for user-visible change.
```

## Critic B — User lens

```
[SEVERITY: H] [US-001] [PROTECTED-PATH] .devcontainer/Dockerfile protected (line 43); add override note explaining hardening-not-deletion.
[SEVERITY: H] [US-004] CI shellcheck sweep (ci-harness.yml:113) picks up the new script; a shellcheck violation fails boot-lint before the guard step. AC must require passing the CI sweep, not just a standalone invocation.
[SEVERITY: M] [US-002] POSIX-sh requirement vs `bash scripts/check-pnpm-pin.sh` invocation inconsistent; align shebang + invocation, or shellcheck --shell=sh.
[SEVERITY: M] [US-003] test needs two coordinated fixtures (Dockerfile + package.json) in the temp dir; "mirror harness-config.test.ts" (single-file) under-specifies. Require both fixtures + arg injection.
[SEVERITY: M] [US-002] path-resolution strategy ($0-relative vs repo-root) unspecified; pin one (dirname-based) and test from a non-root CWD.
[SEVERITY: M] [*] document the human fix workflow when pnpm is legitimately bumped; rely on FR-3 message; specify exact message format.
[SEVERITY: M] [US-003] add Case D: packageManager with +sha512 suffix → exit 0.
[SEVERITY: L] [US-001] tighten grep AC to grep -c / exact replacement.
[SEVERITY: L] [US-004] specify step ordering (after Hadolint).
[SEVERITY: L] [*] persona "harness maintainer" vs single-developer USER.md framing; use "harness developer".
```

## Synthesis

- **High-severity findings**: 1 distinct (protected-path on `.devcontainer/Dockerfile`, flagged by both critics) + the US-004 release-gating and US-002 shell-compat concerns (both resolved by grounding, not blockers).
- **Medium-severity findings**: 5 (sha-suffix normalization, CWD/fixture path injection, shellcheck-glob redundancy, exact message format, hadolint AC) — all folded into the revised stories.
- **Low-severity findings**: 4 (grep -c, @latest-vs-missing case, step ordering, persona) — all applied.
- **Recommendation**: PROCEED. The protected-path finding is mitigated by the explicit `## Protected-path override note` (additive hardening, not deletion). All actionable M/L findings were incorporated into prd.md before any GitHub-side state was created.
