# Critique — t3-npx-silent-install

Generated 2026-05-09; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

```
CRITIC_A — IMPLEMENTER LENS

[SEVERITY: M] [STORY: US-002] FR-6 lists `docs/troubleshooting/README.md` as an optional fifth target, but Section 7 says `docs/troubleshooting/` is a new subdirectory and `context/rules/repo-layout-source.md` requires a one-line annotation be added to `docs/architecture/container-runtime.md#repo-layout` whenever a new directory appears under `docs/`. That sixth file (`docs/architecture/container-runtime.md`) is not in the FR-6 allowlist and is not named in any AC. An implementer who follows FR-6 literally will skip the required annotation, violating `repo-layout-source.md`. | EVIDENCE: FR-6, Section 7, container-runtime.md has no existing `troubleshooting` entry | RECOMMENDATION: Add `docs/architecture/container-runtime.md` to the FR-6 allowlist and add a concrete AC to US-002.

[SEVERITY: M] [STORY: US-002] The AC requires the troubleshooting doc to be "reachable from docs/" with branch logic that breaks: there is no `docs/README.md` in the repository, and `docs/troubleshooting/` does not yet exist. An implementer checking for a pre-existing `docs/README.md` will not find one, and may either create it (a seventh uncatalogued file) or silently drop the linking requirement. | EVIDENCE: `ls /home/sandbox/harness/docs/` shows no README.md; FR-6 allowlist; US-002 AC third bullet | RECOMMENDATION: Resolve the branch explicitly: when neither `docs/README.md` nor `docs/troubleshooting/README.md` exists, the implementer MUST create `docs/troubleshooting/README.md` and that file MUST be in the FR-6 allowlist.

[SEVERITY: M] [STORY: US-004] The CHANGELOG AC says "links the harness tracking issue (the one /ship-spec opens for this PRD)" but the issue number is not known at PRD-write time. An implementer running stories serially may not know the issue number when writing the CHANGELOG entry, leaving a placeholder or a broken link. | EVIDENCE: US-004 AC second bullet; plan file shows issue creation is stage 5, after PRD is written | RECOMMENDATION: Add a concrete note: the issue number is available in `tasks/t3-npx-silent-install/prd.json` after stage 6, or via `gh issue list --search t3-npx-silent-install`; retrieve before writing the CHANGELOG bullet.

[SEVERITY: M] [STORY: US-003] AC prescribes exact bullet wording but also requires no duplication. There is no AC or pre-check step that verifies `MEMORY.md` doesn't already contain a semantically equivalent bullet. | EVIDENCE: `/home/sandbox/harness/memory/MEMORY.md` lines 1-8; no idempotency guard in AC | RECOMMENDATION: Add a pre-condition check: grep MEMORY.md for `npm/_logs` or `npx swallow`; if a matching bullet exists, skip and mark AC satisfied.

[SEVERITY: L] [STORY: US-001] AC requires "verbatim smoking-gun excerpt" from `~/.npm/_logs/*-debug-0.log`. That log is ephemeral — host-local. If the Ralph executor runs in a fresh sandbox without the original log, it cannot produce a verbatim excerpt. | EVIDENCE: US-001 AC third bullet; the log file path is host-local; no AC says "use the excerpt captured in the plan" | RECOMMENDATION: Embed the verbatim smoking-gun lines directly in the PRD (as appendix) so the executor has the text without needing the original host log.

[SEVERITY: L] [STORY: US-002] AC says "Markdown lints cleanly; relative links resolve" but no defined lint command or anchor-check tool is called out. | EVIDENCE: US-002 AC last bullet; US-001 AC last bullet | RECOMMENDATION: Specify which tool validates relative links, or replace relative cross-tree links with absolute repo-root paths and note they are for human readers.
```

## Critic B — User lens

```
CRITIC_B — USER LENS
[SEVERITY: M] [STORY: US-002] The `docs/troubleshooting/` directory is entirely new but FR-6 does not list `docs/architecture/container-runtime.md` as a permitted touch. Section 7 says the annotation "should be" done; FR-6 names only five allowed targets — implementer will either violate FR-6 or violate the repo-layout rule. | EVIDENCE: prd.md §4 FR-6 vs §7 Technical Considerations; `context/rules/repo-layout-source.md` | RECOMMENDATION: Add `docs/architecture/container-runtime.md` to FR-6 with a conditional clause, OR promote the "should" in §7 to a mandatory AC in US-002.

[SEVERITY: M] [STORY: US-002] PRD §7 says a README is "recommended but not required" but `context/rules/directory-readme.md` mandates one when contents are "otherwise gitignored." Without a gitignore check, this edge is invisible to the implementer. | EVIDENCE: prd.md §7; `context/rules/directory-readme.md` | RECOMMENDATION: Add an explicit AC: check `.gitignore` for patterns matching `docs/troubleshooting/`; if matched, a `README.md` is required.

[SEVERITY: M] [STORY: US-004] References "the harness tracking issue" but if implementer runs US-004 before the issue exists, no documented fallback. | EVIDENCE: prd.md §3 US-004 AC bullet 2; §9 has no open question about issue ordering | RECOMMENDATION: Add explicit prerequisite: GitHub issue must exist before US-004 is implemented; record the issue URL in US-001 as a prerequisite link.

[SEVERITY: L] [STORY: US-003] Prescribed lesson text hardcodes `~/.npm/_logs/*-debug-0.log`. On systems using `npm_config_cache` overrides or different log-name formats, the path is wrong. | EVIDENCE: prd.md §3 US-003 AC bullet 2; ICP persona implies varied npm configs | RECOMMENDATION: Replace hardcoded path with "scan the npm debug log (default: `~/.npm/_logs/`)".

[SEVERITY: L] [STORY: *] No rollback story. For append-only files, no documented procedure to revert if upstream t3code ships a fix that invalidates the advice. Stale troubleshooting is an active hazard. | EVIDENCE: prd.md §5; `context/rules/memory.md` append-only mandate | RECOMMENDATION: Add Non-Goal acknowledging lesson correction is out of scope; note that if upstream resolves, open follow-up to annotate as resolved rather than delete.

[SEVERITY: L] [STORY: US-001] AC bullet 7 gates on `pnpm -r run lint` but topic note is plain markdown with no lint coverage. Vacuously true. If hook config changes to include markdownlint, criterion silently becomes load-bearing. | EVIDENCE: prd.md §3 US-001 AC bullet 7; §7 | RECOMMENDATION: Replace with concrete verifiable criterion: "Pre-commit hook exits 0 on commit of this file alone".
```

## Synthesis

- **High-severity findings**: 0
- **Medium-severity findings**: 6 (4 from A, 2 from B; FR-6/repo-layout-source contradiction flagged by both — counts as 1 root issue)
- **Low-severity findings**: 5
- **Recommendation**: PROCEED with PRD revision

### Mitigations applied to prd.md before stage 5

Five Mediums are load-bearing enough to warrant pre-stage-5 PRD revision:

1. **FR-6 / repo-layout-source contradiction** (A & B): added `docs/architecture/container-runtime.md` to FR-6 conditional allowlist; added US-002 AC requiring the annotation if the directory is new.
2. **docs/README.md branch logic** (A): resolved — implementer MUST create `docs/troubleshooting/README.md` if absent; added to FR-6.
3. **US-004 issue-number ordering** (A & B): added prerequisite note to US-004 with concrete retrieval mechanism.
4. **US-003 idempotency** (A): added pre-condition grep step.
5. **Verbatim smoking-gun appendix** (A, low but cheap): embedded log lines as appendix in PRD so executor doesn't need host log.

### Acknowledged but not mitigated (residual risk accepted)

- **L: US-003 hardcoded npm log path** — the lesson wording is generalized in revision; full path-agnostic phrasing is still the prescribed text. Risk: low, lesson still actionable on non-default configs because the path is widely-known default.
- **L: rollback story** — out of scope for this PRD per its own Non-Goals. Stale-recipe hazard exists for any troubleshooting doc; mitigated by linking the upstream issue (state visible there).
- **L: lint criterion** — accepted as-is; markdown-only changes do not currently trip the pre-commit hook, and changing the hook config is out of scope.
- **L: relative-link tooling** — accepted as-is; manual review during PR.
