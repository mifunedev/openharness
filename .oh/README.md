# .oh/

The **`oh`-CLI / installer config surface** — the namespace earned by being
addressed as a unit by an *external* consumer that is **not** an agent provider:
the `oh` CLI, `oh harness add`, and the container build/installer. It rescopes
the removed `.openharness/` deploy-override directory under the short name that
already matches the `oh` CLI (so `.openharness/` nested inside the `openharness`
repo is no longer redundant).

The rule that governs this dir, same as `.mifune/`: **a dotdir namespace is
earned by EXPORT — being addressed by an external consumer — not by ownership.**
`.mifune/` exports to the four agent providers + the skills registry; `.oh/`
exports to the `oh` CLI / installer; this repo's own runtime machinery stays at
root.

## Contents

| File / dir | Purpose |
|------|---------|
| `README.md` | This file — the namespace anchor (keeps `.oh/` in a fresh clone) and the surface's documentation. |

No config has been relocated here yet — the namespace is established first; an
`oh`-CLI consumer or a clean relocation populates it later (see *Relocation
policy* below). When deploy/compose overrides or harness-pack/install config move
under `.oh/`, add a row here per the `context/directory-readme.md`
convention.

## What belongs here vs. at root

| Belongs in `.oh/` | Stays at root |
|------|------|
| Deploy / compose overrides, harness-pack + install config — anything the `oh` CLI / `oh harness add` / container build addresses as a config unit | The harness's own runtime machinery: `scripts/`, `evals/`, `crons/`, `context/`, `install/` — consumed *in place* by this repo's runtime, with no external consumer addressing them as a unit |

## Relocation policy (rationale for what stays at root)

The B-state plan flagged `scripts/{install.sh,harness-config.sh,docker-compose.sh,check-pnpm-pin.sh}`
as candidate `.oh/` config. They are **left at root for now** because their
references span CI workflows, the `Makefile`, vitest suites, and the boot-lint
shellcheck glob (`scripts/*.sh`), and probes pin runtime config to its current
path. The migration deliverable is **the namespace + the rescope, not blind
relocation** — relocate a script here only when every Makefile / CI /
devcontainer / cross-script reference can be updated with CI **and** the eval
suite (`bash .mifune/skills/eval/run.sh`) staying green; otherwise it stays at
root with this rationale.

Two configs in particular stay at root deliberately:

- `harness.yaml` — the CI path filters (`ci-harness.yml`, `sandbox-boot-guard.yml`)
  and the `autopilot-preflight-gate` / `harness-ci-core-paths` / `sandbox-boot-guard-ci`
  probes all pin it at the repo root; moving it would redden those guards.
- `config.json` (gitignored, the `composeOverrides[]` source) — read in place by
  `install/banner.sh` and the entrypoint at `$HOME/harness/config.json`.

## Pointers

- `context/directory-readme.md` — the README-as-directory-anchor convention this file follows.
- `docs/roadmap.md` — M2 (`.oh/` config surface) on the B-state migration roadmap.
- `.claude/plans/context-as-a-logical-marble.md` § *Namespace principle* — the export-ness axis that earns this namespace.
