# Council — decision-record route and index guard (#686)

First Mate council per `.oh/prompts/advisor/plan.yml`. Wave 1: `architect`, `pm`, `designer` in
parallel, each given the same brief preamble (ADR-0001 deferral, evidence ledger, six-surface table,
hard constraints, B-state M4 precedent). Wave 2: this synthesis. Wave 3: two adversarial critics.

---

## Wave 1 — analyses

### architect — five binary calls

| # | Call | Verdict | Killing fact |
|---|---|---|---|
| 1 | YAML frontmatter vs plain `Status:`/`Date:`/`Related:` | **plain headers** | Zero YAML delimiters exist in the corpus; nothing parses rfcs frontmatter today. Contrast the wiki, where frontmatter is load-bearing because `.oh/evals/probes/wiki-readme-index.sh:40` actually invokes the canonical extraction. Converting 4 tracked files is churn for zero consumers. |
| 2 | `0000-adr-index.json` vs markdown table | **markdown** | `.oh/docs/rfcs/README.md:23-37` is already the single source of truth. No JSON-for-knowledge precedent exists under `.oh/docs/`; `prd.json` is JSON-for-*work*. A second index is two sources of truth with no writer/reader pair to sync them. |
| 3 | `> Agent Directive:` blockquotes | **reject** | Repo-wide grep returns zero hits. `.oh/manifest.json` `include` has no `docs/**`, so `.oh/docs/` is not vendored downstream and nothing loads it at session start — a normative marker there has no runtime force. The existing carrier of "always do X" is `.oh/context/IDENTITY.md`; the existing greppable local marker is `## Constraints` (`.oh/tasks/first-mate-charter/plan.md:15`). |
| 4 | Subsumes / duplicates | subsumes the hand-rolled task-local decision docs; risks duplicating wiki and MEMORY | **Discriminating test: does the record name a rejected alternative and why it lost?** Yes → decision record. No → wiki fact or MEMORY observation. |
| 5 | Probe | one executable | Modeled on `wiki-readme-index.sh` (git-tracked enumeration, diff) + `first-mate-charter.sh` (accumulator, honest SKIP). |

Architect additionally proposed negative-space assertions banning YAML frontmatter, `*.json` in the
rfcs dir, `> Agent Directive:` lines, and `.github/workflows/rfc-to-adr.yml`. **Overruled in
synthesis — see Ruling 1.**

### pm — cut list, decomposition, honesty

Cut, each mapped to ADR-0001's "concrete evidence" bar with the evidence that *would* have justified
it and the finding that it does not exist: repo-root `docs/adr/`; `0000-adr-index.json` (this *is*
"formal registries"); `> Agent Directive:` (conformance machinery, #532 AC 5/8 disposition
`DEFERRED`); `rfc-to-adr.yml`; YAML frontmatter (no consumer once the JSON index is cut); a new
`NNNN` numbering authority separate from GitHub issue numbers ("IANA-style allocation authority");
any 4th lifecycle stage (`.oh/docs/rfcs/README.md:20` — "three states by design (kept to ≤4
deliberately)").

PM independently verified pain point (d) against `git ls-files .oh/tasks` (35 tracked files) and
`.gitignore:12-13`, and reported: the decision docs **are** git-tracked, force-added per the pattern
`.oh/tasks/slack-admin-command-surface/critique.md:24` itself documents. **Nothing is lost.** The
defect is the same class as the live `rfc-runtime-support.md` index rot — unindexed, not unrouted.

PM's conclusion, adopted verbatim into the PRD: *none of the four pain points is solved by a document
format; all four reduce to a promotion/index step.*

### designer — measured ergonomics

**The cold-start question splits, and the split is the difference between a strong and a weak
argument.** Measured:

| Sub-question | Answered at | Files opened | Delta if adopted |
|---|---|---|---|
| Q1 — what does declaring it in the manifest buy? | `.oh/docs/integrations/slack.md:66-67` | **2** | **0 — unchanged** |
| Q2 — why isn't documenting them enough? | `.oh/tasks/slack-admin-command-surface/critique.md:53` | **7** | **3 (−57%)** |

Three properties of the Q2 path, each verified: natural-language greps in `.oh/docs/` hit **0/4**
(`why.*manifest`, `instead of.*document`, `not.*enough.*doc` all return zero); the terminal hop is
**not linked from `.oh/docs/README.md`**, and `.oh/context/REPO_MAP.md:96` actively routes readers
*away* from `.oh/tasks/`; and the terminal artifact sits on a **weekly GC path**
(`.oh/crons/cleanup-tasks.md`, `schedule: "0 23 * * 0"`, `enabled: true`, no exclusion for
referenced artifacts).

**Corroborating scale — 7 hand-rolled decision records across 4 surfaces**, three of which were not
in the brief's ledger and were found by the designer:

| # | Location | Shape |
|---|---|---|
| 1 | `.oh/tasks/cc-safety-net/decision.md:9-16` | ADOPT/KEEP/RETIRE/DOCUMENT GAP verdict table + `## Accepted risk` |
| 2 | `.oh/tasks/cc-safety-net/install-decision.md` | provider × mechanism decision table |
| 3 | `.oh/tasks/slack-admin-command-surface/critique.md:51-64` | operator ruling reversing a shipped approach |
| 4 | `.oh/tasks/first-mate-charter/plan.md:8` | *"the lighter alternative … was rejected because…"* |
| 5 | `.oh/docs/integrations/debugmcp.md:258-278` | `## Maintainer Decision Gate`, 3-option table, `**Decision (2026-06-23).**` |
| 6 | `.oh/docs/open-core.md:39-45` | `## Why not the alternatives` (AGPL/SSPL/BSL, Apache+dual) |
| 7 | `CHANGELOG.md:642` | an ADR compressed into a changelog line |

**Two independent bugs found, both verified by the orchestrator:**

- `.oh/evals/probes/slack-admin-command-surface.sh:12` hard-codes
  `$ROOT/.oh/tasks/slack-admin-command-surface/root-package-audit.md` and asserts three literals
  against it. The weekly cleanup cron relocates that path into `.oh/tasks/archive/$TODAY/`, which
  **turns a tier-A probe red**. Latent today, independent of #686 — and direct evidence that
  decision-grade content currently lives on a garbage-collection path.
- `.oh/agents/critic.md:32` references `.claude/rules/`, which does not exist.

**Read-path baseline:** `git grep -n 'docs/rfcs\|adr-0001'` returns references only from
`.oh/docs/*` and `CHANGELOG.md` — **zero from any of the 40 skills, 6 agents, 5 context files, or
`AGENTS.md`.** An agent's probability of encountering an ADR today is effectively zero.

**Budget arithmetic, measured:** 40 skill frontmatters = 25,992 chars ≈ 6,498 tok, always-injected;
6 agent frontmatters = 3,109 chars ≈ 777 tok, also always-injected. No proposed insertion touches any
`description:` field. `.oh/evals/probes/repo-map-contract.sh:13` pins `MAX_BYTES=12288` against a
12,217-byte `REPO_MAP.md` — **71 bytes of headroom**, and a useful routing row costs 147.

**Designer's honest risk finding (§6), adopted:** the step most likely to be skipped is not the ADR
but `Impact: NOT-APPLICABLE` at plan time — because *the highest-value decision class is the plan
being overturned mid-flight*. `critique.md:51` is literally headed `## Operator correction`. A
plan-time gate structurally cannot catch it. The designer explicitly declined to propose a
truthfulness probe ("a judgment call wearing a PASS/REGRESSION costume") and declined to import
eye-tracking claims it had no local evidence for.

---

## Wave 2 — First Mate rulings

Four points where the crew disagreed or over-reached. These are HOW-decisions; none redefines WHAT
was asked.

**Ruling 1 — the probe ships, but without the negative-space assertions.** Architect wanted the probe
to ban YAML frontmatter, `*.json` in the rfcs dir, `> Agent Directive:` lines, and the CI workflow
file. Rejected. Those assertions encode *this council's preference* as a permanent guard, which is
precisely the over-constraint ADR-0001 warns against — a future issue with concrete evidence must
remain able to adopt frontmatter without deleting a probe. They would also flag `/audit eval-quality`
mode 6 (too-narrow/special-cased). The probe asserts **index freshness and the header contract** —
things that rot silently — not the council's taste. PM proposed no probe at all; overruled, because
criterion C2 requires a named instrument to move and the index rot is real and currently undetected.

**Ruling 2 — `Why:` beats `Decision:`.** Designer's measured evidence wins: the repo has independently
converged on a one-line rationale three times, with observed lengths of 86–202 chars in the closest
analogue (`cc-safety-net/decision.md` "One-line rationale" column). 240 chars accommodates the
observed max plus the "rather than Y" clause the existing fields omit. The same string serves as the
file header *and* the index-row cell — one authoring act, no drift.

**Ruling 3 — the contract lives in `rfcs/README.md`, not a separate template file.** PM proposed
`.oh/docs/rfcs/decision-record-template.md`. Rejected: a second file is a second place to drift from
the index that governs it. A fenced skeleton inside `rfcs/README.md` § "Writing a decision record" is
equally copy-pasteable and cannot desync from the lifecycle rules beside it.

**Ruling 4 — the `REPO_MAP.md` insertion is deferred to an optional story.** Designer's paid-for swap
(delete the duplicate line 26, insert a routing row, net +47 bytes, verified against all 20 pinned
literals) is careful work and the analysis is sound. But it edits the single most budget-constrained
always-loaded file in the repo, and it makes the always-loaded delta positive rather than zero.
Designer's own Insertion 2 — one bullet in `.oh/agents/critic.md`'s body, which runs twice per
`/spec critique`, exactly where re-litigation happens — buys the read path at **zero** cost. The
core slice takes the zero-cost path; the `REPO_MAP.md` row becomes an optional story with the
paid-for-swap requirement recorded.

**Correction carried into the PRD.** The task brief and the orchestrator's own plan claimed
`grep -rl 'slack-manifest' .oh/docs/` returns nothing. It returns **three files**. The mechanics are
well documented; what is absent from `.oh/docs/` is the *rejected alternative* — verified by
`grep -rniE 'docs-only|rejected|instead of.*document'` across those three files returning **zero**.
The corrected claim is narrower and stronger, and it is exactly the architect's discriminating test:
docs state what *is*; an ADR states what *lost*.

---

## Wave 2 — scored verdict

Criteria fixed before the council ran. Veto rows: C1, C2, C3, C6.

### The source proposal, as written

| # | Criterion | Score | Basis |
|---|---|:--:|---|
| C1 | Always-loaded delta | 2 | Adds no always-loaded content — but only because nothing reads it. |
| C2 | Moves a named instrument | **0** | A CI Action moves no probe and no capability benchmark. **VETO** |
| C3 | Arbitration rows | **0** | None proposed; a 7th surface with no boundary rule. **VETO** |
| C4 | Evidence vs ADR-0001 | 0 | Cites no repo artifact. |
| C5 | Net machinery | 0 | New CI job, new vendor, new repo secret. |
| C6 | Pain-point honesty | 0 | Implicitly claims the format solves all four. |
| C7 | Reversibility | 0 | Converts 4 tracked docs to YAML; creates a competing root directory. |

**2 / 14 — two veto zeros — NO-GO.**

### The residual design

| # | Criterion | Score | Basis |
|---|---|:--:|---|
| C1 | Always-loaded delta | 2 | Core insertions are skill/agent **bodies** and `references/` only. No `description:` frontmatter touched; `AGENTS.md`, `.oh/context/`, `.oh/memory/` untouched. Delta **0**. |
| C2 | Moves a named instrument | **1** | One probe, red today on the `rfc-runtime-support.md` rot, green after the fix. **Not scored 2**: no capability-benchmark A/B is claimed, because the designer showed the real skip is unmeasurable and a rate-check proxy would be a false-positive generator. Honest 1. |
| C3 | Arbitration rows | 2 | Both written verbatim with mechanical, judgment-free discriminating tests — including an ordered first-match-wins test for the MEMORY/ADR/IDENTITY three-way. |
| C4 | Evidence vs ADR-0001 | 2 | 7 hand-rolled records across 4 surfaces, ≥1 operator ruling (`critique.md:51-64`), ≥1 live rot instance (`.oh/docs/README.md` missing `rfc-runtime-support.md`), plus a latent tier-A probe break caused by storing decision content on a GC path. |
| C5 | Net machinery | 2 | Exactly one new executable. Zero new skills, zero CI jobs, zero vendors. |
| C6 | Pain-point honesty | 2 | (a) partial — the route solves it, not the format; (b) split Q1 delta 0 / Q2 delta 7→3; (c) *worse* unless arbitrated; (d) not lost, unindexed. Plus the structural plan-time-gate admission. |
| C7 | Reversibility | 2 | Purely additive; `git rm` the new files and revert three reference paragraphs. The one subtractive edit (`REPO_MAP.md`) is deferred to an optional story. |

**13 / 14 — no veto zeros — GO on the residual.**

### Verdict

**PARTIAL-GO.** Adopt the destination, the route, the index guard, and the arbitration rows. Reject
YAML frontmatter, the JSON index, `> Agent Directive:`, and `rfc-to-adr.yml`. The destination the
source proposal identified is right; every mechanism it proposed to get there is wrong for this repo.

---

## Wave 3 — critics

Two adversarial critics, run after synthesis. **Critic A: HALT. Critic B: REVISE-PRD.**

### Critic A — implementer lens (HALT)

Six HIGH findings. Four survive orchestrator verification intact and are decisive:

`[SEVERITY: H] [STORY: *] Revealed preference argues "unused", not "underspecified" — 4 of the 7 ad hoc decision records were authored AFTER the formal .oh/docs/rfcs/ destination already existed | [EVIDENCE: adr-0001 created 2026-07-03 (e19dcb62); cc-safety-net/decision.md 2026-07-19, first-mate-charter/plan.md 2026-07-21, open-core.md 2026-07-24, slack-admin-command-surface/critique.md 2026-07-31 — 16 to 28 days later] | [RECOMMENDATION: discount C4; require evidence of an author ATTEMPTING .oh/docs/rfcs/ and hitting friction, not merely skipping it]`

`[SEVERITY: H] [STORY: *] The residual ships nothing that answers its own diagnosis — PM concluded all four pain points reduce to a promotion/index step, but Why:, the contract section, arbitration rows, the probe, and two backfills are all format, guidance, or one-time backfill; none moves a future critique.md ruling into the index without an author remembering by hand | [EVIDENCE: council.md PM conclusion vs the residual scorecard's own C6 "(a) partial — the route solves it, not the format"] | [RECOMMENDATION: scope a real promotion mechanism, or shrink to the two orthogonal bugs]`

`[SEVERITY: H] [STORY: *] C2=1 is circular self-justification — the probe's whole value is guarding index freshness on a surface with no demonstrated write traffic, which is /audit eval-quality Check 7 (probe count grows, capability ceiling flat) | [EVIDENCE: .oh/skills/audit/references/eval-quality.md Check 7; council.md's own "no capability-benchmark A/B is claimed"] | [RECOMMENDATION: score C2 as 0; defer the probe]`

`[SEVERITY: H] [STORY: *] Undercounted blast radius — a ## Decision Record block in .oh/skills/prd/SKILL.md edits a PROTECTED, universally-reused skill invoked by every /prd, /spec plan, /ship-spec and /autopilot run harness-wide, turning a norm needed a few times a month into a permanent section every future PRD author reads or skips | [EVIDENCE: .claude/protected-paths.txt lists `prd`; .oh/skills/prd/SKILL.md:58-132] | [RECOMMENDATION: gate behind a trigger test, or do not ship]`

`[SEVERITY: H] [STORY: *] B-state M4 violated in spirit — 6+ scattered edit points enforcing one norm reproduces exactly the proliferation shape M4 just collapsed, even though the token delta is zero | [EVIDENCE: AGENTS.md:31 vs the Rulings 1-4 touch list] | [RECOMMENDATION: consolidate into one on-demand artifact]`

`[SEVERITY: H] [STORY: *] FALSE AS SPECIFIED — the "verified" claim that the slack-admin probe will break when cleanup-tasks runs does not hold on the cited instance | [EVIDENCE: .oh/crons/cleanup-tasks.md:76-77 requires progress.txt to END with a line matching exactly STATUS: COMPLETE; in slack-admin-command-surface/progress.txt that line is 19 of 40 and the last line is unrelated prose] | [RECOMMENDATION: downgrade to "a plausible failure class, unconfirmed on the cited instance"]`

Material M findings: the 7→3 delta conflates "files a keyword grep returns" with "hops to find the why" and should be reported as two facts; "one ADR in four months" is wrong — `.oh/docs/rfcs/` was created 2026-07-02, ~1 month ago; the arbitration rows sit outside what `/audit context` Dimension D scans, so the "mechanical test" is unenforced prose; `.claude/agents/critic.md` is a materialized copy, not a symlink, so editing `.oh/agents/critic.md` alone never reaches the Claude-facing agent without `.oh/scripts/link-providers.sh`.

### Critic B — maintainer lens (REVISE-PRD)

`[SEVERITY: H] [STORY: *] The isomorphic precedent is omitted 87.5% of the time — ## Wiki Alignment, a mandatory Stage 2.5 step, appears in 1 of 8 prd.md files | [EVIDENCE: orchestrator re-verified: PRESENT only in archive/2026-07-27/markitdown-wiki-pilot/prd.md; ABSENT in the other 7] | [RECOMMENDATION: do not assume ## Decision Record fares better; wire a structural check or accept silent decay]`

`[SEVERITY: H] [STORY: *] No blocking gate — Wiki Alignment's Impact: REQUIRED is wired into the audit that must PASS; the proposed promotion sits in improve/compound, which is the advisory tail | [EVIDENCE: execute.md:78-81 "before the audit can PASS" vs :89-94 compound and :102-103 "report-only... do not block the merge"] | [RECOMMENDATION: wire it into the AUDIT-PASS gate or state plainly it is advisory and will be skipped under merge pressure]`

`[SEVERITY: H] [STORY: *] Probe blind spot — an index-freshness probe can only diff ADRs that exist; it structurally cannot detect a REQUIRED decision never written, so a green probe reads as "the convention works" while the real failure is invisible | [EVIDENCE: wiki-readme-index.sh has nothing to diff against if the file was never created; designer §6 concedes the same for plan time] | [RECOMMENDATION: do not claim the probe guards the actual risk]`

M findings: the 240-char cap leaves only 38 chars over the observed 202-char max, too little for the rejected-alternative clause that defines an ADR; `CONTRIBUTING.md` has zero mention of the convention (verified: 0 matches); backfilled ADRs need a `Source:` line citing the `file:line` they reconstruct from; the expected `REQUIRED` base rate is ~2–3% of tasks.

---

## Wave 4 — approve gate and revised verdict

Both critics were verified independently by the orchestrator rather than taken at face value. **Every
factual challenge they raised was upheld**, including one against a claim this document asserted as
verified.

### Corrections to the record

1. **The GC/probe-break claim was wrong.** The orchestrator confirmed the probe hard-codes
   `.oh/tasks/slack-admin-command-surface/root-package-audit.md` and that the cleanup cron archives
   completed tasks — then asserted the break. It never checked whether the cron's predicate *fires on
   this file*. It does not. Checking a proxy instead of the behaviour is exactly
   `.oh/context/IDENTITY.md:8`, committed inside a document that cites it. The hazard remains real
   for any task whose `progress.txt` genuinely ends with `STATUS: COMPLETE`; it is not evidence here.
2. **"One ADR in four months" is wrong.** `.oh/docs/rfcs/README.md` was created 2026-07-02 and
   ADR-0001 on 2026-07-03 — roughly one month ago. This was stated in issue #686 and must be
   corrected there.
3. **The 7→3 delta conflates two metrics** and is restated as two separate facts.

### Rescored — residual design, post-critique

| # | Criterion | Was | Now | Why it moved |
|---|---|:--:|:--:|---|
| C1 | Always-loaded delta | 2 | **2** | Holds — token delta is genuinely 0. Blast radius is a separate concern, recorded under C5. |
| C2 | Moves a named instrument | 1 | **0** | Circular: the probe guards index freshness on a surface with no demonstrated write traffic, and structurally cannot detect the dominant failure (never written). **VETO** |
| C3 | Arbitration rows | 2 | **1** | The rows are real and well-drafted, but sit outside `/audit context` Dimension D's scanned set — an unenforced convention, not a mechanical boundary. |
| C4 | Evidence vs ADR-0001 | 2 | **1** | Inverted by dating: 4 of 7 records post-date the formal destination by 16–28 days. That is evidence authors *avoid* the surface, not that it is underspecified. One cited instance also refuted. |
| C5 | Net machinery | 2 | **1** | One executable, but 6+ scattered edit points enforcing one norm — the proliferation shape B-state M4 collapsed — plus an edit to the protected, harness-wide `prd` skill. |
| C6 | Pain-point honesty | 2 | **1** | The analysis was honest, but shipped one false "verified" claim and one wrong dormancy stat. |
| C7 | Reversibility | 2 | **2** | Holds — purely additive. |

**8 / 14 — one veto zero (C2) — NO-GO.**

### Verdict

**NO-GO on the machinery. Carve out and ship the two orthogonal bugs.**

The source proposal scored 2/14 with two vetoes and is rejected outright. The residual survived wave
2 at 13/14 and then failed under adversarial review at 8/14 with a veto — because the decisive
question was never "what should an ADR look like" but "is this surface unused or underspecified,"
and the dating evidence answers *unused*. Building route, contract, and probe machinery on a surface
authors demonstrably route around is machinery-growth-without-capability-movement, which is the exact
pattern `/audit eval-quality` Check 7 names and which ADR-0001 pre-emptively deferred.

**What ships instead** — two real defects, found by this council, orthogonal to the machinery and
independently valuable:

1. `.oh/docs/README.md` does not link `rfc-runtime-support.md` (25% of the corpus invisible from the
   index a human enters through).
2. `.oh/agents/critic.md:32` references `.claude/rules/`, which does not exist.

**Re-entry bar**, per ADR-0001's own discipline: a future issue should show an author or agent
**attempting** to use `.oh/docs/rfcs/` and hitting concrete friction — not merely bypassing it. Until
then the lightweight convention stands, exactly as ADR-0001 decided.

`STATUS: SPEC-DENIED`
