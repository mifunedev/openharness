# PRD — `oh runtime`: install and inspect isolation runtimes

## Problem

Answering "can this machine run MicroSandbox?" currently costs three files and
two issues: read [#805](https://github.com/mifunedev/openharness/issues/805) for
the blockers, check `.devcontainer/Dockerfile`'s base image for its glibc, then
check `.devcontainer/docker-compose.yml` for a `devices:` key. The answer is
knowable by measurement in under a second, and nothing measures it.

The runtime work is also spread thin — EPIC #731, the P0 spike (#802/#803),
the MicroSandbox unblock (#805), and the gVisor RFC (#806/#804) — with no single
surface that says what exists and where each one stands. And nothing reports the
runtime you are **currently** on, or whether it is healthy.

## Goal

One command that names the runtime in use, reports host readiness for every
other measured runtime, and installs the default one when the host can actually
run it.

## Non-goals

- **Selecting a runtime.** Nothing here changes how the sandbox boots.
  `resolveExecutionTarget` is untouched.
- **Writing a config key.** See D1.
- **Clearing the MicroSandbox blockers.** The base image is #807's; the
  `devices:` key is #805's. This PR neither bumps a base nor edits compose.
- **Rebuilding or restarting the sandbox.**
- **Deciding whether MicroSandbox belongs in the container or on the host.** See
  the open question.

## Decisions

### D1 — write no configuration key

[#806 § B1](https://github.com/mifunedev/openharness/issues/806) records an open
decision: the substrate plan proposes `sandbox.substrate`, the EPIC #731 sysbox
slice proposes `sandbox.runtime`, and #806 states that settling it outside #731
forks the `ExecutionTarget` seam.

This command therefore persists nothing. Its job — installing a tool and
reporting host readiness — is orthogonal to *selecting* a runtime, and B1 only
binds something that selects. Whichever key wins, this command stays correct.

**Rejected: `install.microsandbox` in the existing `install:` section.** That
section's invariant is "each key maps to a Dockerfile build arg". MicroSandbox
has no build arg and must not get one (D2), so the key would be a lie that
`harness-config.sh env` silently drops.

**Rejected: adding a `set` mode to `harness-config.sh`.** The parser is read-only
by design. Making it a writer to store a key that D1 says should not exist is
two mistakes.

### D2 — no Dockerfile build arg

`.devcontainer/Dockerfile` pins `debian:bookworm-slim` (glibc 2.36) and the
MicroSandbox installer floors at 2.39. A build arg would bake a
guaranteed-failing install into every image. MicroSandbox is modelled on the
catalog's existing `on-demand` shape instead.

### D3 — the preflight is a gate, not a warning

MicroSandbox has two measured blockers here and has never produced a binary in
this harness. Running the installer anyway spends a network round trip to
reproduce an error #805 already documents.

So `install` measures first and **attempts nothing** when the host fails,
printing each unmet requirement beside its remediation and exiting 1. `--force`
is the override — and it is the whole of "leave the decision to the user":
the command supplies the measurement, the operator supplies the decision.

**Rejected: warn and proceed.** A warning followed by the upstream installer's
own error trains the operator to ignore the warning.

### D3a — `runtime`, not `substrate`

"Substrate" is precise and not widely understood. `runtime` is the word Docker
already uses (`docker run --runtime=runsc`) and the word this repo already uses
(`.oh/docs/rfcs/rfc-runtime-support.md`), so operators meet a familiar term.

**Naming the command does not settle the config key.** #806 § B1 is about the
*key*, and D1 means this command writes none. Picking `runtime` for the noun
leans the vocabulary toward one candidate, and that is worth stating plainly —
but it decides nothing, because there is nothing persisted to decide.

Renaming also resolves the doc-path discrepancy the first draft flagged:
`rfc-runtime-support.md` § 2 specifies `.oh/docs/runtimes/<name>.md`, which is
now where these docs live.

### D3b — list the runtime already in use, and check it

Docker is a first-class catalog entry, not a placeholder. A table showing only
the runtimes you *cannot* use answers "what could I move to" while silently
skipping "what am I on, and is it healthy".

Its check is **host-scoped** (`docker version --format '{{.Server.Version}}'`),
because the daemon lives on the machine holding the `oh` binary; a check run
inside the sandbox would answer about the wrong kernel. This adds a `scope`
field to `PreflightCheck` — `"host"` vs `"target"` — and the host check runs
even when the container is unreachable, because "the sandbox will not start" and
"the daemon is down" are different problems.

`install docker` refuses: there is nothing to install.

### D4 — a new top-level noun, not a subcommand of `oh sandbox`

`oh sandbox` is a flags-only verb meaning "provision and start" (`cli.ts`,
`parseSandboxArgs`). Giving it a positional subcommand would make one token both
a verb and a dispatcher. `oh harness` already established the sibling-noun
pattern, and every parse/help/test shape mirrors it one-for-one.

### D5 — three catalog entries, though only one is installable

`docker` (active), `microsandbox` (blocked, installable), `gvisor` (planned).

gVisor is **planned and not implemented here**: it is a host-side Docker
runtime, so `oh runtime` cannot install it, and it declares no checks because
there is nothing yet to probe. It is listed because it measured GREEN and will
land — a one-entry catalog would encode a false singleton and need a schema
change to accept it.

### D6 — the installer argv is cited, not reconstructed

`curl -sSL https://get.microsandbox.dev -o /tmp/get-msb.sh && sh /tmp/get-msb.sh`
is copied verbatim from `.oh/tasks/microsandbox-substrate/next-tasks.md` on
PR #803. With no working binary in this harness there is nothing to verify a
guess against, so the catalog cites the spike and a test pins the string.

## Requirements

| # | Requirement |
|---|---|
| FR-1 | `oh runtime list [--json]` prints every entry with tier, state, supported, and in-use. Exit 0. |
| FR-1a | Exactly one entry reports `IN USE`, and only when the sandbox is actually running. |
| FR-1b | The docker daemon is probed on the **host**, and is probed even when the container is unreachable. |
| FR-1c | `oh runtime install docker` exits 1 saying there is nothing to install. |
| FR-2 | `oh runtime status [name] [--json]` adds the measured value behind each verdict (glibc read, `/dev/kvm` present) plus remediation for failures. Exit 0. |
| FR-3 | `oh runtime install [name] [--force]` defaults `name` to `microsandbox`. |
| FR-4 | A failing preflight prints both blockers and exits 1 with zero install attempt. |
| FR-5 | `--force` proceeds past a failing preflight. |
| FR-6 | `oh runtime install gvisor` exits 1 with a pointer to #806 and does no container work. |
| FR-7 | A stopped or absent container exits 0 with a hint and zero `docker exec`. |
| FR-8 | An unreadable probe reports unknown (`?`), never "unsupported". |
| FR-9 | Every container call goes through `ExecutionTarget`; no direct `docker` spawn, no `kind` branch. |
| FR-10 | No file outside the CLI, docs, changelog, and the new probe is modified. `harness.yaml` is byte-identical after every verb. |

## Test plan

- `runtime-catalog.test.ts` — catalog shape; a drift test pinning the glibc
  floor at 2.39, the `/dev/kvm` requirement, and the #803 installer string
  against `.devcontainer/Dockerfile`'s actual base; `compareVersions` numeric
  ordering (`2.9 < 2.39`, the bug a lexical compare would introduce).
- `runtime.test.ts` — parse, help, and every exit path against DI-injected
  runner fakes: blocked host, ready host, one-blocker-clear, `--force`, stopped
  container, already-installed, failing installer, failing doctor, unknown name,
  and a harness.yaml byte-identity assertion across all verbs. Plus the docker
  entry: in-use only when running, a host-scoped daemon probe that is not a
  `docker exec`, the version actually read, a **down** daemon rendering FAIL
  with remediation, the probe still running when the container is unreachable,
  and `install docker` refusing.
- `.oh/evals/probes/runtime-preflight-gate.sh` — tier A, source-grep only.
  Asserts no config key in code, no build arg, both blockers declared, the
  installer provenance, the gate returning 1, the `--force` override, no direct
  docker, and CLI reachability. Verified by rejection: 11 injected defects, each
  turning it red.

## Open question, flagged not answered

**Container-side or host-side?** This installs `msb` inside the container,
because that is the only side `ExecutionTarget` can reach. #805 measures the
glibc floor against *both* the WSL2 host (2.35) and the devcontainer (2.36) and
does not settle which is intended. A microVM tier that replaces the container
would plausibly install on the host. Routed to #731 alongside B1.

**Doc path — resolved.** The first draft used `.oh/docs/substrates/` and flagged
that `rfc-runtime-support.md` § 2 specifies `.oh/docs/runtimes/<name>.md`. The
rename (D3a) puts these docs at the path the RFC already named.
