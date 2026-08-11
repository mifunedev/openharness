# PRD: ExecutionTarget contract + DockerCompose compatibility adapter

> Issue: [#733](https://github.com/mifunedev/openharness/issues/733) — anchor (branch `feat/733-execution-target-contract`)
> EPIC: [#731](https://github.com/mifunedev/openharness/issues/731) — `Refs #731`, **never** `Closes` (epics do not close on one PR)
> Repo: `mifunedev/openharness` · Base: `development`

## Introduction

OpenHarness has a clean *configuration* seam (`harness.yaml` + compose overlays) but no
*execution* seam. Today the runtime lifecycle is expressed directly in Docker terms:
`.oh/scripts/docker-compose.sh` assembles the compose argv and executes Docker, and the
TypeScript CLI reaches for Docker directly in at least one place
(`.oh/cli/src/commands/lifecycle.ts:298` `runShell` shells out to `docker exec -it -u sandbox
<name> zsh`). Every new substrate explored under #591 (gVisor, Firecracker, Kata, Sysbox,
managed sandboxes) therefore risks becoming another branch inside Docker-shaped lifecycle code
rather than an interchangeable implementation.

This task lands the **first buildable slice of EPIC #731**: a small, provider-neutral
`ExecutionTarget` contract in the CLI's core TypeScript surface, with today's Docker Compose
behavior as its **first adapter**, implemented by **delegating to the existing proven
machinery** rather than rewriting it. It also ratifies the Phase-0 brain/hands boundary
decisions into a durable, citable RFC so #732, #734, and `openharness-cloud#104` build against
one written contract instead of re-deriving it.

**This is not a runtime migration.** Docker remains the default and must behave *exactly* as it
does today after the change. The success test is that the abstraction is nearly invisible: the
existing `lifecycle.test.ts` assertions pass **unchanged**, and adapter-produced compose argv is
byte-identical to today's argv.

### Why now — the second adapter is scheduled, not imagined

A one-adapter interface is a premature abstraction *when the second implementation is
hypothetical*. It is not hypothetical here, and the justification belongs on this PRD's face:

1. **This is the first slice of EPIC [#731](https://github.com/mifunedev/openharness/issues/731)**,
   whose **P0 explicitly schedules the Sysbox execution target as the very next slice** after this
   one. The abstraction has a named, prioritized second implementer before the first one merges.
2. **[#732](https://github.com/mifunedev/openharness/issues/732) (durable sessions) and
   [#734](https://github.com/mifunedev/openharness/issues/734) (credentials / capability
   separation) are open, real issues** under #731 that consume this exact seam — #732 needs
   `execution.attached` / `execution.released` to hang off `attach()`, #734 needs
   `HarnessAuthState` separated from `ExecutionState`. They are the audience, and they exist
   today as tracked work, not as a design-for-an-audience-that-may-never-arrive.
3. **`openharness-cloud#104`** is the third consumer, and is the reason the workspace stance is
   ratified in an RFC rather than left implicit.
4. **The Captain approved this scope on 2026-08-10** — recorded in `.oh/memory/2026-08-10/log.md`
   (the `spec-plan` / `spec-critique` entries for this slug carry the approved scope and routing).
   The scoping decision is made; this PRD executes it. Legs 1–3 are the load-bearing ones.

Consequently the "a reviewer can write the Sysbox adapter's signatures on paper" success metric is
a check against a **scheduled** consumer, not an imagined one. If #731's P0 ordering changes such
that no second target is scheduled, this slice should be re-scoped — but that is not the state
today.

### Where the decisions live

The Phase-0 boundary decisions are **not restated in this PRD**. They live in a new durable RFC,
`.oh/docs/rfcs/rfc-brain-hands-boundary.md` (US-001), because task folders get archived while
RFCs stay citable by #732/#734/Cloud #104. This PRD **cites** that RFC; it does not duplicate it.

## Goals

- Establish a narrow, capability-oriented `ExecutionTarget` contract in the core TypeScript
  surface with **zero Docker nouns** in the contract file (probe-enforced).
- Ship `DockerComposeExecutionTarget` as the first adapter by **wrapping** the existing
  `.oh/scripts/docker-compose.sh` machinery, not reimplementing it.
- Route the canonical `oh` lifecycle commands (`oh sandbox`, `oh shell`) through the contract
  while preserving operator UX byte-for-byte.
- Add capability discovery so higher-level orchestration never has to test `kind === "docker"`.
- Ratify the Phase-0 brain/hands boundary and the four-class state taxonomy in a durable RFC,
  and correct the three stale factual claims in `.oh/docs/rfcs/rfc-runtime-support.md`.
- Prove no regression: existing tests unchanged + a new tier-A probe.

## User Stories

### US-001: Ratify the Phase-0 brain/hands boundary in the RFC layer

**Description:** As an architect consuming EPIC #731 from #732, #734, or `openharness-cloud#104`,
I need the Phase-0 boundary decisions written down in a durable citable place so downstream
slices build against one contract instead of re-deriving the boundary.

This story is **gated first**: US-002..US-005 make design choices (workspace shape, capability
set, what stays brain-side) that are only defensible if the boundary is already written down.

**Artifact (a) — NEW RFC `.oh/docs/rfcs/rfc-brain-hands-boundary.md`** must contain:

1. **Brain/hands responsibility table.** Ralph, cron, autopilot, and memory are **brain**
   (orchestration/policy/state). Evals are **split by a stated capability rule**: an eval that
   only reads repo files is brain-side; an eval that needs to execute inside the environment is
   hands-side. The rule must be written as a rule, not a case list.
2. **The four-class state taxonomy**: `WorkspaceState` (user/project filesystem),
   `ExecutionState` (execution-machine state), `HarnessAuthState` (provider/auth/credentials),
   `SessionState` (orchestration/session identity) — with the **Hermes known-violation**
   documented explicitly as a known Phase-0 violation, not silently omitted.
3. **Workspace stance**: the contract carries `workspace: { hostRoot, targetRoot }`.
   **Identical-path mapping (`hostRoot === targetRoot`) is the ONLY supported Phase-0 worktree
   configuration**; non-identical mapping is documented as explicitly unsupported in Phase-0.
   The RFC must additionally state that **the two-field shape is speculative**: in Phase-0 only
   the degenerate equal case is legal, so the second field currently carries *permission*, not
   *semantics*. The Sysbox slice is expected to give it real semantics (or collapse it back to a
   single field) — the RFC says so in as many words rather than implying the shape is settled.

**RFC header (authority clause) — required.** The RFC opens with an explicit authority statement:
*"This file is the sole authority for Phase-0 brain/hands boundary decisions. Do not restate its
content in future PRDs, task folders, or wiki entries — cite it."* This is what keeps the decision
from fragmenting across prd.md + RFC + wiki with three copies to reconcile.

**Artifact (b) — AMEND `.oh/docs/rfcs/rfc-runtime-support.md`** with:

4. Three factual socket/dockerd corrections. Today's file claims the host Docker socket is
   bind-mounted by default; it is **opt-in and off by default** (the socket overlay is added
   only on request — `.oh/scripts/docker-compose.sh:136`), and the image ships the docker CLI
   but **no dockerd**. Correct all three sites: § Purpose (~line 13), § 1 axis **A1** row
   (~line 27), § 1 axis **A3** row (~line 29).
5. **Sysbox inserted as a NET-NEW item 1** in § 8 (proposed child-issue ordering), consistent with
   #731's Sysbox-first priority. Sysbox has **no existing entry in § 8 today** (zero grep hits) —
   this is an insertion, not a reorder. The existing entries (gVisor, Firecracker, Kata, managed
   sandboxes, CI-as-runtime, deploy-skill family, landscape memo) keep their relative order and
   renumber down by one.
6. **§ 9 "DinD trade-off" open decision marked answered** (Sysbox gives the tier its own dockerd,
   so sibling-container capability is not lost), with cross-links to #731, #733, and the new RFC.

**Acceptance Criteria:**

- [ ] `.oh/docs/rfcs/rfc-brain-hands-boundary.md` exists and contains a brain/hands
      responsibility table naming ralph, cron, autopilot, and memory as brain
- [ ] The RFC states the eval split as a **capability rule** (executes-in-environment vs.
      reads-repo-files), not an enumerated list of evals
- [ ] The RFC defines all four state classes by name: `WorkspaceState`, `ExecutionState`,
      `HarnessAuthState`, `SessionState`
- [ ] The RFC documents the Hermes known-violation of the state taxonomy explicitly
- [ ] The RFC states `workspace: { hostRoot, targetRoot }` and that identical-path mapping is
      the only supported Phase-0 worktree config, with non-identical mapping documented unsupported
- [ ] The RFC explicitly calls the two-field workspace shape **speculative** — in Phase-0 the
      second field carries permission, not semantics, and the Sysbox slice is expected to give it
      semantics or collapse it
- [ ] The RFC's header contains the authority clause: it is the **sole authority** for Phase-0
      boundary decisions and its content must be cited, not restated, in future PRDs/wiki entries
- [ ] The RFC records the **`attach()` synchrony decision and its migration path**: `attach()` is
      synchronous in `contractVersion: 1` because the process-runner seam is `spawnSync`-based and
      attach is a blocking terminal handoff; a future `contractVersion: 2` (Sysbox or #732) may
      make it async and migrate `runShell` and its assertions as a separately-reviewed change
- [ ] `.oh/docs/rfcs/rfc-runtime-support.md` no longer claims the host Docker socket is mounted
      by default at § Purpose, § 1 A1 row, or § 1 A3 row; each says opt-in/off-by-default and
      notes the image has the docker CLI but no dockerd
- [ ] `.oh/docs/rfcs/rfc-runtime-support.md` § 8 lists Sysbox as a **newly inserted** item 1 (it
      had no prior entry), with the pre-existing seven entries renumbered down by one in their
      original relative order
- [ ] `.oh/docs/rfcs/rfc-runtime-support.md` § 9 marks the DinD trade-off decision answered and
      links #731, #733, and `rfc-brain-hands-boundary.md`
- [ ] No source file under `.oh/cli/` is modified by this story (docs-only)
- [ ] CHANGELOG `## [Unreleased] → ### Added` entry for the new RFC
- [ ] Typecheck passes

### US-002: Define the provider-neutral `ExecutionTarget` contract

**Description:** As core orchestration code, I want a narrow capability-oriented execution
contract so I can provision, inspect, and execute inside an environment without knowing that
Docker exists.

**Scope: types and interface ONLY** at `.oh/cli/src/lib/execution/target.ts`. No implementation,
no imports of Docker/compose machinery, and — the hard rule — **no Docker nouns anywhere in the
file** (`container`, `containerId`, `compose`, `image`, `volume`, `dockerd`), enforced by the
US-005 probe.

Shape (per #733's sketch, with **three** deliberate refinements called out below):

```ts
export type ExecutionStatus = "absent" | "starting" | "ready" | "stopped" | "failed";

export type ExecutionCapability =
  | "exec" | "pty" | "files" | "ports" | "docker" | "snapshot";

export type ExecRequest = {
  argv: string[];                       // NOT `command: string`
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  stdio?: "inherit" | "capture";
  user?: string;
};

export type ExecResult = { exitCode: number; stdout: string; stderr: string };

export interface ExecutionTarget {
  readonly kind: string;
  readonly contractVersion: 1;
  readonly workspace: { hostRoot: string; targetRoot: string };
  provision?(): Promise<void>;
  status(): Promise<ExecutionStatus>;
  capabilities(): Promise<ReadonlySet<ExecutionCapability>>;
  exec(request: ExecRequest): Promise<ExecResult>;
  attach?(request: ExecRequest): number;   // SYNC in contractVersion 1 — see refinement 3
  destroy?(): Promise<void>;
  describe(): string;
}
```

**Deliberate refinements to #733's sketch (state the rationale in a file-header comment):**

- **(1) `ExecRequest.argv: string[]` instead of `command: string`.** The codebase bans shell
  strings — every subprocess invocation is argv-array form (`.oh/cli/src/commands/lifecycle.ts`
  file header; `lib/tmux.ts`). A `command: string` field would reintroduce shell-injection
  surface at the exact seam we are creating.
- **(2) `ExecutionStatus` gains `"absent"`** — #733's four states cannot express "the target has
  never been provisioned", which `status()` must return before `provision()` runs.
- **(3) `attach?()` is SYNCHRONOUS in `contractVersion: 1` — `attach?(request): number`, not
  `Promise<number>`.** This is the resolution of the round-1 blocking contradiction (see below).
- `"docker"` is added to the capability union so callers can ask *"can I reach a Docker daemon
  in here?"* without a `kind` check. `"snapshot"` is present as a **literal only** — there are
  deliberately **no snapshot methods** on the interface in this slice.

#### Why `attach()` is synchronous (resolves critique H1)

Round 1 flagged a real internal contradiction: the PRD demanded both an async
`attach(): Promise<number>` *and* "every `lifecycle.test.ts` assertion passes UNCHANGED", while
`runShell` is `export function runShell(opts, io): number` (`.oh/cli/src/commands/lifecycle.ts:298`)
and its tests assert synchronously — `expect(runShell(...)).toBe(0)`
(`lifecycle.test.ts:362`, `:428`) and `expect(() => runShell(...)).toThrow(...)` (`:435`). An async
`attach()` forces `runShell` to return a `Promise`, which `toBe(0)` and `toThrow()` cannot observe.

**Decision (option A — keep the compat oracle literally true): `attach()` is declared synchronous
in `contractVersion: 1`.** Rationale, all verifiable in today's code:

- The entire execution seam this contract wraps is **already synchronous**. `LifecycleRunner` is
  `(cmd, args, opts) => RunResult` (`lifecycle.ts:49-53`) and the real runner is `spawnSync`
  (`lifecycle.ts:59`). A sync `attach()` is the *existing* pattern, not a concession.
- `attach()` is a **terminal handoff**: it inherits stdio, blocks until the child exits, and
  returns the exit code. There is nothing to await — the async signature would have been
  ceremony wrapping a `spawnSync`.
- `runSandbox` is **already `async`** (its tests `await runSandbox(...)`, `lifecycle.test.ts:113`),
  so `provision?(): Promise<void>` needs no change and is left async. The asymmetry is deliberate
  and documented, not accidental.
- `contractVersion: 1` is the versioning escape hatch. **Documented migration path:** if the
  Sysbox slice (or #732's remote/durable sessions) needs a non-blocking attach, it bumps to
  `contractVersion: 2` with `attach(): Promise<number>` — or adds a sibling async method — and
  migrates `runShell` and its assertions then, as a deliberate, separately-reviewed change. That
  migration note is written into `rfc-brain-hands-boundary.md` in US-001 and into the `target.ts`
  header comment.

Because of this, the US-005 **COMPAT ORACLE stays at its strongest form: zero assertion edits in
`lifecycle.test.ts`.** It is not downgraded to "assertions may be updated mechanically".

**Acceptance Criteria:**

- [ ] `.oh/cli/src/lib/execution/target.ts` exists and exports `ExecutionStatus`,
      `ExecutionCapability`, `ExecRequest`, `ExecResult`, `ExecutionTarget`
- [ ] `ExecutionStatus` is exactly `"absent" | "starting" | "ready" | "stopped" | "failed"`
- [ ] `ExecutionCapability` is exactly `"exec" | "pty" | "files" | "ports" | "docker" | "snapshot"`
- [ ] `ExecRequest` uses `argv: string[]`; the file contains no `command: string` field
- [ ] `ExecutionTarget` declares `readonly contractVersion: 1` and
      `readonly workspace: { hostRoot: string; targetRoot: string }`
- [ ] `capabilities()` returns `Promise<ReadonlySet<ExecutionCapability>>`
- [ ] **`attach?()` is declared SYNCHRONOUS: `attach?(request: ExecRequest): number`** — NOT
      `Promise<number>`. `provision?()`, `status()`, `capabilities()`, `exec()`, and `destroy?()`
      stay async. This is what keeps `runShell`'s public `: number` signature (and therefore the
      US-005 zero-assertion-edit compat oracle) achievable
- [ ] `ExecResult` is `{ exitCode: number; stdout: string; stderr: string }` — `stderr` is a
      required field, and US-003 is responsible for actually populating it (see US-003)
- [ ] The interface declares no snapshot method (grep for `snapshot(` returns nothing)
- [ ] `target.ts` contains no Docker nouns (case-insensitive: `container`, `compose`, `image`,
      `volume`, `docker`) **except** the `"docker"` capability string literal and its doc comment
- [ ] `target.ts` has no runtime imports (types/interfaces only)
- [ ] A file-header comment records the **three** refinements (`argv` over `command`, added
      `"absent"`, synchronous `attach()`) with rationale, **plus** the documented migration path
      that a future `contractVersion: 2` may make `attach()` async
- [ ] **The header comment is worded generically — it contains NO Docker nouns.** Refinement (1)
      cites *"the codebase bans shell strings; every subprocess invocation is argv-array form"*;
      refinement (3) cites *"the existing synchronous process-runner seam"*. Neither names Docker,
      `docker exec`, containers, compose, or images. (Probe C2 bans those nouns file-wide except
      the `"docker"` capability literal and its own doc comment — the header is not that comment.)
- [ ] Typecheck passes

### US-003: Implement `DockerComposeExecutionTarget` by delegating to existing machinery

**Description:** As a maintainer, I want the Docker adapter to *wrap* the proven compose
machinery rather than reimplement it, so today's behavior is preserved by construction rather
than by luck.

Three files:

1. `.oh/cli/src/lib/execution/docker-compose-target.ts` — `DockerComposeExecutionTarget`
   implementing `ExecutionTarget`. It **delegates** to `.oh/scripts/docker-compose.sh` for all
   compose argv assembly (harness.yaml-derived env, compose overrides, docker-socket opt-in, SSH
   overlay + port collision checks, Hermes overlay, sandbox naming, project-root behavior).
   Do **not** reassemble compose argv in TypeScript.
2. `.oh/cli/src/lib/execution/runner.ts` — the `LifecycleRunner` type and the real
   `spawnRunner` extracted out of `.oh/cli/src/commands/lifecycle.ts` (currently defined around
   line 49) and **re-exported from `lifecycle.ts` for back-compat**, so no existing import path
   breaks.
3. `.oh/cli/src/lib/execution/index.ts` — an **internal** `resolveExecutionTarget()` factory.
   Internal and defaulted to Docker; **no user-facing target selector config** is exposed.

**Capability detection mechanism (pinned — no TS reimplementation).** `capabilities()` must return
`"docker"` **only when the docker-sock overlay is enabled**; with the overlay off, the returned set
must omit `"docker"`. The opt-in logic lives entirely in `.oh/scripts/docker-compose.sh`
(`truthy()` at line 63; the overlay is appended at line 136) and there is no queryable primitive —
so the adapter **must not** reimplement `truthy()`/`harness.yaml` parsing in TypeScript. Instead it
**shells the script's own non-executing oracle**: run `.oh/scripts/docker-compose.sh --print-argv`
(via the injected runner, `stdio: "capture"`) and inspect the emitted `-f` file list for a path
ending in `docker-compose.docker-sock.yml`. Present → `"docker"` is in the set; absent → it is not.
The script remains the single source of truth for the opt-in decision. The set always contains
`"exec"` and `"pty"`.

**stderr stance (decided — resolves critique M/US-002-US-003).** `ExecResult.stderr` is a **real
captured value, not a stub**. Today `RunResult` (`lifecycle.ts:38-46`) carries only `stdout`, even
though the capture-mode `spawnSync` call already pipes stderr (`lifecycle.ts:62`) and simply
discards `r.stderr`. **Extending `RunResult` with an optional `stderr?: string` and populating it in
`spawnRunner` is IN SCOPE for US-003** — it is a two-field change on the runner being extracted
anyway, additive and back-compatible (existing fake runners that omit `stderr` still typecheck).
`ExecResult.stderr` is `""` only for `stdio: "inherit"` runs, where stderr went to the terminal and
was never captured — that case is documented in the adapter, not silently empty.

**Extraction checkpoint (ordering requirement).** The `LifecycleRunner`/`spawnRunner` extraction
into `runner.ts` (file 2) has its **own** failure mode — a broken back-compat re-export — that a
green adapter can mask. It must therefore reach a **standalone green-tests checkpoint** (extraction
+ re-export only, no adapter, full existing suite passing) **before** the adapter lands on top.

**Acceptance Criteria:**

- [ ] `.oh/cli/src/lib/execution/docker-compose-target.ts` exports
      `DockerComposeExecutionTarget implements ExecutionTarget`
- [ ] The adapter invokes `.oh/scripts/docker-compose.sh` for compose operations; it contains no
      hand-assembled `-f <overlay>` compose argv list
- [ ] `.oh/cli/src/lib/execution/runner.ts` holds `LifecycleRunner` + the real spawn runner, and
      `.oh/cli/src/commands/lifecycle.ts` re-exports `LifecycleRunner` so existing imports resolve
- [ ] **The extraction reaches its own green checkpoint first**: with `runner.ts` + the
      `lifecycle.ts` re-export in place and **no adapter yet**, the full existing test suite and
      typecheck pass. Only then does the adapter land on top (recorded as an ordering note in the
      PR description or an intermediate commit, so the two failure modes stay separable)
- [ ] `.oh/cli/src/lib/execution/index.ts` exports an internal `resolveExecutionTarget()` that
      returns a `DockerComposeExecutionTarget`
- [ ] No `harness.yaml` key, CLI flag, or env var is added to select a target
- [ ] `capabilities()` includes `"docker"` when the docker-sock overlay is on and omits it when off
- [ ] **The docker-detection mechanism is exactly:** the adapter shells
      `.oh/scripts/docker-compose.sh --print-argv` through the injected runner (`stdio: "capture"`)
      and tests whether the emitted `-f` file list contains a path ending in
      `docker-compose.docker-sock.yml`. The adapter contains **no TypeScript reimplementation of
      `truthy()`**, no `harness.yaml` parsing for `sandbox.docker_socket`, and no hardcoded
      env-var read for `DOCKER_SOCKET`
- [ ] `capabilities()` always includes `"exec"` and `"pty"`
- [ ] **`RunResult` gains `stderr?: string` and `spawnRunner` populates it from `spawnSync`'s
      piped stderr on `stdio: "capture"` runs** (the field is already piped and currently
      discarded). The change is additive — fake runners that omit `stderr` still typecheck
- [ ] **`exec()` returns real captured `stderr`** for `stdio: "capture"` runs; it returns `""`
      for `stdio: "inherit"` runs, and a code comment states that this is because inherited
      stderr went to the terminal and was never captured
- [ ] The adapter accepts an injected runner (DI seam) so tests never spawn a real subprocess
- [ ] Typecheck passes
- [ ] Tests pass

### US-004: Route `oh sandbox` and `oh shell` through the contract

**Description:** As an operator, I want `oh sandbox` and `oh shell` to keep behaving exactly as
they do today while internally going through the execution contract, so the abstraction is
invisible to me.

- `oh sandbox` → `target.provision()`
- `oh shell` → `target.attach()`, **replacing** the direct `docker exec -it -u sandbox <name>
  zsh` in `.oh/cli/src/commands/lifecycle.ts:298` `runShell` — that is the TS bypass this slice
  closes. **`runShell` keeps its exact public signature `(opts, io): number` and stays
  synchronous**, because `attach()` is synchronous in `contractVersion: 1` (US-002, refinement 3).
  Adding `async` to `runShell` — or having it return a `Promise` in any form — is a **story
  failure**, not an implementation detail: it breaks the US-005 compat oracle by construction.
  (`runSandbox` is already `async` and stays so; `provision()` remains `Promise<void>`.)
- `oh gateway` **deliberately stays brain-side** and is NOT routed through the contract. The
  gateway is orchestration/policy, not execution; routing it would be a boundary violation. This
  is an intentional decision, to be recorded in a code comment.

**Boundary-inversion review criterion (hard):** operator policy must stay in the *command*, not
migrate into `provision()`. Specifically `seedHarnessYaml`, the interactive Docker-socket opt-in
prompt, and sandbox image resolution stay in `.oh/cli/src/commands/lifecycle.ts`. If any of them
drift into `provision()`, the brain/hands boundary is violated on day one and the story is not done.

The Makefile's `docker exec` line (`Makefile:49`) **stays as-is** — `make shell` is not in scope
and the line is pinned by the US-005 probe against accidental drift.

**Acceptance Criteria:**

- [ ] `runSandbox` obtains a target via `resolveExecutionTarget()` and calls `provision()`
- [ ] `runShell` no longer contains a literal `docker` `exec` argv; it calls `attach()`
- [ ] The `runShell` doc comment (`.oh/cli/src/commands/lifecycle.ts:291-296`) is updated to
      describe `attach()`-based delegation, not a literal `docker exec` invocation
- [ ] **`runShell`'s signature is still `export function runShell(opts: ShellOptions, io:
      LifecycleIO): number`** — not `async`, not returning a `Promise` (`git diff` on that
      signature line shows only the body changing)
- [ ] `runGateway` is unchanged and a comment records that the gateway stays brain-side by design
- [ ] `seedHarnessYaml`, the Docker-socket prompt, and image resolution remain in
      `.oh/cli/src/commands/lifecycle.ts` — `provision()` performs none of them
- [ ] `Makefile:49` still contains its `docker exec -it -u $(SHELL_USER) $(SHELL_CONTAINER) zsh` line
- [ ] `oh shell`'s container-name precedence (positional arg > `sandbox.name` in `harness.yaml` >
      `openharness`) and its non-zero-exit hint text are unchanged
- [ ] Wiki entry `.oh/skills/wiki/corpus/oh-cli-portable-lifecycle.md` is updated to describe the
      new execution seam (`oh shell` → `attach()`, `oh sandbox` → `provision()`, `oh gateway`
      brain-side), with `updated:` bumped and `.oh/docs/rfcs/rfc-brain-hands-boundary.md` added
      to `sources:` (see § Wiki Alignment)
- [ ] **Word budget honored:** `oh-cli-portable-lifecycle.md` is **657 words today** against the
      schema's ≤900-word architecture cap, leaving ~243 words of headroom for a materially new
      concept. The story must **trim existing prose** (the now-stale direct-`docker exec`
      narration is the natural donor) so the final entry is **≤900 words**, verified with
      `wc -w` and reported in the PR
- [ ] `bash .oh/evals/probes/wiki-readme-index.sh` passes
- [ ] CHANGELOG `## [Unreleased] → ### Changed` entry noting lifecycle commands now route
      through the execution contract with no behavior change
- [ ] Typecheck passes
- [ ] Tests pass

### US-005: Prove no regression — tests + tier-A probe

**Description:** As a reviewer, I need mechanical proof that the abstraction changed no operator
behavior, so I can approve the seam without re-reasoning about Docker.

Four test surfaces:

1. **New** `.oh/cli/src/__tests__/execution-target.test.ts` — using a fake runner:
   - exact argv assertions for `provision()` and `attach()`;
   - capability discovery in **both** socket states (overlay on → set contains `"docker"`;
     overlay off → set omits `"docker"`);
   - an `stdio: "inherit"` streaming case that exercises the pass-through path (a `capture`-only
     test suite would silently drop live build output and interactive shells — the #1 critic risk);
   - **a minimal `exec()` case** so the method does not ship as dead, unverified surface: with a
     fake runner returning `{ status: 0, stdout: "hi", stderr: "warn" }`, `exec()` resolves to
     `{ exitCode: 0, stdout: "hi", stderr: "warn" }` — proving both argv pass-through and that
     `stderr` is genuinely plumbed (US-003) rather than hardcoded.
2. **Compat oracle (kept at full strength):** every existing assertion in
   `.oh/cli/src/__tests__/lifecycle.test.ts` passes **UNCHANGED** — zero assertion edits. This is
   achievable *because* `attach()` is synchronous in `contractVersion: 1` (US-002, refinement 3),
   which keeps `runShell` sync and keeps `expect(runShell(...)).toBe(0)` (`:362`, `:428`) and
   `expect(() => runShell(...)).toThrow(...)` (`:435`) valid. If an assertion has to change,
   behavior changed and the slice failed.
3. **Argv equivalence:** `.oh/scripts/__tests__/compose-args.test.ts` gains a case proving the
   adapter's compose argv is identical to today's argv, using
   `.oh/scripts/docker-compose.sh --print-argv` as the non-executing oracle.
4. **New probe** `.oh/evals/probes/execution-target-contract.sh` (tier A, standard 3-state
   PASS/REGRESSION/SKIPPED oracle), with exactly five checks:
   - C1: `.oh/cli/src/lib/execution/target.ts` exists
   - C2: `target.ts` contains no Docker nouns (excepting the `"docker"` capability literal)
   - C3: `target.ts` declares no snapshot method
   - C4: `runShell` in `.oh/cli/src/commands/lifecycle.ts` contains no direct `docker exec` argv.
     **Matching strategy (pinned):** C4 inspects **argv literals passed to the runner** — it
     asserts no `["exec", "-it", …]` argv array is constructed outside the adapter — and is
     **not** a naive text grep of the file. Comments and doc prose can therefore neither trip C4
     nor falsely satisfy it.
   - C5: `Makefile` still contains, **verbatim**, the line
     `docker exec -it -u $(SHELL_USER) $(SHELL_CONTAINER) zsh` — a whole-line exact match, not a
     loose `grep -q "docker exec"` (which would stay green through an argument-level regression).

**Acceptance Criteria:**

- [ ] `.oh/cli/src/__tests__/execution-target.test.ts` exists and uses a fake runner (no real
      subprocess spawned)
- [ ] It asserts exact argv for `provision()` and `attach()`
- [ ] It asserts capability discovery in both socket states (`"docker"` present / absent)
- [ ] It exercises `stdio: "inherit"` streaming, not only `"capture"`
- [ ] It contains a **minimal `exec()` unit test** against a fake runner asserting the resolved
      `{ exitCode, stdout, stderr }` — `exec()` must not ship as untested surface
- [ ] `.oh/cli/src/__tests__/lifecycle.test.ts` passes with **zero** assertion edits
      (`git diff` on that file shows no changed expectations) — no `await`/`async`/`rejects`
      rewrites of the `runShell` cases either
- [ ] `.oh/scripts/__tests__/compose-args.test.ts` has a new case asserting adapter argv ≡
      today's argv via `--print-argv`
- [ ] `.oh/evals/probes/execution-target-contract.sh` exists, is `tier: A`, executable, and
      implements exactly checks C1–C5
- [ ] **Probe C2 is dry-run against the FINAL `target.ts` header text** before the story is called
      done — i.e. C2 is executed against the real committed header comment and passes, proving the
      generically-worded header (US-002) does not trip the Docker-noun ban
- [ ] **Probe C5 asserts the Makefile line verbatim** (exact whole-line match on
      `docker exec -it -u $(SHELL_USER) $(SHELL_CONTAINER) zsh`), not a substring `docker exec` test
- [ ] The probe exits 0 (PASS) on the finished branch, and exits non-zero if `target.ts` is
      edited to mention a container (verified by rejection, not just by a green run)
- [ ] `bash .oh/evals/probes/execution-target-contract.sh` is green in a full `/eval` run
- [ ] Typecheck passes
- [ ] Tests pass

## Functional Requirements

- FR-1: A new RFC `.oh/docs/rfcs/rfc-brain-hands-boundary.md` records the brain/hands
  responsibility table, the four-class state taxonomy (with the Hermes known-violation), and the
  workspace stance with identical-path mapping as the only supported Phase-0 worktree config.
- FR-2: `.oh/docs/rfcs/rfc-runtime-support.md` is corrected at § Purpose, § 1 A1, and § 1 A3 to
  state the host Docker socket is opt-in/off-by-default and the image has no dockerd.
- FR-3: `.oh/docs/rfcs/rfc-runtime-support.md` § 8 gains Sysbox as a **net-new item 1** (it has no
  entry today); the seven existing entries renumber down by one. § 9's DinD open decision is
  marked answered and cross-links #731, #733, and the new RFC.
- FR-3b: `rfc-brain-hands-boundary.md` carries an authority clause (sole authority for Phase-0
  boundary decisions; cite, do not restate) and calls the two-field workspace shape speculative.
- FR-4: `.oh/cli/src/lib/execution/target.ts` defines the `ExecutionTarget` contract as types and
  interface only, with no Docker nouns.
- FR-5: `ExecRequest` carries `argv: string[]`; shell-string command fields are forbidden.
- FR-6: `ExecutionStatus` includes `"absent"`; `ExecutionCapability` includes `"docker"` and
  `"snapshot"`, with no snapshot methods on the interface.
- FR-7: `DockerComposeExecutionTarget` implements the contract by delegating to
  `.oh/scripts/docker-compose.sh`.
- FR-8: `LifecycleRunner` moves to `.oh/cli/src/lib/execution/runner.ts` and is re-exported from
  `lifecycle.ts` for back-compat.
- FR-9: `resolveExecutionTarget()` is internal and defaults to Docker; no user-facing selector.
- FR-10: `oh sandbox` calls `provision()`; `oh shell` calls `attach()`; `oh gateway` is unrouted.
- FR-11: Operator policy (`seedHarnessYaml`, socket prompt, image resolution) stays in the
  command layer.
- FR-12: `capabilities()` reports `"docker"` only when the docker-sock overlay is enabled,
  detected by shelling `.oh/scripts/docker-compose.sh --print-argv` and looking for
  `docker-compose.docker-sock.yml` in the emitted `-f` list — never by reimplementing `truthy()`.
- FR-13: New unit tests cover exact argv, capability discovery in both socket states,
  `stdio: "inherit"` streaming, and a minimal `exec()` result assertion.
- FR-14: Existing `lifecycle.test.ts` assertions pass unchanged (zero edits).
- FR-15: `compose-args.test.ts` proves adapter argv ≡ today's argv via `--print-argv`.
- FR-16: A tier-A probe `.oh/evals/probes/execution-target-contract.sh` enforces C1–C5, with C5 a
  verbatim whole-line Makefile match and C2 dry-run against the final `target.ts` header text.
- FR-17: `attach?()` is synchronous (`: number`) in `contractVersion: 1`; `runShell` keeps its
  public sync `: number` signature. A future `contractVersion: 2` may make `attach()` async.
- FR-18: `RunResult` gains `stderr?: string`, populated by `spawnRunner` on capture runs, so
  `ExecResult.stderr` is genuinely captured rather than stubbed (`""` only for inherit runs).

## Non-Goals (Out of Scope)

Explicitly **not** in this task:

- **No RPC.** No remote execution protocol, no wire format, no daemon or network control plane.
- **No Sysbox implementation.** Sysbox is promoted in the RFC ordering only; the adapter is a
  later slice.
- **No snapshot methods.** `"snapshot"` exists as a capability literal to prove the escape hatch;
  no `snapshot()`/`restore()` is added.
- **No target selector configuration.** `resolveExecutionTarget()` stays internal and
  Docker-defaulted. No `harness.yaml` key, CLI flag, or env var.
- **No rewrites of `.oh/scripts/*`.** `docker-compose.sh` and friends are wrapped, not rewritten.
- **No #732 or #734 work.** Session events (`execution.attached` / `execution.released`) and
  credential/capability separation are named as future consumers only; nothing is emitted here.
- **No Makefile change.** `Makefile:49`'s `docker exec` stays and is probe-pinned.
- **No `oh gateway` routing.** Deliberately brain-side.
- **No Firecracker/gVisor/Kata/E2B/Daytona work**, no Kubernetes-style scheduling.
- **No async `attach()` migration.** `attach()` is sync in `contractVersion: 1`. Bumping the
  contract version and migrating `runShell` to async is a later, separately-reviewed change.
- **No ongoing PRD⇄RFC reconciliation.** Once this PR merges,
  `.oh/docs/rfcs/rfc-brain-hands-boundary.md` is the **sole source of truth** for the Phase-0
  boundary decisions. This task folder is a build artifact that gets archived; there is **no
  obligation to keep archived task-folder content consistent with the RFC**, and no obligation to
  re-open this PRD when the RFC is later amended. Future work cites the RFC and amends the RFC.

## Rollback

Single PR, **revert-safe via `git revert`**. The change is additive files plus two in-place
refactors (`runner.ts` extraction with a back-compat re-export; `runShell`/`runSandbox` routing).
It writes **no persisted state**, adds **no migration**, introduces **no config key, CLI flag, or
env var**, and changes **no on-disk format** — so reverting the merge commit restores the previous
behavior exactly, with no data or operator cleanup step. Nothing outside the repo needs undoing.

## Technical Considerations

- `.oh/cli/` is a real published TypeScript package (`@mifune/openharness`, bin `oh`,
  host-installable via `get-oh.sh` with no repo clone) — the host-mode Operator vehicle already
  exists, so this contract lands in shippable code, not a prototype.
- All compose argv already flows through `.oh/scripts/docker-compose.sh`, and that script has a
  `--print-argv` mode (`.oh/scripts/docker-compose.sh:17`) that prints argv without executing —
  it is the ready-made non-executing test oracle for FR-15.
- `lifecycle.ts` already delegates through an injectable `LifecycleRunner`
  (`.oh/cli/src/commands/lifecycle.ts:49`), so the adapter is an **interface extraction**, not a
  rewrite. This is why "delegate, don't rewrite" is cheap here.
- The host docker socket is **opt-in and off by default**; the image ships the docker CLI but no
  dockerd. That fact drives both the RFC corrections (US-001) and the two-state capability test
  (US-005).
- Argv-array form is a codebase-wide invariant (`lifecycle.ts` header, `lib/tmux.ts`); this is
  the reason `ExecRequest` takes `argv`, not `command`.

## Success Metrics

- `oh sandbox` and `oh shell` behave identically before and after — zero assertion edits in
  `lifecycle.test.ts`.
- Adapter-produced compose argv is byte-identical to today's argv under `--print-argv`.
- Zero Docker nouns in `target.ts` (probe C2 green).
- A reviewer can write the Sysbox adapter's method signatures on paper against the interface
  without adding, removing, or reshaping a method — the anti-"one-adapter-shaped abstraction" test.
  Sysbox is **#731's scheduled P0 next slice** (see § Why now), so this is a check against a real
  queued consumer, not a hypothetical one.
- `/eval` stays green; `execution-target-contract.sh` is a new green tier-A probe.

## Wiki Alignment

**Impact: REQUIRED**

**Local entries** (`.oh/skills/wiki/corpus/`, per `.oh/skills/wiki/references/schema.md`):

| Entry | Relationship | Action |
|---|---|---|
| `oh-cli-portable-lifecycle` | **Directly invalidated.** Its `sources:` list names `.oh/cli/src/commands/lifecycle.ts`, `.oh/cli/src/lib/remote.ts`, and `.oh/scripts/docker-compose.sh` — exactly the files US-003/US-004 reshape. Its description of `oh shell` as a direct `docker exec` becomes false. | **Revise in US-004** |
| `runtime-isolation-landscape` | Adjacent — the substrate survey behind #591/`rfc-runtime-support.md`. Not invalidated by this slice (no runtime lands). | No change; may gain a `[[...]]` cross-link |
| `crabbox-remote-exec-control-plane` | Adjacent — remote-exec control-plane prior art; a future consumer of the contract, not a subject of it. | No change |
| `sandbox-dependency-installs`, `fresh-machine-setup` | Operator-setup facts unchanged by an invisible refactor. | No change |

**Spec alignment:** the PRD's Non-Goals bound the wiki work too — the wiki records *what is true
after this slice* (the seam exists, `oh shell` attaches through it, `oh gateway` stays brain-side,
Docker remains the only adapter), and must **not** describe Sysbox, RPC, snapshots, or a target
selector as existing. The durable architectural rationale belongs in
`.oh/docs/rfcs/rfc-brain-hands-boundary.md` (US-001); the wiki entry cites it rather than
restating it, matching the schema's `docs/` vs. wiki boundary (schema § 1).

**DeepWiki comparison:** best-effort — the public DeepWiki for `mifunedev/openharness` was not
fetched during planning (network access not exercised in this spec-only node). The DeepWiki
standard is still applied structurally per schema § 2: the revised entry must lead with
`## Relevant Source Files` naming `.oh/cli/src/lib/execution/target.ts`,
`docker-compose-target.ts`, and `.oh/cli/src/commands/lifecycle.ts`; line-cite the routing
claims; and carry a compact Mermaid or table view of the brain/hands ownership boundary. `/spec
execute` should re-attempt the DeepWiki comparison when network is available and reconcile any
divergence in the same branch.

**Wiki acceptance criteria** (carried by **US-004**):

- [ ] `.oh/skills/wiki/corpus/oh-cli-portable-lifecycle.md` describes the execution seam:
      `oh sandbox` → `provision()`, `oh shell` → `attach()`, `oh gateway` deliberately brain-side
- [ ] The entry no longer states that `oh shell` runs `docker exec` directly
- [ ] `sources:` gains `.oh/cli/src/lib/execution/target.ts` and
      `.oh/docs/rfcs/rfc-brain-hands-boundary.md`; `updated:` bumped to the build date
- [ ] The entry stays within the schema word cap (≤ 900 words for an architecture entry). It is
      **657 words today**, so the seam description must be paid for by **trimming existing prose**
      (the stale direct-`docker exec` narration is the donor); verify with `wc -w` and state the
      final count in the PR
- [ ] `bash .oh/evals/probes/wiki-readme-index.sh` passes (README index regenerated if needed)

## Open Questions

Each open question below carries an **owner and a due point**; neither is left as "someone else's
problem". Both discharge steps are **`/spec execute`-phase actions** — this planning node writes no
GitHub state.

1. **`.oh/docs/**` is absent from the `oh update` manifest allowlist** — docs never ship
   downstream to installed `oh` users. Both RFCs written/amended in US-001 are therefore invisible
   to anyone who installed via `get-oh.sh` without cloning the repo. This is **flagged, not fixed
   here**: changing the manifest allowlist is a separate decision with its own payload-size and
   update-semantics trade-offs.
   - **Owner:** the `/spec execute` operator for this slice.
   - **Due:** *the same session the PR goes up* — do not defer to review.
   - **Execute-phase step:** file a follow-up issue under EPIC #731 ("`oh update` manifest
     allowlist excludes `.oh/docs/**` — RFCs never reach installed users"), and link it from this
     PR's description. Archived task-folder flags historically vanish; the issue is the receipt.
2. **Is identical-path worktree mapping too strict for `openharness-cloud#104`?** Phase-0 supports
   only `hostRoot === targetRoot`. Cloud's golden-image provisioning may need a host path that
   differs from the in-target path. If so, either Phase-0's stance loosens or Cloud carries a
   documented exception.
   - **Owner:** whoever plans **#734** (credentials / capability separation) — that spec is the
     first one that must actually resolve the host↔target path question.
   - **Due:** resolved in the **#734 planning spec**, i.e. before any #734 implementation begins;
     explicitly **not** during #734's build.
   - **Execute-phase step:** during `/spec execute`, post a **comment on EPIC #731** (a comment,
     **not** a body edit — sibling slices #732/#734 touch the same EPIC body concurrently and a
     body edit is a two-writer race) reading *"#734 planning spec must resolve: identical-path
     worktree mapping vs. openharness-cloud#104 (deferred from #733, see
     `rfc-brain-hands-boundary.md` § Workspace stance)"* — so the deferral is tracked on the epic
     rather than only in an archived folder. (No GitHub write happens at plan time.)
3. Should `ExecutionCapability` gain `"watch"` (filesystem watch) now, or wait for a caller? #733
   lists it as an example; no current consumer needs it, so it is omitted here.

## References

- Issue [#733](https://github.com/mifunedev/openharness/issues/733) — this slice (anchor)
- EPIC [#731](https://github.com/mifunedev/openharness/issues/731) — brain/hands decoupling (`Refs`)
- [#591](https://github.com/mifunedev/openharness/issues/591) / [#592](https://github.com/mifunedev/openharness/issues/592) — runtime support program
- `.oh/docs/rfcs/rfc-brain-hands-boundary.md` (created by US-001) — Phase-0 boundary decisions
- `.oh/docs/rfcs/rfc-runtime-support.md` (amended by US-001) — runtime axes taxonomy
- `.oh/cli/src/commands/lifecycle.ts` — `LifecycleRunner` (~line 49), `runShell` (~line 298)
- `.oh/scripts/docker-compose.sh` — compose argv assembly; `--print-argv` oracle (line 17)
