# PRD: Fork-Friendly Install

## Introduction

The Open Harness installer is hardcoded to upstream (`ryaneggz/open-harness`) at two coupling points:

1. `README.md:17` uses `https://oh.mifune.dev/install.sh` — a Cloudflare 302 redirect owned by upstream. Forkers cannot repoint it.
2. `scripts/install.sh:241` and `:244` literal-clone `https://github.com/ryaneggz/open-harness.git`. Even if a forker bypasses the redirect by curling their own raw script URL, both clone sites still pull upstream code into `~/.openharness`.

Net effect: forks can publish a different README, but the actual installed harness is always upstream's. This blocks every team running their own Open Harness from being a self-contained product.

This PRD adopts **Option E (Hybrid B+A)** — the unanimous output of a 5-seat AI council deliberation (DX, Security, OSS Maintainer, Infra Pragmatist, Self-Host User) with Critic-concur-with-amendments. The chosen approach parameterizes the clone source via `OH_GITHUB_REPO` env var and adds a "For forks / self-host" block to the README pointing forkers at the raw-GitHub URL pattern. The upstream one-liner (`curl ... oh.mifune.dev/install.sh | bash`) is preserved unchanged so existing referrers continue to work.

## Goals

- A forker can run one curl-pipe command against their fork and end up with their fork's code in `~/.openharness`.
- The upstream install command is byte-equivalent to today — no new prompts, no new env-var requirements for upstream users.
- Bad inputs fail loudly. Malformed `OH_GITHUB_REPO` dies with a clear regex-validation message; non-default value warns visibly that a fork is being cloned.
- The update path (`git pull`) is fork-aware: re-running with a different `OH_GITHUB_REPO` than the existing clone's `origin` warns and skips the pull rather than silently mixing remotes.
- `OH_INSTALL_REF=v1.2.3` continues to work unchanged (back-compat via alias).

## User Stories

### US-001: `OH_GITHUB_REPO` env var parameterizes the clone

**Description:** As a forker of Open Harness, I want the installer to clone from my fork instead of `ryaneggz/open-harness` so that running the install command on my fork yields my code in `~/.openharness`.

**Acceptance Criteria:**

- [ ] `scripts/install.sh` defines `OH_GITHUB_REPO="${OH_GITHUB_REPO:-ryaneggz/open-harness}"` **immediately after `REPO_DIR` is determined and before the migration block (i.e., between the `Install target is ~/.openharness` log around line 181 and the migration logic starting at line 183)** — placing it BEFORE any filesystem-mutating logic so a bad value dies before `mv`/`git stash`/archive run
- [ ] `OH_GITHUB_REPO` is validated using the bash regex form `[[ "$OH_GITHUB_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]` (NOT `grep -E` or `echo | grep` — anchors `^...$` in bash `=~` match the full string; `grep` substring matching is forbidden here). On mismatch: `die "OH_GITHUB_REPO must be <owner>/<repo>: got '$OH_GITHUB_REPO'"`. Exit code non-zero
- [ ] When `$OH_GITHUB_REPO` differs from `ryaneggz/open-harness`, the installer emits `warn "Cloning from fork: $OH_GITHUB_REPO"` before the clone runs
- [ ] Both hardcoded clone URLs at current `scripts/install.sh:241` (with `--branch "$OH_INSTALL_REF"`) and `:244` (no branch) are replaced with `"https://github.com/${OH_GITHUB_REPO}.git"`
- [ ] With `OH_GITHUB_REPO` unset, the upstream install path produces an identical clone URL to today (`https://github.com/ryaneggz/open-harness.git`)
- [ ] With `OH_GITHUB_REPO=ryaneggz/open-harness` (explicitly set to default), no fork-warn fires; behavior matches the unset case
- [ ] `bash -n scripts/install.sh` passes (no syntax errors)
- [ ] `shellcheck scripts/install.sh` exits 0 (or, if the baseline already has warnings, the warning count does not increase — capture baseline count in the PR description)

### US-002: `OH_GITHUB_REF` aliases `OH_INSTALL_REF`

**Description:** As a forker, I want to pin to a tag or SHA in my fork using the same naming pattern as the repo var so that the env-var surface is internally consistent.

**Acceptance Criteria:**

- [ ] `scripts/install.sh` accepts `OH_GITHUB_REF` as an alias for `OH_INSTALL_REF`: `OH_GITHUB_REF="${OH_GITHUB_REF:-${OH_INSTALL_REF:-}}"`
- [ ] The existing branch-clone guard at lines 240-246 (which currently keys on `OH_INSTALL_REF`) MUST also fire when only `OH_GITHUB_REF` is set. Concretely: after the alias resolution above, the guard checks `if [ -n "$OH_GITHUB_REF" ]` (or the equivalent) so either variable triggers the `--branch` clone form
- [ ] **Concrete back-compat test (executable):** with `git` shimmed to print its arguments, `OH_INSTALL_REF=v1.2.3 bash scripts/install.sh` produces a clone command containing `--branch v1.2.3`
- [ ] **Precedence test:** with both set, `OH_GITHUB_REF=v2.0 OH_INSTALL_REF=v1.0 bash scripts/install.sh` produces a clone with `--branch v2.0` (newer var wins). When both are set to differing values, the installer emits `warn "OH_GITHUB_REF and OH_INSTALL_REF both set with different values; OH_GITHUB_REF wins."`
- [ ] The help-text `Env vars:` block (current lines 104-107) lists both names; `OH_GITHUB_REF` is canonical in docs; `OH_INSTALL_REF` is documented as a back-compat alias
- [ ] No deprecation warning emitted in this release

### US-003: Pull path validates remote against `OH_GITHUB_REPO`

**Description:** As a user re-running the installer, I want the installer to detect when my existing clone's `origin` doesn't match the `OH_GITHUB_REPO` I just supplied so that I don't silently mix upstream + fork code in `~/.openharness`.

**Acceptance Criteria:**

- [ ] In the pull branch (current `scripts/install.sh:229-237`, gated by `[ -d "$REPO_DIR/.git" ]`), before `git pull --ff-only` at line 233, the installer reads `git -C "$REPO_DIR" remote get-url origin 2>/dev/null || true` (the `|| true` is REQUIRED because `set -e` would otherwise abort if no `origin` exists)
- [ ] **Both URLs are normalized to `owner/repo` slug form before comparison.** Acceptable input forms that MUST normalize to the same slug:
  - `https://github.com/owner/repo.git` → `owner/repo`
  - `https://github.com/owner/repo` → `owner/repo`
  - `git@github.com:owner/repo.git` → `owner/repo`
  - `git@github.com:owner/repo` → `owner/repo`
  - (case-insensitive owner/repo per GitHub URL semantics)
- [ ] Implementation: normalize via a small inline function that strips `https://github.com/` or `git@github.com:` prefix and trailing `.git`. Compare the normalized values against `OH_GITHUB_REPO`
- [ ] If `git remote get-url origin` failed or returned empty, treat that as a mismatch (existing clone is broken/incomplete — same recovery path as a true mismatch)
- [ ] On mismatch: `warn` with both URLs printed (raw, not normalized — so SSH users see their actual remote), skip the pull, print multi-line recovery guidance:
  ```
  WARN: Existing clone origin (<raw origin URL>) does not match OH_GITHUB_REPO=<value>.
  WARN: Skipping pull. To switch sources:
  WARN:   1. Back up customizations:  cp ~/.openharness/.devcontainer/.env /tmp/oh.env.bak
  WARN:   2. Remove the clone:        rm -rf ~/.openharness
  WARN:   3. Re-run with the desired OH_GITHUB_REPO and (if needed) OH_GITHUB_REF.
  WARN:   Note: rm -rf also discards any local changes and pinned OH_INSTALL_REF state.
  ```
- [ ] The installer does NOT modify the remote automatically — the user must do that explicitly
- [ ] On match: pull proceeds as today (no behavior change for upstream users — SSH-cloned upstream users included)

### US-004: Help text documents the new env vars

**Description:** As a user running `scripts/install.sh --help`, I want to see `OH_GITHUB_REPO` and `OH_GITHUB_REF` documented so that I can discover the fork-flow without reading the source.

**Acceptance Criteria:**

- [ ] `print_help` `Env vars:` block (current lines 104-107) gains two lines:
  - `OH_GITHUB_REPO       GitHub repo to clone (default: ryaneggz/open-harness)`
  - `OH_GITHUB_REF        Git ref to clone (alias: OH_INSTALL_REF)`
- [ ] The `Examples:` block (current lines 109+) gains one fork-flow example showing the raw-GitHub URL + env-var pattern, e.g.:
  ```
  OH_GITHUB_REPO=myorg/my-harness curl -fsSL \
    https://raw.githubusercontent.com/myorg/my-harness/main/scripts/install.sh | bash
  ```
- [ ] The existing curl-pipe URL in usage (current line 92) remains `https://oh.mifune.dev/install.sh`

### US-005: README adds a "For forks / self-host" block

**Description:** As a forker reading the README, I want a clear, copy-pasteable fork-install snippet adjacent to the hero install command so that I'm not tempted to copy the upstream redirect URL.

**Acceptance Criteria:**

- [ ] `README.md` line 17 (`curl -fsSL https://oh.mifune.dev/install.sh | bash`) is UNCHANGED
- [ ] **Structural insertion (not line-numbered):** a new subsection titled `📦 For forks / self-host` is inserted after the closing paragraph of the `## 📦 Install` section, before the `## 🚀 Use it` heading
- [ ] **Visual hierarchy guard:** immediately above the new fork code block, a one-line callout reads: `> **Forking this repo?** The block above pulls upstream code. Use the block below to install your fork instead.` (blockquote form so it visually separates from the surrounding prose)
- [ ] The fork block's curl-pipe and env-var literal MUST use the same placeholder owner/repo (e.g., `<your-org>/<your-fork>` in both positions) — they must not diverge in the example
- [ ] The block contains:
  - The literal forker curl-pipe (raw.githubusercontent.com of the fork + `OH_GITHUB_REPO=<your-org>/<your-fork>` env var)
  - One line: "If your fork uses a default branch other than `main`, set `OH_GITHUB_REF=<branch>` and replace `main` in the URL."
  - One trust caveat: "`curl | bash` from a branch HEAD is mutable — pin to a tag/SHA for production installs."
  - One footnote: "Forks restructuring `.devcontainer/` should also patch the local-run detection in `scripts/install.sh` (the `-f .devcontainer/docker-compose.yml` check near line 173) — update the paths to match the new layout."
- [ ] Markdown renders without errors (no broken headers, no unclosed code fences)

### US-006: `docs/installation.md` env-overrides table + Forking section

**Description:** As a user reading the long-form install docs, I want the env-overrides reference table to include the new variables so that I have a canonical, complete reference.

**Acceptance Criteria:**

- [ ] The env-overrides table in `docs/installation.md` (around line 36) gains rows for `OH_GITHUB_REPO` and `OH_GITHUB_REF`
- [ ] `OH_INSTALL_REF` row is annotated as a back-compat alias of `OH_GITHUB_REF`
- [ ] A new short subsection titled "Forking this harness" (3-4 lines) is added after the Environment Overrides section, mirroring the README block and pointing to the `scripts/install.sh:173` local-run note
- [ ] The Manual Installation block's hardcoded `git clone https://github.com/ryaneggz/open-harness.git` at `docs/installation.md:50` MUST gain a one-line comment immediately above it (or inline) noting "Forkers: substitute your fork URL here." — keeping the upstream default copy-pasteable while flagging the substitution
- [ ] **Content-anchored, not line-numbered:** the line `curl -fsSL https://oh.mifune.dev/install.sh | bash` in `docs/quickstart.md` is unchanged (verify by content match, not line number)

### US-007: `CHANGELOG.md` `[Unreleased]` records the change

**Description:** As a future release-cutter, I want the unreleased changes documented per Keep-a-Changelog so that the next `/release` promotes a complete entry.

**Acceptance Criteria:**

- [ ] `CHANGELOG.md` `## [Unreleased]` block gains:
  - `### Added` row: `OH_GITHUB_REPO` and `OH_GITHUB_REF` env vars for fork-friendly installs
  - `### Changed` row: README and `docs/installation.md` add a "For forks / self-host" section; canonical upstream `oh.mifune.dev` URL unchanged
- [ ] Entries follow existing Keep-a-Changelog format (imperative mood, one line each)
- [ ] PR link uses `(#TBD)` placeholder at commit time; immediately after `gh pr create` returns the PR number, a follow-up commit on the same branch replaces `#TBD` with the actual PR number before merge

## Functional Requirements

- **FR-1**: `scripts/install.sh` MUST honor `OH_GITHUB_REPO` env var (default `ryaneggz/open-harness`) for both fresh-clone code paths.
- **FR-2**: `scripts/install.sh` MUST validate `OH_GITHUB_REPO` against `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$` and exit non-zero on mismatch.
- **FR-3**: `scripts/install.sh` MUST emit a visible warning when `OH_GITHUB_REPO` differs from the upstream default.
- **FR-4**: `scripts/install.sh` MUST accept `OH_GITHUB_REF` as an alias for `OH_INSTALL_REF` (the latter wins if both unset; `OH_GITHUB_REF` wins if set).
- **FR-5**: `scripts/install.sh` MUST compare `git remote get-url origin` of an existing `$REPO_DIR` against `OH_GITHUB_REPO` before pulling; on mismatch, MUST skip the pull and warn.
- **FR-6**: `scripts/install.sh` help text MUST document `OH_GITHUB_REPO` and `OH_GITHUB_REF` in the `Env vars:` and `Examples:` blocks.
- **FR-7**: `README.md` MUST gain a "For forks / self-host" subsection between lines 22 and 24 without modifying line 17.
- **FR-8**: `docs/installation.md` MUST gain rows for `OH_GITHUB_REPO`/`OH_GITHUB_REF` in the env-overrides table and a "Forking this harness" subsection.
- **FR-9**: `CHANGELOG.md` `## [Unreleased]` MUST gain `### Added` and `### Changed` entries per Keep-a-Changelog.
- **FR-10**: Upstream install (`curl -fsSL https://oh.mifune.dev/install.sh | bash`) MUST be functionally identical to today — no new prompts, no new required env vars.

## Non-Goals

- Renaming `~/.openharness` directory or `SANDBOX_NAME` defaults.
- Removing `oh.mifune.dev` from README (rejected during synthesis — keep as canonical upstream entry).
- Branch-name rejection for `OH_INSTALL_REF` (a Security Reviewer extra). Pin-to-SHA / TOFU hardening is a separate PR; accepted as residual risk for this work.
- The `@ryaneggz/mifune` pack reference at `README.md:10`.
- Agent-branch URLs in `docs/agents/*.md`.
- Cloudflare redirect config (lives in a separate infra repo).
- Restructuring `.devcontainer/` (forkers that do this must patch `scripts/install.sh:173` themselves; documented).
- Deprecation warning for `OH_INSTALL_REF` (both names work indefinitely in this release).

## Design Considerations

- **No new files.** All changes land in existing files: `scripts/install.sh`, `README.md`, `docs/installation.md`, `CHANGELOG.md`.
- **No new prompts.** The installer's interactive prompts are unchanged; env-var-only surface for the new behavior.
- **`warn` and `die` are existing helpers** at `scripts/install.sh:13-14`. Reuse them — do not introduce new logging primitives.

## Technical Considerations

- The script runs under `set -euo pipefail` (line 2). New variable assignments must use `${VAR:-default}` form to coexist with `-u` (already the pattern at line 22-25, 55, 105).
- Two clone sites (lines 241 and 244) must change in lockstep. Missing one leaves a partially-parameterized path that silently clones the wrong repo depending on whether `OH_INSTALL_REF` is set.
- The `ERR` trap at line 7 already surfaces silent `set -e` exits. New `die` calls will route through it.
- The `prompt_input` pattern (lines 20-48) is not used here — `OH_GITHUB_REPO` is silently defaulted, never prompted. This is intentional: prompting forkers for their repo name in the curl-pipe flow would break the no-TTY path.
- The script's local-run detection at line 173 hardcodes `.devcontainer/docker-compose.yml`. We document this as a known forker patch point rather than parameterize it (out of scope per Non-Goals).

## Success Metrics

- A clean walkthrough of the fork flow (curl + env var) produces a clone whose `origin` is the fork's URL, verified by `git -C ~/.openharness remote get-url origin`.
- Upstream install behavior verified byte-identical via `--help` output diff and clone-URL trace.
- CI green on the PR (lint + tests + shellcheck pass).
- No regressions reported on the upstream install path in the first 7 days post-merge.

## Open Questions

- Should the upstream README also link to the new "Forking this harness" section of `docs/installation.md`? (Soft preference: yes, one-line "See docs for fork instructions" at end of the new README block; defer to implementer judgment.)
- Should `OH_GITHUB_REPO` accept full URLs (e.g., `https://github.com/myorg/my-harness.git`) in addition to the slug form? Current scope: slug-only. URLs are out of scope but easy to add later if requested.
