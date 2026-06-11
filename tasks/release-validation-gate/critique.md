# Critique — release-validation-gate

Generated 2026-06-11; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

```
[SEVERITY: H] [US-001] Duplicate Node/pnpm setup: publish job already has Setup Node + Install pnpm (release.yml:43-49); validate job adds them too. Jobs don't share runner state, so the publish job genuinely needs its own setup — "no publish-side steps removed" is correct. Clarify in AC. RECO: state publish job keeps its own setup; the duplication is expected (cross-job state is not shared).
[SEVERITY: H] [US-001] pnpm cache path omitted from AC (only key given). ci-harness.yml uses path: ~/.local/share/pnpm/store/v3. RECO: add explicit path to AC to avoid silent cache miss.
[SEVERITY: M] [US-001] Permissions move is semantic, not YAML-parse-catchable. If packages: write is dropped from publish job, docker push fails at runtime. RECO: add grep-verifiable AC that publish job carries contents: write + packages: write.
[SEVERITY: M] [US-001] FR-4 "byte-identical" ambiguous + no automated drift detection. RECO: scope FR-4 to step name/uses/run; note future ci-harness.yml changes must be manually mirrored.
[SEVERITY: M] [US-002] context/rules/git.md is a protected path (.claude/rules symlink). Edit (not deletion) is permitted. RECO: edit canonical context/rules/git.md; verify diff context/rules/git.md .claude/rules/git.md exits 0.
[SEVERITY: M] [US-003] CHANGELOG namespace: older entries use mifunedev; PRD uses ryaneggz. RECO: confirm canonical namespace. (RESOLVED: repo is ryaneggz/openharness; all 20 current [Unreleased] links use ryaneggz — PRD URL is correct; historical entries stay.)
[SEVERITY: L] [US-001] YAML-parse AC won't catch a misspelled needs:. RECO: add grep AC for needs:.*validate.
[SEVERITY: L] [US-003] "now validates" is present-tense; existing [Unreleased] entries mix imperative ("Make") and present ("now keys on", "now resumes") — PRD wording is consistent with the present-tense pattern already in use.
[SEVERITY: L] [*] "Open Questions: None" overconfident. test:scripts confirmed in package.json. RECO: replace None with confirmed-deps list.
```

## Critic B — User lens

```
[SEVERITY: H] [US-002] [PROTECTED-PATH] context/rules/git.md == .claude/rules/git.md (protected-paths:50) edited with no override note. Edit is a doc correction, not deletion — permitted. RECO: add explicit override note: corrects an inaccuracy; does not remove or deprecate the file or any procedure it encodes.
[SEVERITY: M] [US-001] :latest rollback on validate failure unaddressed. RECO: Non-Goals should state "no :latest rollback on gate failure" (correct for single-dev).
[SEVERITY: M] [US-001] Gate tag-only vs release/* branch pushes unaddressed. RECO: Non-Goals: "gate is tag-only — no validate on release/* branch pushes".
[SEVERITY: M] [US-001] Step divergence asserted, not mechanically enforced. RECO: a diff check (or accept manual-mirror note for single-dev).
[SEVERITY: M] [*] Personas "release engineer"/"contributor" drift from single-developer USER.md. RECO: reframe as "the maintainer".
[SEVERITY: L] [US-001] cache path in description but not AC. RECO: add to AC.
[SEVERITY: L] [US-003] issue #24 unverified in PRD. (RESOLVED: #24 is the tracking issue, filed this run.)
```

## Synthesis

- **High-severity findings**: 3 (A: duplicate setup, cache-path AC gap; B: protected-path override note) — all AC-level mitigatable; none require rethinking the approach.
- **Medium-severity findings**: 6 — permissions grep AC, FR-4 scoping, namespace (resolved), :latest rollback Non-Goal, release/* tag-only Non-Goal, persona reframe.
- **Resolution**: REVISE-PRD — incorporate all mitigations into the ACs/Non-Goals (override note for the git.md edit, explicit cache `path:`, grep-verifiable permissions + `needs:` checks, persona reframe to maintainer, `:latest`/tag-only Non-Goals, manual-mirror note). The protected-path finding is a permitted content edit (not a deletion), satisfied by an explicit override note.
- **Recommendation**: PROCEED (after PRD revision incorporating the above).
