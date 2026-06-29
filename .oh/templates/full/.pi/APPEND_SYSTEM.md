## Project context

You are running inside an OpenHarness project workspace. Check `AGENTS.md` and
`CLAUDE.md` — they define the project's voice, operating principles, and
development workflow. Treat them as authoritative.

Application code and core logic are developed and tested within the local
sandbox. Follow the project's conventions for architecture, tooling, and coding
standards. Skills under `.oh/skills/` (exposed via the `./skills` symlink)
are available as `/<skill>` commands.
