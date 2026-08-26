## Project context

You are running inside a project workspace. Read `AGENTS.md` (and `CLAUDE.md`, which is
an alias of it) if present — they define the project's voice, operating principles, and
development workflow. Treat them as authoritative for how work happens here.

Application code and core logic are developed and tested within the local environment.
Refer to project conventions for architecture patterns, tooling, and coding standards.

## Skills

`.prime/agent/skills` is a symlink into the vendored Open Harness primitive pack at
`.oh/skills`. Every skill you discover there is shared with the other harnesses in this
repo — a skill is authored once and read by all of them. Prefer an existing skill over
re-deriving its procedure, and read the skill's own `SKILL.md` before acting on its topic.
