# Critique — release-validate-ci-parity

Generated 2026-06-14; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

```
[SEVERITY: H] [US-002] eval-probes may exit 1 on a cold runner via green→red delta on next-dev-prod.
  → Investigated: run.sh regression fires ONLY when prior==PASS and status∈{non-PASS,non-SKIPPED}
    (run.sh:106). next-dev-prod is committed as REGRESSION (not PASS) in RESULTS.md, so it can
    never trigger. Empirically the eval-probes job is GREEN on the development GH runner
    (run 27486297602, 2026-06-14T02:46). RESOLVED — folded into Technical Considerations.
[SEVERITY: H] [US-001/003] New jobs lack an explicit permissions: block; would inherit repo default
    (possibly contents: write) in release.yml (no workflow-level permissions).
  → MITIGATED: AC now requires `permissions: contents: read` on each new job (matches validate's
    job-level convention + ci-harness's effective workflow-level perm).
[SEVERITY: M] [US-004] [PROTECTED-PATH] git.md is on protected-paths.txt — but this is an EDIT,
    not a deletion; protected-paths gates deletion/deprecation. MITIGATED: AC requires a targeted
    Edit (no whole-file rewrite) on the one sentence; symlink resolves to context/rules/git.md.
[SEVERITY: M] [US-001] AC's `python3 -c "import yaml"` assumes PyYAML — NOT installed in the sandbox
    (verified: no PyYAML, no js-yaml, no `yaml` npm, no ruby). MITIGATED: AC switched to deterministic
    structural grep assertions + GitHub's authoritative parse-on-push as backstop.
[SEVERITY: M] [US-002] eval-probes writes RESULTS.md to ephemeral runner, no commit (same as
    ci-harness). Confirmed: no commit step intended. Noted in Technical Considerations.
[SEVERITY: M] [US-003] Confirm `needs:` array enforces all-three-PASS. GitHub `needs:` semantics do.
    AC requires the literal array [validate, boot-lint, eval-probes].
[SEVERITY: L] [US-001] eval-ci-gate probe guards ci-harness.yml only — release.yml copy is unguarded,
    a future drift vector. Deferred to Open Questions (adding a probe is a PRD non-goal).
[SEVERITY: L] [US-001] shellcheck workspace/*.sh — verified clean baseline (exit 0). No block.
```

## Critic B — User lens

```
[SEVERITY: H] [US-002] eval-probes hard gate could block a release for a reason unrelated to release
    content if a probe flips red on the runner. → Same resolution as Critic A's H: empirically green
    on GH runner; delta gate keyed on committed RESULTS.md; REGRESSION-prior probes cannot block.
[SEVERITY: H] [US-002] first-run-of-a-new-probe behavior is non-obvious. → Documented in Technical
    Considerations (new probe committed as "(not run)"/REGRESSION cannot block; a probe committed as
    PASS that is actually red on a runner WOULD block — validate new probes in ci-harness first).
[SEVERITY: M] [US-004] [PROTECTED-PATH] git.md edit — same mitigation as Critic A (targeted Edit).
[SEVERITY: M] [US-001/002] permissions least-privilege — same mitigation (contents: read per job).
[SEVERITY: M] [US-003] No escape hatch for an infra-flaky gate. MITIGATED: noted that a failed gate is
    re-runnable via GitHub Actions "Re-run failed jobs" (no tag delete needed); release.yml has no
    workflow_dispatch by design.
[SEVERITY: L] [US-004] CHANGELOG must link #111 — issue #111 confirmed to exist (created this run).
[SEVERITY: L] [*] "Open Questions: None" was overconfident — replaced with the documented follow-ups.
```

## Synthesis
- **High-severity findings**: 4 (2 distinct themes: eval-probes-as-hard-gate ×2, permissions ×2) — ALL mitigated at AC level (eval-probes empirically green + delta logic proven; permissions block added). None un-mitigable.
- **Medium-severity findings**: 6 — all folded into AC or Technical Considerations.
- **Low-severity findings**: 4 — resolved or deferred to Open Questions.
- **Protected-path check**: git.md flagged, but the change is an edit (not a deletion) → not a hard-gate violation; targeted-Edit constraint added.
- **Recommendation**: PROCEED (PRD revised to incorporate all mitigations).
