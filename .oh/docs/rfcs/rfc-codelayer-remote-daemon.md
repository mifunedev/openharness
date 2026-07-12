# RFC: Optional CodeLayer remote-daemon support

Status: Draft for [#635](https://github.com/mifunedev/openharness/issues/635).

> **RFC only — not an implementation or support declaration.** This document
> creates no configuration key, command, dependency, credential store, daemon,
> port, or production integration. CodeLayer is not accepted or supported by
> Open Harness as a result of this draft. Every command and configuration surface
> labeled **Proposed** below is unavailable today and requires separately tracked
> implementation work.

## Purpose

Evaluate an optional integration between Open Harness and HumanLayer CodeLayer's
remote daemon. The intended operator outcome is browser-based session management
while execution remains in the operator-controlled Open Harness sandbox. The
existing local CLI and tmux paths remain the zero-dependency default.

This RFC uses three evidence labels:

- **Verified fact** — stated in the cited HumanLayer public documentation,
  accessed 2026-07-11.
- **Proposed decision** — Open Harness design for a future implementation; not
  present or accepted today.
- **Unknown / blocked** — requires credentials, a launch token, source review, or
  a disposable-sandbox spike before a decision can be accepted.

## Evidence baseline

### Verified facts

HumanLayer's public documentation, accessed **2026-07-11**, documents:

- a remote daemon running on an operator-controlled host and browser-based
  session management;
- interactive authentication with `humanlayer login`;
- daemon startup with `humanlayer daemon launch`;
- non-interactive startup with
  `humanlayer daemon launch --launch-token <TOKEN>`;
- no built-in daemon self-supervision, with tmux or screen recommended to keep it
  running;
- task worktrees generated from a configured workspace; and
- current browser limitations: no workspace-configuration editing, no embedded
  terminal, and no path autocomplete.

Primary sources:

- [HumanLayer: Remote Daemons](https://docs.humanlayer.com/guide/remote-daemons)
  (accessed 2026-07-11)
- [HumanLayer: Workspace setup](https://docs.humanlayer.com/guide/workspaces)
  (accessed 2026-07-11)
- [HumanLayer public documentation](https://docs.humanlayer.com/)
  (accessed 2026-07-11)
- [CodeLayer browser application](https://app.humanlayer.com/)
  (accessed 2026-07-11)
- [Open Harness issue #635](https://github.com/mifunedev/openharness/issues/635)
- [Open Harness RFC convention](README.md)

The documentation establishes product-level behavior, not compatibility with a
specific Open Harness image, exact CLI version, agent backend, filesystem model,
or secret-handling policy.

### Blocked verification

Both authenticated flows are **BLOCKED**, not failed and not accepted:

<!-- markdownlint-disable MD013 -->

| Flow | Evidence available | Blocker | Current verdict |
| --- | --- | --- | --- |
| Interactive | Documentation for `humanlayer login` and daemon launch | No operator credentials were supplied | BLOCKED |
| Launch token | Documentation for `--launch-token <TOKEN>` | No operator launch token was supplied | BLOCKED |

<!-- markdownlint-enable MD013 -->

No login, daemon connection, browser session, worktree creation, reconnect, or
credential revocation was attempted for this RFC. Supplying credentials is an
operator action and is outside this docs-only change.

### Unresolved facts

The following remain unknown and must not be inferred from the documentation:

1. the exact repository, prompt, command, output, telemetry, and metadata data
   flow between browser, HumanLayer services, daemon, and agent backend;
2. the on-disk credential path, file permissions, refresh behavior, logout or
   revocation semantics, and server-side session invalidation behavior;
3. whether a reviewed fixed CLI pin remains compatible with the remote service;
4. the supported agent-backend and feature matrix for Claude, Codex, Pi, Hermes,
   and other Open Harness surfaces;
5. whether direct use of `$OH_PROJECT_ROOT` is supported and safe;
6. whether HumanLayer-generated task worktrees preserve Open Harness workspace
   setup, mounts, provider links, branch rules, and project-root semantics; and
7. whether browser limitations prevent required recovery or setup operations.

These unknowns are acceptance blockers for implementation, not details that an
implementer may silently choose.

## Proposed architecture

### Placement and process boundary

**Proposed decision:** a future experimental integration runs *inside the
existing Open Harness sandbox*, as the non-root `sandbox` user, in **exactly one**
named tmux session:

```text
client-codelayer
```

It is not a host process, not a root process, not a second container or Compose
service, and not a system service. It publishes **no host or container port**.
The expected connection is daemon-initiated outbound traffic, but the direction,
protocol, destinations, and payloads remain unknown until captured by the spike.
If HumanLayer requires an inbound listener or a published port, this placement
proposal must return to Draft rather than opening one implicitly.

This placement reuses the harness's established `client-*` tmux convention and
keeps the daemon near the equipped repository. It does **not** establish that
HumanLayer officially supports this container placement; its documentation only
verifies the broader operator-host remote-daemon model.

### Future operator surface — unavailable today

The following is a proposed shape only. **None of these keys or commands exists
as part of this RFC.** Documentation and help output must not advertise them
until an implementation child issue lands and passes its gates.

```yaml
# PROPOSED AND UNAVAILABLE
integrations:
  codelayer:
    enabled: true
    auth: interactive # or launch-token
```

```bash
# PROPOSED AND UNAVAILABLE
oh codelayer login
oh codelayer start
oh codelayer status
oh codelayer logs
oh codelayer stop
oh codelayer logout
```

The integration remains disabled by default. When disabled, Open Harness must
perform no package install, authentication, startup check, network request,
volume creation, or daemon work.

## Lifecycle, deduplication, and restart

**Proposed decisions for future implementation:**

1. `start` first checks for `client-codelayer`. If the session exists and its
   recorded daemon identity is healthy, it returns success without creating a
   duplicate.
2. If the session exists but the daemon is absent or unhealthy, `start` reports
   the state and requires an explicit restart action; it must not create a
   second session or hide the stale one.
3. The single session runs one harness-owned supervisor wrapper, as `sandbox`.
   The wrapper launches the pinned HumanLayer daemon and writes redacted logs to
   `/tmp/client-codelayer.log`. The wrapper is not daemon self-supervision; it is
   Open Harness lifecycle policy around a daemon documented as lacking it.
4. The supervisor uses bounded exponential backoff for unexpected exits and a
   finite retry ceiling. Exhaustion leaves an inspectable stopped/error state
   rather than an infinite crash loop.
5. Intentional `stop` disables restart, terminates the child, waits with a fixed
   timeout, then kills only `client-codelayer`. It must not use broad process-name
   kills.
6. Container restart destroys tmux state. Automatic recreation is allowed only
   when the operator has explicitly enabled the integration and a reviewed
   credential mode is available; otherwise status is stopped and the operator
   starts it explicitly.
7. Health is not inferred from tmux-session existence. The spike must identify a
   non-secret readiness signal that proves browser-service connectivity. Until
   then, proposed states are `stopped`, `starting`, `connected`, `recovering`,
   `blocked-auth`, and `error`, with `connected` unavailable to implementation.

The implementation must record PID/command identity without storing tokens and
must verify that the owned PID belongs to `sandbox` before signalling it.

## Authentication and persistence

### Interactive login

**Verified fact:** `humanlayer login` is documented.

**Proposed decision:** login runs interactively as `sandbox`, never during image
build or default sandbox boot. Credentials may persist only in an
operator-local, gitignored storage location mounted into the `sandbox` user's
home. The exact mount and path cannot be chosen until the CLI's actual credential
path and permissions are observed. The storage must not be copied into the image,
repository, generated workspace, logs, or task worktrees.

`logout` and destructive sandbox cleanup must distinguish:

- stopping the daemon while retaining an operator-approved login;
- revoking/removing CodeLayer credentials; and
- destroying the sandbox without claiming server-side revocation.

The RFC cannot define complete removal until logout/revocation behavior is
verified.

### Launch-token bootstrap

**Verified fact:** the CLI accepts `--launch-token <TOKEN>`.

The documented flag puts the secret in process arguments. That can expose it via
shell history, tmux capture, logs, error reports, process listings, and
`/proc/<pid>/cmdline` to processes with sufficient access. Merely sourcing the
value from an environment variable does not remove the token from the launched
process's argv.

**Proposed decision:** tracked configuration stores only the selected auth mode,
never the token. A future implementation must use the platform's ephemeral secret
input, disable shell tracing, avoid command echo and `tee` of the launch command,
redact diagnostics, and unset temporary values immediately after launch.
HumanLayer's public documentation calls launch tokens short-lived but does not
state their lifetime or whether they are single-use. Before shipping, the spike
must determine those semantics, whether the child retains the token in argv
after exchange, and whether a safer stdin, file-descriptor, or environment
mechanism exists. If argv is the only mechanism, that residual exposure requires
an explicit security acceptance and operator warning; this RFC does not grant
it.

## Workspace model

HumanLayer documentation verifies workspace-generated task worktrees. It does
not verify Open Harness correctness in those worktrees.

Two modes must be tested:

<!-- markdownlint-disable MD013 -->

| Candidate | Benefit | Required proof | Current status |
| --- | --- | --- | --- |
| Direct `$OH_PROJECT_ROOT` | Uses the already-equipped checkout and its active branch | CodeLayer can target the exact path without unsafe concurrent writes; cwd, UID, mounts, git state, and provider tooling are correct | Unknown |
| HumanLayer-managed task worktree | Session isolation matches documented CodeLayer behavior | Worktree derives from the intended repo/ref; `$OH_PROJECT_ROOT` resolves correctly; `.oh/`, provider symlinks, hooks, credentials, mounts, and branch cleanup behave as intended | Unknown |

<!-- markdownlint-enable MD013 -->

**Proposed decision:** implementation chooses neither by assumption. The spike
runs both and records evidence. Prefer direct `$OH_PROJECT_ROOT` only if
CodeLayer supports it and concurrent-write safety is demonstrated; otherwise use
a HumanLayer-managed worktree only after the full Open Harness workspace
correctness checklist passes. If neither passes, defer the integration.

The browser's lack of workspace-config editing, embedded terminal, and path
autocomplete means setup and recovery must remain available through the normal
Open Harness terminal. The browser must not be documented as a complete terminal
replacement.

## Trust boundary and data flow

The proposed trust boundary is:

```text
Operator browser
    <-> HumanLayer service (authentication/session control; exact payloads unknown)
    <-> outbound daemon connection (protocol/destinations unknown)
    <-> client-codelayer as sandbox user
    <-> selected agent backend (compatibility unknown)
    <-> repository/worktree and explicitly inherited sandbox capabilities
```

The daemon sits inside a sandbox that may contain source code, git credentials,
cloud credentials, SSH material, and access to the host Docker socket. Placement
inside the sandbox therefore does not make the service low-trust or least
privilege. A future implementation must inventory and minimize:

- filesystem mounts and readable paths;
- inherited environment variables and credential agents;
- Docker-socket, host-network, SSH, cloud, and GitHub access;
- prompts, source snippets, diffs, commands, stdout/stderr, file paths, and model
  responses crossing the HumanLayer boundary;
- HumanLayer and agent-provider telemetry, retention, and account controls; and
- browser actions that can start commands or mutate repositories.

No secret allowlist, egress allowlist, payload schema, or retention statement is
claimed here. The implementation child must publish an operator-facing data-flow
and threat-model document based on captured evidence before promotion.

## Version, compatibility, upgrade, and rollback

**Proposed policy:** installation is opt-in and uses an exact reviewed
`@humanlayer/cli` version (no `latest`, caret, tilde, or floating tag). This RFC
intentionally names no current version: recording an untested version here would
canonize a pin without proving service compatibility.

For each proposed pin or upgrade:

1. record package provenance, integrity metadata, license, transitive dependency
   review, and release notes;
2. rerun both authentication flows when credentials are available;
3. run the backend matrix and direct/worktree workspace matrix;
4. verify launch, browser connection, reconnect, bounded restart, stop, logout,
   cleanup, and redaction;
5. confirm compatibility with the live HumanLayer service; and
6. retain the last known-good exact package artifact and configuration for
   rollback.

An upgrade is a reviewable implementation PR, never automatic at sandbox boot.
Rollback stops `client-codelayer`, restores the prior exact pin and compatible
credential format, then reruns the smoke protocol. If the remote service rejects
the prior pin, disable the integration; do not float forward silently. A fixed
pin cannot be called service-compatible until the spike proves it, and continued
compatibility needs a drift probe.

## Cleanup and kill switch

**Proposed immediate kill switch:** `oh codelayer stop` (future and unavailable)
terminates the owned process and the single `client-codelayer` tmux session.
Network isolation at the container/host layer remains the operator's stronger
emergency control if graceful stop fails.

Complete cleanup must be separately confirmable and must:

1. stop restart attempts and kill only the owned session/process tree;
2. remove temporary token material, PID/state files, and redacted temporary logs;
3. enumerate HumanLayer-created worktrees and remove only those positively owned
   by the integration, preserving dirty work for explicit operator review;
4. optionally remove the reviewed CLI package/cache and credential volume;
5. invoke verified logout/revocation where available and clearly distinguish
   local deletion from server-side revocation; and
6. prove no listener, tmux session, daemon process, credential copy, generated
   workspace file, or tracked secret remains.

`make destroy` or `oh clean` behavior must be specified by the implementation
child after credential persistence is known. Destructive credential removal must
not be an undocumented side effect.

## Spike evidence protocol

Run only in a disposable Open Harness sandbox with test repository content,
dedicated test credentials, and a short-lived launch token supplied directly by
the operator. Never paste credentials into an issue, PR, transcript, or tracked
file.

For each CLI pin, auth mode, backend, and workspace mode, capture a redacted
result row containing:

- image/commit, exact CLI version and integrity, UTC time, and test operator;
- UID/GID, cwd, `$OH_PROJECT_ROOT`, selected repo/ref, and resulting worktree;
- tmux session count/name, process tree, restart attempts, and status transitions;
- socket/listener inventory proving no published port;
- DNS destinations and redacted network-flow metadata;
- files read/written outside the test repository, credential path/mode, and token
  lifetime/argv observations;
- browser create/list/reconnect/stop behavior and limitation impact;
- commands, repository data, prompts, output, and metadata observed crossing each
  trust boundary;
- stop, logout/revocation, worktree cleanup, and post-clean secret scan; and
- PASS, FAIL, or BLOCKED with links to sanitized artifacts.

Minimum scenarios are interactive login, launch token, invalid/expired token,
network loss/reconnect, daemon crash, retry exhaustion, duplicate start,
container restart, direct project root, generated worktree, dirty-work cleanup,
and rollback to the prior pin. A BLOCKED row remains blocked; it cannot count as
acceptance. Raw secrets, browser profiles, cookies, environment dumps, and full
private traffic captures are never evidence artifacts.

## Deferred implementation work

Acceptance of this RFC, if it occurs later, authorizes discussion direction only.
Separate child issues and PRs are required for:

1. authenticated disposable-sandbox spike and sanitized evidence matrix;
2. trust-boundary, data-flow, credential, revocation, and argv-exposure review;
3. backend and exact-version service-compatibility matrix;
4. direct-root versus managed-worktree correctness decision;
5. opt-in installer/config surface and exact dependency pin;
6. one-session supervisor, lifecycle/status/logging, deduplication, and kill
   switch;
7. cleanup, credential persistence, logout/revocation, and rollback;
8. operator documentation for browser limitations and terminal recovery; and
9. deterministic lifecycle/redaction/drift probes followed by an explicit
   support decision.

No child may claim production support merely because another child passes.
Promotion requires the runtime-support contract's documented, one-toggle,
validated, and guarded bar in
[`rfc-runtime-support.md`](rfc-runtime-support.md), plus explicit human review.

## Non-goals

- Implementing or installing HumanLayer/CodeLayer in this RFC.
- Declaring CodeLayer accepted, production-ready, or supported.
- Changing default image size, startup, authentication, networking, or agent
  workflows.
- Publishing a daemon port or adding a reverse proxy/tunnel.
- Replacing local terminal, tmux, Slack, or provider-native workflows.
- Solving HumanLayer service behavior, browser feature gaps, or backend support.
- Storing credentials or launch tokens in `harness.yaml`, git, images, logs, issue
  text, generated workspace files, or task worktrees.
- Selecting a CLI version without compatibility evidence.

## Acceptance matrix for #635

This matrix covers every criterion in issue #635. It records the RFC's present
state, not implementation acceptance.

<!-- markdownlint-disable MD013 -->

| #635 criterion | RFC treatment / required evidence | Status |
| --- | --- | --- |
| Choose and document daemon placement and lifecycle model | Proposed inside the existing sandbox as non-root `sandbox`, exactly one `client-codelayer` tmux session, no published port; bounded supervisor, dedup, health, stop, and restart rules above | Proposed; unverified |
| Define exact opt-in configuration and operator commands | Illustrative future `integrations.codelayer` and `oh codelayer ...` surface is explicitly unavailable; exact schema/CLI requires implementation design and tests | Deferred; not implemented |
| Document authentication, credential persistence, data flow, trust boundaries, and cleanup | Interactive/token models, argv risk, unknown credential path/revocation, trust-boundary inventory, cleanup, and kill switch are specified above | Documented as proposal/unknowns; verification blocked |
| Verify interactive-login and launch-token flows in a disposable sandbox | Both flows require operator-provided credentials/token; neither was supplied | BLOCKED |
| Define version pinning, compatibility, health checks, restart behavior, and rollback | Exact-pin review policy, service/backend matrices, non-session health, bounded restart, and rollback policy are defined; no version is canonized | Proposed; compatibility unknown |
| Preserve no-CodeLayer path with no additional dependency or startup work | Disabled-by-default invariant requires zero install/auth/network/volume/startup work | Required; not implementation-tested |
| Conclude Accepted, Draft, or Superseded under RFC convention | This document and issue remain Draft | Satisfied as Draft only |
| No production integration ships merely by accepting this discussion issue; implementation tracked separately | Explicit disclaimer and child-work list prohibit implementation/support claims | Satisfied for this docs-only RFC |

<!-- markdownlint-enable MD013 -->

## Draft conclusion

Remain **Draft**. The placement and lifecycle are concrete proposals, but both
authentication paths are blocked and the data flow, credential/revocation model,
fixed-pin service compatibility, backend matrix, and Open Harness workspace
correctness remain unresolved. No production support or acceptance is claimed.
