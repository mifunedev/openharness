# Hermes runtime home

The image defaults `HERMES_HOME` to `/home/sandbox/harness/.hermes`.
Install Hermes with `oh harness install hermes` inside the sandbox.
The command sets the runtime home before installation and verifies integration.
The program and virtual environment remain in `~/.local/lib/hermes-agent`.
Nothing installs Hermes at boot.

Configuration, memory, skills, sessions, and auth live here. Runtime contents are
gitignored. Keep `auth.json` on the same filesystem as its temporary files; do not
symlink auth to another volume.

Installation and boot use the canonical provider linker for one additive link:

```text
.hermes/skills/openharness -> ../../.oh/skills
```

Hermes-native and user skills remain beside that link. Repeated installation repairs
missing integration. Conflicting occupied paths remain untouched and produce an error.
The link does not make shared content trusted; Hermes can warn when reading it.

In image-only sandboxes, this directory resides in the home volume. With a checkout
bind, it resides in the checkout. Restart preserves both. Removing the home volume
deletes image-only state but not a separately bound checkout.

Old containers need image recreation to inherit the new image environment. Do not
merge populated `~/.hermes` and `~/harness/.hermes` automatically.

See [Hermes onboarding](../docs/harnesses/hermes.md) for setup, persistence, and gateway
commands. The managed installer includes Slack, Teams, web, and PTY extras in the
same virtual environment as the Hermes executable.
