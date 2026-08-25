---
title: "Lifecycle commands: make vs oh"
---

# Lifecycle commands: `make` vs `oh`

There are two front doors to the sandbox lifecycle. This page is the single
source of truth for which is which. Every other document links here rather than
restating the table.

**They are not two implementations.** Every compose target — from both doors —
runs `.oh/scripts/docker-compose.sh`. `make sandbox` calls it directly;
`oh sandbox` reaches the same script through the Docker Compose execution
target. The script owns overlay resolution, project naming, and env plumbing.
Nothing is duplicated except the name you type.

## Which one is canonical

It depends on where you are, not on preference.

| Where | Canonical | Why |
|---|---|---|
| **On the host, in a source checkout** | `make` | Host prerequisites are Docker, Git, and `make` — deliberately **no Node**. Host `oh` needs Node ≥ 20, so `make` is the one that always works. |
| **Inside the sandbox** | `oh` | `oh` is baked into the image at `/usr/local/bin/oh`. (`make` is present too, via `build-essential`, but the repo may be mounted anywhere.) |
| **In a repo equipped by `oh init`** | `oh` | An equipped repo gets the `.oh/` control plane and no Makefile. `oh` is the only door. |

This is why neither surface delegates to the other: making the Makefile call
`oh` would add Node to the host prerequisites and break the headline promise.

## The mapping

| `make` | `oh` | Runs |
|---|---|---|
| `make sandbox` | `oh sandbox` | `docker-compose.sh up -d --build` |
| `make shell [container]` | `oh shell [container]` | an interactive `zsh` in the container |
| `make stop` | `oh stop` | `docker-compose.sh stop` |
| `make restart` | `oh restart` | `docker-compose.sh restart` |
| `make logs` | `oh logs` | `docker-compose.sh logs -f` |
| `make ps` | `oh ps` | `docker-compose.sh ps` |
| `make gateway <pi\|hermes>` | `oh gateway <args…>` | `.oh/scripts/gateway.sh` |
| `make destroy` | — | see below |
| `make config` | — | see below |
| `make harness-config` | *(implicit in `oh sandbox`)* | seeds `harness.yaml` from the example |
| — | `oh init` · `oh update` · `oh harness` · `oh runtime` · `oh tool` · `oh cloud` · `oh config <integration>` | no `make` equivalent, by design |

`oh <verb> -- <args>` forwards extra arguments to `docker compose`, e.g.
`oh logs -- --tail 50`.

## The three deliberate exceptions

A probe (`.oh/evals/probes/make-oh-lifecycle-parity.sh`) asserts that every
`make` target either has an `oh` verb or is named here. The list cannot grow
silently.

### `make destroy` — no `oh destroy`

`down -v` wipes the named volumes, which hold provider authentication. A
passthrough with no confirmation policy would put that one typo away. The verb
is deferred until that policy is designed, not forgotten.

### `make config` — no `oh` equivalent

`oh config` already means *"configure an integration"* (`oh config <name>`).
Overloading it to also print resolved compose config would be worse than the
gap. A different verb name may resolve this later.

### `make shell` — the one raw `docker exec`

`oh shell` routes through the execution target's `attach()`; the Makefile spawns
`docker exec -it -u … zsh` directly. That is **intentional and pinned**:
`.oh/evals/probes/execution-target-contract.sh` check C5 asserts that line
verbatim. The Makefile is host-side orchestration, not work executed inside a
provisioned environment, so it sits outside the brain/hands contract — the same
reasoning that keeps `oh gateway` off it. See
[`rfc-brain-hands-boundary.md`](rfcs/rfc-brain-hands-boundary.md).

## What is not consolidated, and why

- **The two `harness.yaml` seeds.** `make harness-config` and the CLI's
  `seedHarnessYaml()` both copy the example. Unifying them means the Makefile
  shelling into Node, which the host-prerequisite promise forbids. Two small
  implementations of one `cp` is the cheaper trade.
- **The ~60 `make …` references across the docs.** They are correct — `make`
  stays canonical on the host. A sweep would be churn.
