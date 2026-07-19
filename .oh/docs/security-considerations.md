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

- **Mechanism:** [`.gitignore`](../../.gitignore)
  - `**/.env*` (`.gitignore:2`) ignores every real env file, anywhere in the tree.
  - `.devcontainer/.harness.yaml.env` (`.gitignore:7`) — the derived env artifact the Makefile generates from `harness.yaml`.
  - `/.oh/config.json` (`.gitignore:8`) — host-local harness config.
  - `**/auth.json` and `**/.credentials.json` (`.gitignore:63-64`) — provider auth blobs.
- **Template allowlist:** the *tracked* files are templates that hold no real secrets — e.g. [`.devcontainer/.example.env`](../../.devcontainer/.example.env) and `.claude/.example.env.claude`. The operator copies the template to the real (gitignored) `.devcontainer/.env`; `install.sh` writes host defaults there. The `.example.env` header spells this out.
- **In the sandbox:** auth/state persists in Docker **named volumes** (`claude-auth`, `codex-auth`, `pi-auth`, `config-dir`, …), not in the repo — see [`.devcontainer/docker-compose.yml:31-41`](../../.devcontainer/docker-compose.yml).

**What this does not do:** it does not scan commit *contents* for
secrets pasted into a tracked file by mistake. That is the job of the
guards in §2 plus normal review.

## 2. Secret-exposure guards on commands and file paths — **ENFORCED**

The harness assumes the permission engine can be bypassed (see §4) and
puts deterministic **hooks** in front of every tool call so the line
holds anyway.

- **Command guard:** [`.oh/hooks/deny-env-dump.sh`](../../.oh/hooks/deny-env-dump.sh) (PreToolUse `Bash`) is a two-tier scanner over the raw command string:
  - **Deny** — bulk env dumps (`env|`, `set >`, `export -p`, `declare -x`, `compgen -v`, `printenv`, `/proc/*/environ`), shell history dumps, `echo`/`printf` of a secret-named variable (`*TOKEN*`, `*SECRET*`, `*KEY*`, `SLACK_*`, `ANTHROPIC_*`, `GH_TOKEN`, `AWS_SECRET`, …), `Authorization:` headers with variable interpolation, and token-printing CLIs (`gh auth token`, `gcloud auth print-*-token`, `aws configure get`, `kubectl get secret -o yaml/json`, `docker secret/config inspect`).
  - **Deny (paths)** — reading secret-laden files (`.env*`, `*.pem`, `id_rsa*`, `.aws/credentials`, `.netrc`, `.kube/config`, shell history, …) via `cat`/`sed`/`grep`/`base64`/… , with a basename allowlist that exempts the tracked `*.env.example`/`.sample`/`.template` templates.
  - **Ask** — narrow reads like `printenv VAR` that *might* be public.
  - It strips HEREDOC bodies first (`deny-env-dump.sh:20-23`) so a PR/commit body that merely *mentions* `cat .env` is not falsely denied.
- **File-path guard:** [`.oh/hooks/deny-secret-paths.sh`](../../.oh/hooks/deny-secret-paths.sh) (PreToolUse `Read|Write|Edit|NotebookEdit`) blocks the same credential-path family for the file tools, mirroring the deny globs.
- **Permission deny-list + wiring:** [`.claude/settings.json`](../../.claude/settings.json) — `permissions.deny` (lines 4-69) lists the same `Read(...)`/`Bash(...)` globs, and `hooks.PreToolUse` (lines 72-96) wires both scripts. `defaultMode` is `bypassPermissions` (`.claude/settings.json:70`), which is **exactly why** the hooks exist: deny-list rules alone are skipped under bypass mode, so the hooks re-assert them.
- **Non-blocking warn:** [`.oh/hooks/warn-devtcp.sh`](../../.oh/hooks/warn-devtcp.sh) prints a stderr warning (never blocks) when a command uses `/dev/tcp` or `/dev/udp`.

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
- **Fail-closed under STRICT:** `CC_SAFETY_NET_STRICT=1` (`docker-compose.yml:69`) closes the one fail-open hole — unparseable shell syntax **ALLOWS** by default; STRICT **denies** it. Malformed input JSON is denied unconditionally (source-verified). `CC_SAFETY_NET_WORKTREE=1` (`docker-compose.yml:70`) unblocks *bare* `git reset --hard` / `clean -fd` / `checkout -- .` inside a verified linked worktree (autopilot builds there) without unblocking `reset --hard <ref>`. No `PARANOID`/`DEBUG` modes.
- **Why a hook, not a prompt:** same rationale as §2 — the sandbox runs with `bypassPermissions` / `approval_policy=never`, so the permission engine is off (§4, Caveat 2) and hooks are the *only* enforcement layer. **A prompt asks; a hook enforces** (§7). Docker remains the real security boundary; this is a footgun net, not a sandbox (see the honesty note in the runbook below).
- **Per-provider wiring:**
  - **claude** — a guard-wrapped entry appended to `PreToolUse`→`Bash`→`hooks[]` in [`.claude/settings.json`](../../.claude/settings.json:87): `sh -c '[ "$CC_SAFETY_NET_OFF" = "1" ] || exec cc-safety-net hook --claude-code'`. The existing §2 hook entries are byte-for-byte unchanged.
  - **codex** — the *same* guard-wrapped command appended as a second `PreToolUse`/`Bash` entry in [`.codex/hooks.json`](../../.codex/hooks.json:14) (codex reads Claude-format hook entries); its pre-existing `deny-env-dump.sh` wrapper is unchanged.
  - **pi** — no command wrapper: `"npm:cc-safety-net@1.0.6"` is pinned in `packages` of [`.pi/settings.json`](../../.pi/settings.json:29), and the package's native extension auto-registers on `bash`/`Shell` tool calls and fails closed in source. The RETIRED `RISKY_BASH` branch of [`.pi/extensions/path-guard.ts`](../../.pi/extensions/path-guard.ts) (dead code in both headless and TUI modes) is superseded by it; `path-guard.ts` now guards sensitive-path writes/edits only.
- **Binary + boot gate:** the pinned binary is baked into the image at build time (`RUN npm install -g cc-safety-net@1.0.6`, [`.devcontainer/Dockerfile:146`](../../.devcontainer/Dockerfile)) — boot and hook execution perform **zero** npm-registry access (avoids the #639 boot crash-loop class). [`.oh/scripts/link-providers.sh`](../../.oh/scripts/link-providers.sh) **fails loudly** if the binary is missing or version-mismatched against the pin, scoped to environments where the guard is enabled (`CC_SAFETY_NET_STRICT=1`, exported by docker-compose inside the sandbox — CI checkouts and pre-rebuild hosts only get an informational note) — **unless** `CC_SAFETY_NET_OFF=1`, which downgrades the failure to a warn-and-continue (the kill-switch must never brick boot).
- **Coverage matrix (post-change):**

  | Provider | Destructive-command guard (cc-safety-net) | Secret-exposure guards (§2, unchanged) |
  |---|---|---|
  | claude | guard-wrapped hook in `.claude/settings.json` | all four `.oh/hooks/` guards |
  | codex | guard-wrapped hook in `.codex/hooks.json` | `deny-env-dump.sh` wrapper only (**pre-existing asymmetry**, unchanged by this task) |
  | pi | `npm:cc-safety-net` package extension (auto-registers, fails closed) | `SENSITIVE_PATHS` confirm — interactive-mode only; a **headless no-op today** (pre-existing gap, named future work) |
  | hermes | **none** — no hook surface + no upstream support (**documented gap**) | none |

- **Eval:** [`.oh/evals/probes/cc-safety-net-wiring.sh`](../../.oh/evals/probes/cc-safety-net-wiring.sh) asserts every wiring point above (config entries are repo-static — absence is a REGRESSION, never a SKIP; only the live-binary block test may SKIP when the binary is absent outside the built image).

### Operator runbook

- **False positive? Two overrides.**
  1. **Kill-switch (env-only, no reprovision):** set `CC_SAFETY_NET_OFF=1`. The `sh -c` wrapper on the claude/codex hooks then exits 0 with no output. It affects **newly-spawned provider processes only** — a process already running keeps the guard until it restarts.
  2. **Route the operation through the script:** `bash .oh/scripts/git-maintenance.sh <subcommand>` (`reset-hard <ref>` · `clean` · `branch-delete <branch>` · `worktree-remove <path>` · `push-force <remote> <branch>`). Script-file invocation is not analyzed by the guard, so a legitimate destructive-git op runs while the inline equivalent stays denied. This is how the harness's own automation (the `reset|clean` runner, `/watchdog`, worktree/branch grooming, the `cleanup-tasks` cron) keeps working.
- **THE PI EXCEPTION.** `CC_SAFETY_NET_OFF=1` does **not** affect pi — pi's guard is a *package extension*, not a command wrapper, so it never reads the env flag. To disable on pi: remove `"npm:cc-safety-net@1.0.6"` from `packages` in [`.pi/settings.json`](../../.pi/settings.json) and **restart the pi session**.
- **Rollout / restart step (required).** The guard binds at process spawn, so long-lived sessions started **before** the guard landed stay unguarded until restarted — without this step they defeat the purpose indefinitely. After the merge and image rebuild:
  - **Simplest — recreate the container** (restarts every session with the new image + env): `docker compose -f .devcontainer/docker-compose.yml up -d --build` (or `make sandbox`).
  - **Or restart the long-lived sessions in place:**
    - `cron-system` (and `autopilot-*` run sessions): `tmux kill-session -t cron-system` — the `cron-watchdog` supervisor respawns it automatically ([`entrypoint.sh:653-656`](../../.devcontainer/entrypoint.sh)); per-run `autopilot-<branch>` sessions are transient and pick up the guard on their next hourly cron.
    - `client-slack-pi` (Slack bridge): `gateway pi --restart` (see [Integrations → Slack](integrations/slack.md)).
- **Audit trail.** Every block logs to `~/.cc-safety-net/logs/<session_id>.jsonl` with secrets redacted. The `~/.cc-safety-net` directory is a Docker **named volume** (`docker-compose.yml:57,109`), so the log survives rebuilds.
- **Honesty note — the script-file gap cuts both ways.** The same script-file route the harness uses for its own destructive git is also the model's evasion route: an agent that writes its own `.sh` and runs it bypasses this layer entirely. That is **accepted**. cc-safety-net (per its own README) is a footgun net, not a security control — **Docker is the security boundary** (§4). This layer catches accidents, not a determined adversary who controls the model.

## 4. Sandbox isolation & the Docker-socket caveat — **ENFORCED (with a caveat)**

Agents run inside a container, not on the host.

- **Mechanism:** [`.devcontainer/docker-compose.yml`](../../.devcontainer/docker-compose.yml) + [`.devcontainer/devcontainer.json`](../../.devcontainer/devcontainer.json) + [`.devcontainer/Dockerfile`](../../.devcontainer/Dockerfile). The repo is bind-mounted (`docker-compose.yml:32`); the agent runs as the non-root `sandbox` user (`devcontainer.json:6`); auth lives in named volumes, not on the host FS.
- **Caveat 1 — the Docker socket (OFF by default; opt-in).** `/var/run/docker.sock` is **no longer mounted by default** — it is an explicit opt-in via the [`docker-compose.docker-sock.yml`](../../.devcontainer/docker-compose.docker-sock.yml) overlay, applied only when `DOCKER_SOCKET` is truthy (`harness.yaml` `sandbox.docker_socket: true`, or `DOCKER_SOCKET=true` in `.devcontainer/.env`). Both interactive installers prompt for it and **default to off**: `install.sh` (the `curl | bash` path) and `oh sandbox` (the `oh` CLI / `get-oh.sh` path). Enabling it is a deliberate capability trade-off: **socket access is effectively host root** (an agent can start a privileged container that mounts the host FS), so the container becomes *isolation for convenience and blast-radius reduction, not a hard security boundary* against a hostile agent. Leave it off unless the agent genuinely must drive Docker; if it must and you still need a hard boundary, run a rootless/proxied Docker. **VS Code "Reopen in Container"** reads `docker-compose.yml` directly and bypasses the wrapper, so it never mounts the socket; to enable it there, add `docker-compose.docker-sock.yml` to `dockerComposeFile` in [`devcontainer.json`](../../.devcontainer/devcontainer.json).
- **Caveat 2 — permissions bypassed inside.** `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=true` (`docker-compose.yml:48`) turns off the interactive permission engine inside the sandbox. This is the *reason* the §2 guards are implemented as hooks (which still fire) rather than relying on deny-list prompts (which are skipped).

**Bottom line:** the sandbox reliably keeps agent work off the host
filesystem and out of host user state — a real, enforced boundary. With the
Docker socket left at its default (off) that boundary holds; opting the
socket in trades it away for Docker access and makes the sandbox no longer
an escape-proof jail. Run the harness on hosts and repos you are willing to
expose to whichever trust level you choose.

- **Caveat 3 — the optional sshd overlay (RECOMMENDED to configure).** The base
  container publishes **no ports** and runs **no** SSH daemon. The opt-in overlay
  ([`.devcontainer/docker-compose.ssh.yml`](../../.devcontainer/docker-compose.ssh.yml),
  enabled via `ssh.enabled` in `harness.yaml`) starts `sshd` and ships a **safe
  default posture**: host bind **loopback-only** (`127.0.0.1`), **public-key auth**,
  `PermitRootLogin no`, and password auth **off**. Two operator choices weaken that
  and are your responsibility: switching the bind to `0.0.0.0` (public interface),
  and enabling password auth while `SANDBOX_PASSWORD` is still the weak default
  (`test1234`). A `make sandbox` **port-collision preflight**
  ([`.oh/scripts/check-host-port.sh`](../../.oh/scripts/check-host-port.sh)) refuses
  to create a container on a port already in use, so enabling SSH or adding a tenant
  can't silently clobber another tenant's port. Setup + the nginx multi-tenant recipe:
  [Integrations → SSH](integrations/sshd.md).

## 5. Human merge gate / no auto-merge — **ENFORCED (process) · RECOMMENDED (hard gate)**

No agent merges its own work to the trunk.

- **Doctrine:** [`AGENTS.md`](../../AGENTS.md) § The Workflow — the canonical path ends `… → merge (human) → reset|clean`, and the ownership table states the human owns *"merge — final gate, no auto-merge"* (`AGENTS.md:158`, mermaid `MERGE` node `AGENTS.md:147`). The runner resets; it never merges.
- **Enforced in autopilot:** the self-improvement loop [`.oh/skills/autopilot/SKILL.md`](../../.oh/skills/autopilot/SKILL.md) **never auto-merges** and is rate-capped by the deterministic preflight [`.oh/skills/autopilot/autopilot-caps.sh`](../../.oh/skills/autopilot/autopilot-caps.sh) — cap **6 PRs/UTC-day** and **10 total open** (`autopilot-caps.sh:16-19,29-30`). On a capped hour the runtime spawns *no* session at all.
- **RECOMMENDED (hard gate):** the ultimate enforcement of "no agent merges" is **GitHub branch protection** (required reviews / restricted merge) on `development`/`main`. That lives in repo settings, not this tree — configure it. Without it, "no auto-merge" rests on the agents' skill definitions, not a server-side block.

## 6. Autopilot owned-surface guard — **ENFORCED**

The unattended loop can only touch harness infrastructure, never sandbox
application code, and cleans up only after itself.

- **Mechanism:** [`.oh/skills/autopilot/SKILL.md`](../../.oh/skills/autopilot/SKILL.md) defines `OWNED_PATHS` (`SKILL.md:134`) — the exact set it may mutate (`.claude/`, `.oh/context/`, `docs/`, `scripts/`, `.oh/crons/`, `.oh/skills/wiki/`, `.oh/evals/`, `.oh/memory/`, `.oh/tasks/`, `CHANGELOG.md`). The §1 clean-state check and every restore scope to that array.
- **Scope guard:** "harness-infra only … never sandbox application code" (`SKILL.md:549`) — the same boundary as `CLAUDE.md` § What You Do NOT Do.
- **Non-destructive restore:** a dirty *owned* surface skips the run with a distinct `BLOCKED-OWNED-WIP` token (never a bare `FAIL`); the scoped restore discards only the run's own owned-path residue and leaves any *foreign* change outside the owned set byte-for-byte untouched (`SKILL.md:159-177,560`). `git clean` is deliberately not used.

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
- `AGENTS.md` § The Workflow — the human merge gate in context.
