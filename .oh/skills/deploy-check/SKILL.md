---
name: deploy-check
description: |
  Validate a deployment of the sandbox image end to end in a throwaway container,
  without touching the operator's own sandbox. Pulls the image, verifies its
  contract, boots the image-only flavor with no host checkout behind it, asserts
  resource provisioning (container, volume, network) and internal provisioning
  (the defaults installed at boot), then destroys everything it created.
  TRIGGER when: asked to validate, verify, smoke, or sanity-check a deployment,
  a published image, a release image, or the image-only / no-checkout / Flavor B
  path; "does :latest actually work", "test the deploy recipe", "check the
  published image", or before pointing someone at a published tag.
argument-hint: "[scenario] [--image <ref>] [--local] [--keep] [--run <token>]"
allowed-tools: Bash, Read, Grep
---

# Deploy Check

Run one live deployment scenario against a sandbox image and report what actually
provisioned. A parent harness stands up a **child sandbox over the Docker socket**,
asserts against it, and destroys it — so QA never pollutes the parent. This is the
door to `.oh/scripts/deployment-guard.sh`; **the skill adds no assertions of its
own** — it selects a scenario, resolves the image, runs the guard, and reads its
result. One source of truth for the checks. There is no CI leg, by design.

Arguments received: `$ARGUMENTS`

## Why this exists

Nothing else validates a published image. `sandbox-boot-guard.yml`,
`sandbox-compatibility.yml`, and `release.yml` each build a local tag and boot it
through `.oh/scripts/docker-compose.sh`, which pins the bind-mount compose file —
so `entrypoint.sh` always takes the *checkout bind detected* branch and the
image-only seed branch runs in no CI job at all.

Health alone is not the oracle either: `entrypoint.sh` runs
`provision-defaults.sh` under `timeout` and, on failure, logs a WARNING and
continues. A container can be `healthy` with every default harness and tool
missing. The guard therefore asserts the provisioned outcome, not the log line.

## Isolation — the contract this skill exists to keep

A run must not disturb the operator's own sandbox or anything else on the daemon.
`deployment-guard.sh` enforces all of this; state it when you report:

- One unique run token names the container, the volume, and the network together
  (compose derives all three from the project name).
- The run **aborts in preflight** if anything already carries that token. It never
  removes a resource it did not create.
- Its own `DOCKER_CONFIG` in an empty scratch directory, so an ambient
  `credsStore` cannot fail an anonymous pull and no login is read or written.
- No bind of the operator's checkout: the container gets a volume it creates and
  destroys, seeded from `/opt/oh-seed` inside the image.
- It reads and writes neither the checkout's `oh.json` nor its `.env` — the driver
  passes no `--env-file` at all, which is exactly why it does not reuse
  `.oh/scripts/docker-compose.sh`.
- No published host port, no Docker socket, not privileged — each asserted from
  `docker inspect`, not from inside the container.
- **No `prune` verb anywhere.** Teardown removes only this run's own resources,
  then fails the run if the before/after container, volume, and network
  inventories differ.

**This skill never manages the operator's sandbox.** It does not call
`oh sandbox`, `oh shell`, or `oh destroy`, and it offers no way to attach to a
long-lived container. It creates one, asserts against it, and destroys it. To
work in your own sandbox, use `oh shell`.

## Scenarios

| Scenario | What it asserts |
|---|---|
| `provisioning` (default) | image contract → image-only boot → the boot-smoke health, Herdr, and default-catalog oracles → seed branch, seed marker, gitconfig, container shape, and the `oh harness install` persist-and-install contract |

`provisioning` is the only scenario today. **Adding a second one is a case branch
in `.oh/scripts/deployment-guard.sh` plus its assertions** — the runner takes the
scenario, so a new deployment shape does not need a second instrument, a second
compose driver, or a second workflow. Keep the shared preflight, teardown, and
leak check; add only what the new scenario asserts.

## Instructions

### 1. Parse the arguments

`SCENARIO` is the first token unless it starts with `-`; it defaults to
`provisioning`. Everything else is a flag.

| Flag | Effect |
|---|---|
| `--image <ref>` | Image to validate. Default `ghcr.io/mifunedev/openharness:latest`. |
| `--local` | **Not yet supported by the mechanism.** `deployment-guard.sh` pulls unconditionally, so a local-only tag fails with `could not pull <ref>`. Say so and stop rather than running it. |
| `--keep` | Skip teardown for interactive triage. The guard prints the exact cleanup command it did not run; surface that line verbatim. |
| `--run <token>` | Override the run token. Use only to reproduce a specific failure. |

An unrecognised scenario is a stop, not a fallback — print the table above and
**run nothing**:

```text
deploy-check: unknown scenario '<x>'. Known scenarios: provisioning
```

### 2. Resolve the image

```bash
IMAGE=${IMAGE:-ghcr.io/mifunedev/openharness:latest}
```

The ref must be pullable. `deployment-guard.sh` starts with `docker pull`, so a
tag that exists only on this daemon fails immediately with
`FAIL: could not pull <ref>` — see *Known gaps*.

## Known gaps

Both are real and unfixed; do not paper over them in a report.

- **`--local` does not work.** The guard pulls unconditionally, so it cannot
  validate a locally built image — which is exactly what you want after changing
  the Dockerfile. Closing this means making the pull conditional on the ref not
  already being present locally.
- **There is no "leave me a child to poke at" mode.** The guard boots, asserts,
  and destroys. Ad-hoc QA — reproducing a reported failure by hand inside a fresh
  sandbox — currently means driving `.oh/scripts/deployment-compose.sh` yourself.
  `--keep` is the nearest thing, but it still runs the full assertion pass first.

### 3. Run the guard

```bash
bash .oh/scripts/deployment-guard.sh [--keep] [--run <token>] "$IMAGE"
```

Expect **5–10 minutes**: the boot installs the default harnesses and tools from
upstream registries on a fresh volume every run. Run it in the background and
report when it exits; do not poll it with `sleep`.

The guard prints one `ok:` or `FAIL:` line per assertion and accumulates failures
rather than stopping at the first, so a single multi-minute boot reports every
defect it found. Exit `0` is a pass; non-zero means at least one assertion failed
or a resource leaked.

### 4. Report

Lead with the verdict and the image, then the failed assertions verbatim. On a
pass, state what was actually asserted rather than "it worked" — the point of the
run is the assertion list.

- **A failed boot is not automatically a repository defect.** The boot installs
  live upstream packages; an npm or registry outage turns the run red with nothing
  in this repo changed. Triage starts with `docker logs` (`--keep` keeps the
  container alive for it), and the report says which of the two it looks like.
- Never report a pass the guard did not print. A timeout, a missing daemon, or a
  killed run is a failure to report, not a skip.

## When NOT to use

- **Checking the operator's own running sandbox** — that is `oh shell` and
  `/health-check`, not a throwaway container.
- **Checking CI status for a branch** — `/ci-status`.
- **Static contract checks** — `.oh/evals/probes/oh-image-only-deploy.sh` already
  owns the compose shape, the entrypoint detection logic, and the seed contract,
  and runs in the eval suite in under a second. Do not boot a container to
  re-assert them.
- **Host resource triage** — `/health-check`.

## See Also

- `.oh/scripts/deployment-guard.sh` — the mechanism; every assertion lives there.
- `.oh/scripts/deployment-compose.sh` — the image-only compose driver.
- `docs/deployment-prebuilt-image.md` — the deployment paths this validates.
