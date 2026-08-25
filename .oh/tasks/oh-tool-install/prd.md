# PRD — `oh tool`: the third catalog

## Problem

`agent-browser` shares the `harness.yaml` `install:` section with the optional
harnesses but is not one — it is a headless browser, not an agent CLI. #821's
catalog excluded it deliberately, and `harness-catalog.test.ts:64` asserts that
exclusion. The exclusion was right; it just had nowhere to send the user.

So adding agent-browser still means hand-editing `harness.yaml` and then
recreating the container, because `.devcontainer/entrypoint.sh` installs it at
boot. And separately, nothing could answer "is `gh` actually in this image, and
what version" without opening a shell.

## Goal

One command for the sandbox tooling that is neither an agent CLI (`oh harness`)
nor an isolation runtime (`oh runtime`): report what is present, and install the
one thing that is installable.

## Non-goals

- **Changing how agent-browser is installed.** The entrypoint's runtime install
  is deliberate; this PR describes it, and does not move it into the Dockerfile.
- **Renaming `INSTALL_AGENT_BROWSER` or `install.agent_browser`.**
- **Bumping the `0.8.5` pin.**
- **Creating `.oh/docs/tools/<id>.md` pages.** Five stubs for a table that fits
  in `installation.md` would be worse than one good table.
- **Touching the `init.ts` wizard**, which already offers `agent_browser`.
- **Rebuilding or restarting the sandbox.**

## Decisions

### D1 — five entries, not one

A catalog containing only `agent-browser` **would** be the false singleton the
runtime catalog's header argues against — one row, no shape, a schema change
waiting to happen. The fix is not to pad it.

The fix is that the category is *"sandbox tooling that is neither an agent CLI
nor an isolation runtime"*, and that category already has five real members:
`agent-browser` (opt-in) plus `herdr`, `cloudflared`, `docker-cli`, and `gh`,
all baked into the image and therefore report-only.

This is structurally the same table as `../runtimes/catalog.ts`: three entries,
exactly one installable. Reporting on a tool you cannot install is the point,
not filler.

**Rejected: defer the command until a second installable tool exists.** That
leaves agent-browser with no home indefinitely, and the reporting half has value
on its own today.

**Rejected: put agent-browser in the harness catalog.** It is not an agent, the
exclusion test is correct, and the harness drift test asserts a Dockerfile
invariant agent-browser cannot satisfy (D3).

### D2 — persist-first, like `oh harness` and unlike `oh runtime`

`oh runtime` deliberately writes no config, because #806 § B1 leaves the
substrate selector undecided. That reasoning does **not** transfer:
`install.agent_browser` already exists in `harness-config.sh`'s envmap and in
`harness.yaml.example`, so this command writes a key the schema already defines
and changes no schema.

Persist first, then install live — so the choice survives the next container
recreate even if the download is declined or fails.

### D3 — `entrypointGuard`, not `buildArg`

agent-browser is **absent from `.devcontainer/Dockerfile`**. It is installed by
`.devcontainer/entrypoint.sh:708-715` at container start.

The harness catalog's `buildArg` field carries an invariant its drift test
enforces — "this name appears in the Dockerfile". Reusing it here would quietly
falsify that invariant. So this catalog declares a distinct field with a
distinct ground truth, and the drift test asserts **both** directions: the name
is in entrypoint.sh / docker-compose.yml / harness-config.sh, **and** it is
absent from the Dockerfile. The absence is the load-bearing half; an unasserted
premise is how these tables drift.

### D4 — the ~1 GB download is gated, and fails closed

agent-browser pulls Chromium. No harness install downloads anything comparable,
so this is the one place the CLI asks before spending the operator's bandwidth.

Precedence: `--yes` wins; then an injected confirm (tests); then the real prompt,
but only on a TTY. A non-interactive run without `--yes` installs **nothing** and
names the flag it wanted. Silently proceeding would pull a gigabyte in CI.

The gate sits *after* the persist and *after* the already-installed check, so
declining costs nothing already done and nobody approves a download that would
not have happened.

### D5 — version probes only where the flag is verified

`versionArgv` is declared for `cloudflared`, `docker-cli`, and `gh`, where
`--version` is an industry-standard flag on a ubiquitous tool. It is **omitted**
for `herdr` and `agent-browser`: neither binary exists on the machine this
catalog was written on, so their flags could not be confirmed, and the repo's
rule — set by `msb` in the runtime catalog — is to cite a verified source or
omit, never guess. `status` renders the absence as `—`, distinct from a failed
read.

Presence is always `command -v`, never a version flag: presence and version are
different questions, and the shell cannot be wrong about PATH.

### D6 — `docker-cli` is not `docker`

The runtime catalog owns `docker` (the isolation boundary and its daemon); this
one owns `docker-cli` (the client binary in the image). Different questions —
the CLI can be present while no daemon answers — so the ids differ on purpose
and a test asserts the three catalogs stay disjoint.

## Requirements

| # | Requirement |
|---|---|
| FR-1 | `oh tool list [--json]` prints every tool with kind, enabled, installed. Exit 0. |
| FR-2 | `oh tool status [name] [--json]` adds a version where one is declared, `—` where not. Exit 0. |
| FR-3 | `oh tool install <name>` requires a name — no default, since most tools are baked in. |
| FR-4 | Installing a baked-in tool exits 1 with the reason and the installable list. |
| FR-5 | A large download prompts first; `--yes` bypasses; non-interactive without `--yes` installs nothing and exits 1. |
| FR-6 | The flag is persisted even when the download is declined or fails. |
| FR-7 | `--persist-only` never prompts and never execs; `--no-persist` leaves harness.yaml byte-identical. |
| FR-8 | A stopped or absent container persists the flag, hints, and exits 0 with zero `docker exec`. |
| FR-9 | An absent binary is never asked for its version. |
| FR-10 | Every container call goes through `ExecutionTarget`; no direct `docker` spawn, no `kind` branch. |
| FR-11 | The three catalogs share no id; `agent_browser` stays out of the harness catalog. |

## Test plan

- `tool-catalog.test.ts` — shape; the three catalogs disjoint; the agent-browser
  drift test against `entrypoint.sh` (three install steps, the `0.8.5` pin, the
  dropped log cosmetics) **plus** the inverse assertion that
  `INSTALL_AGENT_BROWSER` is absent from the Dockerfile; version probes declared
  only where verified.
- `tool.test.ts` — parse, help, and every exit path on DI-injected runner fakes,
  with the gate covered in six ways: fail-closed non-interactive, decline still
  persists, the prompt names the size, accept installs, `--yes` bypasses,
  `--persist-only` never prompts, and already-installed never asks.
- `.oh/evals/probes/tool-catalog-boundary.sh` — tier A, source-grep only.
  Verified by rejection: 11 injected defects, each turning it red.

## Note

`harness.yaml.example`'s `install:` comment said `agent_browser` "is not managed
by that command" — true, and now incomplete. It names `oh tool` instead. The
harness catalog and its exclusion test are unchanged and still pass; the
exclusion was never wrong, it just now has a destination.
