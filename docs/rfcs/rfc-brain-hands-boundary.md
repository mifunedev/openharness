# RFC: The brain/hands boundary — Phase-0 decisions for the execution seam

Status: Draft for [#733](https://github.com/mifunedev/openharness/issues/733). Implementation epic: [#731](https://github.com/mifunedev/openharness/issues/731).

> **AUTHORITY CLAUSE.** This file is the sole authority for Phase-0 brain/hands
> boundary decisions. Do not restate its content in future PRDs, task folders, or wiki
> entries — cite it.

Consequences of that clause, stated once so they are not re-litigated:

- Task folders under `.oh/tasks/` are **build artifacts** and get archived. This RFC is the
  durable record. When the two disagree, this file wins and the folder is simply stale.
- Downstream slices ([#732](https://github.com/mifunedev/openharness/issues/732),
  [#734](https://github.com/mifunedev/openharness/issues/734),
  `openharness-cloud#104`) **cite** this file and **amend** this file. They do not fork a
  second copy of the boundary into their own specs.
- Amending is expected and cheap: change the section, note the amending issue. Reconciling
  three parallel copies is neither.

This document decides *where the line falls* between the part of Open Harness that decides
what to do (**brain**) and the part that makes something happen inside an environment
(**hands**). It defines no runtime and implements no adapter. The first adapter, and the
`ExecutionTarget` contract it implements, land in #733; the substrate taxonomy those adapters
are selected from lives in [`rfc-runtime-support.md`](rfc-runtime-support.md).

## 1. Why a boundary at all

The harness has a clean *configuration* seam — `harness.yaml` plus compose overlays assembled
by `.oh/scripts/docker-compose.sh` — and no *execution* seam. Lifecycle behavior is expressed
directly in Docker terms, including in TypeScript: `runShell` shells out to a literal
`docker exec -it -u sandbox <name> zsh` argv (`.oh/cli/src/commands/lifecycle.ts:298`). Every
substrate explored under [#591](https://github.com/mifunedev/openharness/issues/591) therefore
risks landing as another branch *inside* Docker-shaped lifecycle code rather than as an
interchangeable implementation behind a contract.

The boundary below is what makes a second substrate an implementation detail instead of a
refactor.

## 2. Brain/hands responsibility table

**Brain** owns decisions, policy, and durable state. **Hands** owns making something happen
inside an environment. The test is not "is it important" — it is *"does this need to execute
inside the environment to do its job?"*

| Subsystem | Side | Why |
|---|---|---|
| **The build executor** (`.oh/scripts/firstmate.sh`, the story cycle) | **Brain** | Chooses the next story, decides when the loop terminates. It *invokes* hands; it is not hands. |
| **Cron** (`.oh/crons/`, the scheduled-agent runtime) | **Brain** | Scheduling and cap enforcement are policy. The work a cron fires may be hands-side; the scheduler is not. |
| **Autopilot** (`/autopilot`) | **Brain** | Issue selection, caps, and the merge gate are pure orchestration. |
| **Memory** (`.oh/memory/`, `.oh/context/`) | **Brain** | Durable knowledge state. Reading and writing it needs no environment. |
| **Wiki** (`.oh/skills/wiki/corpus/`) | **Brain** | Same: repo-file knowledge state. |
| **Provisioning / attach / exec** | **Hands** | The definition of the side. |
| **Evals** (`.oh/evals/probes/`) | **Split — see §3** | Determined per-probe by a rule, not by a list. |

`oh gateway` is **brain-side by design** and is deliberately *not* routed through the
execution contract: it is orchestration and policy, not execution. Routing it would invert the
boundary on day one.

## 3. The eval split is a rule, not a list

Evals do not belong to one side. The split is decided by a **capability rule**, evaluated
per-probe:

> A probe that **only reads repository files** is **brain-side**. A probe that **must execute
> inside the environment** to observe its subject is **hands-side**.

Stated as a rule on purpose. An enumerated list of probes goes stale the moment a probe is
added, and a stale list is worse than none — it invites the reader to trust it. Apply the rule
to the probe in front of you.

The rule's practical consequence: brain-side probes run anywhere the repo is checked out,
including in CI and on a host install with no sandbox running. Hands-side probes require a
provisioned target and must degrade to `SKIPPED` — not `REGRESSION` — when there is none.

## 4. The four-class state taxonomy

Phase-0 recognizes exactly four classes of state. Naming them is what lets #734 separate
credentials from execution without renegotiating the whole boundary.

| Class | Owns | Example |
|---|---|---|
| **`WorkspaceState`** | The user/project filesystem — the repo the harness operates on. | The bind-mounted project root; git worktrees. |
| **`ExecutionState`** | Execution-machine state: whether a target exists, is running, and what it can do. | `ExecutionStatus`; the capability set. |
| **`HarnessAuthState`** | Provider, auth, and credential state. | The per-CLI auth volumes (`claude-auth`, `codex-auth`, `pi-auth`, …); `gh` auth under `~/.config`. |
| **`SessionState`** | Orchestration and session identity. | Which loop is running, which task folder it is building, session/lease identity. |

The classes are **descriptive for Phase-0**, not enforced by types. #733 introduces
`ExecutionState`'s vocabulary (`ExecutionStatus`, `ExecutionCapability`) into code;
`HarnessAuthState` is named here so that #734 splits it *out of* `ExecutionState` rather than
discovering it fused in.

### 4.1 Known violation — Hermes

The taxonomy has one **documented, accepted Phase-0 violation**, recorded here rather than
quietly omitted.

Hermes (`docs/harnesses/hermes.md`) is an optional image-level agent runtime that bundles
*both* sides inside one opaque process: persistent memory, auto-generated skills, scheduled
task automation, and sub-agent delegation (**brain**), plus its own container-sandboxed task
execution across local / Docker / SSH / Singularity / Modal backends (**hands**). From the
harness's point of view its state is a single blob under the project-local `.hermes/`
directory — including `auth.json`, so `HarnessAuthState` and `SessionState` are fused there,
not separable.

Two consequences that must not be forgotten when a second execution target lands:

1. Hermes can provision execution environments the `ExecutionTarget` contract does not know
   about — a *second, nested* hands layer beneath the harness's own. The contract does not
   model it, and Phase-0 does not try to.
2. Its brain-side surface is configured through an execution-shaped mechanism: the dashboard
   is toggled by a **compose overlay** (`.devcontainer/docker-compose.hermes-dashboard.yml`),
   so brain-side policy rides on substrate configuration.

This is accepted for Phase-0 because Hermes is opt-in and off by default (`install.hermes`).
It is recorded so that a later slice which finds the taxonomy "already violated" knows it was
a decision, not an oversight.

## 5. Workspace stance

The contract carries:

```ts
readonly workspace: { hostRoot: string; targetRoot: string };
```

**Identical-path mapping (`hostRoot === targetRoot`) is the ONLY supported Phase-0 worktree
configuration.** Non-identical mapping is **explicitly unsupported** in Phase-0: no consumer
above the seam may translate a host path into an in-target path, and no adapter may promise
that it will.

This is an honest description of today's code rather than an aspiration. Nothing above the
seam performs path translation: the CLI resolves one project root (`resolveProjectRoot`) and
uses that same string for reading files and for invoking compose. The base compose file *does*
bind a host directory to `OH_PROJECT_ROOT` (`..:${OH_PROJECT_ROOT:-/home/sandbox/harness}`,
`.devcontainer/docker-compose.yml`) — but that mapping lives **below** the seam, inside the
adapter's own machinery, and Phase-0 deliberately does not expose it. A consumer that needs
the two paths to differ is asking for a capability the contract does not have.

### 5.1 The two-field shape is SPECULATIVE

Stated plainly, because a two-field contract in which only the degenerate equal case is legal
is exactly the "abstraction shaped like its one implementation" smell:

> In Phase-0 only `hostRoot === targetRoot` is legal, so **`targetRoot` carries permission,
> not semantics**. It reserves the right to differ; it does not yet mean anything when it
> does.

The Sysbox slice — #731's scheduled next slice — is expected to either give `targetRoot` real
semantics or **collapse the shape back to a single field**. Either outcome is a success. What
is *not* acceptable is leaving a second field indefinitely that no code reads, which is why
this section commits the next slice to resolving it.

**Deferred, with an owner:** whether identical-path mapping is too strict for
`openharness-cloud#104` (golden-image provisioning may need a host path that differs from the
in-target path) is resolved in the **#734 planning spec** — before any #734 implementation
begins, not during its build. Either Phase-0's stance loosens, or Cloud carries a documented
exception.

## 6. `attach()` is synchronous in `contractVersion: 1`

**Decision:** `attach?(request: ExecRequest): number` — synchronous. `provision?()`,
`status()`, `capabilities()`, `exec()`, and `destroy?()` are async. The asymmetry is
deliberate.

Rationale, all verifiable in today's code:

- **The seam it wraps is already synchronous.** `LifecycleRunner` is
  `(cmd, args, opts) => RunResult` (`.oh/cli/src/commands/lifecycle.ts:49-53`) over `spawnSync`
  (`:59`). A sync `attach()` is the *existing* pattern, not a concession to it.
- **`attach()` is a terminal handoff.** It inherits stdio, blocks until the child exits, and
  returns the exit code. There is nothing to await; `Promise<number>` would be ceremony
  wrapping a `spawnSync`.
- **It keeps the compatibility oracle literally true.** `runShell` is
  `export function runShell(opts, io): number` (`:298`) and its tests assert synchronously —
  `expect(runShell(...)).toBe(0)` and `expect(() => runShell(...)).toThrow(...)`
  (`.oh/cli/src/__tests__/lifecycle.test.ts:362`, `:428`, `:435`). An async `attach()` would
  force `runShell` to return a Promise, which neither assertion can observe, and the
  "no behavior change" proof would have to be weakened to accommodate the abstraction. That
  is the wrong trade for an invisible refactor.
- **`runSandbox` is already async**, so `provision(): Promise<void>` costs nothing.

**Migration path (the escape hatch is the version field).** If the Sysbox slice or #732's
durable/remote sessions need a non-blocking attach, the contract bumps to
`contractVersion: 2` with `attach(): Promise<number>` — or adds a sibling async method — and
migrates `runShell` **and its assertions** at that point, as a deliberate, separately-reviewed
change. Making `attach()` async is therefore a *versioned* decision with a named trigger, not
a door that closes here.

## 7. What this RFC decides vs. defers

- **Decides:** the brain/hands split (§2), the eval capability rule (§3), the four-class state
  taxonomy and its one known violation (§4), the Phase-0 workspace stance and its speculative
  second field (§5), and `attach()` synchrony with its migration path (§6).
- **Defers:** identical-path mapping vs. `openharness-cloud#104` → the **#734 planning spec**
  (§5.1). Whether `ExecutionCapability` gains `"watch"` → until a consumer needs it. Any
  second adapter → #731's ordering.

## Non-goals

- No runtime, substrate, or adapter is implemented here — see
  [`rfc-runtime-support.md`](rfc-runtime-support.md) for the substrate taxonomy and #733 for
  the first adapter.
- No remote-execution protocol, wire format, or control plane.
- No enforcement mechanism for the state taxonomy: §4 is descriptive vocabulary for Phase-0,
  and turning it into types is #734's call to make or decline.
