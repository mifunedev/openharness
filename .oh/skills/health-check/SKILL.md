---
name: health-check
description: |
  Triage memory, swap, disk and CPU where you are running, and rank Docker reclaim
  levers by safety×yield. Docker triage is host-only: inside a sandbox with no
  Docker socket the skill states that once and emits a procedure for the
  orchestrator to run at the host project root, rather than failing per command.
  TRIGGER when: asked for a health check, "do we have enough memory/disk"
  (container-scope inside a sandbox), before starting a heavy stack or docker build
  (emits the host procedure when the socket is absent), "system health", or "free up
  space" / "reclaim resources" — which hand you the host block rather than
  reclaiming inside the container.
argument-hint: "[target] [--reclaim] [--dry-run]"
---

# Health Check

Report-first resource triage. Answers two questions: **can we start `<target>` right now**, and **what is the safest way to recoup headroom if not**. Destructive reclaim is never automatic — only the regenerable build cache is pruned without asking.

**This skill spans two scopes, and step 0 decides which one you are in.** Docker inventory and every reclaim lever live on the machine running the daemon; memory, swap, disk and CPU can be read on either side but mean different things depending on where you read them. The sandbox has had no host Docker socket since [#756](https://github.com/mifunedev/openharness/issues/756) removed it as a host-root escape path, so a sandboxed invocation reports container-scope metrics and hands the Docker half to the orchestrator. Never present container figures as host figures — that is the failure mode this structure exists to prevent, and it is worse than reporting nothing, because a green container disk row reads like permission to start a multi-GB image build.

`target` is free text naming what you intend to start (a compose path, `make dev`, a service name). It sizes the verdict — a full `docker compose build` and a `make dev` against already-running services have very different footprints, so always pin down which before judging "sufficient."

## Performance rules

Default to a **fast path**: one scope classification, one host snapshot, one Docker summary, one running-container list, and one exited-container list. Do not run verbose or per-container probes until the summary shows a likely binding constraint or the user asks for reclaim candidates.

- Gate expensive commands: `docker system df -v`, `docker stats`, `docker exec <container> ps ...`, `du`, and nested-Docker inspection are second-pass diagnostics, not baseline checks.
- Run expensive diagnostics **once** and reuse the captured output. Never call `docker system df -v` inside a loop over volumes/images/containers.
- Prefer scoped reads over broad scans: explicit cache paths (`~/.npm`, project `.pnpm-store`) are acceptable; `du -sh /home/*` or filesystem-wide `find` is not.
- Keep reruns delta-oriented: if a prior health-check in the same thread already found the shape of the problem, recheck only the changed metrics unless the target changed.
- **Never retry a Docker call that failed for want of a daemon.** Step 0 settles reachability once. Nine copies of the same connection error is not diagnosis.

## Instructions

### 0. Classify the scope — always first, before any other command

```bash
SNAP=${SNAP:-$(mktemp -d)}
bash .oh/skills/health-check/scripts/scope-preflight.sh | tee "$SNAP/scope.txt"
```

The script resolves the Docker endpoint (`HEALTH_CHECK_DOCKER_SOCK`, then `DOCKER_HOST`, then `docker context`, then `/var/run/docker.sock`, then the rootless path) and settles it with **at most one** round-trip. It always exits `0`; a classification step that exits non-zero is the misleading failure this replaces.

It emits `SCOPE`, `DOCKER_CLI`, `DOCKER_ENDPOINT`, `DOCKER_TRIAGE` and `METRICS_SCOPE`.

> **The `KEY=VALUE` lines select the branch. They are not the report.** Surface the single `HEALTH-CHECK SCOPE-NOTICE:` line to the user and nothing else from this file. Pasting the preflight output as the answer is not a health check.

Branch on `DOCKER_TRIAGE`:

| Value | Meaning | What to do |
|---|---|---|
| `available` | The daemon answered | Run every step below as written. |
| `host-only` | No endpoint here, or no CLI to reach one | **Skip steps 2, 5, 7 and the reclaim ladder without issuing a Docker call.** Report the notice, the scoped metrics, and the [host-side procedure](#host-side-docker-triage). |
| `unreachable` | The endpoint exists and the daemon did not answer | Same skip. The one round-trip already spent is the whole diagnosis — do not retry per command. Report the notice; the endpoint may be a dead daemon or a socket this user cannot open. |

Do not test for the `docker` binary to decide this. `/usr/bin/docker` is installed in the sandbox and proves nothing about reachability — treating its presence as availability is precisely the defect #762 records.

### 1. Snapshot resources — label the scope you measured

Use one grouped command so the baseline is cheap and internally consistent:

```bash
SNAP=${SNAP:-$(mktemp -d)}
{
  echo "=== MEMORY ===" && free -h
  echo "=== SWAP ===" && (swapon --show || echo "no swap")
  echo "=== DISK ===" && df -h /
  echo "=== CPU ===" && nproc && uptime
} | tee "$SNAP/host.txt"
```

Read for: **available** memory (not "free" — buff/cache counts), presence of swap (no swap = no cushion), disk **% used** on `/`, and load vs core count.

**Carry `METRICS_SCOPE` into every number you report.** Under `METRICS_SCOPE=container` these are the container's cgroup and overlay figures. They answer container-local questions honestly — will `uv sync` OOM this container, is the workspace filesystem filling — and they do **not** answer what the Docker host has spare. Where a container's limits are unset, `free -h` reports the host's physical memory while the container cannot necessarily use it; say so rather than passing the number through.

Under `METRICS_SCOPE=host`, `/` is the binding number when Docker's data root is on the root filesystem. Confirm that rather than assuming it — `docker system df` in step 2 and `df -h` on the data root settle it. (An earlier version of this skill asserted the root overlay was always the binding number "on this host". That was written for one environment and is false wherever the daemon lives elsewhere or is not visible at all.)

### 2. Docker resource breakdown — **host-only**

> Requires `DOCKER_TRIAGE=available`. Under `host-only` or `unreachable`, skip this step entirely and point at the [host-side procedure](#host-side-docker-triage). Do not issue these commands to see what happens.

Keep the baseline to three Docker calls:

```bash
SNAP=${SNAP:-$(mktemp -d)}
docker system df | tee "$SNAP/docker-df.txt"
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Size}}' | tee "$SNAP/docker-running.txt"
docker ps -a --filter status=exited --format 'table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Size}}' | tee "$SNAP/docker-exited.txt"
```

`docker system df` splits usage into Images / Containers / Local Volumes / Build Cache with a **RECLAIMABLE** column — that column is the entire reclaim opportunity at a glance. Only if the summary shows material reclaim or the user asks for a ranked cleanup list, capture verbose detail **once**:

```bash
docker system df -v > "$SNAP/docker-df-v.txt"
```

Read candidates from `$SNAP/docker-df-v.txt`; do not rerun `docker system df -v` per object.

If `$SNAP/docker-running.txt` shows a Docker-in-Docker container (common names: `*dind*`, `ci-runner-dind`), inspect only that nested daemon before concluding the reclaim plan:

```bash
docker exec <dind-container> docker system df
docker exec <dind-container> docker ps -a --size --format 'table {{.Names}}\t{{.Status}}\t{{.Size}}\t{{.Image}}'
```

Nested CI sidecars often hide the best disk win: unused inner CI images and build artifacts inside the sidecar volume. Skip this branch when there is no DIND container. If ongoing cleanup is requested, prefer an idle-aware spindown or watchdog over repeated manual pruning — a lever that runs on a schedule beats one that needs an operator to remember it.

### 3. Size the target

Match the verdict to what `target` actually does:

| Target shape | Dominant cost | Watch | Answerable under `host-only`? |
|---|---|---|---|
| `docker compose build` / fresh stack | Disk — new images + build cache (multi-GB) | Disk %; build cache balloons | **No.** Image and cache growth land on the Docker host, which is not visible. |
| `make dev` / run against live services | Memory + small disk (`.venv`, `node_modules`) | Available mem, no-swap spikes during `uv sync` / `npm install` | **Partly** — the container-local memory and workspace disk cost is measurable here. |
| Pull-only (`compose up`, no build) | Disk — pulled image layers | Disk % | **No.** Layers land on the Docker host. |

**Verify assumptions instead of trusting them, but scope the verification.** If the user says "services are already running," confirm against the already-captured container list first (or, under `host-only`, against the ports themselves — a reachable port is evidence a service is up even when the container list is not available), then check only named/known ports and dependency dirs:

```bash
PORTS="<space-separated-ports>"
for p in $PORTS; do (echo > /dev/tcp/127.0.0.1/$p) 2>/dev/null \
  && echo "port $p OPEN" || echo "port $p closed"; done
TARGET_DIR="<target-dir>"
[ -d "$TARGET_DIR" ] && du -sh "$TARGET_DIR/.venv" "$TARGET_DIR/node_modules" 2>/dev/null || echo "deps not yet installed"
```

A closed port or missing `.venv`/`node_modules` is a finding worth surfacing — it changes "ready to start" into "ready to provision, then start." If no ports or target directory are named, skip this probe rather than guessing.

### 4. Reclaim ladder (safest → most destructive) — **host-only**

> Every lever here acts on the Docker daemon's storage and requires `DOCKER_TRIAGE=available`. Under `host-only` or `unreachable`, propose nothing from this table as something you can do — hand over the [host-side procedure](#host-side-docker-triage) instead. There is no in-container substitute; a sandboxed agent cannot free a byte of the host's image store.

Walk the ladder top-down. Run tier 1 freely. Stop and **confirm** before tiers 2–4.

| Tier | Lever | Yield | Risk | Gate |
|---|---|---|---|---|
| 1 | `docker builder prune -f` | Often the biggest single win (regenerable cache) | None — cache rebuilds, only costs future build time | Run freely (skip if `--dry-run`) |
| 2 | Remove **exited/abandoned** containers (`docker rm <id>`) + their images | High (stale sandboxes hoard GBs) | Destructive — data in the container is gone | Confirm; never auto-remove a container you didn't create |
| 3 | Dangling images (`docker image prune -f`) | Medium | Low — only untagged layers | Confirm |
| 4 | Orphaned volumes (`docker volume prune` / named `docker volume rm`) | Usually small, occasionally large | Destructive — may hold DB state | Confirm each named volume individually |

Rank candidates by **safety × yield**, not yield alone. The default action of this skill is tier 1 only; everything below is a proposal.

**Identifying tier-2 candidates** — use the baseline file for exited containers from torn-down sandboxes, not in the active set:

```bash
cat "$SNAP/docker-exited.txt"
```

Cross-check names against `$SNAP/docker-running.txt` before proposing removal. An "Exited (255) N days ago" sandbox that isn't one of the live ones is the prototypical safe-to-reclaim target — but still confirm, per the don't-delete-what-you-didn't-create rule. If size/yield is unclear, parse the single verbose snapshot (`$SNAP/docker-df-v.txt`) rather than issuing new Docker queries in a loop.

### 5. Per-container RAM reclaim — **host-only**

> Requires `DOCKER_TRIAGE=available`. This step reads resident memory **across containers from the daemon's side**; it is not something a container can do for itself. Under `host-only` or `unreachable`, skip it. For the RAM inside *this* container, step 1's figures plus a plain `ps -eo rss,args --sort=-rss` are the honest local equivalent, and killing a stale process here is still worth proposing.

When memory — not disk — is the binding constraint, the reclaimable RAM may be **in-container process accumulation** that is invisible to the Docker-object ladder above. `docker system df` and `docker ps --size` report layer/diff sizes on disk; they do **not** predict per-container resident-set memory.

Run `docker stats` only for memory-bound checks or explicit "system health" requests that ask for RAM/process reclamation:

```bash
docker stats --no-stream | tee "$SNAP/docker-stats.txt"
```

This emits one row per running container showing live **MEM USAGE / LIMIT** and **%MEM**. Inspect only the heaviest one or two containers, not every running container:

```bash
docker exec <container> ps -eo rss,args --sort=-rss | head -20 | tee "$SNAP/<container>-top-rss.txt"
```

Typical findings: stale `node` / `python` dev servers from a previous session, a hung test runner, or an orphaned build worker that was never cleaned up. Killing the process (not the container) reclaims its RSS immediately and is safer than any tier-2+ ladder action.

Propose the kill to the user with the process name, RSS, and estimated RAM freed — do not auto-kill. This step is **memory-only**; skip it when disk is the sole binding constraint.

### 6. Run tier 1 where you can, then report the verdict

Under `DOCKER_TRIAGE=available`, and unless `--dry-run`, run the build-cache prune and show before/after with the smallest useful recheck:

```bash
df -h / | tail -1
docker builder prune -f
df -h / | tail -1
docker system df
```

Under `host-only` or `unreachable`, there is nothing to prune here. Say so once and move to the verdict.

If the request is a rerun/check-again in the same thread, make the report delta-oriented: call out what changed since the prior health check (disk %, available memory, CPU load, Docker restart/status changes) before repeating the verdict. Do not re-explain the full ladder or rerun verbose diagnostics unless the finding changed; keep it focused on current state plus material deltas.

Then emit a verdict table. **Name the scope in the header, and withhold any row you cannot support:**

```
Scope: container (METRICS_SCOPE=container) · Docker triage: host-only

| Resource | Status | Detail |
|----------|--------|--------|
| Disk     | 🟢/🟡/🔴 | <free / %used, headroom vs target> |
| Memory   | 🟢/🟡/🔴 | <available, swap presence, spike risk> |
| CPU      | 🟢/🟡/🔴 | <cores vs load> |
| Docker   | ⚪ N/A | host-only — see the host-side procedure |
```

Rating guide: 🔴 if starting the target would cross a hard limit (disk → ~90%+, OOM with no swap); 🟡 if it fits but with thin margin (no cushion, transient spikes possible); 🟢 if comfortable. State the **binding constraint** explicitly — it's usually one resource, not all three.

**Withholding rule — the verdict must refuse what the scope cannot support.** Under `DOCKER_TRIAGE=host-only` or `unreachable` with a **build-shaped target** (any row in step 3 marked *No*), the Disk row is not a RAG rating. Render it:

```
| Disk | ⚪ N/A | host-only — image and build-cache growth land on the Docker host, which is not visible from here |
```

and state in prose: *no build-sizing verdict is possible from inside this container.* A labelled green disk row beside a `docker compose build` target still reads as permission to start the build; a label explains a number, it does not withdraw a conclusion. For container-local targets, keep the real RAG rating — there the container view is the correct view, and refusing to answer would be its own failure.

### 7. Propose-then-confirm for tiers 2–4 — **host-only**

> Requires `DOCKER_TRIAGE=available`. Under `host-only` or `unreachable` there is nothing here for you to propose: the levers are in the host-side procedure, and the person running it owns the confirm gate.

If tier-1 reclaim already clears the target, say so and present the rest as **optional headroom** — don't push destructive removal that isn't needed. When you do propose it, quote the concrete artifact (container name, age, size) so the user can judge:

```
Optional further reclaim:
- <name> (exited <N>d ago, <size>) — removing frees ~<X>G → <new free>/<new %>.
```

Build this list from the baseline files and, when needed, one cached verbose snapshot. For volume candidates, read the `Local Volumes` section from `$SNAP/docker-df-v.txt`; never run `docker system df -v` once per volume.

Then ask (use `AskUserQuestion`). Run the removal only on explicit approval. With `--dry-run`, propose everything and write nothing — including skipping the tier-1 prune.

### 8. Log (Memory Improvement Protocol)

When `AUDIT_RUN_ID` is inherited, return a structured health observation carrying
`AUDIT_RUN_ID`, `AUDIT_ROOT`, and `AUDIT_LOG_ROOT` and skip this append/retro; the
outer `/audit` owns the single log. Direct invocation logs normally. Per
`.oh/skills/retro/references/memory-protocol.md`:

```bash
TODAY=$(date -u +%Y-%m-%d); TIME=$(date -u +%H:%M)
MEM="$(bash .oh/scripts/oh-path memory)"; mkdir -p "$MEM/$TODAY"
.oh/scripts/locked-append.sh "$MEM/$TODAY/log.md" <<EOF

## Health-Check -- $TIME UTC
- **Result**: OP | DRY-RUN
- **Scope**: <container | host> · **Docker triage**: <available | host-only | unreachable>
- **Target**: <what was being sized>
- **Binding constraint**: <disk | memory | none | unknown-host-side>
- **Reclaimed**: <e.g. builder cache 9.1G; disk 83%→73% — or "none, host-only">
- **Observation**: <one sentence>
EOF
```

Do **not** memorize the raw numbers (they're re-derivable in under a minute — see the memory anti-pattern table). Log the *interpretation*: which resource bound, which lever paid off, and whether the answer was scope-limited.

## Host-side Docker triage

The relocated half of this skill. Docker inventory and every reclaim lever run where the daemon runs — they are **not** something a sandboxed agent can do, and #756 closed that route deliberately.

**Who runs this.** The **orchestrator** — the agent session at the host project root, which root `AGENTS.md` § Permissions already grants `docker` and `docker compose`, and whose own skills table already lists `/health-check`. If you are that session, `DOCKER_TRIAGE` reports `available` and you simply run steps 2 through 7 as written; this section is what you hand to somebody else.

**The round trip, both directions.** A sandboxed agent cannot run this block. Print it, say where it runs, and say what comes back:

1. Ask the operator to run the block below **on the machine hosting this sandbox**, at the harness project root — the orchestrator session, not this container.
2. Ask them to paste the output back into this session as their next message.
3. Fold that output into steps 2–7 exactly as if you had captured it yourself, then re-issue the verdict with `Docker triage: host (operator-supplied)`.
4. **If nobody comes back, finish the report anyway.** State Docker headroom as `UNKNOWN`, keep the container-scope rows, and keep the build-sizing refusal from step 6. Never leave the report silently pending on a paste that may never arrive.

```bash
# Run on the Docker host, at the harness project root.
echo "=== SCOPE ===" && bash .oh/skills/health-check/scripts/scope-preflight.sh
echo "=== DISK ===" && df -h /
echo "=== MEMORY ===" && free -h
echo "=== DOCKER SUMMARY ===" && docker system df
echo "=== RUNNING ===" && docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Size}}'
echo "=== EXITED ===" && docker ps -a --filter status=exited \
  --format 'table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Size}}'
```

That is the read-only baseline and is safe to run unprompted. Everything beyond it follows the same gates as in-scope use: tier 1 (`docker builder prune -f`) is free to run, tiers 2–4 need a per-artifact confirm, and `docker stats --no-stream` is a second-pass probe for memory-bound checks only. With `--dry-run`, hand over the baseline and nothing else.

## Anti-patterns

- **Reporting container figures as host figures.** The single worst outcome available here: it looks like an answer, it passes a glance, and it green-lights a build the host cannot fit. Carry `METRICS_SCOPE` into every number.
- **Retrying Docker after step 0 said no.** One classification, one answer. Nine identical connection errors is what #762 was filed about.
- **Testing for the `docker` binary instead of the endpoint.** The CLI ships in the sandbox image. Its presence means nothing.
- **Rating a resource you cannot see.** A RAG row implies a measurement. Under `host-only`, a build-shaped Disk verdict is fabrication with a colour on it — render `N/A` and say why.
- **Repeating expensive diagnostics.** `docker system df -v`, `docker stats`, `docker exec <container> ps`, and `du` are second-pass probes. Capture each once, reuse the output, and never put verbose Docker calls inside per-object loops.
- **Auto-removing containers/volumes.** Only tier 1 runs without asking. A container or named volume you didn't create gets a confirm gate every time.
- **Trusting "it's already running."** Closed ports and missing `.venv`/`node_modules` are silent until you check — verify, then size.
- **Ranking by yield alone.** A 5G exited container is not a better lever than a 9G cache prune when the prune is risk-free. Safety × yield.
- **Pushing destructive reclaim that isn't needed.** If tier 1 clears the target, the rest is optional headroom, framed as such — not a recommendation.
- **Handing over the host procedure and then going quiet.** The report finishes with or without the paste-back; `UNKNOWN` is a result, silence is not.
