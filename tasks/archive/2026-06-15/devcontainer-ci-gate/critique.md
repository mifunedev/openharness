# Critique — devcontainer-ci-gate

Generated 2026-06-11; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

```
[H] US-003 hadolint/hadolint-action@v3.1.0 may not exist / tag is mutable | RESOLVED: tag verified to exist (SHA 54c9adbab1582c2ef04b2016b760714a4bfde3cf); will SHA-pin.
[H] US-001+003 cancel-in-progress:true cancels boot-lint via shared concurrency group | ACCEPTED/DOCUMENTED: inherited behavior identical to the ci job; a new push re-runs boot-lint. Recommendation itself says "no code change required." Documented in Non-Goals.
[H] US-003 shellcheck names only banner.sh; Dockerfile globs install/*.sh → future files unlinted | RESOLVED: lint via globs `.devcontainer/*.sh install/*.sh` (covers entrypoint.sh + banner.sh + any future script).
[M] US-002 local hadolint version may differ from action's bundled binary | RESOLVED: .hadolint.yaml header documents the validated version; rule families DL3008/DL4006/etc are stable across hadolint 2.x.
[M] US-003 "install only if needed" not verifiable; runner image could lack shellcheck | RESOLVED: add an install-if-missing guard (`command -v shellcheck || sudo apt-get install -y shellcheck`).
[M] US-003 boot-lint may show "skipped" / block Node-only PRs if made a required check | DOCUMENTED: Non-Goals notes boot-lint is NOT registered as a required status check by this PR.
[M] US-001 grep AC also matches a comment line | ACK: implementation will not place the literal string in a comment near paths; AC holds.
[L] US-004 verify repo slug ryaneggz/openharness | RESOLVED: confirmed via gh repo view.
[L] US-002 .hadolint.yaml root placement / auto-discovery | NON-ISSUE: no parent .hadolint.yaml exists.
[L] * protected-paths.txt ghost entries (cloudflared-*) | OUT OF SCOPE: pre-existing, untouched by this PR.
```

## Critic B — User lens

```
[H] US-003 cancel-in-progress cancels boot-lint mid-flight; maintainer may merge thinking it passed | ACCEPTED/DOCUMENTED (see Critic A duplicate); standard GitHub behavior, re-runs on new push.
[H] US-001 banner.sh actually lives at .devcontainer/banner.sh (two copies) | DISMISSED — FACTUALLY FALSE: `ls .devcontainer/banner.sh` → No such file. Only install/banner.sh exists (git ls-files); entrypoint.sh:175 sources install/banner.sh. No second copy.
[M] US-002 all 6 current hadolint families suppressed → zero signal on them | DOCUMENTED: Non-Goals lists the suppressed families explicitly.
[M] US-003 shellcheck version not pinned; runner update could re-break baseline | MITIGATED: `-S warning` excludes the info-level SC2015 findings regardless of version; install-if-missing guard added.
[M] * no escape hatch documented | RESOLVED: Non-Goals adds a one-line rollback note (delete the job block + the two path entries).
[M] US-001 devcontainer.json-only change also triggers the ci (Node) job | DOCUMENTED: Non-Goals notes the accepted path-filter overhead.
[L] US-003 prefer SHA pin for hadolint action | RESOLVED: SHA-pinned.
[L] US-004 verify issue number before committing CHANGELOG link | RESOLVED: confirmed #26 OPEN.
```

## Synthesis

- **High-severity findings**: 4 raised — 1 factually false (dismissed with evidence), 1 verified+resolved (SHA pin), 2 are the same concurrency observation (accepted/documented; recommendation says no code change required). **0 genuine un-mitigatable High findings.**
- **Medium-severity findings**: 6 — all resolved via globs, install-if-missing guard, SHA pin, or a documented Non-Goals caveat.
- **Low-severity findings**: resolved or out of scope.
- **Protected-path violations**: none — `.hadolint.yaml` is a new root file; the protected `.devcontainer/entrypoint.sh` / `Dockerfile` are read by the gate, not modified.
- **Recommendation**: **PROCEED** with mitigations folded into prd.md (US-002, US-003, Non-Goals).
