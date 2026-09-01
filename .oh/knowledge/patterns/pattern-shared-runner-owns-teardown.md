---
title: "A reusable runner's own EXIT trap destroys the subject its next caller needs"
slug: pattern-shared-runner-owns-teardown
kind: pattern
tags: [scripts, bash, traps, teardown, reuse, docker, seams]
created: 2026-09-01
updated: 2026-09-01
sources:
  - .oh/scripts/sandbox-boot-smoke.sh@4fbca954
  - .oh/scripts/deployment-guard.sh@540047f0
  - .oh/tasks/deployment-provisioning-guard/evidence.md@540047f0
confidence: provisional
---

# A reusable runner's own EXIT trap destroys the subject its next caller needs

## Relevant Source Files
- `.oh/scripts/sandbox-boot-smoke.sh` — `trap teardown EXIT` plus the
  `BOOT_SMOKE_DOWN_ARGS` seam that lets a caller neutralise it.
- `.oh/scripts/deployment-guard.sh` — the caller that needed the container to
  outlive the runner, and now owns teardown itself.

## Summary
A self-contained script that provisions something, asserts on it, and tears it
down in an `EXIT` trap is correct as a leaf. The moment a second caller wants to
reuse its *assertions* and then add its own, the trap is in the way — and it fires
on the **successful** exit too, so the subject is gone precisely in the case the
caller was planning for. The plan that proposed the reuse will usually claim the
trap as a benefit, because a trap that guarantees cleanup on failure reads like
one.

## Detail
**Symptom.** A design note says "teardown is inherited from the runner's `trap`",
and it is wrong in the only direction that matters. `sandbox-boot-smoke.sh:157`
declares `trap teardown EXIT`, and `teardown` runs `compose down -v
--remove-orphans`. Its success path is `exit 0` inside the health-poll loop, so a
caller that invokes it and then runs `docker exec` against the container it just
proved healthy finds nothing there. The failure is not intermittent and not
subtle; it is simply invisible at planning time, because the trap is read as
"cleanup is handled" rather than as "the subject is destroyed at return".

**Root cause.** Lifetime is not part of the seam. The script exposes
`BOOT_SMOKE_COMPOSE`, `BOOT_SMOKE_UP_ARGS`, `BOOT_SMOKE_DOWN_ARGS`, and a health
command — every knob except *who owns the resource*. Ownership was implicit in
"this script is the whole run", and that assumption is exactly what the second
caller breaks. The same shape appears wherever a runner both creates and destroys
state: a fixture harness, a temp-dir helper, a container smoke test.

**Workaround.** Give the outer caller ownership and neutralise the inner
teardown through the seam that already exists, rather than editing the runner's
trap or forking it:

```bash
BOOT_SMOKE_DOWN_ARGS="ps -q" bash "$BOOT_SMOKE"   # a read-only no-op
trap teardown EXIT INT TERM                        # the caller owns the real one
```

Two rules make that honest. The outer trap must cover `INT` and `TERM`, not only
`EXIT`, because the inner script's trap was the only thing handling an interrupt
before. And the outer teardown must **assert** that what it created is gone and
fail the run if it is not — a leak is a failure of the instrument, not a warning —
because the neutralised inner cleanup no longer provides a second chance.

Do not answer this by removing the runner's trap. Its original single-caller use
is still the common one, and a leaf script that leaks on failure is worse than one
whose trap a second caller has to opt out of.
