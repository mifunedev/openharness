# Security considerations

Open Harness is a **public** repo that runs coding agents with broad
autonomy. This page documents the security boundaries the harness
**already enforces today**, each tied to the real file/mechanism in the
tree, so operators can trust and audit them rather than take them on
faith.

It is a description of *what exists now*, not a roadmap. It adds no new
enforcement. Where a boundary is doctrine (a convention we follow)
rather than a mechanism (code that holds regardless of what an agent
does), it says so.

## How to read this page

| Label | Meaning |
|-------|---------|
| **ENFORCED** | A concrete mechanism in the tree holds the line — a hook, a gitignore rule, a permission deny-list, a shell guard. It does not depend on the model choosing to behave. |
| **RECOMMENDED** | Doctrine or operator hardening only — a convention the harness follows, or a control you should configure outside this repo. Not a hard mechanism yet. |

**Threat model, stated plainly.** The primary threats this page
addresses are *accidental* credential leakage into transcripts/prompt
caches and agents wandering outside their intended surface. The
mechanisms below are strong against those. They are **not** a sandbox
escape prevention against a determined adversary who controls the model —
the guards are pattern-based and the sandbox intentionally trades
isolation for capability (§4, sandbox isolation). Treat every model and
tool output as untrusted (§7, untrusted output).

---

## 1. Secrets stay out of git — **ENFORCED**

Real credentials never enter the tracked checkout. Only no-secret
templates are committed.

- **Mechanism:** [`.gitignore`](../.gitignore)
  - `**/.env*` (`.gitignore:2`) ignores every real env file, anywhere in the tree.
  - `.devcontainer/.harness.yaml.env` (`.gitignore:7`) — a derived env artifact from before 0.4.0. Nothing generates it any more; the ignore line stays one release so a stale local copy is never committed.
  - `/.oh/config.json` (`.gitignore:8`) — host-local harness config.
  - `**/auth.json` and `**/.credentials.json` (`.gitignore:63-64`) — provider auth blobs.
- **Template allowlist:** the *tracked* files are templates that hold no real secrets — e.g. [`.env.example`](../.env.example) and `.claude/.example.env.claude`. The operator copies `.env.example` to the real (gitignored, mode-`0600`) root `.env`; `install.sh` seeds it and `oh secret set <KEY>` edits one key. `.devcontainer/.env` is a symlink to that file, so VS Code "Reopen in Container" reads the same one. The `.env.example` header spells this out, including the warning that the compose default for `SANDBOX_PASSWORD` (`test1234`) is weak and public and must be overridden on any network-reachable deployment.
- **Split by kind:** non-secret settings live in the *tracked* [`oh.json`](../oh.json), never in `.env`. The split is enforced in code — `.oh/cli/src/lib/secrets.ts` owns the secret allow-list and `.oh/cli/src/lib/config-render.ts` refuses to render an allow-listed secret into the compose environment. See [Configuration](configuration.md).
- **In the sandbox:** auth/state persists in the single `/home/sandbox` mount — the named volume `<sandbox-name>_workspace`, or a host path when `storage.homePath` is set — not in the repo. See [`.devcontainer/docker-compose.yml`](../.devcontainer/docker-compose.yml).

**What this does not do:** it does not scan commit *contents* for
secrets pasted into a tracked file by mistake. That is the job of the
guards in §2 plus normal review.

## 2. Secret-exposure guards on commands and file paths — **ENFORCED**

The harness assumes the permission engine can be bypassed (see §4) and
puts deterministic **hooks** in front of every tool call so the line
holds anyway.

- **Command guard:** [`.oh/hooks/deny-env-dump.sh`](../.oh/hooks/deny-env-dump.sh) (PreToolUse `Bash`) is a two-tier scanner over the raw command string:
  - **Deny** — bulk env dumps (`env|`, `set >`, `export -p`, `declare -x`, `compgen -v`, `printenv`, `/proc/*/environ`), shell history dumps, `echo`/`printf` of a secret-named variable (`*TOKEN*`, `*SECRET*`, `*KEY*`, `SLACK_*`, `ANTHROPIC_*`, `GH_TOKEN`, `AWS_SECRET`, …), `Authorization:` headers with variable interpolation, and token-printing CLIs (`gh auth token`, `gcloud auth print-*-token`, `aws configure get`, `kubectl get secret -o yaml/json`, `docker secret/config inspect`).
  - **Deny (paths)** — reading secret-laden files (`.env*`, `*.pem`, `id_rsa*`, `.aws/credentials`, `.netrc`, `.kube/config`, shell history, …) via `cat`/`sed`/`grep`/`base64`/… , with a basename allowlist that exempts the tracked `*.env.example`/`.sample`/`.template` templates.
  - **Deny (operator-only dir)** — *any* command naming the `.config/` directory as a path segment, at the repo root or in `$HOME`. This tier is verb-agnostic on purpose: the operator owns the directory outright, so read, write, traversal, and archive routes are all closed rather than enumerated (a verb allowlist leaks through `python`/`node`/`perl`/`tar` and every tool added later). Anchored to a whole path segment, so `jest.config.js`, `--config foo`, `git config`, and `.oh/config.json` are unaffected.
  - **Ask** — narrow reads like `printenv VAR` that *might* be public.
  - It strips HEREDOC bodies first (`deny-env-dump.sh:20-23`) so a PR/commit body that merely *mentions* `cat .env` is not falsely denied.
- **File-path guard:** [`.oh/hooks/deny-secret-paths.sh`](../.oh/hooks/deny-secret-paths.sh) (PreToolUse `Read|Write|Edit|NotebookEdit|Grep|Glob`) blocks the same credential-path family for the file tools, mirroring the deny globs, and denies the operator-only `.config/` directory for both read and write. It scans every path-shaped field of `tool_input` (`file_path`, `notebook_path`, `path`, `glob`) so `Grep`/`Glob` cannot walk into a denied directory that `Read` is blocked from; Grep's `pattern` is a content regex, not a path, and is deliberately not scanned.
- **Permission deny-list + wiring:** [`.claude/settings.json`](../.claude/settings.json) — `permissions.deny` (lines 4-78) lists the same `Read(...)`/`Write(...)`/`Edit(...)`/`Bash(...)` globs, and `hooks.PreToolUse` (lines 82-109) wires both scripts. `defaultMode` is `bypassPermissions` (`.claude/settings.json:79`), which is **exactly why** the hooks exist: deny-list rules alone are skipped under bypass mode, so the hooks re-assert them.
- **Non-blocking warn:** [`.oh/hooks/warn-devtcp.sh`](../.oh/hooks/warn-devtcp.sh) prints a stderr warning (never blocks) when a command uses `/dev/tcp` or `/dev/udp`.

**Safe pattern — `-F <file>` / `--body-file`.** The command guard scans
the raw command *string*. When a commit message or PR body legitimately
contains a substring the guard flags (e.g. the literal text `.env` or a
secret-shaped word), do **not** rewrite the prose — write it to a file
and pass the file: `git commit -F msg.txt`, `gh pr create --body-file
body.md`. The text then never appears in the command string, and the
guard's HEREDOC stripping covers the `$(cat <<'EOF' … EOF)` form too.

**Honest limit:** these guards are pattern-based. They stop the common
*accidental* leak paths and hold under `bypassPermissions`; they are not
a complete defense against an adversary deliberately crafting a novel
exfiltration command. Do not retry a variant that bypasses a deny — the
guard message says as much.

## 3. Destructive-command guard — cc-safety-net@1.0.6 — **ENFORCED**

A **complementary** layer to §2. The §2 guards stop *secret exposure*;
this one stops *destructive intent* — the "I just `rm -rf`'d the repo"
class of footgun. The two domains do not overlap: cc-safety-net does
**not** scan for secret leakage, and the four `.oh/hooks/` guards remain
wired exactly as §2 describes. Both fire on the same `PreToolUse`/`Bash`
event.

- **What it is:** [cc-safety-net](https://github.com/kenryu42/cc-safety-net) `@1.0.6` (MIT), a community-maintained `PreToolUse` hook that **semantically parses** the Bash command (via `shell-quote`, not a regex) and denies destructive intent: `rm -rf` targets, `git reset --hard`, `git checkout --` discards, `git push --force`, `git stash clear`, `git clean -f`, `find -delete`, `dd`/`mkfs`/`shred`, and destructive interpreter one-liners. Semantic parsing means shell-wrapper evasion (`bash -c "…"`, `xargs`, command chaining) is followed and blocked too, not just the surface form.
- **Fail-closed under STRICT:** `CC_SAFETY_NET_STRICT=1` (`docker-compose.yml:69`) closes the one fail-open hole — unparseable shell syntax **ALLOWS** by default; STRICT **denies** it. Malformed input JSON is denied unconditionally (source-verified). `CC_SAFETY_NET_WORKTREE=1` (`docker-compose.yml:70`) unblocks *bare* `git reset --hard` / `clean -fd` / `checkout -- .` inside a verified linked worktree (cron and build worktrees live there) without unblocking `reset --hard <ref>`. No `PARANOID`/`DEBUG` modes.
- **Why a hook, not a prompt:** same rationale as §2 — the sandbox runs with `bypassPermissions` / `approval_policy=never`, so the permission engine is off (§4, Caveat 2) and hooks are the *only* enforcement layer. **A prompt asks; a hook enforces** (§7). Docker remains the real security boundary; this is a footgun net, not a sandbox (see the honesty note in the runbook below).
- **Per-provider wiring:**
  - **claude** — a guard-wrapped entry appended to `PreToolUse`→`Bash`→`hooks[]` in [`.claude/settings.json`](../.claude/settings.json):87: `sh -c '[ "$CC_SAFETY_NET_OFF" = "1" ] || ! command -v cc-safety-net >/dev/null 2>&1 || exec cc-safety-net hook --claude-code'`. The `command -v` clause makes the hook a clean **no-op when the binary is absent** (outside the built sandbox image — CI checkouts, host clones, `projects/` clones) instead of emitting `exec: cc-safety-net: not found` on every Bash call; loud enforcement of the binary's presence stays at the STRICT-scoped boot gate (`link-providers.sh`), never on the per-command hot path. The existing §2 hook entries are byte-for-byte unchanged.
  - **codex** — the *same* guard-wrapped command appended as a second `PreToolUse`/`Bash` entry in [`.codex/hooks.json`](../.codex/hooks.json):14 (codex reads Claude-format hook entries); its pre-existing `deny-env-dump.sh` wrapper is unchanged.
  - **pi** — no command wrapper: `"npm:cc-safety-net@1.0.6"` is pinned in `packages` of [`.pi/settings.json`](../.pi/settings.json):29, and the package's native extension auto-registers on `bash`/`Shell` tool calls and fails closed in source. The RETIRED `RISKY_BASH` branch of [`.pi/extensions/path-guard.ts`](../.pi/extensions/path-guard.ts) (dead code in both headless and TUI modes) is superseded by it; `path-guard.ts` now guards sensitive-path writes/edits only.
- **Binary + boot gate:** the pinned binary is baked into the image at build time (`RUN npm install -g cc-safety-net@1.0.6`, [`.devcontainer/Dockerfile:146`](../.devcontainer/Dockerfile)) — boot and hook execution perform **zero** npm-registry access (avoids the #639 boot crash-loop class). [`.oh/scripts/link-providers.sh`](../.oh/scripts/link-providers.sh) **fails loudly** if the binary is missing or version-mismatched against the pin, scoped to environments where the guard is enabled (`CC_SAFETY_NET_STRICT=1`, exported by docker-compose inside the sandbox — CI checkouts and pre-rebuild hosts only get an informational note) — **unless** `CC_SAFETY_NET_OFF=1`, which downgrades the failure to a warn-and-continue (the kill-switch must never brick boot).
- **Coverage matrix (post-change):**

  | Provider | Destructive-command guard (cc-safety-net) | Secret-exposure guards (§2, unchanged) |
  |---|---|---|
  | claude | guard-wrapped hook in `.claude/settings.json` | all four `.oh/hooks/` guards |
  | codex | guard-wrapped hook in `.codex/hooks.json` | `deny-env-dump.sh` wrapper only (**pre-existing asymmetry**, unchanged by this task) |
  | pi | `npm:cc-safety-net` package extension (auto-registers, fails closed) | `SENSITIVE_PATHS` confirm — interactive-mode only; a **headless no-op today** (pre-existing gap, named future work) |
  | hermes | **none** — no hook surface + no upstream support (**documented gap**) | none |

- **Eval:** [`.oh/evals/probes/cc-safety-net-wiring.sh`](../.oh/evals/probes/cc-safety-net-wiring.sh) asserts every wiring point above (config entries are repo-static — absence is a REGRESSION, never a SKIP; only the live-binary block test may SKIP when the binary is absent outside the built image).

### Operator runbook

- **False positive? Two overrides.**
  1. **Kill-switch (env-only, no reprovision):** set `CC_SAFETY_NET_OFF=1`. The `sh -c` wrapper on the claude/codex hooks then exits 0 with no output. It affects **newly-spawned provider processes only** — a process already running keeps the guard until it restarts.
  2. **Route the operation through the script:** `bash .oh/scripts/git-maintenance.sh <subcommand>` (`reset-hard <ref>` · `clean` · `branch-delete <branch>` · `worktree-remove <path>` · `push-force <remote> <branch>`). Script-file invocation is not analyzed by the guard, so a legitimate destructive-git op runs while the inline equivalent stays denied. This is how the harness's own automation (the `reset|clean` runner, `/watchdog`, worktree/branch grooming, the `cleanup-tasks` cron) keeps working.
- **THE PI EXCEPTION.** `CC_SAFETY_NET_OFF=1` does **not** affect pi — pi's guard is a *package extension*, not a command wrapper, so it never reads the env flag. To disable on pi: remove `"npm:cc-safety-net@1.0.6"` from `packages` in [`.pi/settings.json`](../.pi/settings.json) and **restart the pi session**.
- **Rollout / restart step (required).** The guard binds at process spawn, so long-lived sessions started **before** the guard landed stay unguarded until restarted — without this step they defeat the purpose indefinitely. After the merge and image rebuild:
  - **Simplest — recreate the container** (restarts every session with the new image + env): `docker compose -f .devcontainer/docker-compose.yml up -d --build` (or `oh sandbox install docker`).
  - **Or restart the long-lived sessions in place:**
    - cron runtime: `systemctl restart openharness-cron.service` — systemd owns the scheduler ([`openharness-cron.service`](../.devcontainer/openharness-cron.service)).
    - `client-slack-pi` (Slack bridge): `gateway pi --restart` (see [Integrations → Slack](integrations/slack.md)).
- **Audit trail.** Every block logs to `~/.cc-safety-net/logs/<session_id>.jsonl` with secrets redacted. The `~/.cc-safety-net` directory is a Docker **named volume** (`docker-compose.yml:57,109`), so the log survives rebuilds.
- **Honesty note — the script-file gap cuts both ways.** The same script-file route the harness uses for its own destructive git is also the model's evasion route: an agent that writes its own `.sh` and runs it bypasses this layer entirely. That is **accepted**. cc-safety-net (per its own README) is a footgun net, not a security control — **Docker is the security boundary** (§4). This layer catches accidents, not a determined adversary who controls the model.

## 4. Sandbox isolation & the Docker-socket caveat — **ENFORCED (with a caveat)**

Agents run inside a container, not on the host.

- **Mechanism:** [`.devcontainer/docker-compose.yml`](../.devcontainer/docker-compose.yml) + [`.devcontainer/devcontainer.json`](../.devcontainer/devcontainer.json) + [`.devcontainer/Dockerfile`](../.devcontainer/Dockerfile). The repo is bind-mounted (`docker-compose.yml:32`); the agent runs as the non-root `sandbox` user (`devcontainer.json:6`); auth lives in named volumes, not on the host FS.
- **Caveat 1 — the Docker socket (OFF by default; opt-in).** `/var/run/docker.sock` is **no longer mounted by default** — it is an explicit opt-in via the [`docker-compose.docker-sock.yml`](../.devcontainer/docker-compose.docker-sock.yml) overlay, applied only when `DOCKER_SOCKET=true` in `.devcontainer/.env`. Both interactive installers prompt for it and **default to off**. Review the downloaded installer before you run it with `bash install.sh`: `install.sh` (the `curl | bash` path) and `oh sandbox install docker` (the `oh` CLI / `get-oh.sh` path). Enabling it is a deliberate capability trade-off: **socket access is effectively host root** (an agent can start a privileged container that mounts the host FS), so the container becomes *isolation for convenience and blast-radius reduction, not a hard security boundary* against a hostile agent. Leave it off unless the agent genuinely must drive Docker; if it must and you still need a hard boundary, run a rootless/proxied Docker. **VS Code "Reopen in Container"** reads `docker-compose.yml` directly and bypasses the wrapper, so it never mounts the socket; to enable it there, add `docker-compose.docker-sock.yml` to `dockerComposeFile` in [`devcontainer.json`](../.devcontainer/devcontainer.json).
- **Caveat 2 — permissions bypassed inside.** `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=true` (`docker-compose.yml:48`) turns off the interactive permission engine inside the sandbox. This is the *reason* the §2 guards are implemented as hooks (which still fire) rather than relying on deny-list prompts (which are skipped).

**Bottom line:** the sandbox reliably keeps agent work off the host
filesystem and out of host user state — a real, enforced boundary. With the
Docker socket left at its default (off) that boundary holds; opting the
socket in trades it away for Docker access and makes the sandbox no longer
an escape-proof jail. Run the harness on hosts and repos you are willing to
expose to whichever trust level you choose.

- **Caveat 3 — `cap_add: SYS_ADMIN` for systemd as PID 1 (REVIEWED trade-off).** systemd is
  PID 1 in the sandbox ([`Dockerfile`](../.devcontainer/Dockerfile) `CMD ["/sbin/init"]`), and
  systemd cannot boot without a **writable** cgroup2 hierarchy. Docker mounts
  `/sys/fs/cgroup` read-only for unprivileged containers, so the compose files grant
  `cap_add: [SYS_ADMIN]`, `security_opt: [apparmor=unconfined]`, and
  `tmpfs: [/run, /run/lock, /sys/fs]`, with `cgroup: private`. The tmpfs on `/sys/fs` leaves
  `/sys/fs/cgroup` unmounted, so systemd mounts cgroup2 there itself; because the container
  has a private cgroup namespace, that mount is rooted at the **container's own cgroup
  subtree**. The host cgroup tree is never exposed.

  `apparmor=unconfined` is required because Docker's `docker-default` AppArmor profile denies
  `mount` **even when `CAP_SYS_ADMIN` is granted**. Without it, PID 1 dies immediately on a
  native Linux host with `Failed to mount tmpfs (type tmpfs) on /run … Permission denied` /
  `Failed to mount API filesystems`. `/run` and `/run/lock` come from Docker for the same
  reason, so systemd performs one mount rather than three. Note that AppArmor's container
  profile is already largely redundant once `CAP_SYS_ADMIN` is granted — its principal
  container-relevant restrictions are mount and a handful of `/proc` writes — so this pairs
  a capability with the profile that would otherwise block that same capability's use.

  **Untested: SELinux hosts.** This shape is verified on Docker Desktop/WSL2 and on a Debian
  Linux runner with AppArmor. On a host running `container-selinux` (Fedora, RHEL, CentOS
  Stream) systemd's mounts may be denied by SELinux instead, which `apparmor=unconfined`
  does not affect. The failure is loud rather than silent — PID 1 exits and the container
  restart-loops — so an affected operator sees it immediately in `oh logs`. Tracked as
  [#960](https://github.com/mifunedev/openharness/issues/960); the supported host baseline
  remains Debian/Ubuntu per
  [Runtimes → Docker](runtimes/docker.md).

  This is the minimum proven necessary, established by testing in increasing order of
  authority against Docker 29.7.2 / cgroup v2 / `cgroupfs` driver:

  | Grant | Result |
  |---|---|
  | Docker defaults | systemd exits at PID 1: `Failed to create /init.scope control group: Read-only file system` |
  | `--cgroupns=private` | same failure — the namespace is already the default; the mount is still `ro` |
  | `+ tmpfs /run,/run/lock` | same failure — `/run` was never the blocker |
  | `+ cap_add SYS_ADMIN` alone | same failure — systemd does not remount an already-mounted `ro` `/sys/fs/cgroup` |
  | `+ tmpfs /sys/fs`, AppArmor enforced | boots on hosts without AppArmor; on a native Linux runner PID 1 dies at `mount … /run: Permission denied` |
  | `--security-opt systempaths=unconfined` | same failure — it does not reach the cgroup mount |
  | `-v /sys/fs/cgroup:/sys/fs/cgroup:rw` | boots, **rejected**: the container gets the host cgroup **root** read-write — it can create cgroups at the host root and write other containers' `cgroup.procs`. Also leaves journald failed and the system `degraded`. |
  | `privileged: true` | boots, **prohibited** by policy and strictly broader than the alternative |
  | **`cap_add SYS_ADMIN` + `apparmor=unconfined` + `tmpfs /run,/run/lock,/sys/fs`** | **boots `running` with zero failed units on both Docker Desktop and a native Linux runner, and `/sys/fs/cgroup` is the container's own private subtree** |

  The residual risk is honest: `CAP_SYS_ADMIN` plus `apparmor=unconfined` is a real
  reduction in confinement — it permits mount operations inside the container's mount
  namespace and is a well-known lateral-movement primitive. It is still less authority than
  `privileged: true` (no extra devices, no unmasked `/proc`, no full capability set, no host
  cgroup access) and, unlike the widely-copied host-cgroup-bind recipe, it exposes **nothing
  belonging to the host** — the trade chosen deliberately, because a sandbox that can write
  the host's cgroup tree and its neighbours' `cgroup.procs` breaks the first non-negotiable
  in `AGENTS.md` (agent work stays inside the sandbox) in a way a mount capability does not. It is also far narrower than the
  Docker socket in Caveat 1, which remains the dominant risk when enabled.
  [`.oh/evals/probes/systemd-sandbox-init.sh`](../.oh/evals/probes/systemd-sandbox-init.sh)
  pins this shape and fails on `privileged: true` or a host cgroup bind;
  [`.oh/evals/probes/tailscale-tool-boundary.sh`](../.oh/evals/probes/tailscale-tool-boundary.sh)
  holds `SYS_ADMIN` as the **only** capability the sandbox may grant, so a networking
  capability can never be added quietly.

- **Caveat 4 — the optional sshd overlay (RECOMMENDED to configure).** The base
  container publishes **no ports** and runs **no** SSH daemon. The opt-in overlay
  ([`.devcontainer/docker-compose.ssh.yml`](../.devcontainer/docker-compose.ssh.yml),
  enabled via `access.ssh: true` in `oh.json`) starts `sshd` and ships a **safe
  default posture**: host bind **loopback-only** (`127.0.0.1`), **public-key auth**,
  `PermitRootLogin no`, and password auth **off**. Two operator choices weaken that
  and are your responsibility: switching the bind to `0.0.0.0` (public interface),
  and enabling password auth while `SANDBOX_PASSWORD` is still the weak default
  (`test1234`). An `oh sandbox install docker` **port-collision preflight**
  ([`.oh/scripts/check-host-port.sh`](../.oh/scripts/check-host-port.sh)) refuses
  to create a container on a port already in use, so enabling SSH or adding a tenant
  can't silently clobber another tenant's port. Setup + the nginx multi-tenant recipe:
  [Integrations → SSH](integrations/sshd.md).

- **Caveat 5 — the Tailscale tool (install-on-request, private-by-default).** Installing
  `tailscale` with `oh tool install tailscale` adds **no container capability**: `tailscaled` runs inside the
  sandbox in **userspace-networking** mode as the unprivileged `sandbox` user, so
  there is no `NET_ADMIN`, no `/dev/net/tun`, no `privileged: true`, and no host
  socket mount. There is no compose addition at all — the verb is the only door,
  nothing installs Tailscale at boot, and daemon state lives in
  `/home/sandbox/.tailscale`, inside the single `/home/sandbox` mount. **No host port is published** — T3 Code stays on
  container loopback `127.0.0.1:3773` and Tailscale Serve proxies tailnet HTTPS to
  it, so a device outside the tailnet has nothing to reach. The posture:
  - **Private tailnet only. Tailscale Funnel is never enabled by default and the
    harness ships no Funnel command or flag.** Funnel would publish a tailnet
    service to the internet; if you want that, you are configuring it yourself,
    outside this tree. For a deliberately *public* preview, use `cloudflared`
    instead and understand that the URL is the only credential.
  - **Installation never joins a tailnet.** The entrypoint installs the binaries and
    stops. It never runs `tailscaled` and never runs `tailscale up`. Joining is an
    explicit interactive human act.
  - **Never print or commit a reusable Tailscale auth key.** The documented and
    supported setup is interactive `tailscale up` with a browser login. If an
    operator insists on auth-key automation, the key is a secret and belongs in the
    gitignored mode-`0600` root `.env` via the §1 secret channel — never in
    `oh.json`, a script, or a log.
  - **Pairing URLs and tokens are secrets.** T3 Code's pairing URL carries a
    single-use token in its fragment. The `/t3` skill keeps the server log under
    `/tmp/agent-t3code.log` and writes no URL into a tracked file. Do not paste a
    pairing URL into an issue, a pull request, a commit message, or chat.
  - **Two revocation paths, both required.** `t3 auth` issues, inspects, and revokes
    T3 sessions and pairing credentials. `tailscale serve --https=443 off` withdraws
    the Serve mapping, which otherwise persists after T3 Code stops.
    `tailscale logout` signs the node out, and the Tailscale admin console deletes
    the device. Revoking one does not revoke the other.

  Setup, lifecycle, and troubleshooting: [Connecting → Mobile access over
  Tailscale](connecting.md#mobile-access-over-tailscale).

## 5. Human merge gate / no auto-merge — **ENFORCED (process) · RECOMMENDED (hard gate)**

No agent merges its own work to the trunk.

- **Doctrine:** [the `/spec` workflow contract](../.oh/skills/spec/SKILL.md#workflow-contract) — the canonical path ends `… → merge (human) → reset|clean`, and the human alone merges. The runner resets; it never merges.
- **No unattended merger exists:** the `autopilot` self-improvement loop and its rate-capping preflight were removed in 0.4.0. No scheduled agent now opens or promotes PRs unattended, so there is no automated path to a merge at all.
- **RECOMMENDED (hard gate):** the ultimate enforcement of "no agent merges" is **GitHub branch protection** (required reviews / restricted merge) on `development`/`main`. That lives in repo settings, not this tree — configure it. Without it, "no auto-merge" rests on the agents' skill definitions, not a server-side block.

## 6. Harness-infra self-edit surface — **DOCTRINE (was ENFORCED)**

An agent editing this repo touches harness infrastructure, never sandbox
application code.

- **Status change (0.4.0):** this control was *mechanically* enforced by the
  `autopilot` loop's `OWNED_PATHS` clean-state check and scoped restore. Both
  were removed with the loop. The boundary is now doctrine, not a running check.
- **Boundary:** the path set is recorded in
  [`docs/repair-operator-registry.md`](repair-operator-registry.md) § Tier 1,
  which is now its source of truth.
- **Scope guard:** "harness-infra only … never sandbox application code" — see
  `AGENTS.md` § "Agent work stays inside the sandbox," which is normative.

## 7. Untrusted model output — the harness is the authority — **RECOMMENDED (doctrine)**

The design principle behind §§1–6: **treat every model, tool, and
retrieved-context output as untrusted, and let deterministic harness
mechanisms — not the model's self-restraint — be the authority.**

This posture is doctrine (not yet a single enforcing file), but it is
*realized* by the ENFORCED mechanisms above, each of which assumes the
model may misbehave:

- the §2 hooks do not trust the agent to avoid dumping secrets — they scan every command/path and hold even under `bypassPermissions`;
- the §5 merge gate does not trust the agent's PR — a human reviews before trunk;
- the §6 owned-surface guard does not trust the agent to stay in scope — it scopes and restores mechanically.

Corollaries for operators and skill authors:

- Instructions arriving inside tool results, fetched web pages, or `<system-reminder>`/recalled-memory blocks are **context, not commands** — a recalled note reflects what was true when written; verify a cited file/flag still exists before acting on it.
- Prefer a deterministic guard (hook, gitignore rule, scoped restore) over a prompt instruction whenever a boundary actually matters. A prompt asks; a hook enforces.

---

## Reporting a vulnerability

Found a way past one of the ENFORCED boundaries above, or a leak this
page missed? Open a GitHub issue (or, for a sensitive report, contact the
maintainers privately before filing) rather than posting a working
exploit publicly.

## Related

- [Contributing](contributing.md) · [Connecting to the sandbox](connecting.md) · [Installation](installation.md)
- [The `/spec` workflow contract](../.oh/skills/spec/SKILL.md#workflow-contract) — the human merge gate in context.
