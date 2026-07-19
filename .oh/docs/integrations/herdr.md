# Herdr

[Herdr](https://herdr.dev/) is installed in every Open Harness image. It provides a single terminal workspace for running and switching between multiple coding-agent sessions.

From the project root inside the sandbox:

```bash
herdr
```

Herdr discovers supported agent CLIs already shipped by Open Harness. Its configuration (`~/.config/herdr`) persists in the shared `config-dir` volume, while session/worktree state (`~/.herdr`) uses `herdr-data`; both survive container rebuilds.

Use Herdr's built-in updater for the direct install:

```bash
herdr update
```

See the upstream [quick start](https://herdr.dev/docs/quick-start/) and [configuration reference](https://herdr.dev/docs/configuration/) for keybindings and customization.
