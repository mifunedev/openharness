# Raw snapshot — prompt-miner subsystem (2026-06-19)

> Net-new internal subsystem. There is **no external source URL and no DeepWiki
> counterpart** for prompt-trace mining on https://deepwiki.com/mifunedev/openharness —
> this snapshot records the in-repo authoritative artifacts the `wiki/prompt-miner.md`
> entry synthesizes, in lieu of a fetched web page. Provenance is the implementation
> itself plus its spec.

## In-repo authoritative sources captured

- `tasks/prompt-miner/prd.md` — the PRD (US-001..US-012); authoritative acceptance criteria.
- `tasks/prompt-miner/critique.md` — the two-critic gate + re-gate that moved the cron
  mechanism from `/orchestrate` to `/ship-spec --repo` and shipped it `enabled: false` + cap-gated.
- `.claude/skills/prompt-miner/scripts/mine-traces.mjs` — the deterministic engine.
  - `:766` pipeline order `read → aggregate → score → feature → rank → report`.
  - `:186` `classifyLine` dual-schema (Claude nested `is_error` vs Pi `toolResult.isError`).
  - `:307` `aggregateSession` dedupes/merges resumed sessions by `sessionId`.
  - `:391` `scoreSession` friction formula; `:407` ground-truth bonus applied, clamped 0..100.
  - `:753` `resolveGroundTruth` (PR-url OR commit-in-window on `origin/development`; `--no-git` stub).
  - `:444` `extractFeatures`; `:474` `detectSessionType`; `:493` `redact`; `:155` `validateWeights`.
  - `:891`/`:894-895` ranking — window sort by `firstTs`, then rankable sorted by `score` desc.
- `.claude/skills/prompt-miner/SKILL.md` — interactive skill; Step 3 (`:126`) stratified
  marker mining, Step 4 (`:154`) propose-then-confirm gate mirroring `/retro`.
- `.claude/skills/prompt-miner/references/{scoring,markers,report-schema}.md` — the contracts.
  - `markers.md:57-58` thresholds `sessions_supporting ≥ 10` AND `effect_size ≥ 0.3`.
  - `markers.md:67-76` `NO-CORPUS` vs `NO-CANDIDATE`.
- `crons/prompt-miner.md` — daily cron; Step 3 (`:74`) `/ship-spec --repo ryaneggz/openharness`,
  PR-label step (`:88`) to keep the cap honest.
- `scripts/prompt-miner-caps.sh` — origin-scoped wrapper of `scripts/autopilot-caps.sh`.
