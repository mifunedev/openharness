# PRD: prompt-miner — rank prompts by outcome to mine the markers that produce the best sessions

## Introduction

Every Claude and Pi session is already persisted on disk as a `.jsonl` transcript, but
nothing in the harness reads them. `prompt-miner` is a new orchestrator skill, backed by a
deterministic Node engine, that closes a self-improvement loop on **prompt quality**: it
collects session traces from both harnesses, scores each session by an *outcome* proxy,
ranks the initiating prompts by that outcome, and mines the prompt **markers** (file paths,
acceptance criteria, imperative voice, briefing structure, …) correlated with the best
outcomes. Findings feed back into the harness — interactively behind a `/retro`-style
confirmation gate, and unattended via a daily cron that files an origin issue for the top
finding and hands it to `/ship-spec --repo ryaneggz/openharness` to ship a loop-gated,
benchmarked PR against `origin`.

This is a cross-session, data-driven cousin of `/retro`. The design was audited by an expert
`skill-builder` advisor and revised after a two-critic gate (`critique.md`): the cron
mechanism was changed from `/orchestrate` (which cannot target origin nor ingest a seed) to
`/ship-spec --repo`, and shipped `enabled: false` + cap-gated.

## Goals

- Parse Claude (`~/.claude/projects/-home-sandbox-harness/*.jsonl`) and Pi
  (`${PI_CODING_AGENT_DIR:-~/.pi/agent}/sessions/**/*.jsonl`) traces with a per-harness adapter.
- Compute a defensible **friction + ground-truth** outcome score per session, with an
  auditable `scoreBreakdown` and pluggable, validated weights.
- Extract an objective prompt **feature vector** + session **type** per session so the LLM
  can correlate markers against outcome **stratified by session type**.
- Emit a ranked report (`json` + `md`) to the gitignored `memory/<UTC-date>/` — **never**
  committing raw transcripts; redaction on by default.
- Provide a `/prompt-miner` skill that mines markers into a **falsifiable** list and proposes
  harness improvements behind a propose-then-confirm gate (mirrors `/retro`).
- Add a daily Denver-timezone cron (`enabled: false`, cap-gated) that mines the last 24h and,
  for a high-confidence candidate, files an origin issue and runs `/ship-spec --repo
  ryaneggz/openharness --base development --issue <N>` — never upstream, never auto-merge,
  never unattended MEMORY/IDENTITY mutation.
- Guard the fragile JSONL parsing with a tier-A eval probe.

## User Stories

### US-001: Engine I/O — CLI, enumeration, streaming, malformed tolerance

**Description:** As an orchestrator, I want a zero-dependency Node engine that parses flags,
enumerates session files for both harnesses, and streams them line-by-line tolerating
corruption, so the parse layer is independently testable.

**Acceptance Criteria:**

- [ ] `.claude/skills/prompt-miner/scripts/mine-traces.mjs` exists; runs under node v22 with no npm deps (the `git` binary is an allowed external for ground-truth, documented in `references/scoring.md`); header comment states one-line purpose.
- [ ] CLI flags: `--harness all|claude|pi` (default all), `--since`/`--until` (YYYY-MM-DD), `--hours N` (sub-day window; takes precedence over `--since` when set), `--last-n N`, `--min-turns N` (default 2), `--top N` (default 15), `--attribution first|all` (default first), `--include-prompt-text`, `--no-git` (stub ground-truth bonus to 0), `--weights <json>`, `--out <dir>` (default `memory/<UTC-date>/`), `--report-only`, `--dry-run`, `--max-file-mb` (default 50).
- [ ] Enumerates Claude `~/.claude/projects/-home-sandbox-harness/*.jsonl` and Pi `${PI_CODING_AGENT_DIR:-~/.pi/agent}/sessions/*/*.jsonl` (env override resolved), filtered by harness + window.
- [ ] Streams each file with `node:readline` (constant memory); each line `JSON.parse` in try/catch — malformed lines increment `malformedLines` and are skipped, never thrown.
- [ ] Files exceeding `--max-file-mb` are skipped and counted in a distinct `skippedFiles` manifest counter (separate from `malformedLines`).
- [ ] `node --check` passes.

### US-002: Per-harness adapters — normalization, dedup, exports

**Description:** As an orchestrator, I want each harness's lines normalized to a common event
shape and aggregated per session, so scoring is harness-agnostic.

**Acceptance Criteria:**

- [ ] Adapter normalizes each line to `{kind, ts, isError?, stopReason?, usage?, text?}`. Tool-error path is harness-correct: Claude `.message.content[] | select(.type=="tool_result") | .is_error`; Pi `role=="toolResult"` → `.message.toolResult.isError`.
- [ ] Sessions aggregated and deduped by `sessionId` (resumed sessions across files merged; counts unioned).
- [ ] Exports pure functions (`classifyLine`, `aggregateSession`, `scoreSession`, `extractFeatures`, `redact`) for unit testing.
- [ ] Unit-tested over fixtures (see US-006).

### US-003: Outcome scoring — friction + ground-truth bonus (origin cross-ref)

**Description:** As an orchestrator, I want each session scored by a documented heuristic so
prompts can be ranked by outcome quality with an auditable breakdown.

**Acceptance Criteria:**

- [ ] Friction score: `100 − 35*toolErrorRate − 30*correctionDensity − 20*abandoned − 10*incomplete − 5*turnBloat` (sub-signals normalized 0..1, clamped).
- [ ] Abandonment/incompleteness from last assistant `stop_reason`/`stopReason` (`aborted` / not `end_turn|stop`); `correctionDensity` uses a documented negation lexicon (in `references/scoring.md`) over plain-text human follow-ups.
- [ ] Ground-truth bonus (+15, total capped at 100): PR URL grep in assistant content OR a commit on the session branch present in `git log origin/development` within the session window. Cross-ref uses **`origin/development` specifically** (never `upstream`); the engine runs `git fetch origin development` (bounded depth) first, and `--no-git` stubs the bonus to 0 for CI/test.
- [ ] Weights overridable via `--weights <json>`; validated (required keys present, values non-negative, unknown keys error out).
- [ ] Each session emits `scoreBreakdown` so every number is auditable.
- [ ] Unit-tested arithmetic AND a git-absent path test (see US-006).

### US-004: Prompt feature extraction + session-type detection

**Description:** As an orchestrator, I want each attributed prompt reduced to an objective
feature vector and each session tagged with a type, so marker correlation can be stratified.

**Acceptance Criteria:**

- [ ] Attributed prompt selected per `--attribution` (default: first human prompt). Claude human-prompt detector = `type:"user"` AND `userType=="external"` AND `message.content` is a string AND `isMeta != true` AND content does not start with `<…>` (and `promptSource != "sdk"` when the field is present). Pi = `type:"message"` AND `role=="user"`.
- [ ] Feature vector: `lenChars`, `lenWords`, `startsImperative`, `hasFilePath`, `hasAcceptanceCriteria`, `hasCodeFence`, `hasInlineCode`, `briefingStructure`, `referencesSkill`, `mentionsIssuePr`, `questionCount`, `urlCount`, `hedgingCount`.
- [ ] Session type detected from the first human prompt (`impl|retro|query|audit|cron|other`) and recorded on each session.
- [ ] Sessions with no human prompt flagged `no_human_prompt` and excluded from prompt ranking (kept in the session table).

### US-005: Report generation + redaction

**Description:** As an orchestrator, I want a ranked, redacted report in a gitignored location
so I can read results without ever committing transcripts or secrets.

**Acceptance Criteria:**

- [ ] Emits `prompt-miner-<UTC-date>.json` (full dataset per `references/report-schema.md`) and `prompt-miner-<UTC-date>.md` (ranked top-N/bottom-N table + manifest) to `--out` (default `memory/<UTC-date>/`).
- [ ] Default output contains feature vectors + metadata only — **no raw prompt text**.
- [ ] `--include-prompt-text` opts into prompt text AND applies a redaction pass covering line-level patterns (`sk-`, `sk-ant-`, `ghp_`/`gho_`, `github_pat_`, `AKIA`, `Bearer `) AND block-level patterns (`-----BEGIN * KEY-----` … `-----END * KEY-----` bodies; runs of ≥40 base64/hex chars) AND prints a `WARNING: prompt text may contain secrets` banner.
- [ ] `--dry-run` computes and prints to stdout, writes nothing.
- [ ] `--report-only` writes the report + the daily log entry, but never edits `memory/MEMORY.md` or `context/IDENTITY.md` (the daily `memory/<date>/log.md` write is still emitted).
- [ ] Manifest records `sessionsScanned`, `sessionsRanked`, `malformedLines`, `skippedFiles`, `weights`, window, `scoreModel`.

### US-006: Unit tests + synthetic fixtures

**Description:** As an orchestrator, I want a `node --test` suite over synthetic fixtures so
the fragile dual-schema parsing is verifiable without real session data.

**Acceptance Criteria:**

- [ ] `scripts/__tests__/fixtures/{claude-sample,pi-sample}.jsonl` are hand-authored synthetic traces (no real data); each has ≥1 tool-error line, ≥1 human prompt, and (Claude) ≥1 `isMeta:true` and ≥1 `<command-name>` wrapper line for exclusion testing.
- [ ] `scripts/__tests__/mine-traces.test.mjs` runs under `node --test` (no vitest/tsx).
- [ ] Tests assert: Claude string-vs-array prompt detection, `<command-name>`/`isMeta`/non-external exclusion, nested `is_error` (Claude) vs `toolResult.isError` (Pi) counting, abandonment via `aborted`/non-`end_turn`, malformed-line tolerance, redaction scrub (incl. block-level keys), `--weights` validation, score-breakdown arithmetic, and the `--no-git` ground-truth-stub path.
- [ ] `node --test .claude/skills/prompt-miner/scripts/__tests__/` exits 0.

### US-007: Reference contracts (scoring, markers, report-schema)

**Description:** As an orchestrator, I want the scoring formula, marker taxonomy, and output
schema documented out-of-band so the SKILL.md stays lean and the contracts are stable.

**Acceptance Criteria:**

- [ ] `references/scoring.md`: the formula; per-harness JSON paths for every signal; the negation lexicon; the candidate scoring approaches; the explicit "heuristic proxy — validate before trusting" caveat (flagging `correctionDensity` as highest-variance); `--weights` validation rules; the `git` binary + `git fetch origin development` requirement; the concrete reason for `.mjs` over jq.
- [ ] `references/markers.md`: the feature taxonomy + the falsifiable marker schema `{feature, direction, threshold, sessions_supporting, sessions_contradicting, effect_size}`; the `sessions_supporting ≥ 10` / `effect_size ≥ 0.3` thresholds; the mandatory session-type stratification rule; and the corpus-size reality — emit `NO-CORPUS` (distinct from `NO-CANDIDATE`) when no session type reaches the support threshold.
- [ ] `references/report-schema.md`: the emitted JSON shape (manifest + sessions[] + markerFeatureKeys).

### US-008: SKILL.md + memory-log helper + .pi mirror

**Description:** As an orchestrator, I want the `/prompt-miner` skill — workflow, marker
mining, feedback gate — plus the mandatory memory-log entry and provider parity.

**Acceptance Criteria:**

- [ ] `.claude/skills/prompt-miner/SKILL.md` frontmatter: `name: prompt-miner`; `description` with TRIGGER phrases; `argument-hint` (bracket-per-option form); `disable-model-invocation: true` (suppresses auto-invocation only — the user-typed skill still performs LLM marker synthesis); `allowed-tools: Read, Grep, Bash, Edit`; no `effort` field; no `## Handoff`/loop `STATUS` line.
- [ ] Body: privacy contract; Step 1 runs the engine via `args=($ARGUMENTS); node "${CLAUDE_SKILL_DIR}/scripts/mine-traces.mjs" "${args[@]}"` (array form so `--weights '{...}'` is one token, not word-split); Step 2 reads the dataset; Step 3 mines markers **stratified by session type** into the `references/markers.md` falsifiable schema; Step 4 propose-then-confirm (APPROVE/SKIP/EDIT) additions to `memory/MEMORY.md` / `context/IDENTITY.md` mirroring `/retro`, running candidates through `retro/scripts/check-memory-duplicates.sh`; Step 5 appends the memory-log entry.
- [ ] Human result tag documented: `RESULT: MINING-COMPLETE | DRY-RUN | NO-SESSIONS | NO-CORPUS`.
- [ ] `scripts/render-log-entry.sh` (`set -euo pipefail` + ERR trap) with a documented flag interface (`--result`, `--time HH:MM`, `--sessions-scanned N`, `--markers-found N`, `--top-marker TEXT`); the memory-log append resolves the harness root via `git rev-parse --show-toplevel` and uses repo-root `scripts/locked-append.sh`.
- [ ] If `.pi/skills/` mirrors `.claude/skills/` as an invariant (verify against `evals/probes/retro-deterministic-contract.sh`'s expectation), create `.pi/skills/prompt-miner/` as a byte-identical copy; otherwise record in `references/` why Pi parity is not required.
- [ ] SKILL.md stays under the length guideline (≤ ~500 lines), deferring detail to `references/`.

### US-009: Daily cron → file origin issue → /ship-spec --repo origin (cap-gated, opt-in)

**Description:** As an orchestrator, I want a daily cron that mines the corpus and, for a
high-confidence candidate, ships a benchmarked PR to `origin` through `/ship-spec`, safely
opt-in and cap-gated.

**Acceptance Criteria:**

- [ ] `crons/prompt-miner.md` frontmatter: `id: prompt-miner`; `schedule: "0 5 * * *"`; `timezone: America/Denver`; `enabled: false`; `overlap: false`; `catchup: false`; `tmux: true`; `worktree: true`; `preflight: scripts/prompt-miner-caps.sh`; `repo: ryaneggz/openharness`; one-line `description`.
- [ ] `scripts/prompt-miner-caps.sh` exists (`set -euo pipefail` + ERR trap): an origin-scoped cap wrapper that execs `scripts/autopilot-caps.sh` with `AUTOPILOT_REPO=ryaneggz/openharness` and `AUTOPILOT_LABEL=prompt-miner` (caps scoped to prompt-miner-labeled PRs on the fork). Add a row to `scripts/README.md`.
- [ ] Body instructs: (1) mine `--hours 24 --report-only`; write `memory/<today>/prompt-miner-<date>.md` + surface top markers in `memory/<today>/log.md`; (2) if a marker meets the `references/markers.md` thresholds → ensure the `prompt-miner` label exists on `ryaneggz/openharness` and file/ensure a GitHub issue labeled `prompt-miner`; else log `NO-CANDIDATE` (or `NO-CORPUS`) and stop; (3) run `/ship-spec --repo ryaneggz/openharness --base development --issue <N>` (the loop's build→/eval→/pr-audit→ready path, targeting origin), capture the created PR number, and immediately `gh pr edit <PR> --repo ryaneggz/openharness --add-label prompt-miner` — the cap counts PRs by label and GitHub does NOT inherit the issue's label onto the PR, so an unlabeled PR would silently defeat the cap; (4) append the `crons/.cron.log` liveness line, resolving the shared-root path under worktree mode (`$CRON_WORKTREE`-vs-root, mirroring the autopilot convention).
- [ ] Body states: never auto-merge; never edit MEMORY/IDENTITY directly; kill-switch is `enabled: false` (the default) + SIGHUP reload.
- [ ] `id` matches filename basename, kebab-case; `schedule` is valid 5-field cron (no `ID_MISMATCH`/`SCHED_INVALID` at load); `repo:` frontmatter resolves to `AUTOPILOT_REPO` for the preflight/agent (verify against `scripts/cron-runtime.ts`).
- [ ] `crons/README.md` Scheduled-jobs table gains a `prompt-miner.md` row.

### US-010: Eval probe for schema-compat (+ optional .pi parity probe)

**Description:** As an orchestrator, I want a tier-A probe that fails loudly if the JSONL parse
breaks, so schema drift is caught by `/eval`.

**Acceptance Criteria:**

- [ ] `evals/probes/prompt-miner-schema-compat.sh` derives `ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"`, runs `node "$ROOT/.claude/skills/prompt-miner/scripts/mine-traces.mjs" --dry-run --no-git` against `$ROOT/.claude/skills/prompt-miner/scripts/__tests__/fixtures/`, and asserts non-zero session count AND non-zero tool-error count; 3-state oracle (PASS/REGRESSION/SKIPPED) with standard exit codes; SKIPPED guard if the skill dir is absent.
- [ ] If `.pi/skills/prompt-miner/` is created (US-008), the probe (or a sibling) asserts `.pi`↔`.claude` parity, matching `retro-deterministic-contract.sh`.
- [ ] A single new row for the probe(s) is hand-inserted into `evals/RESULTS.md` (no wholesale regeneration / timestamp churn on other rows).
- [ ] `bash evals/probes/prompt-miner-schema-compat.sh` exits 0 (PASS) on the fixtures.

### US-011: Register /prompt-miner in CLAUDE.md

**Description:** As an orchestrator, I want the skill discoverable in the Skills table.

**Acceptance Criteria:**

- [ ] A single `/prompt-miner` row is added to the `CLAUDE.md` Skills table (additive edit; no other rows changed, no protected content removed).
- [ ] The row's "When" text matches the skill's actual trigger.

### US-012: Wiki entry — wiki/prompt-miner.md

**Description:** As an operator, I want a DeepWiki-style wiki page so the prompt-mining
subsystem is teachable to humans and future agents.

**Acceptance Criteria:**

- [ ] `wiki/prompt-miner.md` created per `context/rules/wiki.md`: frontmatter (`slug: prompt-miner`, tags, `created`/`updated`, `sources`, `confidence: provisional`), `## Relevant Source Files` (`mine-traces.mjs`, `SKILL.md`, `crons/prompt-miner.md`), `## Summary`, `## Detail` (collect→score→rank→mine→feed-back; both feedback paths), `## System Relationships` (Mermaid diagram of the pipeline + cron→ship-spec→origin handoff), `## See Also` (`[[cron-runtime]]` and any retro/loop entries).
- [ ] Line-cited claims for stage ordering and the scoring model; records that no DeepWiki counterpart exists (net-new subsystem).
- [ ] `wiki/README.md` refreshed; `bash evals/probes/wiki-readme-index.sh` passes.

## Functional Requirements

- FR-1: The engine MUST parse both harnesses' JSONL via a per-harness adapter, honoring the verified schema (nested `is_error` for Claude; `toolResult.isError` for Pi; human-prompt detector keyed on string content + `userType=="external"` + `isMeta != true`; no `pr-link` line type).
- FR-2: The engine MUST stream files (constant memory), tolerate malformed lines, and count `skippedFiles` for over-limit files.
- FR-3: Scoring MUST be friction + ground-truth, with ground-truth cross-referenced only against `origin/development` (with a `git fetch` first and a `--no-git` stub).
- FR-4: Default output MUST contain no raw prompt text; `--include-prompt-text` MUST redact (line + block patterns) and warn.
- FR-5: The skill MUST set `disable-model-invocation: true` and gate all MEMORY/IDENTITY writes behind propose-then-confirm; `--report-only` MUST never touch MEMORY.md/IDENTITY.md.
- FR-6: Marker mining MUST stratify by session type, emit the falsifiable marker schema with documented thresholds, and emit `NO-CORPUS` when the corpus is too small.
- FR-7: The cron MUST be Denver-timezone daily, `enabled: false`, cap-gated against `ryaneggz/openharness`, file an origin issue, run `/ship-spec --repo ryaneggz/openharness`, never auto-merge, and never mutate MEMORY/IDENTITY directly.
- FR-8: The eval probe MUST gate the parser against schema drift (via fixtures, `--no-git`) and be registered with a single new RESULTS.md row.

## Non-Goals

- No LLM-judge outcome scoring inside the engine (the SKILL.md marker step is the judgment layer).
- No commit of raw transcripts or `--include-prompt-text` output to git (artifacts stay in gitignored `memory/<date>/`).
- No deletion or rewrite of any `.claude/protected-paths.txt` entry; all repo-file edits (CLAUDE.md, crons/README.md, scripts/README.md, evals/RESULTS.md) are strictly additive single rows.
- No targeting of `upstream` (mifunedev) anywhere — ground-truth, issue, and PR shipping are origin-only.
- No autonomous MEMORY.md/IDENTITY.md writes from the cron path (improvements land as loop-gated PRs through `/ship-spec`, which the cron invokes but does not bypass).
- No use of `/orchestrate` for the cron (it cannot target origin nor ingest a seed — see `critique.md`).
- No new npm runtime dependency (no tsx/vitest; node built-ins + `node --test` only; `git` binary is the one allowed external).

## Technical Considerations

- Reuse: `retro/scripts/check-memory-duplicates.sh` (dedup), repo-root `scripts/locked-append.sh` (memory-log append), `retro/scripts/render-log-entry.sh` shape, `scripts/repo-orientation-benchmark-score.mjs` (`.mjs` precedent), `scripts/autopilot-caps.sh` (wrapped by `prompt-miner-caps.sh`), `/ship-spec --repo` (origin-targeted build). `/retro` SKILL.md is the propose-then-confirm template.
- Fixtures live under `scripts/__tests__/fixtures/`, NOT `references/`, so they are never auto-loaded into context.
- `jq` 1.6 is installed but inadequate for the cross-session stateful join + weighted scoring + dual-schema normalize + redaction; `references/scoring.md` records this rationale.
- Performance target: a full run over the ~219 MB local corpus completes with constant memory (readline streaming) and `--max-file-mb` guards pathological files.
- Cron→`/ship-spec` reuses the autopilot isolation model (`worktree: true`, shared-root log resolution); `/ship-spec` Stage 10 reuses `$CRON_WORKTREE`.

## Wiki Alignment

- **Impact**: REQUIRED (owned by US-012).
- **Local entries**: `wiki/prompt-miner.md` to create (architecture/harness-mechanism page).
- **Spec alignment**: the entry must explain the collect→score→rank→mine→feed-back pipeline, both harnesses' trace paths/schemas, the friction+ground-truth scoring model (proxy caveat), the falsifiable marker schema + stratification rule, and the interactive vs. cron (`/ship-spec` to origin) feedback paths — with relevant source files, line-cited claims, a System Relationships diagram, and `## See Also`.
- **DeepWiki comparison**: no relevant DeepWiki page exists for prompt-trace mining — net-new subsystem with no counterpart on https://deepwiki.com/mifunedev/openharness; the entry establishes the page rather than reconciling. Recorded explicitly in the entry.
- **Acceptance criteria**: see US-012.

## Success Metrics

- `node --test` suite green; `evals/probes/prompt-miner-schema-compat.sh` PASS; full `/eval` shows no new green→red regression.
- A real run produces a ranked report where PR-bearing sessions cluster near the top and every score is reconstructable from its `scoreBreakdown`.
- `git status` after a run shows only gitignored `memory/<date>/` artifacts — no transcripts staged.
- The cron parses cleanly (no `SCHED_INVALID`/`ID_MISMATCH`), defaults `enabled: false`, and a `--report-only` dry fire proposes no MEMORY/IDENTITY writes.

## Open Questions

- Initial default `--weights` and the `correctionDensity` lexicon need tuning against a small hand-labeled sample once real rankings are inspected (follow-up calibration, not a v1 blocker).
- Minimum corpus size before flipping the cron to `enabled: true` (the `NO-CORPUS`/`NO-CANDIDATE` gates make a premature enable harmless, but document the expected ramp).
- Whether to later promote the most durable markers into a standalone prompting-guide doc/wiki sub-article (deferred; interactive gate covers v1).
