# PRD — t3-npx-silent-install

## 1. Introduction / Overview

A triage of `npx t3` (the `t3` CLI from https://github.com/pingdotgg/t3code, package `t3@0.0.22`) reproduced a fully silent exit 1 on Linux x64 (Node 22.22.2): both stdout and stderr empty, no log surfaced. Root cause: `node-pty@1.1.0` ships no Linux prebuilds, so its install hook falls through to `node-gyp rebuild`, which fails on systems without `make` / build-essential. `npx` propagates the non-zero exit but suppresses install-script stderr, leaving the user with no signal.

A polished bug report has been filed upstream at https://github.com/pingdotgg/t3code/issues/2621 with reproduction, smoking-gun log excerpt, and a one-line recommended fix (move `node-pty` to `optionalDependencies`).

This PRD captures the **harness deliverable** for that investigation: durable knowledge so the next agent who hits this pattern (silent npx exit on a CLI with native deps) doesn't re-derive the diagnostic recipe. It does NOT propose any change to t3code itself; that is upstream's call.

## 2. Goals

- Preserve the investigation as a topic memory note linkable from future sessions.
- Generalize the diagnostic into a reusable troubleshooting recipe — t3code is the example, not the focus.
- Add a one-line lesson to long-term memory so the qualify/improve loop captures the pattern.
- Stay strictly inside the orchestrator's lane: documentation only, no application code, no fork/PR against the third-party repo.

## 3. User Stories

### US-001: Capture the investigation as a topic memory note

**Description:** As an orchestrator agent picking up this thread later, I want a single source-of-truth note documenting the t3code triage so I don't re-derive the reproduction or root cause from npm logs.

**Acceptance Criteria:**

- [ ] File exists at `memory/t3-npx-silent-install.md`.
- [ ] Note contains the verbatim reproduction command (`npx --yes -p t3@0.0.22 t3 --help`) with observed exit code and zero-byte stdout/stderr counts.
- [ ] Note contains the verbatim smoking-gun excerpt from `~/.npm/_logs/*-debug-0.log` showing `info run node-pty@1.1.0 install { code: 1, signal: null }` and `gyp ERR! stack Error: not found: make`.
- [ ] Note links to the upstream issue: `https://github.com/pingdotgg/t3code/issues/2621`.
- [ ] Note documents the proof that the CLI itself is reachable (`npm install --ignore-scripts t3@0.0.22` + direct `node node_modules/t3/dist/bin.mjs --help`).
- [ ] Note follows the topic-note conventions in `context/rules/memory.md` (placed under `memory/<topic>.md`, not under a daily-log subdir).
- [ ] Lint passes (`pnpm -r run lint` if applicable; markdown files are not blocked).

### US-002: Add a generalized "silent npx install failure" troubleshooting recipe

**Description:** As a future agent or contributor staring at a silently-failing `npx <pkg>`, I want a documented diagnostic recipe so I can identify and work around the failure in minutes instead of an hour.

**Acceptance Criteria:**

- [ ] File exists at `docs/troubleshooting/npx-silent-install-failure.md`.
- [ ] Recipe is generic — it covers the **pattern** (silent npx exit, native dep without prebuilds, install-hook stderr suppression), not just the t3code instance. t3code is referenced as the canonical example with a link to the upstream issue.
- [ ] Recipe documents: (a) symptoms (exit 1 + zero-byte output); (b) where to look (the npm debug log, default `~/.npm/_logs/`; scan latest `*-debug-0.log` for `install { code: 1`); (c) how to confirm (install with `--ignore-scripts` then run the bin directly); (d) common causes (no matching prebuild for platform/arch, missing build toolchain); (e) workarounds (install build tools, use `--ignore-scripts` if the failing dep is non-essential, file an upstream issue requesting `optionalDependencies`).
- [ ] `docs/troubleshooting/README.md` exists (create it; one-line directory-intent + bullet list of recipes, per `context/rules/directory-readme.md`). `docs/troubleshooting/README.md` links the new recipe.
- [ ] If `docs/troubleshooting/` is a genuinely new top-level docs directory at commit time (`git ls-files docs/troubleshooting/ | head -1` returns empty pre-commit), a one-line annotation is added to `docs/architecture/container-runtime.md` under the `## Repo Layout {#repo-layout}` heading per `context/rules/repo-layout-source.md`. Skip this AC only if the directory already exists in git.
- [ ] Pre-commit hook exits 0 when committing only the US-002 files (verifies markdown is acceptable to whatever lint config is active).

### US-003: Append a one-line lesson to `memory/MEMORY.md`

**Description:** As the orchestrator running the qualify/improve loop after this session, I want the takeaway distilled to a single bullet under `## Lessons Learned` so future sessions auto-load it without reading the full topic note.

**Acceptance Criteria:**

- [ ] **Idempotency precheck:** before appending, run `grep -nE 'npm/_logs|npx swallow|silent.*npx' memory/MEMORY.md`. If a semantically equivalent bullet already exists, mark this AC satisfied without appending and document the existing line number in the commit message.
- [ ] If precheck returns no matches, append exactly one bullet to `memory/MEMORY.md` under the existing `## Lessons Learned` heading.
- [ ] Bullet is one line, dated `(YYYY-MM-DD)`, captures the actionable lesson. Suggested wording: `When` ``npx <pkg>`` `exits silently with code 1, scan the npm debug log (default` `~/.npm/_logs/`,`latest` `*-debug-0.log`) `for` `install { code: 1` `— npm/npx swallow install-script stderr.`
- [ ] Bullet links to the topic note (`memory/t3-npx-silent-install.md`) and the upstream issue.
- [ ] No duplication with `context/IDENTITY.md` principles (per `context/rules/memory.md` boundary).
- [ ] No edits to existing entries — append-only.

### US-004: Add a CHANGELOG entry under `[Unreleased]`

**Description:** As a maintainer reviewing the next release, I want the new troubleshooting doc surfaced in the changelog per `context/rules/git.md`'s changelog policy.

**Prerequisite:** the harness tracking issue must exist before this story is implemented. Retrieve the issue number via:
1. `tasks/t3-npx-silent-install/prd.json` — `branchName` field encodes `<prefix>/<N>-<slug>` (preferred — produced by `/ralph` at stage 6, always present at AC-check time).
2. `gh issue list --search t3-npx-silent-install --state all --limit 5` (fallback).

**Acceptance Criteria:**

- [ ] One bullet appended under `## [Unreleased] → ### Added` in `CHANGELOG.md`. Create the `### Added` subheading only if it does not already exist under `[Unreleased]`.
- [ ] Wording: imperative, mentions the new troubleshooting doc, links the harness tracking issue (the one `/ship-spec` opens for this PRD) using the format `([#N](https://github.com/ryaneggz/open-harness/pull/N))` per `context/rules/git.md` § Changelog. Issue link, not PR link, per the rule's "link PR or issue" allowance.
- [ ] No edits to versioned (`## [X.Y.Z]`) sections.
- [ ] No placeholder issue number — if neither retrieval mechanism above produces a number, the implementer MUST halt this story and surface the blocker rather than guess.

## 4. Functional Requirements

- **FR-1:** `memory/t3-npx-silent-install.md` MUST contain reproduction, smoking gun, root cause, upstream issue link, and the `--ignore-scripts` proof — in that order, as level-2 (`##`) sections.
- **FR-2:** `docs/troubleshooting/npx-silent-install-failure.md` MUST follow the canonical "Symptoms / Diagnose / Confirm / Causes / Workarounds / Example" structure (six level-2 sections).
- **FR-3:** The new troubleshooting doc MUST cite the t3code investigation only as an example — the recipe must remain valid even if every t3code-specific reference were elided.
- **FR-4:** `memory/MEMORY.md` MUST gain exactly one new bullet under `## Lessons Learned`.
- **FR-5:** `CHANGELOG.md` MUST gain exactly one new bullet under the existing `## [Unreleased]` → `### Added` section. Create the `### Added` subheading only if it does not already exist under `[Unreleased]`.
- **FR-6:** Allowed file targets for stories US-001 through US-004:
  - `memory/t3-npx-silent-install.md` (US-001, create)
  - `docs/troubleshooting/npx-silent-install-failure.md` (US-002, create)
  - `docs/troubleshooting/README.md` (US-002, create — required per US-002 AC; one-line directory-intent + bullet list of recipes)
  - `docs/architecture/container-runtime.md` (US-002, edit — only when `docs/troubleshooting/` is genuinely new in git, per the conditional AC; one-line annotation under `## Repo Layout {#repo-layout}`)
  - `memory/MEMORY.md` (US-003, append-only)
  - `CHANGELOG.md` (US-004, append under `[Unreleased]` only)
  No other file may be modified by this PRD's stories. Touching any path on `.claude/protected-paths.txt` is explicitly forbidden.

## 5. Non-Goals (Out of Scope)

- **Forking, modifying, or sending a PR against `pingdotgg/t3code`.** The upstream issue is filed; the maintainers own the fix.
- **Any code path that imports `node-pty`** or otherwise touches t3code internals from this harness.
- **Adding a workaround wrapper or installer script** for users who hit this bug — the upstream fix is one line; better to wait.
- **Generalizing the lesson into a `context/IDENTITY.md` principle.** Topic memory is the right tier per `context/rules/memory.md`'s boundary table; promotion to IDENTITY happens only after the lesson generalizes across multiple unrelated runs.
- **Touching any `.claude/protected-paths.txt` entry.** None of the proposed paths overlap; cross-check is informational only.
- **Modifying `context/rules/`, `.claude/skills/`, `.claude/agents/`, or any auto-loaded harness file.** This task is documentation-only.

## 6. Design Considerations

- The troubleshooting doc should be skim-friendly: each section opens with a one-line answer, then expands. A future agent under time pressure should be able to grep for `Symptoms` / `Diagnose` and get to the action in seconds.
- The topic memory note should be terse, factual, and link-heavy — it's a reference, not a story. Avoid narrative or first-person voice; copy the pattern of `memory/x-campaign.md` if it exists as a stylistic anchor.

## 7. Technical Considerations

- **Memory layout** (`context/rules/memory.md`): topic notes live at `memory/<topic>.md` (flat), not under daily-log subdirs. `memory/MEMORY.md` is the long-term tier; daily logs go under `memory/YYYY-MM-DD/log.md`. This PRD touches the topic + long-term tiers only.
- **Directory README** (`context/rules/directory-readme.md`): `docs/troubleshooting/` is a new directory if it doesn't exist; per the rule, it needs a `README.md` if its purpose isn't self-evident from its name. "Troubleshooting" is self-evident, but a one-line README listing the recipes still helps navigability — recommended but not required by AC.
- **Repo layout source** (`context/rules/repo-layout-source.md`): if `docs/troubleshooting/` is a new top-level (under `docs/`) directory, a one-line annotation should be added to `docs/architecture/container-runtime.md#repo-layout`. Treat this as a US-002 acceptance criterion only if the directory is genuinely new.
- **Pre-commit hook** (`/ship-spec` stage 8): runs lint + tests before commit. Markdown-only changes should pass cleanly; if the hook gates on something unexpected, fix the underlying issue rather than `--no-verify`.

## 8. Success Metrics

- A future orchestrator session encountering a silent `npx <pkg>` failure reaches root cause in **under 5 minutes** by following the new recipe (vs the ~45 minutes this triage took).
- The topic note is referenced (linked or read) at least once in the next 30 days, indicating discoverability works.
- No follow-up "where did we document this?" question appears in subsequent sessions about t3code or similar native-dep CLIs.

## 9. Open Questions

- Should the troubleshooting doc cross-link from `CLAUDE.md`'s "Session start" or from a session-bootloader rule? Deferred — propose only after the doc has been used at least once and the link target is justified by usage, not speculation.
- Is `docs/troubleshooting/` the right home, or should this live under `docs/operations/`? **Decision: troubleshooting/**, because it's reactive (you read it when something is wrong), not proactive (operating procedure). Revisit only if the directory grows beyond ~5 docs and naturally splits.
- Should `memory/MEMORY.md` get a date-grouping convention? Out of scope for this PRD; raise as a separate issue if the file gets unwieldy.

---

**Provenance:** This PRD was generated from the approved plan at `.claude/plans/address-resolution-shimmering-river.md`, scaffolded via `/ship-spec` (stage 2), and reviewed by two adversarial critics (stage 3) before any GitHub-side state was created.

---

## Appendix A — Verbatim smoking-gun excerpt (for US-001)

The following lines were captured during the original triage (host: WSL2 / Linux x64, Node 22.22.2, `npx --yes -p t3@0.0.22 t3 --help`) from `~/.npm/_logs/2026-05-09T17_18_53_456Z-debug-0.log`. Use these verbatim in `memory/t3-npx-silent-install.md` so the executor does not need access to the original host log.

```
1401 info run msgpackr-extract@3.0.3 install node_modules/msgpackr-extract node-gyp-build-optional-packages
1402 info run node-pty@1.1.0 install node_modules/node-pty node scripts/prebuild.js || node-gyp rebuild
1403 info run msgpackr-extract@3.0.3 install { code: 0, signal: null }
1404 info run node-pty@1.1.0 install { code: 1, signal: null }
1411 verbose cwd /tmp/t3-clean
1412 verbose os Linux 6.6.114.1-microsoft-standard-WSL2
1413 verbose node v22.22.2
1414 verbose npm  v10.9.7
1415 verbose exit 1
1416 verbose code 1
```

And from a separate `npm install` run:

```
npm error gyp ERR! build error
npm error gyp ERR! stack Error: not found: make
npm error gyp ERR! stack at getNotFoundError (/usr/lib/node_modules/npm/node_modules/which/lib/index.js:16:17)
npm error gyp ERR! stack at which (/usr/lib/node_modules/npm/node_modules/which/lib/index.js:77:9)
npm error gyp ERR! cwd /tmp/t3-extract/package/node_modules/node-pty
npm error gyp ERR! node -v v22.22.2
npm error gyp ERR! node-gyp -v v11.5.0
```

And the prebuilds-list confirmation:

```
$ ls node_modules/node-pty/prebuilds/
darwin-arm64  darwin-x64  win32-arm64  win32-x64
# no linux-* directory
```

---

## Appendix B — Critic synthesis (stage 4 PROCEED)

Two adversarial critics reviewed this PRD at stage 3. Findings:

- **High**: 0
- **Medium**: 6 raw findings (4 from Critic A — Implementer lens; 2 from Critic B — User lens; the FR-6 / repo-layout-source contradiction was raised by both and counts as one root issue).
- **Low**: 5

Five Mediums were mitigated in this PRD before stage 5: FR-6 now lists `docs/architecture/container-runtime.md` with a conditional clause; US-002 has a concrete README + repo-layout AC; US-003 has an idempotency precheck; US-004 has a prerequisite block specifying issue-number retrieval; verbatim smoking-gun lines are embedded in Appendix A.

Five Lows are acknowledged as residual risk: hardcoded npm log path generalized in lesson wording but full path-agnosticism not enforced; no rollback story for append-only files (out of scope per Non-Goals); lint criterion for markdown remains pre-commit-hook-driven; relative-link tooling deferred to manual review.

Full critique transcripts: `tasks/t3-npx-silent-install/critique.md`. Recommendation: **PROCEED** to stage 5.
