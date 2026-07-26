# PRD: cc-safety-net Cross-Provider Destructive-Command Guard (v2.1)

Revision 2.1 — incorporates critique rounds 1 and 2 (see `critique.md`) and the completed
US-001 spike (`install-decision.md`, the authoritative install/config reference for every story).

## Introduction

Adopt [cc-safety-net](https://github.com/kenryu42/cc-safety-net) `@1.0.6` (MIT, actively
maintained, 1.5k★) as the deterministic destructive-command guard for the sandbox across the
claude, codex, and pi providers. It is a PreToolUse hook that **semantically** parses Bash
commands (shell-wrapper recursion, source-verified fail-closed on malformed input; fail-closed
on unparseable shell syntax under `STRICT`) and blocks destructive intent: `rm -rf` targets,
`git reset --hard`, `git checkout --` discards, `git push --force`, `git stash clear`,
`git clean -f`, `find -delete`, `dd`/`mkfs`/`shred`, destructive interpreter one-liners.

**Framing (explicit):** this is *proactive* hardening, not incident response. Motivation: (a)
the harness runs autonomously with `bypassPermissions`/`approval_policy=never`, so hooks are
the only enforcement layer; (b) audit revealed our only destructive-command guard
(pi `path-guard.ts` `RISKY_BASH`) is dead code in both headless and TUI modes; (c) deferring
command-semantics maintenance to a purpose-built community ecosystem beats maintaining our own
regex guards. Docker remains the real security boundary — this is a footgun net.

**Per-provider guard coverage today (pre-change, verified):**

| Provider | Destructive-command guard | Secret-exposure guards |
|---|---|---|
| claude | none | all 4 `.oh/hooks/` (env-dump, secret-paths, devtcp warn, slack notify) |
| codex | none | `deny-env-dump.sh` wrapper only (pre-existing asymmetry, unchanged by this task) |
| pi | `RISKY_BASH` — dead code (headless AND TUI early-returns) | `SENSITIVE_PATHS` confirm — **also headless no-op today** (same `!ctx.hasUI` gate) |
| hermes | none (no hook surface) | none |

**Fate-of-existing-hooks decision (authoritative, corrected):**

| Asset | Verdict | Rationale |
|---|---|---|
| `.oh/hooks/deny-env-dump.sh`, `deny-secret-paths.sh`, `warn-devtcp.sh`, `notify_slack.sh` | **KEEP, untouched** | Secret-exposure/notify domain — cc-safety-net does not cover it. Complementary layers. |
| `path-guard.ts` `SENSITIVE_PATHS` write/edit branch | **KEEP** | Interactive-mode value only; it is a headless no-op today (pre-existing gap, out of scope, recorded as future work in `decision.md`). |
| `path-guard.ts` `RISKY_BASH` branch | **RETIRE** | Dead code in both headless and TUI modes today; superseded by cc-safety-net's pi extension (which fails closed, source-verified). |
| Hermes hooks | **DOCUMENT GAP** | No hook surface, no upstream support. |

## Goals

- Deterministic, non-interactive blocking of destructive Bash commands under claude, codex, and pi, headless.
- Reproducible install pinned to `cc-safety-net@1.0.6`: global binary at **image build time** (`Dockerfile`), vendored config entries per provider, zero registry access at boot or hook-execution time (avoids the #639 boot crash-loop class).
- Single kill-switch: `CC_SAFETY_NET_OFF=1` disables the claude/codex bash hooks via the shipped `sh -c` guard wrapper without config edits; boot validation honors it (warns instead of failing).
- Harness automation keeps working: the canonical `reset|clean` runner / watchdog / branch-pruning destructive git moves to a script-file invocation (allowed by design) with the convention documented.
- Existing secret-exposure/notify hooks unchanged; pi keeps `SENSITIVE_PATHS`; eval probe + docs land with the wiring.

## User Stories

> Waves: **W1** = US-002 (binary+env plumbing — prerequisite for everything that runs the
> binary) → **W2** = US-003 ∥ US-004 ∥ US-005 ∥ US-006 ∥ US-007 (disjoint files) → **W3** =
> US-008 ∥ US-009 (docs/records, after implementation settles). US-001 is complete.

### US-001: Install spike — ✅ COMPLETE

Delivered as `install-decision.md`. All subsequent ACs cite concrete mechanisms from it.

### US-002: Binary + env plumbing (W1 — prerequisite)

**Description:** As the harness maintainer, I want the pinned binary baked into the image and the mode env wired, so every later story can exercise the real hook.

**Owned files (exact):** `.devcontainer/Dockerfile` ⚠️ *protected path — explicit override: this story adds a NEW standalone, unconditional `RUN npm install -g cc-safety-net@1.0.6` instruction AFTER the existing agent-CLI install block (~line 130), matching the separate `pi-coding-agent` RUN block pattern (~lines 163-167). It must NOT be threaded into the `AGENTS`/`PKG` loop (that would make the install conditional on agent selection, violating FR-3). No existing lines removed*, `.devcontainer/docker-compose.yml` *(additive only)*, `.devcontainer/entrypoint.sh` ⚠️ *protected — additive only, no lines removed*, `.oh/scripts/link-providers.sh` ⚠️ *protected — additive only, no lines removed*. (`.oh/install/` is NOT touched.)

**Acceptance Criteria:**

- [ ] Dockerfile gains the pinned standalone install instruction; image builds.
- [ ] `CC_SAFETY_NET_STRICT=1` and `CC_SAFETY_NET_WORKTREE=1` set in compose/entrypoint env (per install-decision.md; no PARANOID vars, no DEBUG).
- [ ] `docker-compose.yml` mounts `~/.cc-safety-net` as a named volume alongside the existing per-tool volumes, so the block audit log (`~/.cc-safety-net/logs/*.jsonl`) survives rebuilds.
- [ ] `link-providers.sh` gains a new binary check-kind (`command -v cc-safety-net`, version match against the pin) alongside `required_execs` — new code, since the existing array checks repo-relative files only. Fails loudly via the existing `fail` path when the binary is missing/version-mismatched **unless `CC_SAFETY_NET_OFF=1`**, in which case it warns and continues.
- [ ] Boot performs zero npm-registry access for this feature (local presence checks only).

### US-003: Claude wiring (W2)

**Owned file:** `.claude/settings.json` only.

**Acceptance Criteria:**

- [ ] `PreToolUse`→`matcher:"Bash"`→`hooks[]` gains exactly the guard-wrapped command from install-decision.md (`sh -c '[ "$CC_SAFETY_NET_OFF" = "1" ] || exec cc-safety-net hook --claude-code'`).
- [ ] All existing hook entries byte-for-byte unchanged.
- [ ] Headless verification: piping `{"tool_name":"Bash","tool_input":{"command":"git reset --hard HEAD"}}` through the configured command yields `permissionDecision:"deny"`; a benign command passes; with `CC_SAFETY_NET_OFF=1` the wrapper exits 0 with no output.

### US-004: Codex wiring (W2)

**Owned file:** `.codex/hooks.json` only (`config.toml` already has `hooks = true` — untouched).

**Acceptance Criteria:**

- [ ] Same guard-wrapped command appended as a second `PreToolUse`/`Bash` entry; existing `deny-env-dump.sh` entry unchanged. No ask→deny wrapper needed (cc-safety-net only emits deny — verified).
- [ ] Same headless block/pass/kill-switch verification as US-003.

### US-005: Pi wiring + path-guard refactor (W2; flagged 2 iterations)

**Owned files:** `.pi/settings.json`, `.pi/npm/package.json`, `.pi/extensions/path-guard.ts`, `.pi/extensions/__tests__/path-guard.test.ts`.

**Acceptance Criteria:**

- [ ] Iteration 1 (wire): `"npm:cc-safety-net@1.0.6"` added to `packages` in `.pi/settings.json` and as a pinned dependency in `.pi/npm/package.json` (hand-edit; `pi install` rejected per install-decision.md).
- [ ] Iteration 2 (refactor): `RISKY_BASH` array + bash branch removed from `path-guard.ts`; `SENSITIVE_PATHS` branch and `/guard` command retained, `/guard` listing text updated to name cc-safety-net as the bash guard.
- [ ] `path-guard.test.ts` updated: `risky bash` describe-block removed, headless + sensitive-path cases retained. `path-guard.property.test.ts` untouched — it has no RISKY_BASH cases (verified). Both suites pass.

### US-006: Harness destructive-git compatibility (W2)

**Description:** As the harness's own automation (reset|clean runner, /watchdog, worktree/branch grooming), I need my legitimate `git reset --hard <ref>` / `git clean -f` / `git branch -D` / `git worktree remove --force` calls to keep working — cc-safety-net blocks them inline and built-ins are not allowlistable (verified), but script-file invocation passes by design.

**Owned files:** new `.oh/scripts/git-maintenance.sh`, `.oh/skills/git/SKILL.md`, `.oh/skills/watchdog/SKILL.md`, `.oh/skills/worktrees/SKILL.md`, `.oh/crons/cleanup-tasks.md` ⚠️ *protected path — explicit override: its inline `git worktree remove --force` / `git branch -D` calls (lines ~54-55, ~66, plus prose references) are rewritten to `bash .oh/scripts/git-maintenance.sh worktree-remove|branch-delete`; behavior is preserved, no cleanup step is removed. Required because crons here execute as agent prompts (`cron-runtime.ts` spawns `pi --continue`/`claude -p`), so their Bash calls DO pass through the guard — this cron would break the moment US-005 lands.*

**Acceptance Criteria:**

- [ ] `.oh/scripts/git-maintenance.sh` provides subcommands for the destructive operations the harness legitimately automates (`reset-hard <ref>`, `clean`, `branch-delete <branch>`, `worktree-remove <path>`, `push-force <remote> <branch>` for stacked-PR updates), each refusing to run outside the repo and logging what it did. Remaining blocked classes (`rm -rf` escalations, `dd`/`mkfs`/`shred`, `find -delete`, interpreter one-liners, `git stash clear`) get NO script escape hatch — kill-switch only; documented in decision.md.
- [ ] With the hook active, `bash .oh/scripts/git-maintenance.sh reset-hard HEAD` succeeds while inline `git reset --hard HEAD` is denied (verified headless).
- [ ] `.oh/crons/cleanup-tasks.md` rewritten per the override note above; `grep` across all `.oh/crons/*.md` confirms no other inline destructive-git remains (verified clean for the other 4 today — the AC guards against regressions in this PR itself).
- [ ] The three skill docs reference the script for destructive git in agent (hook-mediated) contexts, and state the corrected scope rule: **only non-agent-mediated invocations** (raw scheduler/tmux shell scripts) bypass PreToolUse hooks; agent-driven crons do NOT bypass them.
- [ ] Documented explicitly (here and in decision.md): the script-file gap is also the model's evasion route — accepted; Docker is the security boundary, this layer is a footgun net.

### US-007: Eval probe (W2)

**Owned file:** new `.oh/evals/probes/cc-safety-net-wiring.sh`.

**Acceptance Criteria:**

- [ ] 3-state probe modeled on `devtcp-hook.sh` with `# tier:` header. **SKIPPED semantics (explicit):** config-file assertions (claude/codex hook entries present with the guard wrapper, pi package pinned in both files, Dockerfile pin line, compose env vars) are repo-static and may never SKIP — absence is REGRESSION. Only the live-binary block test (`cc-safety-net` on PATH answering deny for `git reset --hard HEAD`) may SKIP, and only when the binary is absent outside the built sandbox image.
- [ ] `/eval` suite green with the probe.

### US-008: Documentation (W3)

**Owned files:** `.oh/docs/security-considerations.md`, `.oh/docs/oh-directory-layout.md`, `.oh/docs/harness-manifest.md`.

**Acceptance Criteria:**

- [ ] security-considerations.md: cc-safety-net as the destructive-command layer; secret guards as the complementary layer; per-provider coverage matrix (including codex's pre-existing single-hook state and pi's headless SENSITIVE_PATHS gap); "a prompt asks; a hook enforces" doctrine.
- [ ] **Operator runbook**: false-positive override = `CC_SAFETY_NET_OFF=1` (env-only, no reprovision; affects newly-spawned provider processes only) or route the operation through `.oh/scripts/git-maintenance.sh`. **Pi exception stated in the runbook itself**: the kill-switch env does NOT affect pi (its guard is a package extension, not a command wrapper); disabling on pi = remove the `npm:cc-safety-net` entry from `.pi/settings.json` + restart the pi session.
- [ ] **Rollout/restart step**: the runbook lists the exact commands to restart the long-lived provider sessions after merge (`cron-system`, `autopilot-*`, `client-slack-pi` tmux sessions) — without a restart these sessions remain unguarded indefinitely, defeating the purpose. Audit trail: blocks log to `~/.cc-safety-net/logs/<session_id>.jsonl` (persisted via the US-002 volume), secrets redacted.
- [ ] Layout + manifest docs list the new files; hermes gap documented.

### US-009: CHANGELOG + decision record (W3)

**Acceptance Criteria:**

- [ ] CHANGELOG entry per `/git` conventions.
- [ ] `.oh/tasks/cc-safety-net/decision.md`: ADOPT @1.0.6 (pin + sha512 integrity) / KEEP secret guards / KEEP SENSITIVE_PATHS with its pre-existing headless gap named as future work / RETIRE RISKY_BASH ("dead code in headless and TUI modes today") / DOCUMENT hermes gap / manual re-pin policy with re-validation steps.

## Functional Requirements

- FR-1: `git reset --hard HEAD`, `rm -rf /`, `git push --force` are denied headless under claude, codex, and pi; benign commands pass. (Empirical block matrix: install-decision.md.)
- FR-2: `CC_SAFETY_NET_STRICT=1` active (fail-closed on unparseable syntax); `WORKTREE=1` active; no PARANOID modes.
- FR-3: Binary installed at image build, pinned `@1.0.6`; no registry access at boot or hook execution.
- FR-4: Boot validation fails loudly when the binary is missing/mismatched — except under `CC_SAFETY_NET_OFF=1`, which downgrades to a warning (the kill-switch must never brick boot).
- FR-5: The four `.oh/hooks/` guards and codex's deny-env-dump wrapper remain wired exactly as today.
- FR-6: `path-guard.ts` retains `SENSITIVE_PATHS`; both pi test suites pass.
- FR-7: `.oh/scripts/git-maintenance.sh` restores every destructive-git operation the harness automation needs, under the hook.
- FR-8: Eval probe green; SKIPPED only per US-007 semantics.
- FR-9: All changes on `feat/cc-safety-net` targeting `development`; CHANGELOG entry; no auto-merge.

## Non-Goals

- No Hermes integration (documented gap only).
- No fix for pi's pre-existing headless SENSITIVE_PATHS gap (named future work in decision.md).
- No PARANOID modes; no interactive marketplace/plugin installs; no `npx -y` runtime wiring.
- No rulebook exceptions (impossible — additive-only, verified) and no GitHub-sourced rulebooks; local-directory rulebooks only, and none shipped in this change.
- No automated version bumps — manual re-pin only, with re-validation steps in decision.md.
- No latency budget work: hook adds one node process spawn per Bash call (measured acceptable in spike testing); explicitly accepted, revisit only if autopilot throughput regresses.
- No sandbox application code changes; harness infra only.

## Technical Considerations

- Hooks are the only enforcement layer (`bypassPermissions` / `approval_policy=never` / `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=true`).
- W2 stories own disjoint files AND only depend on US-002's binary (merged first), eliminating both merge conflicts and runtime-dependency failures flagged in critique round 1.
- Supply chain: exact pin; hook path performs zero network I/O (source-verified, 6 fetch sites all in rulebook-sync/doctor). The sha512 integrity in install-decision.md is documented for manual re-pin audits (npm audit posture degraded repo-wide, #639); no automated hash verification is built in this change.
- Protected paths touched: `.devcontainer/Dockerfile` (US-002, additive one line, declared above). No protected file is deleted or has lines removed.

## Success Metrics

- Block matrix reproduced in-sandbox post-build for all three providers.
- Clean rebuild boots offline-after-image-build with validation green; `CC_SAFETY_NET_OFF=1` boot warns-and-continues.
- `/eval` green; pi tests green; `bash .oh/scripts/git-maintenance.sh reset-hard HEAD` allowed while inline equivalent denied.

## Open Questions

None — all round-1 open questions resolved empirically by `install-decision.md`.
