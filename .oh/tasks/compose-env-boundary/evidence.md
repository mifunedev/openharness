# Evidence — compose-env-boundary (#920, PR #922)

Branch `task/920-compose-env-boundary`, commits `4425329d` and `531425f5`.
Correlated to the `/eval` run recorded in `eval-result.json` (same HEAD).

## 0. Why this is better than not doing it

**Before.** Adding a tool, harness, or setting to a sandbox required editing a compose
file. Eleven settings travelled `oh.json → config-render.ts → the rendered dotenv →
compose environment: → entrypoint.sh` to a consumer sitting in the home mount next to the
`oh` CLI. That hop produced three measurable defects:

| | Before | After |
|---|---|---|
| Descriptions of the agent-browser and Tailscale installs | **2** (`entrypoint.sh` + `tools/catalog.ts`), with the Tailscale version and **both** sha256 literals duplicated | **1** (`tools/catalog.ts`) |
| Hermes wiring in flavor B (`docker-compose.image-only.yml`) | **dead** — the file never set `INSTALL_HERMES`, so `$HERMES_HOME`, the `auth.json` migration, and the `.hermes/skills/openharness` symlink never ran | runs whenever the binary is present, in **both** flavors |
| Difference between the two compose `environment:` blocks | 15 lines | **0** — `diff` is empty |
| Compose keys not readable from `oh.json` | 21 | **9** (`SANDBOX_NAME`, `SANDBOX_PASSWORD`, `TZ`, `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS`, two `CC_SAFETY_NET_*`, both `GIT_USER_*`, `GH_TOKEN`) |

**Cost.** 50 files, +736/−491 lines. `entrypoint.sh` itself is net **−35** (63 added, 98
removed) — the boot path got smaller, not larger. The added lines are concentrated in
docs (14 files), tests, and two probes.

**Capability given up, stated plainly:** the Hermes dashboard no longer publishes
`127.0.0.1:9119` to the host. That was the retired overlay's one irreducible job. It is
now reachable from inside the sandbox, or over cloudflared or Tailscale. This is in the
BREAKING changelog entry.

*Claimed, unmeasured:* that a future tool addition costs one `oh config set` instead of a
compose edit. The mechanism is in place and probe-guarded, but no such addition has been
made on this branch.

## 1. What the plan asked for

The operator approved a plan to finish the boundary the `#903 → #911` epic set: **inside
the sandbox, the CLI provisions harnesses and tools.** Concretely — make `oh.json` plus
the CLI the only way to say what a sandbox has; leave exactly one description of every
install; stop compose narrating a fact the container can observe; make the two sandbox
flavors identical where nothing forces them apart; and make the class of defect
unrepeatable rather than merely fixed.

## 2. What was built

**The rule, now enforced.** A value belongs in compose `environment:` only if a process
outside the sandbox — or the entrypoint before the control plane is readable — must act
on it.

```
$ diff <(awk '/^    environment:/{p=1;next} p&&/^    [a-z]/{exit} p' .devcontainer/docker-compose.yml) \
       <(awk '/^    environment:/{p=1;next} p&&/^    [a-z]/{exit} p' .devcontainer/docker-compose.image-only.yml)
$ echo $?
0
```

**One description of each install.**

```
$ grep -c 'INSTALL_TAILSCALE\|INSTALL_AGENT_BROWSER\|tailscale_1\.102\.3\|agent-browser@' .devcontainer/entrypoint.sh
0
```

The tool catalog is the sole owner of both pins and Tailscale's two checksums. The
ungated `install -d -o sandbox -g sandbox -m 0755 /var/run/tailscale` is kept, so
`oh tool install tailscale` still leaves the socket path usable without a reboot.

**Flavor detection, simulated in all three states** (the exact predicate from
`.devcontainer/entrypoint.sh:127`):

```
$ sim(){ HARNESS_DIR="$1"; if mountpoint -q "$HARNESS_DIR" 2>/dev/null && [ -d "$HARNESS_DIR/.oh" ]; then echo sync; else echo seed; fi; }
$ sim /home/sandbox/harness          # real checkout bind
sync
$ sim $SCRATCH/emptybind             # empty dir, no bind
seed
$ sim $SCRATCH/seeded                # seeded volume dir with .oh/, no bind
seed
```

**The guards.**

```
$ bash .oh/evals/probes/compose-env-boundary.sh
PASS: every compose environment: key across 4 file(s) is host-side or pre-control-plane; installs and settings stay in oh.json

$ bash .oh/evals/probes/oh-image-only-deploy.sh
PASS: Flavor B (image-only) contract — entrypoint detects the flavor with mountpoint, logs
the mode on both paths, seeds only in the no-bind branch, and keeps .oh/.image-seeded
gitignored; behavioral sim confirms fresh-seed, idempotent-reseed, and
no-clobber-of-existing-.oh/; ...
```

**Mutation verification** — every new or inverted assertion was broken deliberately and
observed to exit 1:

| Probe | Mutation | Exit |
|---|---|---|
| `compose-env-boundary` | `INSTALL_FOO=true` added to `environment:` | 1 |
| `compose-env-boundary` | `OH_IMAGE_ONLY=1` added | 1 |
| `compose-env-boundary` | `LANGFUSE_BASE_URL=x` (unlisted key) added | 1 |
| `compose-env-boundary` | `environment:` block re-added to the sshd overlay | 1 |
| `compose-env-boundary` | extra `ports:` entry added to an overlay | **0** (payload is allowed) |
| `tool-catalog-boundary` | `INSTALL_AGENT_BROWSER` guard re-added to the entrypoint | 1 |
| `tool-catalog-boundary` | `agent-browser@0.8.5` pin re-added to the entrypoint | 1 |
| `tool-catalog-boundary` | `entrypointGuard` re-added to the catalog | 1 |
| `tailscale-tool-boundary` | `INSTALL_TAILSCALE` guard re-added | 1 |
| `tailscale-tool-boundary` | version pin re-added to the entrypoint | 1 |
| `tailscale-tool-boundary` | sha256 literal re-added to the entrypoint | 1 |
| `tailscale-tool-boundary` | `/var/run/tailscale` indented into a conditional | 1 |
| `tailscale-tool-boundary` | `entrypointGuard` re-added to the catalog entry | 1 |
| `oh-image-only-deploy` | detection reverted to a flag test | 1 |
| `oh-image-only-deploy` | `.oh/` conjunct dropped from the detection | 1 |
| `oh-image-only-deploy` | mode-log line deleted | 1 |
| `oh-image-only-deploy` | `.oh/.image-seeded` gitignore rule deleted | 1 |
| `oh-image-only-deploy` | `OH_IMAGE_ONLY` re-added to `image-only.yml` | 1 |

**Gates.**

```
$ bash .claude/skills/eval/run.sh     # 116 probes
ran 116 probe(s); runner exit 0; zero REGRESSION/TIMEOUT/ERROR rows
wiki-pattern-persistence  SKIPPED->PASS      (the only status change)

$ cd .oh/cli && npm run build && npm run typecheck
(clean)

$ npx --yes shellcheck -S warning <CI's exact glob set>
SHELLCHECK CLEAN

$ npx vitest run
Tests  6 failed | 976 passed (982)
```

## 3. Where it diverged from the plan, and why

Five deviations. None narrows the delivered scope; two widen it.

1. **The flavor detection is two conditions, not one.** The plan's option A was
   `mountpoint -q "$OH_PROJECT_ROOT"` alone. `docs/runtimes/microsandbox.md:262` mounts a
   fresh host directory **straight at** `/home/sandbox/harness` — a mountpoint with no
   checkout in it. The single test would have sent that boot down the host-UID-sync path
   and never seeded, breaking a documented runtime. The predicate is now
   `mountpoint -q "$HARNESS_DIR" && [ -d "$HARNESS_DIR/.oh" ]`. Both conjuncts are
   load-bearing and each is mutation-verified: dropping `.oh/` misreads an empty bind;
   dropping `mountpoint` sends a seeded no-bind volume through the UID sync on its second
   boot. That doc's now-meaningless `OH_IMAGE_ONLY` line was also removed.

2. **Two more keys were retired than the plan listed.** The plan's surviving set named
   `SANDBOX_SSH*`. Once `entrypoint.sh` reads `access.sshPasswordAuth` and
   `access.sshAuthorizedKeys` from `oh.json`, nothing reads their rendered projections, so
   leaving them rendered would have left exactly the dead projection this task exists to
   remove. `SANDBOX_SSH` and `SANDBOX_SSH_PORT` stay — `docker-compose.sh` selects the
   overlay from the first and publishes the port from the second, both before the
   container exists.

3. **`migrate-harness-yaml.sh` was left unchanged**, against the plan's instruction to
   stop mapping the retired keys. Reading the script settles it: the variable name there
   is an intermediate token, not a compose projection — `_parse env` emits
   `INSTALL_HERMES`, `_field_for` maps it to `install.hermes`, and `_json_set` writes that
   into **`oh.json`** (`:228-258`). Removing the mappings would silently drop an
   operator's legacy `harness.yaml` settings on migration, for fields this task
   deliberately keeps.

4. **`compose-env-boundary.sh` landed in commit 2, not commit 1.** The plan put it in
   commit 1 with `OH_IMAGE_ONLY`'s removal in commit 2. Its `OH_IMAGE_ONLY` assertion
   cannot pass until that flag is gone, so shipping it in commit 1 would have left that
   commit red. Moving the file kept both commits green while preserving the bisect
   boundary the plan asked for.

5. **Three consumers outside the plan's file list also needed the config read.**
   `sandbox-healthcheck.sh:63` and `banner.sh:125` read `HERMES_DASHBOARD` from the
   process environment and would have gone silently always-false; both now read `oh.json`
   with `jq`. `link-providers.sh`'s `check_hermes_link` was presence-gated first, which
   turned out to be wrong — a worktree has no `.hermes/`, so it fired where the old flag
   skipped it; the correct gate is "verify the link if it exists", and the write path
   keeps the binary check.

Two plan bullets are satisfied by finding nothing to do, recorded so a reviewer does not
read them as skipped: the two tracked secrets-example templates needed **no change** (both
are secrets-only and already describe the Langfuse non-secrets as shell exports), and
`config-schema-parity.sh` keys off the field path rather than the docs table's now-`—`
column, so it stayed green untouched.

## 4. What remains unverified

- **No live container boot.** Plan verification items 5, 6, 7b, and 11 — cold flavor-A
  boot with `install.tailscale`/`install.agentBrowser`, flavor-B boot with
  `install.hermes`, both detection directions on a real volume, and an end-to-end
  `ssh -p 2222` — all require `oh sandbox` on a Docker host. This session has no daemon.
  Detection was simulated with the exact predicate against three real filesystem states
  (§2), and the seed function's own behavior is covered by `oh-image-only-deploy.sh`'s
  fenced-function simulation. **The flavor-B Hermes fix is the defect this task exists to
  correct and it is argued from source, not observed.** A reviewer with Docker should boot
  `image-only.yml` with `install.hermes=true` and confirm `$HERMES_HOME`, the
  `.hermes/skills/openharness` symlink, and the provider skill pack.
- **6 pre-existing `compose-args.test.ts` failures**, carried forward. They reproduce
  unmodified on `development` in this environment, so this branch did not cause them. The
  same file had **8** failing before; retargeting two of its tests onto the sshd overlay
  fixed two incidentally.
- **`oh_config`'s degrade path is untested at runtime.** A missing or old `oh` returns the
  caller's documented default by construction, and `oh config show` ships in every
  released image, but no test forces the failure inside a booting container.
- **`shellcheck` is not installed in this sandbox**; CI's exact glob was run through
  `npx --yes shellcheck` (0.11.0) instead of the apt binary CI installs.
- **`oh destroy` prompt copy** (plan item 9) was not re-read; nothing on this branch
  touches it.
- **Noted, deliberately not fixed:** `INSTALL_PYTHON_KERNEL` vs `OH_PROVISION_PYTHON`
  (a Dockerfile↔entrypoint duplication of the same class), `Dockerfile:106`'s whole-repo
  copy into the `home` stage (a build-cache cost, no image weight), and the two Slack
  scripts' placement in `.devcontainer/`. All three are separate issues.
