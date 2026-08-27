---
title: "Pi dynamic workflows"
---

# Pi dynamic workflows

Open Harness enables [`pi-dynamic-workflows`](https://github.com/Michaelliv/pi-dynamic-workflows) as a default project-local Pi package. The package registers a `workflow` tool that lets the parent Pi agent write a small deterministic JavaScript workflow, fan work out to isolated in-memory subagents, and synthesize the results.

Use it for multi-perspective codebase audits, fan-out research, large review sweeps, and parallel analysis where one sequential assistant turn would be too slow or too narrow.

## Verify package support

The package is pinned in `.pi/settings.json` to the upstream `v1.0.1` commit for supply-chain stability:

```json
"git:github.com/Michaelliv/pi-dynamic-workflows@dbc6800d1f725f7439e51705e2664c59484afcd1"
```

That commit corresponds to upstream tag `v1.0.1` / npm package `pi-dynamic-workflows@1.0.1`.

Pi installs missing project packages automatically after the project is trusted. If you add the package during a running session, reload Pi resources:

```text
/reload
```

## Basic usage

Ask Pi for a workflow in plain language:

```text
Run a workflow to inspect this repository and summarize the main modules.
```

The model can then call the package-provided `workflow` tool with a script shaped like:

```js
export const meta = {
  name: 'inspect_project',
  description: 'Inspect a repository and summarize the main modules',
  phases: [{ title: 'Scan' }, { title: 'Analyze' }],
}

phase('Scan')
const inventory = await agent('Inspect the repository structure.', {
  label: 'repo inventory',
})

phase('Analyze')
const summary = await agent(
  'Summarize the main modules from this inventory:\n' + inventory,
  { label: 'module summary' },
)

return { inventory, summary }
```

The live tool renderer reports phase and subagent progress inline. Press `Esc` to abort a running workflow; active subagents are cancelled and surfaced as skipped.

## Workflow globals

The workflow sandbox exposes these deterministic globals:

| Global | Purpose |
| --- | --- |
| `agent(prompt, opts)` | Spawn one isolated in-memory Pi subagent and return its final text, or a validated object when `opts.schema` is provided. |
| `parallel(thunks)` | Run an array of `() => agent(...)` thunks concurrently and return results in input order. |
| `pipeline(items, ...stages)` | Fan items through sequential processing stages. |
| `phase(title)` | Mark the current progress phase. |
| `log(message)` | Append a workflow-level progress log line. |
| `args` | Optional JSON value passed to the workflow tool. |
| `cwd` / `process.cwd()` | Current working directory for subagents. |
| `budget` | Token budget tracker with `total`, `spent()`, and `remaining()`. |

## Determinism and safety notes

Workflow scripts run in a Node `vm` sandbox. `Date`, `Math.random()`, `require`, dynamic `import`, filesystem APIs, network APIs, and dynamic metadata expressions are intentionally unavailable. This keeps metadata parseable and workflow execution reproducible while keeping subagent access mediated through Pi's normal tool and model runtime.

For editor IntelliSense in reusable workflow files, add:

```js
/// <reference types="pi-dynamic-workflows/workflow" />
```

## See also

- [`pi-dynamic-workflows` README](https://github.com/Michaelliv/pi-dynamic-workflows)
- [`v1.0.1` source commit](https://github.com/Michaelliv/pi-dynamic-workflows/tree/dbc6800d1f725f7439e51705e2664c59484afcd1)
- [Pi packages](../harnesses/pi.md#default-packages)
- [Pi extensions](../harnesses/pi.md#slack-integration)
