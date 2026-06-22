# Critique — pi-fff-file-search

Generated 2026-06-19; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

```
[SEVERITY: H] [US-001] fff-node transitive dependency is unpinned (wildcard `*`) — pinning pi-fff@0.9.5 does not freeze the native binary. | RECOMMENDATION: record the resolved fff-node version in the doc.
[SEVERITY: H] [US-001/US-002] No runtime Pi-load verification step; the hint ships without confirming the extension registers ffgrep/fffind. | RECOMMENDATION: add a `pi -e npm:@ff-labs/pi-fff@0.9.5` runtime verify step + keep the "when available" guard.
[SEVERITY: M] [US-001] peerDependencies (@sinclair/typebox, @earendil-works/pi-tui, @earendil-works/pi-coding-agent) unverified. | RECOMMENDATION: check Pi startup for unmet-peer-dep warnings.
[SEVERITY: M] [US-003] CHANGELOG bullet must follow the issue-reference convention (([#NNN](.../issues/NNN))). | RECOMMENDATION: use the ship-spec issue number.
[SEVERITY: M] [US-001] Package published recently; high churn; no integrity record. | RECOMMENDATION: record resolution date + resolved fff-node version in the doc.
[SEVERITY: M] [US-002] Hint has no size bound; APPEND_SYSTEM.md is appended every turn. | RECOMMENDATION: cap the hint at one short section.
[SEVERITY: L] [US-003] sidebar_position unspecified. | RECOMMENDATION: set an explicit value.
[SEVERITY: L] [US-001] Insertion index within npm pins underspecified (toEqual is order-sensitive). | RECOMMENDATION: state exact position.
[SEVERITY: L] [*] Wiki NOT-APPLICABLE underweights the 3rd-time-recurrence signal. | RECOMMENDATION: at least note a follow-on meta entry.
```

## Critic B — User lens

```
[SEVERITY: H] [US-002] Prompt hint is a soft behavioral override that contradicts Non-Goal "No tool override by default" (which only excluded PI_FFF_MODE=override). | RECOMMENDATION: resolve the contradiction — reword the Non-Goal (override MODE vs soft preference) + document disable, or drop the hint.
[SEVERITY: M] [US-001/*] @-mention autocomplete cold-start: empty frecency index on a fresh sandbox may degrade autocomplete with no diagnostic. | RECOMMENDATION: add a troubleshooting row + note index warms over use.
[SEVERITY: M] [US-001] Native binaries pulled at Pi startup; network-restricted or libc (musl vs gnu) mismatch → silent failure. | RECOMMENDATION: add a troubleshooting row for native-binding failure.
[SEVERITY: M] [US-003] Wiki NOT-APPLICABLE precedent does not hold: autoresearch/dynamic-workflows are operator-invoked; fff is always-on and agent-facing (the hint changes agent default behavior). Wiki is agent-readable; docs/ is human-only. | RECOMMENDATION: add a small wiki entry.
[SEVERITY: M] [US-003] No rollback/disable procedure documented. | RECOMMENDATION: add a Disable/Remove section to the doc.
[SEVERITY: L] [*] Verify 0.9.5 is still `latest` dist-tag at implementation time. | RECOMMENDATION: add a dist-tag check.
[SEVERITY: L] [US-002] "faster/more token-efficient" claim uncited for this repo's scale. | RECOMMENDATION: attribute the claim to upstream.
```

## Synthesis

- **High-severity findings**: 3 (A: transitive-dep wildcard, A: no runtime verify, B: Non-Goal contradiction)
- **Medium-severity findings**: 7
- **Recommendation**: REVISE-PRD → PROCEED. All three H findings are mitigable at the AC level (no destructive ops, no protected-path violations, no GitHub state yet). Resolution applied in prd.md v1.1:
  1. **Transitive-dep wildcard**: this is the existing accepted convention for all 8 pinned Pi packages (none freeze transitive deps); mitigated by recording the resolved `@ff-labs/fff-node` version + resolution date in the doc.
  2. **Runtime verification**: added a required `pi -e` runtime verify step; the hint carries a "when those tools are available" guard so it is harmless if the extension fails to register.
  3. **Non-Goal contradiction**: reworded the Non-Goal to scope it to the runtime `override` MODE (which *replaces* native grep/find/multi_grep tools) — distinct from a soft, conditional preference hint that *keeps* native tools; added a documented Disable/Remove path.
- **Upgraded scope from critique**: Wiki Alignment raised NOT-APPLICABLE → REQUIRED (`wiki/pi-fff.md`), since two critics independently flagged that fff is always-on and agent-facing, unlike the operator-invoked precedents. Doc gains autocomplete cold-start + native-binding troubleshooting rows and a Disable section. Hint capped at one short section.
