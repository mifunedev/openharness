# Evidence — prompt-miner-score-clamp

- **PR**: #779 (`mifunedev/openharness`, base `development`) · **Branch**: `fix/778-prompt-miner-score-clamp`
- **Issue**: #778
- **Audit run**: `audit-20260814T024205Z-1880360` · **Verdict**: `PR-AUDIT-PROMOTABLE`

## What was broken, and what now holds

`scoreSession` kept the display score at 100 after the ground-truth bonus raised the total. The implementation now emits `scoreUncapped` beside `score`.

The implementation adds `manifest.ceilingSaturation` for rankable sessions. The markdown renderer places the census under `## Manifest`.

The focused test suite passes with 36 tests. A base-reference correction now removes the regression-floor blocker.

## Proof by gate

| Gate | Check | Observed | Result |
|------|------------------|----------|--------|
| Task graph | `prd.json` stories | `3/3 stories pass` | PASS |
| Focused tests | Prompt-miner Node test suite | `36/36` tests pass | PASS |
| Regression floor | `/eval` runner | 105 probes; 101 PASS, 0 REGRESSION, 4 SKIPPED | PASS |
| CI | GitHub checks | Four checks pass | PASS |
| Promotable / audit | Native PR classifier | `PR-AUDIT-PROMOTABLE`; `evidenceComplete: true`; `promotable: true` | PASS |
| UI | Browser criteria | No story declares browser verification | N/A |

## Observed output

```text
$ jq -r '"\([.userStories[] | select(.passes == true)] | length)/\(.userStories | length) stories pass"' .oh/tasks/prompt-miner-score-clamp/prd.json
3/3 stories pass

$ node --test .oh/skills/prompt-miner/scripts/__tests__/*.test.mjs
1..36
# tests 36
# suites 0
# pass 36
# fail 0
# cancelled 0
# skipped 0
# todo 0

$ bash .oh/evals/probes/audit-stale-references.sh; rc=$?; printf 'probe_rc=%s\n' "$rc"
PASS: no active legacy audit references across tracked active surfaces
probe_rc=0

$ ROOT=$(git rev-parse --show-toplevel)
$ AUDIT_AGENT_COMMAND_JSON='["claude","-p","--output-format","text"]' \\
>   "$ROOT/.oh/skills/audit/scripts/audit-run.sh" pr 779 --repo mifunedev/openharness --base development -- \\
>   "$ROOT/.oh/skills/audit/scripts/route-driver.sh"
**PR audit — mifunedev/openharness#779** (run `audit-20260814T024205Z-1880360`)

| Field | Value |
|---|---|
| Number | 779 |
| CI | PASS |
| Mergeability | MERGEABLE |
| Clean state | CLEAN |
| Review decision | *(none)* |
| Primary state | draft |
| Flags | *(none)* |
| `readyForReview` | true |
| `readyToMerge` | false |
| `evidenceComplete` | true |
| `promotable` | true |

Notes: draft status `promotable`, no draft limbo, age 0d (422s), references issues #730 and #778. Evidence complete and promotable → PR-AUDIT-PROMOTABLE. No repository file written; no `gh pr ready` or merge performed (`--proof` not requested).

AUDIT-EVIDENCE: PR-AUDIT-PROMOTABLE
```

## Acceptance criteria → proof

| Story | Criterion | Proof |
|-------|-----------|-------|
| US-001 | Emit `scoreUncapped` without changing `score`. | `.oh/skills/prompt-miner/scripts/mine-traces.mjs:427,432-436`; focused tests pass. |
| US-001 | Preserve the field on ranked and unranked records. | `.oh/skills/prompt-miner/scripts/mine-traces.mjs:1044-1046`; focused tests pass. |
| US-002 | Count the stored rounded `score` for rankable strata. | `.oh/skills/prompt-miner/scripts/mine-traces.mjs:506-516,1066-1079`; focused tests pass. |
| US-002 | Render the census under `## Manifest`. | `.oh/skills/prompt-miner/scripts/mine-traces.mjs:1113-1126`; focused tests pass. |
| US-002 | Preserve the privacy contract. | `.oh/skills/prompt-miner/scripts/__tests__/mine-traces.test.mjs`; focused tests pass. |
| US-003 | Name `scoreUncapped` as the correlation scale. | `.oh/skills/prompt-miner/SKILL.md:139`; `.oh/skills/prompt-miner/references/markers.md:4-6,54-57`. |
| US-003 | Document the `UNSTABLE` guard. | `.oh/skills/prompt-miner/SKILL.md:158-161`; `.oh/skills/prompt-miner/references/markers.md:67-77`. |
| US-003 | Update the report and scoring contracts. | `.oh/skills/prompt-miner/references/report-schema.md:36,63`; `.oh/skills/prompt-miner/references/scoring.md:17,24-26`. |

## Gaps and non-gating findings

- A one-line RFC reference correction resolves the pre-existing `audit-stale-references` finding.
- The whole-file `/ste` check reports 12 pre-existing findings outside the changed security paragraph. The changed paragraph uses short active sentences.
- The directory form `node --test .oh/skills/prompt-miner/scripts/__tests__/` remains unavailable in Node v22.23.2. The file-glob form passes and matches the task progress record.
- No story declares browser verification.
