# Critique — update-agent-browser-skill

Generated 2026-06-15; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

CRITIC_A — IMPLEMENTER LENS
[SEVERITY: H] [STORY: US-003] Required `prd.json` artifact is absent and schema is unspecified. | [EVIDENCE: `tasks/update-agent-browser-skill/` contains only `prd.md` and `progress.txt`; AC requires `tasks/update-agent-browser-skill/prd.json` records every story as passed.] | [RECOMMENDATION: Define whether implementer must create `prd.json` and point to an existing canonical schema/example.]
[SEVERITY: M] [STORY: US-002] Probe contract has vague string criteria that can produce brittle or subjective implementations. | [EVIDENCE: AC says “contains an absolute screenshot path requirement” without required literals/regex; “does not contain `agent-browser execute`” forbids even explanatory negative mentions.] | [RECOMMENDATION: Specify exact grep/regex checks and whether negative guidance mentioning stale text is allowed.]
[SEVERITY: M] [STORY: US-003] Full `/eval` success requirement may be blocked by unrelated existing probe failures. | [EVIDENCE: AC requires `/eval` through `.claude/skills/eval/run.sh` with “no new green→red regressions,” but PRD gives no baseline handling for pre-existing failures.] | [RECOMMENDATION: Require targeted `--probe agent-browser-cli` plus full eval report that distinguishes unrelated pre-existing failures from new regressions.]
[SEVERITY: L] [STORY: US-001] Preservation requirement is broad and hard to verify. | [EVIDENCE: AC says “preserves existing install/preflight/session hygiene guidance” without listing protected sections or required anchors.] | [RECOMMENDATION: Name the specific headings/phrases that must remain unchanged.]
[SEVERITY: L] [STORY: *] Protected path risk is acknowledged but not explicit in PRD. | [EVIDENCE: `.claude/protected-paths.txt` lists `agent-browser` as protected; PRD edits `.claude/skills/agent-browser/SKILL.md` but does not explicitly forbid deletion/deprecation.] | [RECOMMENDATION: Add a constraint: modify only; do not delete, rename, or deprecate the protected `agent-browser` skill.]

## Critic B — User lens

CRITIC_B — USER LENS
[SEVERITY: M] [STORY: *] Protected-path guard is implicit, not explicit. | [EVIDENCE: .claude/protected-paths.txt lists `agent-browser`; PRD edits the skill but never states it must not be deleted/deprecated.] | [RECOMMENDATION: Add acceptance criteria: preserve `.claude/skills/agent-browser/SKILL.md`; do not delete/deprecate/rename the protected `agent-browser` skill.]
[SEVERITY: M] [STORY: US-002] Probe contract is underspecified and can false-pass. | [EVIDENCE: “contains an absolute screenshot path requirement” does not define required text/pattern; weak grep could pass on unrelated prose.] | [RECOMMENDATION: Define exact required strings or regexes for absolute path guidance, `$PWD` example, and `<absolute-path>` report/example text.]
[SEVERITY: M] [STORY: US-003] Eval rollback/escape hatch missing for generated scoreboard churn. | [EVIDENCE: PRD requires `/eval` to update `evals/RESULTS.md` with no new regressions but gives no rule for pre-existing unrelated failures or noisy generated diffs.] | [RECOMMENDATION: Require baseline-before/baseline-after comparison; only `agent-browser-cli` must newly pass, and unrelated pre-existing failures must be documented rather than “fixed” out of scope.]

## Synthesis

- **High-severity findings**: 1
- **Medium-severity findings**: 5
- **Recommendation**: PROCEED — the single high-severity finding was an AC-tightening issue, mitigated in `prd.md` by stating that ship-spec creates the schemaVersion 1 `prd.json` artifact before implementation and naming the existing schema pattern. Medium findings were mitigated by adding an explicit protected-path modify-only constraint, exact probe string checks, preserved headings, and baseline handling for unrelated pre-existing eval reds.
