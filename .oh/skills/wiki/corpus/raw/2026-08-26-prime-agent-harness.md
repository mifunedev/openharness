# Source: in-repo capture — the prime-agent provider surface

Capture date: 2026-08-26 (UTC). Captured from the working tree of branch
`feat/838-prime-agent-harness` (issue #838, PR #839), scaffold commit `b1651ff5`.
Verbatim excerpts read directly out of the repository files the
`prime-agent-harness.md` wiki entry cites, plus the upstream facts read out of
the installed `prime-agent@0.8.1` package. This file is **provenance**, not a
restatement of the entry.

## Captured repository files

| Path | Change | Anchor at capture |
| --- | --- | --- |
| `.oh/scripts/link-providers.sh` | edited | `provider_links` row at `:46`; `print_state()` at `:92`; success line at `:253` |
| `.oh/cli/src/commands/init.ts` | edited | `PROVIDER_LINKS` row at `:548`; summary at `:368` |
| `.oh/cli/src/lib/harnesses/catalog.ts` | edited | entry at `:209`–`:220`; `installArgv` literal at `:215` |
| `.oh/evals/probes/skills-vendored.sh` | edited | resolve loop at `:37`; clean-clone assert at `:59` |
| `.devcontainer/entrypoint.sh` | edited | chown list at `:28` |
| `.prime/agent/settings.json` | created | 4 keys, no model pin |
| `.prime/agent/APPEND_SYSTEM.md` | created | project-context + skills sections |
| `.prime/agent/.gitignore` | created | `sessions/`, `telemetry.json` |
| `.oh/docs/harnesses/prime-agent.md` | created | the harness doc the catalog's `docsPath` requires |

## Verbatim excerpts

`.oh/scripts/link-providers.sh:39-47`:

```bash
provider_links=(
  ".pi/skills|../.oh/skills"
  ".claude/skills|../.oh/skills"
  ".codex/skills|../.oh/skills"
  ".claude/agents|../.oh/agents"
  ".claude/hooks|../.oh/hooks"
  ".codex/agents|../.claude/agents"
  ".prime/agent/skills|../../.oh/skills"
)
```

`.oh/cli/src/commands/init.ts:540-549`:

```ts
const PROVIDER_LINKS: [string, string][] = [
  [".pi/skills", "../.oh/skills"],
  [".claude/skills", "../.oh/skills"],
  [".codex/skills", "../.oh/skills"],
  [".claude/agents", "../.oh/agents"],
  [".claude/hooks", "../.oh/hooks"],
  [".codex/agents", "../.claude/agents"],
  [".codex/specs", "../.claude/specs"],
  [".prime/agent/skills", "../../.oh/skills"],
];
```

`.oh/cli/src/lib/harnesses/catalog.ts:209-220`:

```ts
    id: "prime-agent",
    title: "Prime Agent",
    binary: "prime-agent",
    installArgv: [
      "bash",
      "-lc",
      "curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh | PRIME_AGENT_BOOTSTRAP_KERNEL_ON_INSTALL=0 npm_config_prefix=/home/sandbox/.local setsid --wait sh",
    ],
    installUser: "sandbox",
    verifyArgv: ["prime-agent", "--version"],
    docsPath: ".oh/docs/harnesses/prime-agent.md",
    kind: "on-demand",
```

## Upstream facts, read from prime-agent@0.8.1

Installed to `/home/sandbox/.local/lib/node_modules/prime-agent/` on 2026-08-26.
`prime-agent --version` printed `0.8.1`.

From the package's own `docs/skills.md` § Locations:

> Prime Agent loads skills from:
> - Global: `~/.prime/agent/skills/`, `~/.agents/skills/`
> - Project: `.prime/agent/skills/`, `.agents/skills/` in `cwd` and ancestor directories
> …
> - In all skill locations, directories containing `SKILL.md` are discovered recursively

> Prime Agent implements the [Agent Skills standard](https://agentskills.io/specification),
> warning about violations but remaining lenient.

From `docs/usage.md:146-151` — System Prompt Files:

> Replace the default system prompt with:
> - `.prime/agent/SYSTEM.md` for a project
> - `~/.prime/agent/SYSTEM.md` globally
>
> Append to the default prompt without replacing it with `APPEND_SYSTEM.md` in either location.

From `docs/usage.md:142`:

> Use context files for project conventions, commands, safety rules, and preferences.
> Disable loading with `--no-context-files` or `-nc`.

(`prime-agent --help` lists `-nc, --no-context-files  Disable AGENTS.md and CLAUDE.md
discovery` — the native context-file support that makes a provider alias unnecessary.)

From `docs/settings.md:7-8`:

> | `~/.prime/agent/settings.json` | Global (all projects) |
> | `.prime/agent/settings.json` | Project (current directory) |

From `docs/settings.md:71`:

> A random installation ID is stored as `telemetry.json` in the configured agent directory
> (normally `~/.prime/agent/`).

From `docs/providers.md:16-20` — Subscriptions: ChatGPT Plus/Pro (Codex), Claude Pro/Max,
GitHub Copilot. `docs/providers.md:245`: resolution order is environment variable, then the
`auth.json` entry.

Settings keys used by the committed `settings.json`, all confirmed present in
`docs/settings.md`: `defaultThinkingLevel` (`:20`), `theme` (`:41`), `steeringMode`
(`:168`), `followUpMode` (`:169`).

## The installer's interactive prompts

`install.sh` (fetched 2026-08-26, 1620 lines) calls `confirm_install` and
`confirm_kernel_runtime_setup` from `main`. Both call `prime_agent_prompt_yes_no`, which at
`:813` does `if ( : <>/dev/tty ) 2>/dev/null; then prompt_input=tty; exec 3<>/dev/tty`.

That is why redirecting stdin does not silence them: the prompt reads the controlling
terminal directly, not stdin. `confirm_install:1543` prints `No terminal detected;
continuing without confirmation.` and returns 0 when the helper reports status 2 (no
controlling terminal). `setsid` produces exactly that condition.

Observed on a real run in the sandbox: the piped installer printed
`No terminal detected; continuing without confirmation.`, verified the tarball checksum
(`prime-agent-0.8.1.tgz: OK`), and reported `Prime Agent was installed successfully.`

An earlier run without `npm_config_prefix` failed with
`EACCES: permission denied, mkdir '/usr/lib/node_modules/prime-agent'` — the sandbox user's
default npm prefix is `/usr`, which is root-owned. That failure is the reason the argv sets
the prefix explicitly.
