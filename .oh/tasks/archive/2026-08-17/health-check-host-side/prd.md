# PRD — rehome `/health-check` host-side (issue #762)

- **Issue**: [#762](https://github.com/mifunedev/openharness/issues/762) · Refs #756, #731
- **Branch**: `task/762-health-check-host-side` · **Base**: `development` @ `c77ec642`
- **Slug**: `health-check-host-side`

## Problem

`/health-check` triages memory, swap, disk, CPU and Docker usage, ranks reclaim
levers by safety × yield, and prunes the regenerable build cache. It was written
for an environment where the container could reach the host Docker daemon.

That reach was severed deliberately in #756 (host-root escape path). Observed in
this worktree's container, 2026-08-12:

```
$ ls -la /var/run/docker.sock
ls: cannot access '/var/run/docker.sock': No such file or directory

$ docker ps
failed to connect to the docker API at unix:///var/run/docker.sock; check if the
path is correct and if the daemon is running: dial unix /var/run/docker.sock:
connect: no such file or directory

$ docker system df
failed to connect to the docker API at unix:///var/run/docker.sock; check if the
path is correct and if the daemon is running: dial unix /var/run/docker.sock:
connect: no such file or directory

$ command -v docker
/usr/bin/docker
```

Two facts from that observation shape the design:

1. **The CLI is present; only the socket is gone.** Any detection that tests for
   the `docker` binary concludes "Docker is available" and then fails per-command.
   The socket is the thing to test.
2. **The failure is per-command, not once.** The skill's current baseline issues
   three Docker calls in step 2, one more verbose call, `docker stats` in step 5,
   and four calls in step 6 — nine failures for one invocation, each printing the
   same 200-character connection error.

The non-Docker checks still return numbers, but they are the *container's* memory,
disk and CPU. The skill's own prose calls them host figures ("Report-first resource
triage for the sandbox host", "on this host Docker is on the root overlay"). That
is now false, and false in the direction that matters: an agent reads a green disk
verdict and concludes the host has headroom for a multi-GB image build.

## Decision — rehome to the orchestrator role, degrade cleanly in the sandbox

The issue names two options. Both land, because they address two different readers
of the same skill, and this harness already defines both readers.

**There is a host-side agent role, and it already owns this skill.** Root
`AGENTS.md` — reached as `CLAUDE.md`, which is a symlink to it, so it is always
loaded — defines the **orchestrator**: an agent that runs at the host project root,
is explicitly permitted `docker`, `docker compose` and `gh` (§ Permissions), and
carries `/health-check` in its own skills table. That is the true addressee of the
Docker half of this skill.

What #756 severed is narrower, and is the actual defect: an agent **inside the
sandbox** can no longer reach host state, by design. So the rehome is concrete
rather than hand-wavy:

> Docker triage moves from "commands the sandboxed agent runs" to **"the procedure
> the orchestrator runs at the host project root"** — a role that already exists,
> already has the socket, and already lists this skill.

The shipped shape is one skill with an explicit scope boundary:

| Concern | Where it runs now | Why |
|---|---|---|
| Docker inventory, reclaim ladder, build-cache prune, `docker stats` | **Host only** — the orchestrator runs it at the project root | The data and the daemon live there; the sandbox has no route to either since #756 |
| Memory / swap / disk / CPU snapshot | Either — **labelled with the scope it measured** | Honest in both places; actively misleading if mislabelled |
| Scope classification | One deterministic call, either side | Turns nine failures into one statement |

Option 2's degrade is required regardless (the issue says so), and it is what the
sandboxed reader gets. Option 1's relocation is what the orchestrator gets. Doing
only Option 2 would leave the skill claiming to triage a host it cannot see; doing
only Option 1 would leave the sandboxed reader facing the nine-error wall.

An earlier draft of this section justified the shape by claiming no host-side agent
runtime exists. That was wrong — the repo's own always-loaded context contradicts
it, and a critic caught it. The correction is recorded in `critique.md` because it
improved the design rather than only the wording: the host procedure now has a
named addressee that already has the repo checked out.

## Design

### Step 0 — one deterministic preflight

A new `.oh/skills/health-check/scripts/scope-preflight.sh` replaces per-command
discovery. It emits machine-readable `KEY=VALUE` lines plus exactly one
human-readable statement, and always exits `0` — a non-zero exit from a
classification step is itself the misleading-failure signal being removed.

```
SCOPE=container|host
DOCKER_CLI=present|absent
DOCKER_ENDPOINT=<the endpoint tested>
DOCKER_TRIAGE=available|host-only|unreachable
METRICS_SCOPE=container|host
```

**`available` requires a round-trip, not a file-type test.** `[ -S "$SOCK" ]` is
true for a socket left behind by an OOM-killed daemon and for a `chmod 000` socket
the sandbox user cannot open — critic A demonstrated both. Classifying either
`available` reproduces the exact nine-failure wall this issue exists to kill, in a
shape no test would have covered. So:

- **No endpoint** (`[ -S … ]` false for a unix path) → `host-only`, with **zero
  daemon contact**. This is the path in this sandbox.
- **An endpoint** — unix socket present, or any non-unix scheme such as
  `tcp://` — → **one** `docker version` round-trip under `timeout` → `available`
  or `unreachable`.

Three states, not four: `unverified` was in an earlier draft and is removed.
Critic A found nothing in the task graph forced it to ever be *resolved*, so an
implementer could ship a script that reports `unverified` and stops — leaving a
`tcp://` operator exactly where the old skill left them. Collapsing it makes
resolution structural: every path ends at a decided state, and no path issues more
than one failing call.

Endpoint resolution order: `HEALTH_CHECK_DOCKER_SOCK` (test knob) → `DOCKER_HOST` →
`docker context inspect --format '{{.Endpoints.docker.Host}}'` → `/var/run/docker.sock`
→ `${XDG_RUNTIME_DIR}/docker.sock` (rootless). The `context` step is how the real
CLI resolves its endpoint when `DOCKER_HOST` is unset — Colima, OrbStack and
rootless setups set a context, not always the env var — and it is free: verified
here to return `unix:///var/run/docker.sock` with `rc=0` **and no daemon running**,
because it reads local config. Its narrow Go template also satisfies this repo's own
`deny-env-dump.sh` inspect guard.

`SCOPE` uses the convention already in the repo — `/.dockerenv`
(`.oh/scripts/lib/session-runner.sh:176`) — plus `/run/.containerenv` for podman.

`HEALTH_CHECK_DOCKER_SOCK` overrides the endpoint under test. That is the knob the
probe drives to exercise every branch, and the reason the behaviour is testable at
all rather than merely asserted in prose.

### Step 0 branch in `SKILL.md`

- `DOCKER_TRIAGE=host-only` → emit the single statement, **skip** steps 2, 5 and
  the reclaim ladder without contacting the daemon, and print the host-side
  procedure. Report the container metrics, labelled as container-scope.
- `DOCKER_TRIAGE=unreachable` → same skip, different statement: the endpoint exists
  and the daemon did not answer. One failure, not nine.
- `DOCKER_TRIAGE=available` → today's behaviour, unchanged.

The `KEY=VALUE` lines select the branch. They are **not** the report, and the skill
says so explicitly — this skill's own habit elsewhere is to `tee` captured output
into the answer, so without that instruction an agent prints the preflight dump and
calls it a health check.

### The verdict must refuse what it can no longer conclude

The strongest critic finding: labelling the metrics' scope does not stop the skill
printing a green Disk verdict beside a `docker compose build` target. A label
explains a number; it does not withdraw a conclusion. Under `host-only` with a
build-shaped target, the Disk row renders `N/A — host-only, see host procedure`
rather than a RAG rating computed from container `df`, and the report states that
no build-sizing verdict is possible from inside the container. Container-local
questions ("will `npm install` OOM this container") keep a real rating, because for
those the container view is the correct view.

`SKILL.md:44`'s claim that "Docker lives on the root overlay here, so root df is
the binding number" is categorically false once the daemon is one the container
cannot see. It is corrected, not relabelled.

### Host-side procedure

A new section carrying the Docker inventory, the reclaim ladder and the tier-1
prune as a block the **orchestrator** runs at the host project root. It specifies
the round trip in both directions — what is pasted back, and what the report says
if nobody returns: Docker headroom is `UNKNOWN`, never left silently pending. This
is the "relocated host-side" half of AC 2; the host-only markers are the other half,
and both are present rather than one substituting for the other.

## Acceptance criteria → verification

| # | Criterion (from #762) | How it is verified |
|---|---|---|
| 1 | Socket-less run produces a single clear statement, not a series of failed calls | `scope-preflight.sh` executed in this socket-less container: exactly one statement, `DOCKER_TRIAGE=host-only`, zero Docker calls issued. Pinned by probe. |
| 2 | Docker steps relocated host-side or explicitly marked host-only | Both: steps 2/5/ladder carry a host-only marker gated on the preflight, and a host-side operator procedure section exists. |
| 3 | Non-Docker checks state they measure the container | Step 1 and the verdict table carry the scope from `METRICS_SCOPE`; the "sandbox host" framing in the overview and frontmatter is corrected. |
| 4 | `AGENTS.md` skills-table entry matches the new scope | `AGENTS.md:181` and `.oh/templates/AGENTS.md:58` updated, plus the skill's own `description` frontmatter, which is injected into every session and is the more load-bearing of the two. |

## Regression surface — three existing probes touch this skill

Identified before editing, because each one constrains the rewrite:

| Probe | Asserts | Constraint on this change |
|---|---|---|
| `health-check-docker-stats.sh` | `docker stats` present in `.claude/skills/health-check/SKILL.md` | The `docker stats` step must survive the rewrite as a literal string. It moves under a host-only marker; it is not deleted. |
| `memory-log-locked-append.sh` | **Two** things: the literal `AUDIT_RUN_ID` (line 16-18) **and** the literal `.oh/scripts/locked-append.sh "$MEM/$TODAY/log.md" <<EOF` (line 19), both in `.oh/skills/health-check/SKILL.md` | Step 8 keeps both. An earlier draft of this table named only the second; a critic caught the omission and the probe source confirms it. |
| `audit-dispatcher-contract.sh` | `health-check` in the dispatcher's kept list | The skill is not renamed or removed. |

`.claude/skills/health-check` is a symlink (`.claude/skills -> ../.oh/skills`,
verified by `readlink`), so the two probe paths read the same file and one edit
serves every provider surface — `.claude`, `.codex`, `.pi`, and the `.hermes` link.

## Non-goals

- Restoring the Docker socket. It was removed deliberately; #756 is closed.
- A host-side agent runtime. That is #731 EPIC territory, not this issue.
- Rewriting the reclaim ladder's contents. It is relocated and gated, not redesigned.
- Adding `scope-preflight.sh` to `.claude/protected-paths.txt`. The bare
  `health-check` entry (line 31) already resolves to the skill directory that
  contains it; a second entry would be redundant, and `protected-paths-resolve.sh`
  is satisfied either way.
- `.oh/scripts/sandbox-healthcheck.sh` and its open roadmap row
  (`.oh/docs/roadmap.md:195`, "→ SKILL *(verify `/health-check` owns it)*"). That
  script is the container-liveness `HEALTHCHECK` reported through Docker/Compose
  health status — a different subsystem from resource triage, sharing only a name.
  It is untouched here, and stating so keeps a future reader from folding the
  roadmap row into this skill on the strength of the name alone.

## Out-of-scope fix taken anyway

`SKILL.md:72` points at `/docker-disk-cleanup`, which does not exist in
`.oh/skills/` or anywhere else in the repo (verified by `ls` and a repo-wide grep —
the only hit is the dangling reference itself). It sits inside the Docker section
being restructured, so the pointer is removed and the substantive advice it
introduced is kept. Leaving a dangling skill reference inside a section this change
rewrites would be knowingly shipping it.
