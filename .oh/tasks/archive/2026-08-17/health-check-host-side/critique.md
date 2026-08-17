# Critique — health-check-host-side (issue #762)

Two adversarial critics ran in parallel against `prd.md` + `prd.json` before any
implementation. Critic A took the implementer lens, critic B the operator lens.
Both returned **APPROVE-WITH-CHANGES**. Fourteen findings; thirteen accepted, one
accepted with an amendment, one rejected with a reason. Every disputed claim was
re-verified here before the plan was revised.

## Verification of the load-bearing claims

| Claim | Verification | Result |
|---|---|---|
| A7: `memory-log-locked-append.sh` asserts a **second** thing about this skill | Read the probe: line 16-18 requires `AUDIT_RUN_ID` in `.oh/skills/health-check/SKILL.md`; line 19 requires the locked-append line | **CONFIRMED** — my regression table named one constraint where there are two |
| A3: `docker context` resolves the endpoint independently of `DOCKER_HOST` | `docker context inspect --format '{{.Endpoints.docker.Host}}'` → `unix:///var/run/docker.sock`, `rc=0`, **with no daemon running** | **CONFIRMED** — and it is free: a config read, not a daemon call. Its narrow Go template also satisfies this repo's own `deny-env-dump.sh` inspect guard |
| A10: the "no host-side agent runtime" rationale is contradicted by the repo | `ls -la CLAUDE.md` → `CLAUDE.md -> AGENTS.md`; root `AGENTS.md` § Permissions grants the orchestrator `docker`, `docker compose`, `gh` at the project root, and its skills table lists `/health-check` | **CONFIRMED — my rationale was wrong.** See below |
| A11: an open roadmap row could be misread as folding in a different subsystem | `.oh/docs/roadmap.md:195` — `` `sandbox-healthcheck.sh` \| → SKILL *(verify `/health-check` owns it)* `` | **CONFIRMED** |
| A1/A2/A5: `[ -S path ]` is true for a bound-but-dead socket and for a `chmod 000` socket | Critic A bound one with python3 and showed `[ -S ]` true while `connect()` gave `[Errno 111] Connection refused` | **CONFIRMED** |

Incidental finding while re-verifying: an `AF_UNIX` bind fails with
`OSError: AF_UNIX path too long` under this session's scratchpad path (the 108-byte
`sun_path` limit). The probe's socket fixture must live at a short path
(`mktemp -d /tmp/hc-probe.XXXXXX`), not a deep one. Recorded because the probe
would otherwise have failed for a reason unrelated to what it tests.

## The correction that changes the design, not just the wording

`prd.md` justified rejecting Option 1 with "there is no agent runtime on the host."
**That is false**, and this repo's own always-loaded context says so: root
`AGENTS.md` (reached as `CLAUDE.md`, a symlink) defines the **orchestrator** — an
agent that runs at the host project root, is explicitly permitted `docker`,
`docker compose` and `gh`, and carries `/health-check` in its own skills table.

The load-bearing half of the argument survives: an agent **inside the sandbox**
cannot reach host state, and #756 exists to keep it that way. But the conclusion
improves. The host-side runner is not a vague "operator" who may or may not have
the repo — it is a **documented role in this harness, with the repo checked out at
the project root and Docker permissions already granted**. So the rehome has a real
addressee:

> Docker triage moves from "commands the sandboxed agent runs" to **"the procedure
> the orchestrator runs at the host project root"** — a role that already exists,
> already has the socket, and already lists this skill.

This also answers critic B's finding 3 (who runs the host block, and how the
results return) concretely instead of hand-wavily. The plan and the skill now name
the orchestrator session.

## Findings and disposition

### Accepted — detection correctness (A1, A2, A3, A4, A5, A8)

`[ -S "$SOCK" ]` alone cannot distinguish a live daemon from a dead one, an
unreadable one, or a socket left behind by an OOM-killed daemon. Classifying any of
those `available` reproduces the exact nine-failure wall this issue exists to kill,
in a shape no test covered. Accepted in full:

- `DOCKER_TRIAGE=available` requires a **single round-trip** (`docker version` with
  a short `timeout`), not a file-type test.
- The three-state vocabulary changes to **`available | host-only | unreachable`**.
  `unverified` is **removed as a terminal state** — critic A separately found (A8)
  that nothing in the task graph forced it to ever be resolved, so an implementer
  could ship a script that reports `unverified` and stops. Collapsing it means
  every endpoint is resolved by construction: absent endpoint → `host-only` with
  zero daemon contact; present endpoint (unix **or** tcp) → one round-trip →
  `available` or `unreachable`. At most one failure, never nine, on every path.
- Endpoint resolution order becomes `HEALTH_CHECK_DOCKER_SOCK` (test knob) →
  `DOCKER_HOST` → `docker context inspect` → `/var/run/docker.sock` →
  `${XDG_RUNTIME_DIR}/docker.sock` (rootless, A4).

### Accepted with a sharpened contract — proving zero daemon contact (A9)

A static grep cannot prove the host-only branch issues no Docker call. The probe
installs a `docker` **shim first on `PATH`** that appends the subcommand it received
to a sentinel file, and asserts no `version` line appears after a host-only run.
Wording tightened in the AC: the guarantee is "no command that **contacts the
daemon**", because `docker context inspect` is a daemon-free config read that may
legitimately run during endpoint resolution.

This shim also replaces critic A's suggested `listen()`-ing socket fixture (A5).
A python-bound socket cannot answer a real `docker version` — it does not speak
HTTP — so a fixture socket could never produce a genuine `available`. The shim
tests the script's actual contract (endpoint present **and** round-trip succeeds)
and lets the probe exercise `available` **and** `unreachable` deterministically.
python3 is still used for the one arm that needs a real socket file present, behind
`command -v python3 || exit 2` (A6).

### Accepted — the honesty findings (B1, B2, B3, B4, B6)

- **B2 is the strongest finding in either review.** Labelling the metrics'
  scope does not stop the skill printing a green Disk verdict beside a
  `docker compose build` target — the precise false positive `prd.md` opens by
  describing. A label explains the number; it does not withdraw the conclusion.
  Under `host-only` with a build-shaped target the Disk row now renders
  `N/A — host-only`, and the report states plainly that no build-sizing verdict is
  possible from inside the container. `SKILL.md:44`'s claim that "Docker lives on
  the root overlay here, so root df is the binding number" is categorically false
  once the daemon is one the container cannot see, and is corrected.
- **B1**: the statement's *content* is pinned, not just its cardinality — the why
  (#756), what is skipped, who runs the host block, and where it is — plus an
  explicit instruction that the `KEY=VALUE` lines select the branch and are **not**
  the report. Without that, an agent following this skill's own `tee`-the-output
  habit prints the preflight dump as the answer.
- **B3**: the round trip is specified in both directions, including the case where
  the operator never returns — Docker headroom is reported `UNKNOWN`, never left
  silently pending.
- **B4**: the `TRIGGER` list is reworded, not only the `description`. Both are
  injected into every session; leaving "free up space" pointing at a skill that can
  no longer reclaim anything in-container is a discoverability regression.
- **B6**: exact replacement wording for `AGENTS.md:181` and
  `.oh/templates/AGENTS.md:58`, with a mechanical check — each row must pair
  "container" with memory/disk/CPU and "host-only" with Docker.

### Accepted — regression and provenance gaps (A7, A11, B7)

- A7: `AUDIT_RUN_ID` retention added to the regression table and to US-002's ACs.
- A11: a non-goals line disclaiming the `sandbox-healthcheck.sh` roadmap row.
- B7: a committed before/after transcript in `evidence.md`, held to the same
  evidentiary bar `prd.md` used for the nine-failure baseline.

### Accepted with an amendment — the audit composition (A12, B5)

Both critics found the same defect: US-004's "still holds **or** states the caveat"
is an either/or that lets the builder append a sentence and move on. Accepted —
it must be decided, and the envelope must record `METRICS_SCOPE`/`DOCKER_TRIAGE`
rather than labelling a no-Docker-evidence run the same as a full measurement.

**Amended:** critic B proposed routing the missing Docker slice through
`full.md`'s existing `deferred` convention. Rejected on that specific point.
`deferred` in that file means "nested execution prevented the fan-out — here is the
exact top-level rerun", and it exists so a reader knows a rerun recovers the
evidence. A socket-less Docker slice is **not** recoverable by rerunning in the same
place; a rerun in the container produces the identical gap. Labelling it `deferred`
would promise a recovery that does not exist. The correct existing label is
**`partial`** — it ran, and some evidence is structurally unavailable — which
`full.md` already defines.

### Rejected — prose-only alternative (A, closing note)

Critic A argued the four literal issue ACs could be met more cheaply by an inline
`[ -S ]` check in prose, with no script and no probe, and noted repo precedent for
grep-verified prose. Rejected, and critic A's own analysis is why: a prose
"detect and degrade" instruction is unfalsifiable and is exactly what an agent
drops under context pressure. Its accompanying objection — that the script as
originally specified "only replaces nine failures on a missing socket with one
confident lie on a dead socket" — is fair against the original design and is fixed
by the round-trip above, which is what earns the script its place.

## Verdict

**APPROVED to build**, against the revised `prd.md` and `prd.json`. No finding was
left open. The two rejections are recorded with reasons rather than dropped.
