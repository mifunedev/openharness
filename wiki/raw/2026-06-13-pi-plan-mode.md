# Snapshot: @narumitw/pi-plan-mode

Source URL: https://pi.dev/packages/@narumitw/pi-plan-mode
Fetched via npm metadata/package tarball on 2026-06-13 UTC.

## Package metadata

- Package: `@narumitw/pi-plan-mode`
- Version: `0.4.2`
- Description: Pi extension that adds a Codex-like read-only `/plan` collaboration mode.
- Repository: https://github.com/narumiruna/pi-extensions/tree/main/extensions/pi-plan-mode
- Pi extension entrypoint: `package.json` declares `pi.extensions: ["./src/plan-mode.ts"]`.
- License: MIT

## README excerpt

`@narumitw/pi-plan-mode` adds a Codex-like `/plan` collaboration mode to Pi. Plan mode is for read-only exploration, clarifying questions, and a final implementation-ready `<proposed_plan>` block before any code mutation happens. Pi core intentionally does not ship a built-in plan mode; this package provides one as an independently installable extension.

Features listed by the package include:

- Adds `/plan` to enter or manage Plan mode.
- Adds `--plan` to start a session in Plan mode.
- Enables built-in read-only tools by default while Plan mode is active.
- Disables extension and custom tools by default, with a `/plan tools` selector for explicit user-risk opt-in.
- Blocks mutating built-in tools and bash commands such as `rm`, `git commit`, dependency installs, redirects, and editor launches.
- Injects Codex-like Plan mode instructions: explore first, ask decision questions for high-impact ambiguity, do not mutate files, and finish with `<proposed_plan>` only when decision-complete.
- Adds a required `plan_mode_question` tool so the agent can ask structured Plan-mode questions before finalizing a plan.
- Detects proposed plan blocks and prompts you to implement, stay in Plan mode, or exit and discard the plan.
- Shows Plan mode state in Pi's statusline as `📝 plan active` or `📝 plan ready`.
- Persists Plan mode state in the Pi session so resume restores the mode.

Install/try commands from the package README:

```bash
pi install npm:@narumitw/pi-plan-mode
pi -e npm:@narumitw/pi-plan-mode
```

Usage commands:

```text
/plan
/plan <prompt>
/plan tools
/plan exit
```
