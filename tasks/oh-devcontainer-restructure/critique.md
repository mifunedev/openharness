# Critique — oh-devcontainer-restructure (RFC #531 Phase 2 slice 2)

Two adversarial critics (implementer lens + critic lens) reviewed the plan against the live
pre-move tree. Both confirmed the **core relocation logic is structurally correct** (compose
relative-path math `../..`, the single Dockerfile entrypoint COPY, `.dockerignore` negation
removal, VS Code `dockerComposeFile` repoint, the CI workflow edits, the shellcheck zero-match
fix, the boot-probe lockstep). Both also found the SAME critical scope gap.

## Verdicts

- **Implementer lens:** SOUND-WITH-AMENDMENTS — "core logic correct; misses three test suites and
  one eval probe that produce concrete CI failures."
- **Critic lens:** DO-NOT-SHIP-as-scoped — "seven MUST-FIX gaps would cause outright CI failures
  or silent probe regressions before the boot-guard even runs."

## MUST-FIX (folded into the amended prd.json)

The root cause of every must-fix: my first blast-radius sweep did not look inside
`.oh/scripts/__tests__/` (a vitest suite run by CI's **Test job, independently of the
boot-guard**), `.claude/protected-paths.txt`, `evals/probes/cron-watchdog.sh`, or the
user-facing doc `docker compose -f .devcontainer/docker-compose.yml` commands. An exhaustive
`grep -rIn` for all six moved-asset paths (the "grep-sweep FIRST" lesson) surfaced them.

- **MF-A — `.oh/scripts/__tests__/entrypoint.test.ts`** (lines 8, 70, 104, 134) hardcodes
  `.devcontainer/entrypoint.sh`, `.devcontainer/client-slack-supervise.sh`,
  `.devcontainer/seed-msg-bridge.sh` → `readFileSync`/`execFileSync` ENOENT + a content
  assertion that flips when gateway.sh is repointed. → **US-003**.
- **MF-B — `.oh/scripts/__tests__/entrypoint-pnpm-install.test.ts`** (line 9) hardcodes
  `.devcontainer/entrypoint.sh` → module-load `readFileSync` ENOENT. → **US-003**.
- **MF-C — `.oh/scripts/__tests__/gateway.test.ts`** (lines 20, 45, 62-63, 92-93) content
  assertion + `cpSync` source ENOENT + a stub supervisor written to the OLD path so the
  security/token-injection integration test can't `exec` it. → **US-003**.
- **MF-D — `.oh/scripts/__tests__/compose-args.test.ts`** (beforeEach 24-26 + assertions 80,
  112-114, 159) builds compose fixtures at `tmp/.devcontainer/` and asserts the `-f` argv equals
  that path; after docker-compose.sh repoints, the script emits `tmp/.oh/devcontainer/...`. → **US-003**.
- **MF-E — `.oh/scripts/__tests__/docs-compose-overlays.test.ts`** (line 24 regex
  `/\.devcontainer\/docker-compose[\w.-]*\.yml/g` + `expect(refs.size).toBeGreaterThan(0)` +
  per-ref `existsSync`). This is a DOUBLE bind: leaving docs at `.devcontainer/docker-compose.yml`
  fails `existsSync` (file moved); updating docs to `.oh/devcontainer/...` makes the regex match
  zero → `refs.size > 0` fails. The TEST REGEX **and** the docs it scans
  (`docs/intro.md`, `docs/installation.md`) must change **together in one worker**. → **US-003**.
- **MF-F — `evals/probes/cron-watchdog.sh`** (line 8) `ENTRYPOINT="$ROOT/.devcontainer/entrypoint.sh"`
  → after the move the existence guard SKIPs (Tier-A coverage silently goes dark). → **US-004**.
- **MF-G — `.claude/protected-paths.txt`** (lines 47-48) protects `.devcontainer/entrypoint.sh`
  + `.devcontainer/Dockerfile`; the move would leave the operative files unguarded and the guards
  pointing at ghosts. Update to `.oh/devcontainer/...`. → **US-004**. (Note: protected-paths is a
  guard list, not a live boot file — editing it to track the moved files is correct, not a violation.)
- **MF-H — `docs/intro.md` (25,27) + `docs/installation.md` (8,80,113,138)** carry
  `docker compose -f .devcontainer/docker-compose.yml` user commands that break post-move AND are
  asserted by MF-E's test. → **US-003** (coupled with the test).
- **MF-I — sync-devcontainer.sh JSON-comment trap:** the original US-002 AC said "include a
  top-of-file comment in the generated devcontainer.json." JSON has no comment syntax → `jq .`
  (AC-E) would fail. **Resolution:** the "GENERATED — do not hand-edit" notice lives in the SHELL
  SCRIPT (and `.oh/README.md`), never in the emitted JSON. The emitted file is pure JSON. → **US-002 reworded**.
- **MF-J — file-mode preservation:** US-001 must use a real `mv` (not `cp`+`rm`) and assert the
  moved `.sh` files keep their executable bit. → **US-001 AC tightened**.

## SHOULD-FIX (folded where cheap; the rest are documented as a deliberate tail)

- **SF-1 — doc accuracy sweep:** `.oh/README.md` (line 61 `COPY (.devcontainer/Dockerfile)` and the
  §"Why these stay at root" narrative at 86-89, which now over-claims since the build assets leave
  `.devcontainer/`), `AGENTS.md:77`, `docs/integrations/slack.md` (138 entrypoint, 175/300
  supervise), `docs/integrations/debugmcp.md` (`.devcontainer/Dockerfile:LINE` refs),
  `crons/README.md:142`, `.mifune/skills/harness-audit/SKILL.md`,
  `.mifune/skills/harness-context/references/hermes-state-auth-split.md`, `.pi/UPSTREAM.md`,
  `.pi/bridge-recovery/index.ts:14`, and `.oh/scripts/maintenance/restart-openharness-tmux.sh:46`
  (comment). → **US-005** (doc sweep) + the maintenance-script comment → **US-002**.
- **SF-2 — wire `sync-devcontainer.sh --check` into CI:** the new probe
  `oh-devcontainer-restructure.sh` (US-004) runs `--check` so a future drift between the generator
  and the committed `devcontainer.json` is caught by the eval gate (CI runs probes). → **US-004**.
- **SF-3 — DELIBERATELY LEFT (documented in the PR):** `.oh/install/banner.sh:28` (cosmetic jq
  prefix-strip for downstream composeOverrides display — and `boot-banner.test.ts` covers banner.sh,
  so editing it risks an unrelated test for zero functional gain); `harness.yaml:58` (a commented
  composeOverrides *example*); `blog/**` (archival, pinned to `main` at publish time); `tasks/**`
  historical completed-task PRDs. These reference `.devcontainer/...` only as cosmetic/archival
  text and changing them is churn or risk. `.oh/scripts/__tests__/harness-config.test.ts` uses
  FICTIONAL `.devcontainer/docker-compose.a.yml`/`.b.yml` strings to test the override PARSER (no
  file existence check) — left unchanged.

## Items the critics explicitly verified CORRECT (no change)

- Compose path math (`context: ../..`, `dockerfile: .oh/devcontainer/Dockerfile`, bind `../..`):
  `docker-compose.sh` passes ABSOLUTE `-f` paths, so compose's project dir = the compose file's
  new dir; VS Code resolves `dockerComposeFile: ['../.oh/devcontainer/docker-compose.yml']` to the
  same dir. Both land identically. No CLI-vs-VSCode divergence.
- Only ONE Dockerfile COPY references `.devcontainer/` (entrypoint); the rest are root-relative.
- `.dockerignore`: `.oh/` is not excluded, so `COPY .oh/devcontainer/entrypoint.sh` resolves; the
  Dockerfile is read via `--file` (filesystem, not the dockerignored context).
- Disjoint story ownership holds; the filesystem `mv` (US-001) + git staging (Advisor) does not
  race US-002's edit of root `devcontainer.json` (different files).
- The running container booted from the OLD `.devcontainer/`; moving files on a branch cannot
  harm it — the change only takes effect on the NEXT image rebuild, which CI's boot-guard validates
  before merge. Blast radius is contained behind the human merge gate.
- Choosing `.oh/devcontainer/` (not `.oh/templates/.devcontainer/`) is collision-free with slice 1
  (PR #334). The only shared append-files are CHANGELOG `[Unreleased]`, `evals/RESULTS.md`,
  `.oh/README.md` — resolvable by union at merge (known pattern).

## Resolution

Plan expanded from 4 to **5 disjoint-file stories** (added US-003 for the test suite + its coupled
docs; renumbered CI/probes → US-004 with cron-watchdog + protected-paths + the new guard probe;
docs sweep → US-005). Every MUST-FIX folded with exact file:line targets. MF-I reworded the
generator AC. MF-J tightened US-001.

**Final verdict: APPROVED (after amendments).** The change remains a pure, no-behavior relocation;
the four CI oracles (sandbox-boot-guard image build+boot, the vitest Test job, the eval-probe gate,
hadolint/shellcheck boot-lint) plus the Advisor's local gates fully cover it.

STATUS: SPEC-APPROVED
