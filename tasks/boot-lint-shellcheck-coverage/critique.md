# Critique — boot-lint-shellcheck-coverage

Generated 2026-06-13; reviews `prd.md` post-/prd, pre-/ralph. Two rounds: an
initial review surfaced one SEVERITY:H finding (mitigated by a PRD revision),
then a re-review confirmed PROCEED.

## Round 1 — Critic A (Implementer lens)

Top finding (H): the boot-lint glob extension is cosmetic unless the workflow
`paths:` triggers also cover the new directories — `workspace/**` is absent from
`on.push.paths`/`on.pull_request.paths`, so workspace-only commits never fire the
job. Plus M findings: SC2088 fix was an ambiguous either/or; probe single-line
grep fragility + untested SKIPPED path; pre-existing `next-dev-prod` REGRESSION
should be flagged out-of-scope. (Note: `scripts/**` is already in the path
filters — the H finding is narrower than "scripts and workspace".)

## Round 1 — Critic B (User lens)

Independently raised the same H path-filter finding. M/L: mandate the
lint-disable approach for SC2088 (preserve user-facing `~/.openharness`, don't
substitute `$HOME`); declare shellcheck version-pin a Non-Goal; add a rollback
note; declare the `install/cloudflared-tunnel.sh` file-count fragility unguarded.

## Resolution (PRD revision)

- US-002: added an explicit AC to add `workspace/**` to both path-filter arrays;
  clarified `scripts/**`/`.devcontainer/**`/`install/**` are already present.
- US-001: mandated the scoped `# shellcheck disable=SC2088` comment; prohibited
  the `$HOME` substitution (preserves displayed message).
- US-003: documented the single-line assumption, added an unanchored-grep AC, a
  no-false-PASS-on-zero-match AC, and a real SKIPPED-path AC.
- US-004: flagged the pre-existing `next-dev-prod` REGRESSION as out-of-scope.
- Non-Goals: version-pin and file-count guarding declared out of scope; rollback
  and recursive-vs-flat-glob notes added to Technical Considerations.

## Round 2 — Re-review

Both critics returned **VERDICT: no remaining unmitigated SEVERITY:H findings.**
Residual findings are M/L papercuts; the two actionable ones (probe `^`-anchor
trap / false-PASS-on-zero-match, and recursive-vs-flat glob confusion) were
folded into the PRD.

## Synthesis

- **High-severity findings**: 0 remaining (1 raised, mitigated at AC level)
- **Medium-severity findings**: residual M papercuts acknowledged + the two
  actionable ones incorporated
- **Recommendation**: PROCEED
