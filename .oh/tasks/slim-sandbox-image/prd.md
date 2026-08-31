# PRD — Slim the sandbox image (issue #900)

## 1. Overview

Issue #900 proposes shrinking `.devcontainer/Dockerfile` to "base runtime + `oh`
CLI" and moving the agent CLIs, oh-my-zsh, the uv/python tree, and herdr to
runtime provisioning, on the theory that the single `/home/sandbox` mount from
#898/#899 now makes runtime installs persist.

**Measurement rejects that premise.** The three largest artifacts in the image —
`@openai/codex` (336 MB), `@anthropic-ai/claude-code` (239 MB), `cc-safety-net`
(25 MB) — install to `/usr/lib/node_modules`, **outside** the mount. Moving them
to `oh harness install` would make them re-download on every container recreate:
a regression in the exact property #898 established. See §7.

What #900 *can* legitimately reach is the 358 MB baked home at
`/opt/home-seed`. There the fix is not runtime provisioning — it is deleting
bytes that never needed to ship.

This PRD delivers the image reduction #900 wants, without moving any install to
boot time, without a new version-pin surface, and without breaking offline first
boot or the prebuilt-image "docker run and go" promise.

## 2. Goals

| Goal | Measure |
|---|---|
| Stop shipping build caches in the home seed | `/opt/home-seed` contains no `.npm` and no `.cache/uv` |
| Stop shipping the home seed twice | The image stores the seed once, not once per side of `mv` |
| Stop pulling 2 GB of untracked junk into local build contexts | `.pnpm-store` and `.pi` build outputs excluded by `.dockerignore` |
| Change nothing an operator can observe | `verify-sandbox-image.sh` and the boot guard pass unchanged |

Target: **~460 MB off the image**, **~2 GB off local build context**.

## 3. Measured baseline

`sandbox-openharness:latest`, measured in-container on 2026-08-30:

| Path | Size | Produced at | Movable? |
|---|---|---|---|
| `/home/sandbox` (the seed) | **358 MB** | — | — |
| `.local` (pi 136 MB + uv python 95 MB + oh kernel 71 MB) | 238 MB | `Dockerfile:141-144,185` | keep |
| `.cache/uv` | **72 MB** | `Dockerfile:185` | **delete — build cache** |
| `.npm` | **31 MB** | `Dockerfile:141-144` | **delete — build cache** |
| `.oh-my-zsh` + 3 plugins | 18 MB | `Dockerfile:147-151` | keep |

Build context (repo root, not excluded by `.dockerignore`):
`.pnpm-store` **1.5 GB**, `.pi` **509 MB**.

Outside the mount, therefore *not* addressable by #900's idea without a
persistence regression: codex 336 MB, claude-code 239 MB, cc-safety-net 25 MB
(`/usr/lib/node_modules`); uv 49 MB, herdr 19 MB (`/usr/local/bin`); pnpm global
28 MB; `/opt/oh` 38 MB; hermes 2.0 GB when `INSTALL_HERMES=true`.

**The `mv` doubles the seed.** `Dockerfile:194` (`RUN mv /home/sandbox
/opt/home-seed`) moves data across a layer boundary: the new layer holds a full
copy while every earlier layer still holds the original. Verified with a
synthetic control (busybox + 100 MB blob, with and without the `mv`):
**107,117,540 → 212,007,913 bytes.** So every byte removed from the seed is
worth two bytes of image, and storing the seed once is worth another 255 MB.

## 4. Scope

### In scope — Phase 1: purge build caches (independently shippable)

1. In `.devcontainer/Dockerfile`, after the python-kernel layer
   (`Dockerfile:185-189`) and before the seed staging layer
   (`Dockerfile:194`), remove the build caches from the home:
   `rm -rf /home/sandbox/.npm /home/sandbox/.cache/uv`.
   Prefer folding the removal into the *producing* layers where that does not
   complicate them; a dedicated layer is acceptable because the `mv` layer that
   follows re-materializes the tree anyway.
2. Recreate `/home/sandbox/.cache/uv` as an empty `sandbox`-owned directory if
   its absence would change runtime behavior — `entrypoint.sh`'s
   `repair_home_mount_ownership` already `install -d`s it, so verify before
   adding anything.
3. Extend `.dockerignore` with `.pnpm-store` and the untracked `.pi` build
   outputs (`.pi/bridge`, `.pi/npm`), preserving the existing tracked-file
   re-include pattern used for `.claude/*`.
4. New Tier-A probe `.oh/evals/probes/image-seed-hygiene.sh` asserting the
   Dockerfile purges both caches before staging the seed, and that
   `.dockerignore` excludes the store directories.

### In scope — Phase 2: store the seed once (attempt; drop if CI regresses)

5. Restructure `.devcontainer/Dockerfile` into stages so the home is produced in
   a builder stage and lands in the final image via
   `COPY --from=<stage> /home/sandbox /opt/home-seed`, with the final stage
   creating an empty `/home/sandbox`. The natural split is at `Dockerfile:128`:
   everything through the user creation is shared base; `Dockerfile:129-189` is
   the home stage; the final stage keeps the non-home work (the `/opt/uv` and
   hermes `chown -R` at `Dockerfile:138-139`, `/opt/oh-seed` at
   `Dockerfile:181`, the entrypoint, labels, `WORKDIR`).
6. Runtime `ENV NPM_USER_PREFIX` / `UV_*` keep pointing at `/home/sandbox` —
   semantics unchanged. Pi self-updates and `uv tool install` must keep
   persisting into the mount.
7. Rewrite `.oh/evals/probes/oh-home-mount.sh:55-62`, which currently pins the
   *spelling* of the mechanism (`RUN mv /home/sandbox /opt/home-seed`), to
   assert the *invariant* instead: the seed is staged at `/opt/home-seed`,
   `/home/sandbox` is empty in the image, and `harness/` is absent from the
   seed. This rewrite ships in the same commit as the restructure.

**Phase 2 is conditional.** If the builder stage lengthens the
`sandbox-boot-guard` build materially, or the restructure cannot preserve every
`verify-sandbox-image.sh` assertion, drop it from this PR and file it as a
follow-up. Phase 1 ships either way.

### Out of scope

- Moving any install to runtime provisioning (§7).
- Relocating `NPM_USER_PREFIX` / `UV_*` out of `$HOME` (§7).
- Flipping `INSTALL_PYTHON_KERNEL` to `false` (−166 MB). This is the first
  change that would make first boot depend on the network; it is a policy
  decision about default capability, not image hygiene. File separately.
- Anything about hermes (2.0 GB, already opt-in and already runtime-installable).
- `projects/mifunedev/openharness-web`.

## 5. Success criteria

1. `docker build` produces an image whose `/opt/home-seed` contains no `.npm`
   and no `.cache/uv`; total image size drops by ≥ 200 MB (Phase 1 alone) and
   ≥ 400 MB (both phases), measured against the same commit's pre-change build.
2. `.oh/scripts/verify-sandbox-image.sh` passes unchanged — every pin, version,
   and UID/GID assertion still holds.
3. A booted container is behaviorally identical: `pi`, `claude`, `codex`,
   `herdr`, `uv`, `python` all resolve; `~/.oh-my-zsh` and `~/.zshrc` present;
   `oh` works; the python kernel is provisioned.
4. `bash .claude/skills/eval/run.sh` exits 0 (no regressions), and
   `cd .oh/cli && npm test` passes.
5. Both CI workflows green: `sandbox-boot-guard` and `sandbox-compatibility`.
6. First boot still works with no network beyond the image pull.

## 6. Constraints (AGENTS.md)

- No explanatory comments in tracked code. The Dockerfile's existing header
  comments are compose/Docker commentary, not tracked application code; do not
  add new ones justifying the change — put that in the PR body.
- `.oh/` is canonical; never patch a generated mirror.
- Smallest realistic change. Resist scope creep into §4's out-of-scope list.
- Remote and disconnected operation must survive.

## 7. Rejected alternatives

**#900 as literally written** — agent CLIs / oh-my-zsh / uv / herdr moved to
runtime. Rejected on three counts. (a) The 600 MB prize (codex, claude-code,
cc-safety-net) lives outside the mount, so moving it to runtime *removes*
persistence rather than adding it; making it persist first requires relocating
the root npm global prefix into `$HOME`, which grows the seed by 600 MB.
(b) `.oh/cli/src/lib/harnesses/catalog.ts:23,33,44-52,63,88` installs
**unpinned** (`npm install -g @anthropic-ai/claude-code`, no version), so
runtime provisioning means *inventing* a pin-and-verify surface that build time
already has for free. (c) It converts `verify-sandbox-image.sh` from an image
oracle into a booted-container oracle, makes first boot network-dependent, and
contradicts `docs/deployment-prebuilt-image.md:15-19` ("a sandbox comes up in
the time it takes to pull").

**The middle path — relocate `NPM_USER_PREFIX`/`UV_*` to `/opt`.** Cuts the seed
to ~18 MB but saves zero image bytes (the same data moves to a different layer)
while destroying the persistence #898 bought: pi self-updates and
`uv tool install` results would stop surviving recreate. Strictly worse than
Phase 2, which achieves a larger reduction and keeps persistence.

**BuildKit `--mount=type=cache` instead of `rm -rf`.** Would also solve the
cache problem, but adds a BuildKit requirement to a Dockerfile that must build
under plain `docker build` in both CI jobs. `rm -rf` is the smaller truthful
model.

## 8. Build-time oracles that must keep passing

These assert build-time facts and are the regression surface for this work:

- `.oh/scripts/verify-sandbox-image.sh:10,19,48-52,102-119,133` — base codename,
  apt suites, UID/GID, node/pnpm pins, herdr version + checksum, tool versions.
  Invoked by both CI workflows.
- `.oh/evals/probes/cc-safety-net-wiring.sh:107-111` — the `cc-safety-net@` pin.
- `.oh/scripts/__tests__/herdr-default.test.ts:11-17` — `HERDR_VERSION` and both
  arch sha256s.
- `.oh/scripts/__tests__/sandbox-base-image.test.ts:11`,
  `.oh/evals/probes/sandbox-node-base.sh:21-26`,
  `.oh/evals/probes/runtime-preflight-gate.sh:56-64` — `FROM` pin parity.
- `.oh/evals/probes/oh-home-mount.sh:55-62` — **expected to change in Phase 2
  only**, per §4.7.
- `.oh/evals/probes/tool-catalog-boundary.sh:35` — fails if
  `INSTALL_AGENT_BROWSER` appears in the Dockerfile. Pre-existing rule that some
  installs belong at boot; do not disturb it.
- `.oh/scripts/__tests__/provision-python.test.ts:80-88` — asserts the exact
  `install -d` block, slicing to `indexOf("# Pi self-updates")`, **a comment
  that no longer exists in the Dockerfile**, so the anchor silently degrades to
  "rest of file". Fix the anchor opportunistically if Phase 1 touches that
  region; do not expand scope to chase it otherwise.
- `.oh/evals/probes/{oh-image-only-deploy,sandbox-boot-guard-ci,oh-devcontainer-restructure,worktrees-layout}.sh`
  — Dockerfile-coupled; re-run and confirm.

## 9. Delivery

One PR, branch `task/900-slim-sandbox-image`, cut from and targeting
`task/898-single-home-mount` (PR #899 is green but unmerged, and Phase 2 depends
on its `/opt/home-seed` staging). Retarget to `development` once #899 merges —
GitHub does that automatically.

`Closes #900` in the body. CHANGELOG entry under `### Changed`, one sentence,
≤ 250 chars, linking the PR.
