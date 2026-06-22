---
name: health-check
description: |
  Assess sandbox host resources (memory, swap, disk, CPU, Docker usage) and
  readiness to start or build a stack. Ranks reclaim levers by safety×yield,
  runs the zero-risk ones, and confirms before any destructive removal.
  TRIGGER when: asked for a health check, "do we have enough memory/disk",
  before starting a heavy stack or docker build, "system health", "free up
  space", "reclaim resources", or when a build/run is at risk of OOM / disk-full.
argument-hint: "[target] [--reclaim] [--dry-run]"
---

# Health Check

Report-first resource triage for the sandbox host. Answers two questions: **can we start `<target>` right now**, and **what is the safest way to recoup headroom if not**. Destructive reclaim is never automatic — only the regenerable build cache is pruned without asking.

`target` is free text naming what you intend to start (a compose path, `make dev`, a service name). It sizes the verdict — a full `docker compose build` and a `make dev` against already-running services have very different footprints, so always pin down which before judging "sufficient."

## Instructions

### 1. Snapshot host resources

```bash
echo "=== MEMORY ===" && free -h
echo "=== SWAP ===" && (swapon --show || echo "no swap")
echo "=== DISK ===" && df -h /
echo "=== CPU ===" && nproc && uptime
```

Read for: **available** memory (not "free" — buff/cache counts), presence of swap (no swap = no cushion), disk **% used** on `/` (Docker lives on the root overlay here, so root df is the binding number), and load vs core count.

### 2. Docker resource breakdown

```bash
docker system df
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Size}}'
docker ps -a --filter status=exited --format 'table {{.Names}}\t{{.Status}}\t{{.Size}}'
```

`docker system df` splits usage into Images / Containers / Local Volumes / Build Cache with a **RECLAIMABLE** column — that column is the entire reclaim opportunity at a glance. For per-object detail (which exited container is hoarding GBs, which volumes are orphaned) use `docker system df -v`.

### 3. Size the target

Match the verdict to what `target` actually does:

| Target shape | Dominant cost | Watch |
|---|---|---|
| `docker compose build` / fresh stack | Disk — new images + build cache (multi-GB) | Disk %; build cache balloons |
| `make dev` / run against live services | Memory + small disk (`.venv`, `node_modules`) | Available mem, no-swap spikes during `uv sync` / `npm install` |
| Pull-only (`compose up`, no build) | Disk — pulled image layers | Disk % |

**Verify assumptions instead of trusting them.** If the user says "services are already running," confirm it — check the ports and the containers, don't assume:

```bash
docker ps --format '{{.Names}}\t{{.Status}}'
for p in <ports>; do (echo > /dev/tcp/127.0.0.1/$p) 2>/dev/null \
  && echo "port $p OPEN" || echo "port $p closed"; done
du -sh <target>/.venv <target>/node_modules 2>/dev/null || echo "deps not yet installed"
```

A closed port or missing `.venv`/`node_modules` is a finding worth surfacing — it changes "ready to start" into "ready to provision, then start."

### 4. Reclaim ladder (safest → most destructive)

Walk the ladder top-down. Run tier 1 freely. Stop and **confirm** before tiers 2–4.

| Tier | Lever | Yield | Risk | Gate |
|---|---|---|---|---|
| 1 | `docker builder prune -f` | Often the biggest single win (regenerable cache) | None — cache rebuilds, only costs future build time | Run freely (skip if `--dry-run`) |
| 2 | Remove **exited/abandoned** containers (`docker rm <id>`) + their images | High (stale sandboxes hoard GBs) | Destructive — data in the container is gone | Confirm; never auto-remove a container you didn't create |
| 3 | Dangling images (`docker image prune -f`) | Medium | Low — only untagged layers | Confirm |
| 4 | Orphaned volumes (`docker volume prune` / named `docker volume rm`) | Usually small, occasionally large | Destructive — may hold DB state | Confirm each named volume individually |

Rank candidates by **safety × yield**, not yield alone. The default action of this skill is tier 1 only; everything below is a proposal.

**Identifying tier-2 candidates** — exited containers from torn-down sandboxes, not in the active set:

```bash
docker ps -a --filter status=exited --format '{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Size}}'
```

Cross-check names against the running sandboxes before proposing removal. An "Exited (255) N days ago" sandbox that isn't one of the live ones is the prototypical safe-to-reclaim target — but still confirm, per the don't-delete-what-you-didn't-create rule.

### 5. In-container RAM reclaim (when memory is the binding constraint)

When memory — not disk — is the binding constraint, the reclaimable RAM may be **in-container process accumulation** that is invisible to the Docker-object ladder above. `docker system df` and `docker ps --size` report layer/diff sizes on disk; they do **not** predict per-container resident-set memory. Use `docker stats` to find it:

```bash
docker stats --no-stream
```

This emits one row per running container showing live **MEM USAGE / LIMIT** and **%MEM**. Identify the heaviest consumer(s). Then drop into that container's process list to find stale processes or leaked dev servers that can be killed to reclaim RAM without removing the container:

```bash
docker exec <container> ps -eo rss,args --sort=-rss | head -20
```

Typical findings: stale `node` / `python` dev servers from a previous session, a hung test runner, or an orphaned build worker that was never cleaned up. Killing the process (not the container) reclaims its RSS immediately and is safer than any tier-2+ ladder action.

Propose the kill to the user with the process name, RSS, and estimated RAM freed — do not auto-kill. This step is **memory-only**; skip it when disk is the sole binding constraint.

### 6. Run tier 1, then report the verdict

Unless `--dry-run`, run the build-cache prune and show before/after:

```bash
df -h / | tail -1
docker builder prune -f
df -h / | tail -1
```

Then emit a verdict table — one row per resource, RAG-rated against the sized target:

```
| Resource | Status | Detail |
|----------|--------|--------|
| Disk     | 🟢/🟡/🔴 | <free / %used, headroom vs target> |
| Memory   | 🟢/🟡/🔴 | <available, swap presence, spike risk> |
| CPU      | 🟢/🟡/🔴 | <cores vs load> |
```

Rating guide: 🔴 if starting the target would cross a hard limit (disk → ~90%+, OOM with no swap); 🟡 if it fits but with thin margin (no cushion, transient spikes possible); 🟢 if comfortable. State the **binding constraint** explicitly — it's usually one resource, not all three.

### 7. Propose-then-confirm for tiers 2–4

If tier-1 reclaim already clears the target, say so and present the rest as **optional headroom** — don't push destructive removal that isn't needed. When you do propose it, quote the concrete artifact (container name, age, size) so the user can judge:

```
Optional further reclaim:
- <name> (exited <N>d ago, <size>) — removing frees ~<X>G → <new free>/<new %>.
```

Then ask (use `AskUserQuestion`). Run the removal only on explicit approval. With `--dry-run`, propose everything and write nothing — including skipping the tier-1 prune.

### 8. Log (Memory Improvement Protocol)

Always, per `.mifune/skills/retro/references/memory-protocol.md`:

```bash
TODAY=$(date -u +%Y-%m-%d); TIME=$(date -u +%H:%M); mkdir -p "memory/$TODAY"
scripts/locked-append.sh "memory/$TODAY/log.md" <<EOF

## Health-Check -- $TIME UTC
- **Result**: OP | DRY-RUN
- **Target**: <what was being sized>
- **Binding constraint**: <disk | memory | none>
- **Reclaimed**: <e.g. builder cache 9.1G; disk 83%→73%>
- **Observation**: <one sentence>
EOF
```

Do **not** memorize the raw numbers (they're re-derivable in under a minute — see the memory anti-pattern table). Log the *interpretation*: which resource bound, which lever paid off.

## Anti-patterns

- **Auto-removing containers/volumes.** Only tier 1 runs without asking. A container or named volume you didn't create gets a confirm gate every time.
- **Trusting "it's already running."** Closed ports and missing `.venv`/`node_modules` are silent until you check — verify, then size.
- **Ranking by yield alone.** A 5G exited container is not a better lever than a 9G cache prune when the prune is risk-free. Safety × yield.
- **Pushing destructive reclaim that isn't needed.** If tier 1 clears the target, the rest is optional headroom, framed as such — not a recommendation.
- **Reading `/` df only when the target writes elsewhere.** On this host Docker is on the root overlay, so `/` is right — but confirm the mount if a stack writes to a separate volume.
