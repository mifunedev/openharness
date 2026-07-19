# US-001 Install Decision — cc-safety-net (authoritative for all wiring stories)

Empirical spike, 2026-07-19. Package tested headless in scratch; repo untouched.

**Pin**: `cc-safety-net@1.0.6` (latest; published 2026-06-15). Tarball integrity:
`sha512-uc2EmRXPXb08cfN1eGnr+h3tWHqxA20fJGZoGBgW6wFl+Nubmmy6jug18vc7WrOW7dGBMPxz4VuU8srfjHtWlw==`.
One runtime dep (`shell-quote`). Node >=18. Bin: `cc-safety-net`.

## Decision table

| Provider | Install mechanism (non-interactive) | Files touched | Offline-safe? | Config env |
|---|---|---|---|---|
| Claude Code | Vendor hook entry into existing `PreToolUse`→`matcher:"Bash"`→`hooks[]` in `.claude/settings.json`. Marketplace/plugin route REJECTED (installs git main, unpinnable). | `.claude/settings.json` + global binary from image build | Yes (bare binary on PATH, never `npx -y`) | `CC_SAFETY_NET_*` in session env |
| Codex | Same JSON schema appended to `.codex/hooks.json` (codex 0.144.4 reads Claude-format entries; `[features] hooks = true` already set). cc-safety-net only emits `deny`, never `ask` — no ask→deny wrapper needed. | `.codex/hooks.json` | Yes (same binary) | same |
| Pi | Hand-edit: add `"npm:cc-safety-net@1.0.6"` to `packages` in `.pi/settings.json` + dependency in `.pi/npm/package.json` (repo's existing pattern, 10 prior pinned packages). Native pi extension (`dist/pi/index.js`) auto-registers on `tool_call` for `bash`/`Shell`; fails closed in source. `pi install` REJECTED (writes unversioned spec, needs `--approve`). | `.pi/settings.json`, `.pi/npm/package.json` | Yes (boot npm install, same as existing pi packages) | same |

**Binary provisioning**: `RUN npm install -g cc-safety-net@1.0.6` in `.devcontainer/Dockerfile`
(existing pattern ~lines 120-123 for `pi-coding-agent`/`opencode-ai`). Image-build time =
network available and retryable; boot never touches the registry (the `hook` execution path
performs zero network I/O with local-only rulebooks — verified: 6 `fetch(` sites, all in
rulebook-sync/`doctor` paths only). This avoids the #639/4979b846 boot crash-loop class.

## Hook command string (claude + codex, identical)

```json
{"type":"command","command":"sh -c '[ \"$CC_SAFETY_NET_OFF\" = \"1\" ] || exec cc-safety-net hook --claude-code'"}
```

The `sh -c` guard IS the kill-switch: upstream ships **no disable env** (full env inventory:
STRICT, PARANOID, PARANOID_RM, PARANOID_INTERPRETERS, WORKTREE, DEBUG, HOME + legacy aliases).
`CC_SAFETY_NET_OFF=1` is our own convention — one env flips all providers' bash hooks without
config edits. Pi has no command string (extension auto-load); its kill-switch is removing the
package entry or the same env if we wrap via a thin local extension — accepted asymmetry,
documented.

## Env modes (set in docker-compose / entrypoint)

| Var | Value | Rationale |
|---|---|---|
| `CC_SAFETY_NET_STRICT` | `1` | Closes the verified fail-open hole: unparseable shell syntax ALLOWS by default; STRICT denies it. Malformed input JSON denies unconditionally (source-verified). |
| `CC_SAFETY_NET_WORKTREE` | `1` | Autopilot builds in linked worktrees; unblocks `git clean -fd` / `checkout -- .` / bare `reset --hard` there. Does NOT unblock `reset --hard <ref>`. |
| `CC_SAFETY_NET_PARANOID*` | unset | Would block everyday legitimate ops (`rm -rf` in cwd, `node -e` one-liners) and thrash headless loops. |
| `CC_SAFETY_NET_DEBUG` | unset | Optional during rollout only. |
| `CC_SAFETY_NET_OFF` | unset | Our kill-switch (see above). |

## Harness-internal destructive git (the adoption constraint)

Headless block matrix (empirical): `git reset --hard <ref>`, `git stash clear`, `git branch -D`,
`git worktree remove --force`, `git push --force` are BLOCKED in all modes (WORKTREE=1
notwithstanding). Bare `git reset --hard`, `git clean -fd`, `git checkout -- .` ALLOW only in a
verified linked worktree with WORKTREE=1. Wrapper evasion is also blocked (`bash -c "..."`,
`xargs`, chaining) — but **script-file invocation passes**: `bash .oh/scripts/foo.sh` is not
analyzed. Rulebooks are additive-only; built-in git rules are NOT allowlistable (no
skipBuiltin mechanism — verified in bundle source).

**Resolution**: the canonical `reset|clean` runner, `/watchdog`, and branch-pruning automation
must invoke their destructive git via a repo script file (`.oh/scripts/`), not inline agent
Bash. Cron/tmux shell scripts never pass through PreToolUse hooks at all and are unaffected.
The script-file gap is simultaneously the model's evasion route — accepted: Docker is the real
security boundary; cc-safety-net is a footgun net (its own README's framing), not a sandbox.

## Rulebooks

`rule init` project scope; commit `.cc-safety-net/rules/` (rule.json + rule.lock, sha256-digest
pinned). **Local-directory rulebooks only** — no `owner/repo#ref` sources, so the hook path can
never fetch. Use for harness-specific additive extras (e.g. `docker system prune`), never for
exceptions (impossible anyway).

## Fate of existing hooks (corrected per critique round 1)

- KEEP `.oh/hooks/{deny-env-dump,deny-secret-paths,warn-devtcp,notify_slack}.sh` — secret-exposure/notify; cc-safety-net does not cover this domain. Codex coverage today is deny-env-dump only (wrapper); that asymmetry predates this task and is unchanged by it.
- RETIRE `path-guard.ts` `RISKY_BASH` branch — dead code in BOTH headless (`!ctx.hasUI` return) and TUI (`ctx.mode === "tui"` return) modes today; superseded by cc-safety-net's deterministic pi extension.
- KEEP `path-guard.ts` `SENSITIVE_PATHS` write/edit branch — but honestly: it is ALSO a headless no-op today (same `!ctx.hasUI` gate). It provides interactive-mode value only. The headless secret-path write gap on pi is real, pre-existing, out of scope here, and recorded in decision.md as future work.
- Hermes: no hook surface upstream, no cc-safety-net support — documented gap only.

## Update policy

Manual re-pin only. A version bump re-runs: block-matrix smoke (the eval probe), pi extension
load, `doctor`. No automated bumps (explicit non-goal).
