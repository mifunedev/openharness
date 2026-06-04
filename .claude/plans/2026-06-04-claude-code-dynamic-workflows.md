# Claude Code Dynamic Workflows Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task after the draft PR is reviewed and Ryan confirms. Use `/delegate`-style wave execution. Do **not** use haiku; use the default capable model or sonnet where a model must be explicit.

**Goal:** Add inspectable Claude Code dynamic workflow support to Open Harness so scheduled harness tasks can opt into bounded, reviewable multi-agent workflow prompts instead of raw one-shot prompts.

**Architecture:** Treat dynamic workflows as a prompt/workflow layer around the existing cron runtime rather than introducing a separate orchestration engine. The cron runtime remains the trigger; optional `workflow:` frontmatter selects a built-in wrapper that instructs Claude Code to decompose, gate, execute, verify, and summarize work while preserving current behavior when no workflow is configured.

**Tech Stack:** TypeScript runtime under `scripts/cron-runtime.ts`, Vitest tests, Markdown docs under `crons/README.md` and `docs/harnesses/claude-code.md`, Open Harness wiki for source synthesis.

---

## Research Summary

### Source: Claude Code dynamic workflows docs

Public Claude Code documentation describes dynamic workflows as JavaScript orchestration scripts that coordinate subagents at scale. Relevant capabilities:

- Workflows are intended for high-fanout research, audits, and migrations.
- Claude can generate workflow scripts, but the workflow should be inspectable before execution.
- Workflow-spawned subagents have isolated contexts and return summarized results.
- Subagents can run in background and can use worktree isolation for write-capable tasks.
- Permissions, tool allowlists, sandboxing, hooks, and explicit approval gates remain required safety layers.
- Built-in skills such as `/batch`, `/deep-research`, `/verify`, and `/code-review` demonstrate the pattern: plan first, require approval, run bounded parallel agents, gather artifacts, then verify.

### Source: LinkedIn share

The linked post metadata frames the same opportunity: agent workflows are valuable when the process is inspectable. It mentions visible workflow patterns around chains, parallel review, background runs, forked context, worktrees, artifacts, saved flows, review gates, human-in-the-loop checkpoints, and provider choice.

### Open Harness implication

Open Harness already has most of the primitives:

- `.claude/skills/delegate/SKILL.md` defines dependency analysis, wave execution, validation, and report format.
- `.claude/skills/harness-audit/SKILL.md`, `.claude/skills/strategic-proposal/SKILL.md`, and `.claude/skills/ship-spec/SKILL.md` model staged multi-agent workflows.
- `scripts/cron-runtime.ts` already runs cron bodies through `claude -p`.
- Existing tests cover cron parsing, loading, and lock behavior.

The smallest useful implementation is a first-class `workflow:` cron frontmatter field with built-in workflow prompt wrappers, plus tests and docs. This gives Ryan an inspectable/opt-in path without changing default cron behavior or introducing a new CLI surface prematurely.

---

## Proposed User-Facing Behavior

### Existing cron behavior remains unchanged

```md
---
id: heartbeat
schedule: "0 * * * *"
enabled: true
---

Say hello.
```

Runtime still spawns:

```bash
claude -p "Say hello."
```

### New dynamic workflow opt-in

```md
---
id: weekly-repo-audit
schedule: "0 9 * * 1"
timezone: America/Denver
enabled: true
overlap: false
workflow: delegate
---

Audit the harness docs and wiki for stale Claude Code guidance. Propose fixes, verify them, and summarize artifacts.
```

Runtime spawns `claude -p <wrapped prompt>`, where the wrapper:

1. Preserves the original user task exactly.
2. Requires an inspectable plan before execution.
3. Uses dependency analysis and wave execution for independent subtasks.
4. Uses bounded parallelism and default capable model / no haiku.
5. Requires review/verification gates before finalizing.
6. Produces a structured artifact summary.

### Unknown workflow names fail clearly

If a cron declares `workflow: does-not-exist`, the runtime should log `ERR` for that cron fire and avoid silently falling back to raw prompt execution.

---

## Implementation Tasks

### Task 1: Add cron workflow parsing and prompt construction tests

**Objective:** Define the behavior with failing tests before touching runtime logic.

**Files:**
- Modify: `scripts/__tests__/cron-runtime.test.ts`
- Modify: `scripts/__tests__/cron-runtime.property.test.ts` if needed

**Step 1: Add parser test for `workflow:`**

Add a test under `describe("parseCronFile", ...)`:

```ts
it("parses optional workflow frontmatter", () => {
  const entry = parseCronFile(
    `---\nid: weekly-audit\nschedule: "0 9 * * 1"\nworkflow: delegate\n---\nAudit docs.\n`,
    "weekly-audit.md",
  );

  expect(entry?.workflow).toBe("delegate");
});
```

**Step 2: Add prompt builder tests**

Import `buildAgentPrompt` from `../cron-runtime` and add tests:

```ts
import { acquireLock, buildAgentPrompt, loadCrons, parseCronFile } from "../cron-runtime";
```

Add cases:

```ts
describe("buildAgentPrompt", () => {
  it("returns the raw body when no workflow is configured", () => {
    const entry = parseCronFile(`---\nschedule: "* * * * *"\n---\nRaw task.\n`, "raw.md")!;
    expect(buildAgentPrompt(entry)).toBe("Raw task.\n");
  });

  it("wraps delegate workflow prompts with bounded inspectable orchestration", () => {
    const entry = parseCronFile(
      `---\nschedule: "* * * * *"\nworkflow: delegate\n---\nAudit docs.\n`,
      "audit.md",
    )!;

    const prompt = buildAgentPrompt(entry);
    expect(prompt).toContain("Audit docs.");
    expect(prompt).toContain("inspectable plan");
    expect(prompt).toContain("bounded parallelism");
    expect(prompt).not.toMatch(/haiku/i);
  });

  it("throws for unknown workflow names", () => {
    const entry = parseCronFile(
      `---\nschedule: "* * * * *"\nworkflow: mystery\n---\nTask.\n`,
      "mystery.md",
    )!;

    expect(() => buildAgentPrompt(entry)).toThrow(/Unknown cron workflow/);
  });
});
```

**Step 3: Run tests and verify failure**

Run:

```bash
pnpm exec vitest run scripts/__tests__/cron-runtime.test.ts scripts/__tests__/cron-runtime.property.test.ts
```

Expected before implementation: fail because `workflow` and `buildAgentPrompt` do not exist.

**Step 4: Commit after green implementation in Task 2**

Do not commit red tests alone unless explicitly asked.

---

### Task 2: Implement built-in `delegate` cron workflow wrapper

**Objective:** Add runtime support for `workflow: delegate` while preserving all existing raw cron behavior.

**Files:**
- Modify: `scripts/cron-runtime.ts`

**Step 1: Extend `CronEntry`**

Add:

```ts
workflow?: string;
```

**Step 2: Parse optional workflow frontmatter**

In the returned object from `parseCronFile`, add:

```ts
workflow: fm.workflow || undefined,
```

**Step 3: Add a prompt builder**

Add an exported function near `loadCrons`:

```ts
export function buildAgentPrompt(entry: CronEntry): string {
  if (!entry.workflow) return entry.body;

  if (entry.workflow !== "delegate") {
    throw new Error(`Unknown cron workflow: ${entry.workflow}`);
  }

  return `You are running an Open Harness scheduled dynamic workflow.

Workflow: delegate
Cron ID: ${entry.id}

Original task:
${entry.body}

Before making changes or taking side-effecting actions, create an inspectable plan. Then execute the plan using bounded parallelism only where subtasks are independent. Keep concurrency conservative; prefer correctness, isolation, and reviewability over fanout.

Requirements:
- Use the default capable model for delegated reasoning; do not downshift models.
- Build a dependency graph before spawning agents.
- Use isolated contexts for independent subtasks.
- Use worktree isolation for write-capable parallel work when available.
- Add review gates before finalizing changes.
- Run relevant verification commands and include real outputs in the final report.
- Return a structured summary with tasks, artifacts, changed files, verification, and blockers.
`;
}
```

Important: the prompt must not include the string `haiku`, because Ryan explicitly requested no haiku and the tests should enforce that.

**Step 4: Use `buildAgentPrompt` in `fire`**

Replace:

```ts
const child = spawn(AGENT_BIN, ["-p", entry.body], { stdio: "inherit" });
```

with:

```ts
let prompt: string;
try {
  prompt = buildAgentPrompt(entry);
} catch (e) {
  log(entry.id, "ERR", e instanceof Error ? e.message : String(e));
  return;
}
const child = spawn(AGENT_BIN, ["-p", prompt], { stdio: "inherit" });
```

**Step 5: Run focused tests**

Run:

```bash
pnpm exec vitest run scripts/__tests__/cron-runtime.test.ts scripts/__tests__/cron-runtime.property.test.ts
```

Expected: pass.

**Step 6: Commit**

```bash
git add scripts/cron-runtime.ts scripts/__tests__/cron-runtime.test.ts scripts/__tests__/cron-runtime.property.test.ts
git commit -m "feat: add cron workflow prompt wrapper"
```

---

### Task 3: Document dynamic workflow crons and Claude Code guidance

**Objective:** Make the feature discoverable and explain safety/inspection expectations.

**Files:**
- Modify: `crons/README.md`
- Modify: `docs/harnesses/claude-code.md`
- Modify: `CHANGELOG.md`

**Step 1: Update `crons/README.md`**

Add `workflow` to the frontmatter table or example:

```md
workflow: delegate   # optional; wraps the body in an inspectable dynamic workflow prompt
```

Document:

- Omit `workflow` for raw `claude -p` behavior.
- `workflow: delegate` asks Claude Code to plan, decompose, run bounded parallel subagents, verify, and summarize.
- Unknown workflow names are logged as errors and are not run.

**Step 2: Update `docs/harnesses/claude-code.md`**

Add a section `## Dynamic workflows` covering:

- Claude Code can run workflow-like multi-agent tasks through skills/subagents.
- Open Harness exposes an opt-in scheduled path via cron `workflow: delegate`.
- Workflows must be inspectable, bounded, and verified.
- Write-capable parallel work should use worktrees.
- The wrapper uses the default capable model and does not downshift.

**Step 3: Update `CHANGELOG.md`**

Add an Unreleased bullet:

```md
- Add opt-in `workflow: delegate` cron prompts for inspectable Claude Code dynamic workflows.
```

Preserve the existing changelog format.

**Step 4: Run docs/runtime tests**

Run:

```bash
pnpm exec vitest run scripts/__tests__/cron-runtime.test.ts scripts/__tests__/cron-runtime.property.test.ts
pnpm docs:build
```

If `pnpm docs:build` is too slow or fails due to pre-existing environment issues, capture the exact failure and run the narrower relevant docs checks if available.

**Step 5: Commit**

```bash
git add crons/README.md docs/harnesses/claude-code.md CHANGELOG.md
git commit -m "docs: describe Claude dynamic workflow crons"
```

---

### Task 4: Add wiki synthesis for the LinkedIn/source research

**Objective:** Capture the LinkedIn share and research synthesis in the harness wiki so future agents can load it without re-researching.

**Files:**
- Create: `wiki/raw/<today>-claude-code-dynamic-workflows.md`
- Create or modify: `wiki/claude-code-dynamic-workflows.md`
- Modify: `memory/<today>/log.md`

**Step 1: Snapshot source research**

Use `/wiki-ingest` rules. Because the source is LinkedIn/social, use an explicit slug:

```bash
mkdir -p wiki/raw
```

Create `wiki/raw/<today>-claude-code-dynamic-workflows.md` with:

```md
# Source: https://www.linkedin.com/posts/alindnbrg_claudecode-agentharness-codingagents-share-7466225009481637888-zQxE/

<captured metadata and research notes, including Claude Code docs URLs used>
```

**Step 2: Create wiki entry**

Create `wiki/claude-code-dynamic-workflows.md` with valid frontmatter and ≤600-word body:

```yaml
---
title: "Claude Code Dynamic Workflows"
slug: claude-code-dynamic-workflows
tags: [claude-code, workflows, agents, orchestration]
created: <today>
updated: <today>
sources:
  - raw/<today>-claude-code-dynamic-workflows.md
related: [inspectable-agent-harness]
confidence: provisional
---
```

Include sections:

- `## Summary`
- `## Detail`
- `## See Also`

**Step 3: Log the ingest**

Append a `/wiki-ingest` style entry to `memory/<today>/log.md` per `context/rules/memory.md` and `wiki-ingest` skill.

**Step 4: Verify schema**

Run:

```bash
awk '/^---$/{f=!f; next} f{print}' wiki/claude-code-dynamic-workflows.md
```

Manually confirm required fields exist and `confidence: provisional`.

**Step 5: Commit**

```bash
git add wiki/claude-code-dynamic-workflows.md wiki/raw/<today>-claude-code-dynamic-workflows.md memory/<today>/log.md
git commit -m "docs: add Claude workflow research wiki entry"
```

---

### Task 5: Final integration audit

**Objective:** Verify the complete implementation is coherent, tested, and ready for review.

**Files:**
- Review all changed files from Tasks 2-4

**Step 1: Run focused runtime tests**

```bash
pnpm exec vitest run scripts/__tests__/cron-runtime.test.ts scripts/__tests__/cron-runtime.property.test.ts
```

**Step 2: Run broader project checks**

```bash
pnpm test:scripts
pnpm docs:build
```

**Step 3: Inspect git diff**

```bash
git diff origin/development...HEAD --stat
git diff origin/development...HEAD -- scripts/cron-runtime.ts scripts/__tests__/cron-runtime.test.ts crons/README.md docs/harnesses/claude-code.md CHANGELOG.md wiki/claude-code-dynamic-workflows.md
```

**Step 4: Delegate audit**

Use a fresh reviewer subagent to audit:

- spec compliance against this plan
- no haiku/model downshift references
- default behavior preserved for crons without `workflow`
- unknown workflow error behavior
- docs match runtime behavior
- wiki schema valid

**Step 5: Fix any audit findings and re-run relevant checks**

Do not proceed with known critical or important audit findings.

**Step 6: Push implementation commits to the existing draft PR**

```bash
git push
```

Then report the PR link and verification outputs.

---

## Acceptance Criteria

- [ ] The plan is committed first and opened as a draft PR before implementation.
- [ ] Existing crons without `workflow` continue to pass their body unchanged to `claude -p`.
- [ ] `workflow: delegate` wraps the cron body in a bounded, inspectable, review-gated dynamic workflow prompt.
- [ ] Unknown workflow names log an `ERR` and do not execute the raw task.
- [ ] Tests cover parsing, default prompt behavior, delegate prompt behavior, and unknown workflow handling.
- [ ] The workflow wrapper does not mention or select haiku.
- [ ] Docs explain the feature and safety model.
- [ ] Wiki entry captures the LinkedIn/source research with valid schema.
- [ ] Focused runtime tests pass.
- [ ] Docs build passes or any blocker is reported with exact output.
- [ ] Final implementation is audited by a fresh subagent before asking for merge review.

## Deferred / Explicitly Out of Scope

- No new `oh workflow` CLI command in the MVP.
- No generated JavaScript workflow execution engine in this pass.
- No automatic PR creation from cron workflow runs.
- No change to Claude Code permissions or `--dangerously-skip-permissions` behavior.
- No recursive unbounded agent fanout.
