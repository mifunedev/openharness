# Critique — distill-setup-docs

Generated 2026-07-02; reviews `prd.md` post-/prd, pre-/ralph. Two adversarial critics (implementer + user lens), each cross-checked against `.claude/protected-paths.txt`.

## Critic A — Implementer lens

[SEVERITY: H] [STORY: US-007] make gateway "on host" is wrong — `.oh/scripts/gateway.sh` hard-checks `command -v pi`/`command -v hermes` on PATH and errors "run inside the sandbox" if missing; those binaries only exist in the container. `slack.md:141-142` already correctly states `gateway` ≡ `make gateway pi`, both sandbox-only. | EVIDENCE: AC "start (make gateway pi|hermes on host, or gateway <pi|hermes> in sandbox)"; gateway.sh command-v check | REC: drop the host/sandbox split; both `gateway <pi|hermes>` and `make gateway <pi|hermes>` are sandbox-only.

[SEVERITY: H] [STORY: US-008] contributing.md ~69-78 describes a generic pack mechanism (`git clone <pack-repo> workspace/<pack>` → follow its README → "defines the pack contract") that pi-messenger-bridge does NOT follow (it's `npm install --prefix .pi/bridge` in gateway.sh, loaded via `pi --extension`). A name-swap leaves factually wrong install instructions. | EVIDENCE: contributing.md:69-78 | REC: rewrite the whole subsection mechanism, or drop it if pi-messenger-bridge isn't a "pack" in this repo's sense.

[SEVERITY: H] [STORY: US-003] README leading with private-origin+upstream forces reordering Option A/B/C, but `README.md:154` references "**Option B** above" by letter in the footer. No AC checks this cross-reference. | EVIDENCE: README.md:22,40,49 headers vs README.md:154 | REC: after relabeling, grep README for `Option [A-Z]` and verify every letter reference, or replace the letter reference with a named anchor.

[SEVERITY: M] [STORY: US-001] Verification gate `grep -rn "Docker + Git" README.md .oh/docs/*.md` glob-expands to top-level files only; `-r` is a no-op — misses `.oh/docs/harnesses/*` and `.oh/docs/integrations/*`. | REC: use `grep -rn "Docker + Git" README.md .oh/docs/` (directory arg, true recursion).

[SEVERITY: M] [STORY: US-002] AC presumes README has a duplicated key TABLE; actually `README.md:107-125` is prose (secrets/non-secret split), only quickstart has the table. | REC: reword AC to "shrink the prose Configure section to a 2-sentence pointer"; no table removal required.

[SEVERITY: M] [STORY: *] prd.json has only `priority`, no `dependsOn`. US-009/US-010 need the final state of US-001..US-008; if the build fans out via /delegate rather than walking priority in order, US-009/US-010 can build against stale doc state. | REC: sequence US-009 and US-010 as a final serial pass after US-001..US-008 land; call it out in the execution plan.

[SEVERITY: M] [STORY: US-006, US-007] Both need live-sandbox verification for a "docs-only; no scripts, no code" PRD; root CLAUDE.md says the orchestrator does NOT enter the sandbox for ongoing work. US-006's "provisional" reuses wiki vocabulary in prose with no rendering convention; US-007's "where possible" is an unfalsifiable hedge. | REC: define "provisional" for prose docs (an explicit `> Unverified —` admonition, not the wiki `confidence:` field); replace "where possible" with a concrete fallback.

[SEVERITY: L] [STORY: *] Several gap-audit anchors drifted 1-3 lines (harness-config.sh:63-64, hermes.md:146-149, slack.md:151-152). | REC: re-run `grep -n` for each anchor immediately before editing.

[SEVERITY: L] [STORY: US-010] schema.md § 2 requires `sources:` include a `raw/<date>-<slug>.md` snapshot, but this entry synthesizes a first-hand session, not an ingested URL. Precedent `sandbox-dependency-installs.md` cites in-repo file paths directly. | REC: add to AC: "sources cites the touched doc files per the sandbox-dependency-installs.md precedent, not a raw/ snapshot."

[SEVERITY: L] [STORY: *] No protected-path violation — none of the 10 stories touch a `.claude/protected-paths.txt` entry; the wiki story only adds a corpus entry + regenerates the index.

SEVERITY tally: H3 / M5 / L3

## Critic B — User lens

[SEVERITY: H] [STORY: US-008] "Keep CHANGELOG + task artifacts" is an AC but never enforced — the top-level Verification grep doesn't check CHANGELOG/mifune-repo-extraction. The naive implementation (repo-wide find/replace) would scrub historical record. | EVIDENCE: prd.md keep-note vs Verification §1-5 | REC: add a Verification step asserting CHANGELOG.md and the mifune-repo-extraction folder keep their pre-edit mifune count; scope US-008 to "edit only the 6 named line-sites, not a global find/replace."

[SEVERITY: H] [STORY: US-003] README install-ordering change under-specified and unverified: README is a public entry point (Railway button + curl currently lead), not this operator's private notes. PRD doesn't say where Railway/curl end up, doesn't flag reversibility, and no Verification check confirms the Railway button / curl one-liner still exist post-edit. | EVIDENCE: prd.md architecture row; US-003 AC; Verification §1-5; README.md:15-40 | REC: add a constraint that the Railway button and curl one-liner (Option A) must remain present and functionally unchanged (only reordered/demoted), plus a Verification check asserting both still exist.

[SEVERITY: M] [STORY: US-010] Wiki page re-synthesizes the same 13-step flow US-009 canonicalizes in quickstart.md → two sources of truth, contradicting "one canonical home per fact"; risks silent drift. | REC: scope the wiki page to a compact index/pointer to quickstart.md OR justify the duplication + add a "keep in sync with quickstart.md" AC.

[SEVERITY: M] [STORY: *] Architecture spreads the flow across 8+ files; Verification §5 only checks each command appears somewhere, not that the quickstart walkthrough alone is copy-paste runnable. USER.md norm is "concise and action-oriented". | REC: require the quickstart walkthrough to inline the actual commands for all 13 steps, with canonical docs as supplementary depth.

[SEVERITY: M] [STORY: US-006, US-007] Live-verification ACs hedge with "where possible"/"provisional", making them unfalsifiable — reproduces the unverified-doc problem the PRD exists to fix. | REC: name the specific environment for live verification; treat "provisional" as a blocking flag requiring follow-up, not a terminal state.

[SEVERITY: L] [STORY: *] No protected-path violations; wiki README regen is additive.

SEVERITY tally: H2 / M3 / L1

## Synthesis (round 1)
- **High-severity findings**: 5 (US-003 ×2, US-007 ×1, US-008 ×2)
- **Medium-severity findings**: 8 (US-001, US-002, US-006/007 ×2, US-010, sequencing, walkthrough self-sufficiency)
- **Recommendation**: REVISE-PRD — the highs are all AC-precision defects (wrong command surface, name-swap-leaves-wrong-instructions, unchecked Option-letter cross-ref, unenforced preserve-boundary, unverified Railway/curl retention). Fixable by tightening ACs + Verification; no scope change needed.

---

## Round 2 (re-critique after PRD revision)

Both critics re-ran against the revised `prd.md`/`prd.json`.

**Critic A — Implementer lens** (H1/M1/L2): all 5 round-1 highs confirmed MITIGATED (verified gateway.sh:57-58/64-65 host-check, contributing.md:69-78 mechanism, README:154 Option-B ref, Railway `README.md:18` + curl `README.md:25` retention). **One NEW HIGH**: US-008 preserve-check cited `.oh/tasks/mifune-repo-extraction/`, which the cleanup-tasks cron archived to `.oh/tasks/archive/2026-07-02/mifune-repo-extraction/` — the check was inert. M: US-003 didn't pin new-option-vs-fold-into-C. L: installation.md:245 generic "packs" concept; archive gitignored.

**Critic B — User lens** (H0/M3/L5): both round-1 highs MITIGATED. M: §4 Railway/curl check was substring-only (not full block); US-009 inlining duplicates commands with no drift guard; US-010 "keep in sync" unenforced prose. L: preserve-check aggregate not per-path; no walkthrough length bound; sequencing prose-only (no dependsOn).

## Round 3 revisions applied
- **US-008 (new HIGH → mitigated)**: preserve-check repointed to `.oh/tasks/archive/2026-07-02/mifune-repo-extraction/`, per-path baselines recorded (CHANGELOG.md=14, archive=64); generic "packs" concept (installation.md:245) explicitly out of scope.
- **US-003 (M)**: pinned to fold-into-Option-C (no 4th option); §4 tightened to full-markdown-block retention.
- **US-009 (M/L)**: named exception to "one canonical home" recorded in prd.md architecture note; format bound added; `dependsOn` US-001..US-008.
- **US-010 (M)**: drift surface removed — wiki page holds synthesis + doc-handoff map only, no literal commands; `dependsOn` US-009.
- **Sequencing (L)**: `dependsOn` added to US-009/US-010 for machine-checkable ordering.

## Final synthesis
- **Open high-severity**: 0 (5 round-1 + 1 round-2 all mitigated at AC level)
- **Residual**: M/L polish, all addressed or accepted with rationale
- **Recommendation**: PROCEED
