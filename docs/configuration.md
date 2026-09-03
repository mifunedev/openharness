# Configuration

Open Harness has two authored configuration surfaces, split by kind:

| File | Tracked | Holds |
| --- | --- | --- |
| `oh.json` | yes | every non-secret setting |
| `.env` | no — gitignored, mode `0600` | secrets only |

A secret must never reach `oh.json`, because `oh.json` is tracked. A non-secret
must never reach `.env`. The split is enforced in code:
`.oh/cli/src/lib/secrets.ts` owns the secret allow-list,
`.oh/cli/src/lib/oh-config.ts` owns the `oh.json` schema and validator, and
`.oh/cli/src/lib/config-render.ts` refuses to render an allow-listed secret into
the compose environment.

## The two `oh.json` files

The same schema has two homes, and the flag you pass picks one:

| Home | Path | Written by | Holds |
| --- | --- | --- | --- |
| **Registry entry** | `${OH_HOME:-~/.oh}/sandboxes/<name>/oh.json` | `oh sandbox install docker`, then `oh config set --sandbox <name>` | the sandbox: `name`, `runtime`, `repo`, `timezone`, `git.*`, `access.*`, `image.*`, `storage.homePath`, `composeOverrides` |
| **Project** | `<repo>/oh.json` | you, and `oh config set` with no flag | the settings a checkout wants to carry in git |

`oh sandbox install docker` writes the registry entry and, beside it, the
compose files and the compose wrapper. Those are **generated**: the CLI
re-materialises them on every lifecycle call, so edit only `oh.json` there.
A registry entry keeps its own gitignored `.env`, written with
`oh secret set <KEY> --sandbox <name>`.

The project `oh.json` is the seed, not the sandbox. `oh sandbox install docker
--repo <dir>` reads it once to pre-fill the wizard; after that the entry is
authoritative. Nothing else about a checkout is written by the CLI — no
`AGENTS.md`, no provider configuration, no `.gitignore` line other than the
`.env` line `oh secret set` adds inside a git checkout.

`oh config show` prints the resolved `oh.json` and `oh config set <field>
<value>` edits one dotted field in it; `oh secret set <KEY>` prompts for a
credential with the input hidden and writes it to `.env`, and `oh secret list`
shows which keys hold a value with the values redacted. Both accept
`--sandbox <name>` to act on a registry entry instead of the project.
`oh config set` refuses a secret key and `oh secret set` refuses a non-secret
key, each pointing at the other command. Apply a change with
`oh stop <name> && oh sandbox install docker --name <name>`.

## How `oh.json` reaches the sandbox

There are two routes, and which one a field takes follows one rule:

> A value reaches the sandbox through Compose only if a process **outside** the
> sandbox — or the entrypoint **before** the control plane is readable — must act
> on it. Everything else is read from `oh.json` through the `oh` CLI.

**Through Compose.** `.oh/cli/src/lib/config-render.ts` renders those fields into
`KEY=value` lines and `.oh/scripts/docker-compose.sh` passes them to Compose with
`--env-file`. Each also has a default baked into
`.devcontainer/docker-compose.yml`, so an omitted field is not "unset" — it takes
that default. A variable already exported in the shell that runs `oh` beats the
value in `oh.json`.

**Through the CLI.** Everything else is read inside the container at the moment
it is needed — `.devcontainer/entrypoint.sh` calls `oh config show`. Adding a
tool, harness, or setting therefore requires no Compose edit. `config-render.ts`
keeps a `RETIRED_KEYS` list that throws if one of these is ever rendered again.

## Field reference

Types are JSON types. "Compose variable" names the variable the field renders
to; `—` means the field never reaches Compose — it is read through the `oh` CLI,
or consumed by the CLI itself.

### Identity

| Field | Type | Default | Compose variable | What it does |
| --- | --- | --- | --- | --- |
| `version` | number | `1` | — | Schema version. Must be `1`. |
| `name` | string | directory name | `SANDBOX_NAME` | Container and Compose project name. |
| `runtime` | `"docker"` | unset | — | The runtime the entry was provisioned on. `oh sandbox install docker` writes it; `docker` is the only value today. |
| `repo` | string | unset | `OH_REPO_DIR` | Absolute **host** path of a checkout to bind-mount at `/home/sandbox/harness`, set by `oh sandbox install docker --repo <dir>`. It also selects the build-capable compose base and lets a lifecycle verb resolve this sandbox from inside that directory. Unset means image-only: the workspace volume is seeded from the image's `/opt/oh-seed`. |
| `timezone` | string | `America/Los_Angeles` | `TZ` | Timezone for cron schedules and log timestamps. |
| `storage.homePath` | string | unset | `OH_HOME_MOUNT` | Absolute **host** path for the single `/home/sandbox` mount. Leave unset and Docker manages it as the named volume `<name>_workspace`. Must start with `/`; use a dedicated empty directory, since the sandbox takes ownership of it. A stale `OH_HOME_MOUNT` in `.devcontainer/.env` outranks this value, because the wrapper passes the dotenv last. |

### Git identity inside the sandbox

| Field | Type | Default | Compose variable | What it does |
| --- | --- | --- | --- | --- |
| `git.userName` | string | unset | `GIT_USER_NAME` | `user.name` for commits made inside the sandbox. Spaces are fine. |
| `git.userEmail` | string | unset | `GIT_USER_EMAIL` | `user.email` for commits made inside the sandbox. |

### Harness and tool installs

`oh.json` holds no install field. A harness or tool enters the sandbox only when
you run `oh harness install <id>` or `oh tool install <id>`. Nothing installs at
boot. The install lands in `~/.local` inside the persistent home volume, and
`oh destroy` removes it. See
[Harnesses Overview](harnesses/overview.md#installing-a-harness) and
[Installation](installation.md).

### Access

| Field | Type | Default | Compose variable | What it does |
| --- | --- | --- | --- | --- |
| `access.dockerSocket` | boolean | `false` | `DOCKER_SOCKET` | Applies the `docker-compose.docker-sock.yml` overlay. Mounting `/var/run/docker.sock` is effectively HOST ROOT: an agent can start a privileged container that mounts the host filesystem. See [security considerations](security-considerations.md). |
| `access.ssh` | boolean | `false` | `SANDBOX_SSH` | Applies the `docker-compose.ssh.yml` overlay, which runs sshd for direct container SSH. See [sshd](integrations/sshd.md). |
| `access.sshPort` | number (1–65535) | `2222` | `SANDBOX_SSH_PORT` | Host loopback port published for SSH. |
| `access.sshAuthorizedKeys` | string | unset | — | One or more public keys, newline or literal `\n` separated, read by `entrypoint.sh` through `oh config show`. This is public key material, not a secret. Without a key and without password auth nobody can log in, and sshd warns loudly. |
| `access.sshPasswordAuth` | boolean | `false` | — | Enables SSH password auth, which uses the `SANDBOX_PASSWORD` secret. Never enable it on a public-facing bind while `SANDBOX_PASSWORD` is the default. |

### Hermes dashboard

| Field | Type | Default | Compose variable | What it does |
| --- | --- | --- | --- | --- |
| `hermesDashboard.enabled` | boolean | `false` | — | Auto-starts the web dashboard in the `app-hermes-dashboard` tmux session, bound to container loopback. |
| `hermesDashboard.port` | number (1–65535) | `9119` | — | Container loopback port for the dashboard. It is no longer published to the host; reach it from inside the sandbox, or over cloudflared or Tailscale. |

### Cron runtime

| Field | Type | Default | Compose variable | What it does |
| --- | --- | --- | --- | --- |
| `cron.agentBin` | string | `claude` | — | Binary that fires scheduled tasks. |

### Build behaviour

| Field | Type | Default | Compose variable | What it does |
| --- | --- | --- | --- | --- |
| `build.skipPnpmInstall` | boolean | `false` | — | `true` skips the entrypoint's root `pnpm install`. Use it when the dependency tree is managed outside the sandbox. |

### Prebuilt image

Run a published image instead of building from `.devcontainer/Dockerfile`.
Recipe: [`oh sandbox install docker`](deployment-prebuilt-image.md).

| Field | Type | Default | Compose variable | What it does |
| --- | --- | --- | --- | --- |
| `image.ref` | string | `ghcr.io/mifunedev/openharness:latest` | `OH_SANDBOX_IMAGE` | Published image reference. Set it per sandbox with `oh config set --sandbox <name> image.ref <ref>`. |
| `image.mode` | `"build"` \| `"image"` | `build` | — | Whether the lifecycle builds locally or runs `image.ref`. A build happens only when `repo` is also set. Pairs with `oh sandbox install docker --image`. |
| `image.pullPolicy` | `"missing"` \| `"always"` \| `"never"` | `missing` | `OH_PULL_POLICY` | Compose pull policy for `image.ref`. |

### Cloud

| Field | Type | Default | Compose variable | What it does |
| --- | --- | --- | --- | --- |
| `cloud.apiUrl` | string | unset | — | OpenHarness Cloud API base URL used by `oh cloud`. The provisioner key is a secret (`OH_CLOUD_PROVISION_KEY`) and lives in `.env`, never here. |

### Langfuse

Tracing settings the Pi harness reads from its own process environment. They are
not secrets — the Langfuse key pair is, and lives in `.env`. The harness does not
project these into the container: export them in the shell that launches Pi.
They remain settable here so a deployment can record its intended values in one
tracked place.

| Field | Type | Default | Compose variable | What it does |
| --- | --- | --- | --- | --- |
| `langfuse.baseUrl` | string | unset | — | Langfuse host Pi sends traces to, for example `http://langfuse-web:3000`. Takes precedence over `LANGFUSE_HOST`. |
| `langfuse.privacyPreset` | `"metadata-only"` \| `"prompts-only"` \| `"conversations"` \| `"full-debug"` | unset (compose default `metadata-only`) | — | How much of each trace Pi captures. Prefer `metadata-only` unless a broader capture policy is approved. |

### Compose overlays

| Field | Type | Default | Compose variable | What it does |
| --- | --- | --- | --- | --- |
| `composeOverrides` | string[] | `[]` | — | Extra `-f` overlay paths, applied after the built-in overlays selected by `access` (last `-f` wins). |

## Secrets

The allow-list in `.oh/cli/src/lib/secrets.ts` is the complete set of keys the
root `.env` may hold. Each is documented, commented out, in the tracked
`.env.example`:

`GH_TOKEN`, `SANDBOX_PASSWORD`, `XAI_API_KEY`, `PI_SLACK_APP_TOKEN`,
`PI_SLACK_BOT_TOKEN`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`,
`OH_CLOUD_PROVISION_KEY`.

Any other key is rejected by `oh secret set`.

## Settings that are neither

A few variables are read directly from the environment of one process and are
not harness configuration at all, so they appear in neither surface:

- `OH_CLOUD_API_URL` and `OH_CLOUD_PROVISION_KEY` — non-persistent `oh cloud`
  overrides for the persisted `cloud.apiUrl` field and the
  `OH_CLOUD_PROVISION_KEY` secret. `OH_PROVISION_KEY` and `PROVISION_KEY` are
  accepted as legacy spellings. See `.oh/cli/README.md`.

## Retired keys

The directory layout is fixed convention and is no longer configurable.
`WORKTREES_DIR`, `PROJECTS_DIR`, and `CRONS_DIR` were removed;
`config-render.ts` refuses to render them. See
[`.oh/` directory layout](oh-directory-layout.md).
