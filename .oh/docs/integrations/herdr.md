# Herdr

[Herdr](https://herdr.dev/) is Open Harness's primary interactive workspace. Version 0.7.4 is installed in every image with architecture-specific checksum verification.

## Start here

After entering the sandbox, make `herdr` your first command:

```bash
# host
make shell

# first command inside the sandbox
herdr
```

Bare Herdr works before GitHub or provider authentication. It creates or reattaches a workspace for the current repository. Complete GitHub setup, provider authentication, agent sessions, tests, development servers, and reviews from Herdr panes so interactive work stays together.

```bash
# inside the initial Herdr pane
gh auth login && gh auth setup-git
claude auth login                 # or configure codex / pi
claude                            # launch agents from Herdr panes
```

## Agent control skill

Open Harness vendors Herdr's official agent skill at `.oh/skills/herdr/SKILL.md`. Existing shared-skill links expose the same pinned file to Claude Code, Codex, Pi, and optional Hermes without a runtime download. Do not run the upstream global `npx skills` installer inside Open Harness.

The skill activates only when Herdr is explicitly requested. Before controlling a workspace, it requires `HERDR_ENV=1`; an agent outside a Herdr-managed pane must stop rather than inspect or mutate somebody else's focused session. Inside Herdr, the skill teaches agents to inspect panes, split without stealing focus, run and read commands, wait for work, and coordinate helper agents through stable pane IDs.

## Official agent integrations

The entrypoint idempotently installs the integrations bundled with the pinned Herdr binary. Installation is offline, runs as the final `sandbox` user after provider homes are ready, and structurally preserves unrelated settings.

| Open Harness agent | Availability | Herdr integration |
| --- | --- | --- |
| Claude Code | default | session identity and native restore |
| Codex | default | session identity and native restore |
| Pi | default | lifecycle state and native restore |
| OpenCode | when `install.opencode: true` | lifecycle state and native restore |
| Hermes | when `install.hermes: true` | lifecycle, approvals, and native restore |
| DeepAgents / Grok Build | optional | automatic detection only; no official integration exists |

Check the exact bundled integration versions and paths:

```bash
herdr integration status
```

To keep the skill and binary but disable all automatic provider-config mutation, set this in local `harness.yaml` and recreate the container:

```yaml
herdr:
  auto_integrations: false
```

The legacy `.devcontainer/.env` equivalent is `HERDR_AUTO_INTEGRATIONS=false`.

Disable reconciliation **before** manually uninstalling an integration, or the next boot restores it:

```bash
herdr integration uninstall claude # or: codex, pi, opencode
HOME="$(dirname "$HERMES_HOME")" herdr integration uninstall hermes
```

## License and corresponding source

Open Harness distributes the unmodified Herdr v0.7.4 executable under Herdr's
AGPL-3.0-or-later option. Herdr remains a separate work aggregated in the image;
this component notice does not apply the AGPL to Open Harness or other separate
image contents. The image keeps its legal payload and conservative corresponding
source outside the project bind mount:

```text
/usr/share/doc/herdr/LICENSE
/usr/share/doc/herdr/NOTICE
/usr/share/doc/herdr/SOURCE-OFFER
/usr/share/src/herdr/herdr-0.7.4-corresponding-source.tar.gz
/usr/share/src/herdr/herdr-0.7.4-corresponding-source.tar.gz.sha256
```

Read and verify it in a running sandbox:

```bash
CID=$(bash .oh/scripts/docker-compose.sh ps -q sandbox)
docker exec "$CID" sh -c '
  cd /usr/share/src/herdr
  sha256sum -c herdr-0.7.4-corresponding-source.tar.gz.sha256
  listing=$(mktemp)
  trap '\''rm -f "$listing"'\'' EXIT
  tar -tzf herdr-0.7.4-corresponding-source.tar.gz > "$listing"
  grep -m 5 vendor/cargo/ "$listing"
  grep -m 5 vendor/zig-global-cache/p/ "$listing"
  cat /usr/share/doc/herdr/NOTICE
  cat /usr/share/doc/herdr/SOURCE-OFFER
'
# expected corresponding-source SHA-256:
# 46978a7b059db39271124b0430b4cbe0db3e3a3dc12b264d39fcbd00be00b096
```

Or retrieve it without starting the image:

```bash
IMAGE=ghcr.io/mifunedev/openharness:<CalVer>
docker create --name herdr-source "$IMAGE"
docker cp herdr-source:/usr/share/src/herdr/herdr-0.7.4-corresponding-source.tar.gz .
docker cp herdr-source:/usr/share/src/herdr/herdr-0.7.4-corresponding-source.tar.gz.sha256 .
docker cp herdr-source:/usr/share/doc/herdr/LICENSE ./herdr-0.7.4-LICENSE
docker cp herdr-source:/usr/share/doc/herdr/NOTICE ./herdr-0.7.4-NOTICE
docker cp herdr-source:/usr/share/doc/herdr/SOURCE-OFFER ./herdr-0.7.4-SOURCE-OFFER
docker rm herdr-source
sha256sum -c herdr-0.7.4-corresponding-source.tar.gz.sha256
```

Every tagged Open Harness release containing this component also attaches the
bundle, checksum, NOTICE, source-access information, and license. Get the direct
asset URL and expected SHA from the image rather than guessing a tag. The URL is
checksum-verifiable; it is not described as an immutable storage guarantee:

```bash
docker image inspect "$IMAGE" --format \
  '{{ index .Config.Labels "dev.openharness.herdr.source.url" }} {{ index .Config.Labels "dev.openharness.herdr.source.sha256" }}'
```

The bundle contains the exact upstream repository tree at commit
`50aaa2ec046ee26ff407c20f49de496f522512a8`, renamed `herdr-0.7.4`, including
`Cargo.lock`, `Cargo.toml`, `build.rs`, and upstream's vendored patched
`portable-pty` and `libghostty-vt` code. For conservative completeness it also
includes all locked Rust registry and Git dependency sources under
`vendor/cargo`, plus exactly the 36 Zig package-source directories named by
`vendor/libghostty-vt/build.zig.zon.json` under `vendor/zig-global-cache/p`.
Cargo 1.96.1, Zig 0.15.2, and Python 3 create and validate those caches. The
bundle's build note gives the exact Zig fetch flags and offline cache setup.
Generated Zig local caches and build outputs are excluded, while legitimate
upstream and fetched executable modes and symlinks are preserved. Metadata is
normalized with `SOURCE_DATE_EPOCH=1784133039`. Open Harness does not claim a
rebuild will produce a byte-identical executable. Herdr and its source are
provided without warranty as described by the included license.

A Herdr upgrade is atomic at the Open Harness image/release boundary: update the
binary version and architecture checksums, upstream commit and archive checksum,
corresponding-source checksum, vendored skill, legal metadata, integration
fixtures, image labels, and five release assets together. Release CI verifies
the upstream `v0.7.4` tag's dereferenced commit, independently generates the
bundle from the same pinned Docker source stage that the full image reuses,
asserts its canonical SHA before building or publishing, and refuses mutable
asset or version-tag overwrite.

## Configuration

Herdr works without a config file. Open Harness intentionally does not seed one: this preserves Herdr's first-run onboarding and lets its integrations tab explain detected agents. User choices persist at `~/.config/herdr/config.toml` in the shared `config-dir` volume.

Inspect the resolved path and defaults:

```bash
herdr --help
herdr --default-config
```

To create a full config only when one does not already exist:

```bash
mkdir -p ~/.config/herdr
test -e ~/.config/herdr/config.toml || herdr --default-config > ~/.config/herdr/config.toml
```

The upstream defaults already fit Open Harness: new panes use `$SHELL`, child panes follow the current working directory, Herdr-created worktrees live under `~/.herdr/worktrees`, and supported agent sessions resume after a Herdr server restart. Open Harness does not enable pane screen-history persistence because saved terminal contents can include prompts, output, or secrets.

After editing, apply non-startup settings with:

```bash
herdr server reload-config
```

See Herdr's [configuration guide](https://herdr.dev/docs/configuration/) and [config reference](https://herdr.dev/docs/config-reference/) before changing session history, worktree, remote SSH, shell, notification, or keybinding behavior.

## Working model

- Use Herdr workspaces, tabs, and panes for interactive setup, agents, tests, servers, and reviews.
- Detach with `Ctrl-b q`; run `herdr` again to reattach while the container keeps running.
- Open Harness automation worktrees stay under `.oh/worktrees`; open those paths in Herdr. Herdr-created worktrees default to `~/.herdr/worktrees`.
- Cron, Slack gateway, watchdog, and other headless infrastructure remain in their existing tmux sessions. Do not run Herdr inside those managed sessions.
- A raw shell or direct agent command remains a recovery path if Herdr is unavailable.

## Persistence

- `~/.config/herdr` (in the shared `config-dir` volume): configuration, logs, and session metadata.
- `~/.herdr` (in `herdr-data`): Herdr-created worktrees and related data.
- Provider integration files persist in the existing Claude, Codex, Pi, shared XDG, or project-local Hermes state.

`make stop` and normal rebuilds preserve metadata and layout in these volumes, but stopped containers do not preserve running agent, test, or server processes. `make destroy` runs Compose with `-v` and removes the named volumes too.

## Troubleshooting

```bash
herdr --version
herdr status
herdr --help
herdr integration status
herdr server reload-config
herdr server stop              # end a broken Herdr server
herdr --no-session             # run Herdr without its server/client session
```

Herdr is pinned in the Open Harness image. Upgrade the binary, vendored skill, checksums, integration fixtures, and documentation together through a reviewed Open Harness release rather than self-updating `/usr/local/bin/herdr`.

See the upstream [quick start](https://herdr.dev/docs/quick-start/), [agents guide](https://herdr.dev/docs/agents/), [integrations](https://herdr.dev/docs/integrations/), and [agent skill](https://herdr.dev/docs/agent-skill/).
