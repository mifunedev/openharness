# Delegate plan — Codex stale previous_response_id recovery

## PM Analysis

### Task Breakdown
| # | Task | Model | Depends On | Acceptance Criteria |
|---|------|-------|-----------|---------------------|
| 1 | Inspect installed Pi packages and RCA | sonnet | — | Evidence names installed package versions, provider path, stale `previous_response_id` continuation flow, and why existing retry does not fire. |
| 2 | Add non-Slack recovery extension | sonnet | 1 | `.pi/extensions/codex-stale-response-retry.ts` auto-loads with project Pi settings, catches `previous_response_not_found`, re-injects last non-Slack user turn once, and skips Slack prefixes. |
| 3 | Add regression coverage | sonnet | 2 | Vitest covers one retry, top-level error shape, guard exhaustion, re-arm, Slack skip, and unrelated-error ignore; eval probe statically guards extension installation and critical literals. |
| 4 | Document and package PR | haiku | 2,3 | Changelog/docs/task log explain RCA and mitigation; tests/eval pass; branch is pushed and PR opened against `development`. |

### Implementation Contracts

#### Task 1: Inspect installed Pi packages and RCA
- **Input**: Installed packages under `/home/sandbox/.local/lib/node_modules/@earendil-works/pi-coding-agent`, repo `.pi/bridge`, `.pi/npm`, and session error logs.
- **Output**: RCA evidence in PR body and task summary.
- **Acceptance**: Cites installed `@earendil-works/pi-ai@0.79.9` `openai-codex-responses` cached WebSocket continuation and agent retry classifier omission.

#### Task 2: Add non-Slack recovery extension
- **Input**: RCA and existing `.pi/bridge-recovery/index.ts` pattern.
- **Output**: New auto-loaded `.pi/extensions/codex-stale-response-retry.ts`.
- **Acceptance**: On `agent_end`, recoverable non-Slack failed user text is queued once via `sendUserMessage(..., { deliverAs: "followUp" })`; Slack-prefixed text is ignored.

#### Task 3: Add regression coverage
- **Input**: Extension behavior contract.
- **Output**: `.pi/extensions/__tests__/codex-stale-response-retry.test.ts` and `.oh/evals/probes/codex-stale-response-retry.sh`.
- **Acceptance**: Targeted vitest file and probe both pass.

#### Task 4: Document and package PR
- **Input**: Working implementation and verification output.
- **Output**: `CHANGELOG.md`, docs note, task progress, commit, pushed branch, and PR.
- **Acceptance**: PR exists, CI started/checked if available, and PR body includes RCA + verification.

### Scope Boundaries
- **In scope**: Harness-level mitigation for non-Slack Pi/loop/interactive turns using installed package evidence; tests/eval/docs.
- **Out of scope**: Patching upstream `@earendil-works/pi-ai`, changing `node_modules`, disabling Codex WebSocket caching globally, or altering Slack bridge recovery ownership.

### Wave Plan
| Wave | Tasks | Parallelism | Complexity |
|------|-------|-------------|------------|
| 1 | T1 | 1 agent | M |
| 2 | T2 | 1 agent | M |
| 3 | T3, T4 docs draft | 2 agents | M + S |
| 4 | final validation + PR | 1 agent | M |

### Estimated Complexity
Medium — the runtime bug lives in upstream installed Pi packages, but the harness mitigation is a small extension plus focused regression coverage.
