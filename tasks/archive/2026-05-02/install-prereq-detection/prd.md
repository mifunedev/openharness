# PRD: Install Pre-req Detection

## Introduction

Today `curl -fsSL https://oh.mifune.dev/install.sh | bash` runs `docker compose up -d --build` without inspecting the host. A user on a fresh machine without Node experienced this as "the installer ignored my host setup." This PRD covers rewriting `install.sh` to **detect host pre-reqs first** and **branch on the user's intent** before doing anything destructive, plus the doc updates that document the new behavior.

Companion artifacts:
- Spec: `.claude/specs/install-prereq-detection.md` (committed in PR #176, contains 4 mermaid diagrams + 23-scenario verification matrix).
- Issue: [#175](https://github.com/ryaneggz/open-harness/issues/175).
- Setup PR: [#176](https://github.com/ryaneggz/open-harness/pull/176) (spec only — implementation lands here).

## Goals

- Auto-detect Node 20+ on the host; route Node-present users straight to a CLI-first install.
- For Node-absent users, present a 3-way prompt (install Node 22 via nvm + CLI / Docker-only / abort) instead of silently picking a path.
- Decouple "install the CLI" from "start a sandbox": CLI-first paths never auto-start a container — the user runs `oh sandbox <name>` themselves.
- Fix three latent bugs in the current `install.sh` along the way: `.env` written to the wrong path, `read` calls broken in pipe mode, `git pull` failing on dirty trees.
- Verify nvm download integrity (SHA-256 pinned alongside version) before piping to bash.
- Sync all docs that show the curl one-liner so `--with-cli` is no longer the canonical example.

## User Stories

Stories are sliced **hybrid**: foundation work (helpers + bug fixes) lands first, then one story per mode, then doc sync.

### US-001: Add detection + arg-parser foundation in `install.sh`

**Description:** As an installer maintainer, I need a clean detection function and multi-flag parser so the new modes have a reliable substrate to build on.

**Acceptance Criteria:**

- [ ] New helper `detect_node()` returns 0 iff Node ≥ 20 is on PATH; sets `DETECTED_NODE_VERSION` and `DETECTED_NODE_REASON`. The `|| echo unknown` guard against `set -e` is commented as load-bearing.
- [ ] New helper `warn()` writes to stderr; `YELLOW` color added to the helper block.
- [ ] Multi-flag parser handles `--cli`, `--docker-only`, `--no-cli`, `--install-node`, `--with-cli` (deprecation `WARN:`), `-y/--yes`, `-n/--no`, `-h/--help`. Rejects `--cli=value` style explicitly.
- [ ] Reads env: `OH_INSTALL_MODE`, `OH_ASSUME_YES`, `OH_INSTALL_REF`, `SANDBOX_NAME`, `SANDBOX_PASSWORD`. Flags win over env on conflict.
- [ ] Conflict checks (`--cli + --docker-only`, `--cli + --install-node`, `--docker-only + --install-node`, `--yes + --no`) run **after** the parse loop and `die` on any conflict.
- [ ] `bash -n install.sh` and `shellcheck --shell=bash install.sh` pass.
- [ ] Covered by spec scenarios #20 (`--cli=value`), #21 (conflict pair).

### US-002: Replace existing `read` calls with `prompt_input` helper

**Description:** As a user piping `curl … | bash`, I need the password and sandbox-name prompts to actually work — today they read from the script source instead of my keyboard.

**Acceptance Criteria:**

- [ ] New `prompt_input` helper accepts `(varname, msg, default, secret-flag)` and resolves in order: pre-set env var → `</dev/tty` interactive → default fallback (warn) → `die` if no default and no TTY.
- [ ] `read -r SANDBOX_NAME` and `read -rs SANDBOX_PASSWORD` are removed; both call sites use `prompt_input`.
- [ ] Setting `SANDBOX_NAME=foo` skips only the name prompt; password resolves independently.
- [ ] `read -rs` secret behavior preserved: no echo, newline emitted after submit.
- [ ] Curl-piped install with `SANDBOX_NAME=foo SANDBOX_PASSWORD=bar curl … | bash --yes` runs end-to-end with no prompts.
- [ ] Covered by spec scenarios #4 (piped no flags), #5 (piped `--yes`), #19 (env-var partial set).

### US-003: Fix `.env` write path + `git pull` dirty-tree handling

**Description:** As a user running `oh sandbox <name>` after a CLI-first install, I need the name I typed to actually reach the CLI — today it's silently dropped because `.env` is written to the wrong path.

**Acceptance Criteria:**

- [ ] `.env` heredoc writes to `$REPO_DIR/.devcontainer/.env`, not `$REPO_DIR/.env`. (Verified against `packages/sandbox/src/lib/config.ts:7`.)
- [ ] `SANDBOX_NAME` and `SANDBOX_PASSWORD` are quoted in the heredoc so names with shell metacharacters don't break compose.
- [ ] `.devcontainer/.env` is confirmed in `.gitignore`; if missing, add.
- [ ] `git -C "$REPO_DIR" pull` is gated on `git diff --quiet && git diff --cached --quiet`. Dirty tree → warn and skip pull, do not abort the install.
- [ ] After install, `cat $REPO_DIR/.devcontainer/.env` shows the user's typed `SANDBOX_NAME` (not the default `sandbox`).
- [ ] Covered by spec scenarios #14 (clean re-run), #15 (dirty re-run).

### US-004: Mode dispatch + auto-detect → CLI-first happy path

**Description:** As a user with Node 20+ on my host, I want `curl … | bash` to install the `oh` CLI on my host without auto-starting a sandbox so I can learn the lifecycle myself.

**Acceptance Criteria:**

- [ ] `resolve_mode()` reads forcing flags first, then `OH_INSTALL_MODE`, then runs `detect_node`. Result is one of `cli` | `docker` | `node-then-cli` | `prompt`.
- [ ] On `INSTALL_MODE=cli`: ensure pnpm (corepack/npm fallback), `pnpm install`, `pnpm -r run build`, `pnpm link --global ./packages/sandbox`, verify `openharness` on PATH.
- [ ] **No** `docker compose up` runs in CLI mode.
- [ ] Next-steps output prints `cd $REPO_DIR` as Step 1, then `oh sandbox <name>` (Step 2), `oh shell <name>` (Step 3), `gh auth login` shown as **inside-the-shell** in Step 4 — not host-side.
- [ ] `--cli` with no Node 20+ hard-fails with a message that names `--install-node` as the alternative.
- [ ] Covered by spec scenarios #7 (Node present), #10 (`--cli` without Node).

### US-005: Docker-first path + 3-way prompt

**Description:** As a user without Node, I want the installer to ask me how I want to proceed instead of silently picking Docker, and to support a clean Docker-only choice when that's what I want.

**Acceptance Criteria:**

- [ ] When `INSTALL_MODE=prompt`, `choose_path()` reads from `/dev/tty` and shows three numbered options (default `1` = nvm + CLI, `2` = docker, `3` = abort).
- [ ] `--yes` selects option 1; `--no` selects option 3; `--docker-only` skips the prompt entirely (mode flag wins).
- [ ] `--yes --docker-only` is explicitly valid: docker-only runs non-interactively.
- [ ] No-TTY + no flag → `die` with a message that names `--yes`, `--docker-only`, or `--no` as escape hatches.
- [ ] On `INSTALL_MODE=docker`: `docker compose -f .devcontainer/docker-compose.yml up -d --build` runs as today.
- [ ] Docker next-steps show `docker exec -it -u orchestrator <name> bash`, the `cd $REPO_DIR` step before any compose command, and the `--install-node` re-run hint.
- [ ] Covered by spec scenarios #1 (interactive 3-way), #2 (declined), #3 (piped no flags), #4 (TTY die), #6 (`--docker-only`), #16 (`--yes --docker-only`).

### US-006: nvm + Node 22 install path with SHA-256 verification

**Description:** As a user without Node, I want option 1 (default) to set up Node 22 via nvm so my host gets the same outcome as if Node had been pre-installed.

**Acceptance Criteria:**

- [ ] `NVM_VERSION=v0.40.4` and `NVM_SHA256=<pinned>` are constants near the top of the script. Bump procedure documented in a comment.
- [ ] `install_nvm()` first runs a **functional** "already installed" check: source `nvm.sh` in a subshell and verify `nvm --version` exits 0. Existence of `$NVM_DIR/nvm.sh` alone is not sufficient.
- [ ] If installing: download nvm `install.sh` to a temp file, compute SHA-256, abort with `die` on mismatch, then `bash` the verified file and `rm` it.
- [ ] After install: `. "$NVM_DIR/nvm.sh"`, `nvm install 22 --lts`, `nvm alias default 22`, `corepack enable`, `corepack prepare pnpm@<pinned> --activate`. Order is load-bearing — corepack runs in nvm-Node context only.
- [ ] Re-run `detect_node`; if it still fails after install, `die` with a clear message instead of falling through to a broken `pnpm install`.
- [ ] Append a Fish-aware reminder to next-steps when this path runs (`nvm doesn't source into Fish; install nvm.fish or fisher`).
- [ ] Read-only `~/.bashrc`: surface a clear error rather than dying mid-install.
- [ ] Covered by spec scenarios #1 (interactive choose 1), #5 (piped `--yes`), #11 (`--install-node` flag), #17 (SHA-256 mismatch), #18 (broken nvm), #23 (Fish shell).

### US-007: Sync docs and add CHANGELOG entry

**Description:** As a docs reader, I shouldn't see `--with-cli` in primary examples since auto-detect makes it redundant; the new flags and prompt should be documented in one consistent place.

**Acceptance Criteria:**

- [ ] `apps/docs/docs/installation.md`: drop dual `bash` / `bash -s -- --with-cli` examples; show one curl line; add "Override auto-detection" subsection with the full flag table including `--yes --docker-only` and `OH_INSTALL_REF`. Update prerequisites table footnote so Node is recommended-not-required.
- [ ] `apps/docs/docs/quickstart.md`: line 19 changes from `bash -s -- --with-cli` to `bash`; paragraph rewritten to describe auto-detect + 3-way prompt; `gh auth login` shown as running inside the sandbox shell.
- [ ] `apps/docs/src/pages/index.tsx`: line 8 `QUICKSTART` first line drops `--with-cli`.
- [ ] `docs/getting-started/installation.md` and `docs/getting-started/quickstart.md`: same edits as the Docusaurus equivalents (legacy plain-markdown set).
- [ ] `README.md`: rewrite the "Add `-s -- --with-cli`" sentence to describe auto-detect + nvm-or-docker prompt.
- [ ] `CHANGELOG.md`: under `## [Unreleased]` → `### Changed`, add a one-liner: "Installer auto-detects Node 20+; new `--cli` / `--docker-only` / `--install-node` flags; `--with-cli` deprecated." Link the PR.
- [ ] Typecheck passes (`apps/docs` is TypeScript Docusaurus); `pnpm --dir apps/docs build` succeeds.
- [ ] Verify rendered docs in browser using agent-browser skill (`pnpm docs:dev`, then load the installation and quickstart pages).

## Functional Requirements

- **FR-1:** The installer must detect Node 20+ on the host before any destructive action.
- **FR-2:** When Node 20+ is detected (or `--cli` is set), the installer must build and link the `oh` CLI but **must not** run `docker compose up`.
- **FR-3:** When Node is missing or too old (and no forcing flag is set), the installer must show a 3-way prompt with default option 1 (install Node 22 via nvm + CLI), option 2 (Docker-only sandbox), option 3 (abort).
- **FR-4:** The installer must support flags: `--cli`, `--docker-only` (alias `--no-cli`), `--install-node`, `--with-cli` (deprecated alias for `--cli`), `-y/--yes`, `-n/--no`, `-h/--help`.
- **FR-5:** The installer must support env vars: `OH_INSTALL_MODE`, `OH_ASSUME_YES`, `OH_INSTALL_REF`, `SANDBOX_NAME`, `SANDBOX_PASSWORD`. Flags win on conflict.
- **FR-6:** Conflicting flag pairs (`--cli + --docker-only`, `--cli + --install-node`, `--docker-only + --install-node`, `--yes + --no`) must `die` immediately.
- **FR-7:** `--yes --docker-only` must be a valid combination — runs Docker-only with no prompt.
- **FR-8:** All interactive prompts (sandbox name, password, 3-way choice) must read from `/dev/tty` and honor pre-set env vars to skip the prompt.
- **FR-9:** When piped without a TTY and no resolving flag, the installer must `die` with a message naming `--yes`, `--docker-only`, and `--no` as escape hatches.
- **FR-10:** Sandbox configuration must be written to `$REPO_DIR/.devcontainer/.env` (not `$REPO_DIR/.env`).
- **FR-11:** `git pull` on re-run must be gated on a clean working tree; a dirty tree warns and skips, never aborts.
- **FR-12:** The nvm installer download must be SHA-256 verified before being executed; mismatch must `die`.
- **FR-13:** `corepack enable` must run only after nvm-managed Node is sourced into the current shell (never against system Node).
- **FR-14:** `--with-cli` must continue to work, printing `WARN: --with-cli is deprecated` and proceeding as `--cli`.
- **FR-15:** Next-steps output must be mode-aware. CLI-first must lead with `cd $REPO_DIR`. Docker-first must include the `--install-node` re-run hint.
- **FR-16:** The deprecation of `--with-cli` must be documented in the docs flag table; primary examples must show only the flag-less curl one-liner.

## Non-Goals

- **No Cloudflare Worker changes.** The 302 to raw GitHub `main` keeps shipping the new script automatically; pinning escape hatches via Worker query-params are tracked as a follow-up.
- **No `packages/sandbox` changes.** `oh sandbox` repo-locating (so users don't need `cd $REPO_DIR`) is a follow-up issue. The next-steps output works around it.
- **No `--dry-run` mode.** Tracked as a follow-up.
- **No CI gate on `install.sh` in this PR.** Tracked as a follow-up — a separate workflow that runs `bash -n`, `shellcheck`, and the piped `--yes` / `--docker-only` scenarios in throwaway containers.
- **No telemetry / phone-home / install logging.** Tracked as a follow-up.
- **No Windows / WSL / Apple Silicon explicit support matrix expansion.** The script is bash; WSL2 is the documented Windows path.
- **No removal of `--with-cli`.** Removal date scheduled in a separate tracking issue, surfaced in the deprecation `WARN:`.
- **No alternative Node version managers** (fnm, asdf, mise, volta). nvm is the single supported install path.

## Design Considerations

- Reuse existing color/log helpers (`RED`, `GREEN`, `CYAN`, `NC`, `banner`, `ok`, `die`) — extend with `YELLOW` + `warn`.
- Reuse existing repo-resolution block (handles "script inside a checkout" vs "fresh clone to `~/.openharness`").
- Reuse the `.env` heredoc pattern — only the path target changes.
- Diagrams: 4 Mermaid flowcharts already in the spec — link from docs rather than duplicate.

## Technical Considerations

- The script ships via Cloudflare Worker 302 → raw GitHub `main`. A merge to `main` ships immediately to all users.
- `set -euo pipefail` is inherited; new helpers must avoid tripping `-e` (especially `read` on EOF).
- nvm install URL is mutable (GitHub serves whatever the tag points at) — SHA-256 verification is mandatory, not optional.
- `corepack enable` requires Node ≥ 16.13. Order of operations after nvm install matters: source → install → corepack.
- `.gitignore` already excludes `.env*` patterns — verify `.devcontainer/.env` is covered.
- The `oh sandbox` CLI resolves compose paths relative to CWD — the next-steps `cd $REPO_DIR` step is the workaround for this in the absence of a CLI-side fix.

## Success Metrics

- A user on a fresh machine without Node sees a 3-way prompt instead of an unannounced docker compose up.
- A user with Node 22 already installed gets a CLI-only install (no container started) and reaches `oh shell <name>` via the documented next-steps in ≤ 2 commands.
- `oh sandbox <name>` after a CLI-first install provisions a container with the user-typed name, not the default `sandbox`.
- 0 silent failures on curl-piped installs across the 23 spec scenarios.
- `bash -n install.sh` and `shellcheck --shell=bash install.sh` pass before merge.

## Open Questions

- **`pnpm link --global` re-run:** is it truly idempotent or does it duplicate? Resolve at implementation time by running US-004 twice on a clean machine; if duplicates appear, add an `unlink-first` step.
- **`trap` for partial-state cleanup:** worth adding for `pnpm install` and `nvm install` failure paths? Recommend yes, lightweight implementation that prints recovery hints (no auto-rollback).
- **`--help` output format:** spec lists the flag but never defines content. Implementer to draft the help block before US-001 completes.

## Out of Scope (tracked as follow-up issues)

To be opened as separate `task:` issues at implementation time:

1. `oh sandbox` repo-locating (walk up from CWD or honor `OH_REPO_DIR`).
2. CI gate on `install.sh` (path-filtered workflow that runs `bash -n`, `shellcheck`, and the piped `--yes`/`--docker-only` scenarios).
3. Pin `corepack prepare pnpm@<X>` in the non-nvm `--cli` path (today uses `pnpm@latest`).
4. `git clone --depth 1` + `OH_INSTALL_REF` plumbing.
5. `OH_INSTALL_LOG=<path>` for support repro.
6. `--with-cli` removal date (CalVer release).
7. `--dry-run` mode.
8. `oh onboard` host vs sandbox semantics.
9. Worker pinning escape hatch (`?ref=<tag>`).
10. Disk-space pre-flight (`df -k $HOME` ≥ 1GB).
