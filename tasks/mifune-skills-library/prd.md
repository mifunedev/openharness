# PRD: mifunedev/skills library — V0 bootstrap

## 1. Introduction

Build the minimum viable cross-agent skill library at `github.com/mifunedev/skills`. A "Mifune skill" is a portable folder (`SKILL.md` + optional `scripts/`, `references/`, `assets/`) that conforms verbatim to the [Agent Skills open standard](https://agentskills.io/specification). V0 proves the folder-based registry works end-to-end with the simplest possible install path: a `curl | bash` installer that places a skill folder under `.agents/skills/<name>/` or `.claude/skills/<name>/`.

This PRD covers **V0 only** per `.claude/specs/skill-library/06-roadmap.md`. Anything beyond V0 (npm package, Docker image, plugin marketplace JSON, static site, signing) is explicitly out of scope and listed in § Non-Goals.

The V0 work lives in `.worktrees/project/mifunedev/skills/` inside this harness branch — a working-tree copy of what will eventually be pushed to the `mifunedev/skills` GitHub repo. Pushing to the external repo is a manual one-time step after this PR merges (out of scope).

## 2. Goals

- Produce the on-disk skeleton of `mifunedev/skills` matching `01-architecture.md` § *Target repo layout*.
- Author three seed skills that pass upstream `skills-ref validate` AND this harness's `/skill-lint` (CURRENT).
- Author a hand-written `registry.json` describing the three seed skills.
- Author a Bash-only `scripts/install.sh` that performs `cp + version pin + lock entry` for one skill at a time.
- Document the "add a fourth skill" workflow in the repo README such that a contributor can do it in <10 minutes.
- Ship CI that validates every skill on PR (`skills-ref validate`).

## 3. User Stories

### US-001: Scaffold repo skeleton at `.worktrees/project/mifunedev/skills/`

**Description:** As an installer-author, I want the repo layout from `01-architecture.md` to exist on disk so subsequent stories can drop files into known locations.

**Acceptance Criteria:**

- [ ] Directory `.worktrees/project/mifunedev/skills/` exists with subdirectories: `skills/`, `scripts/`, `template/`, `docs/`, `.github/ISSUE_TEMPLATE/`, `.github/workflows/`
- [ ] Top-level `LICENSE` file contains Apache-2.0 text
- [ ] Top-level `CHANGELOG.md` exists with an empty `## [Unreleased]` header (Keep a Changelog format)
- [ ] Top-level `.gitignore` excludes `node_modules/`, `dist/`, `.DS_Store`, and any build artifacts
- [ ] Top-level `.github/PULL_REQUEST_TEMPLATE.md` exists with sections: Summary, Skill changes, Testing
- [ ] Top-level `.github/ISSUE_TEMPLATE/new-skill.md` and `.github/ISSUE_TEMPLATE/bug.md` exist (templates may be minimal)
- [ ] All paths are case-sensitive matches for `01-architecture.md` § *Target repo layout*

### US-002: Hand-write `registry.json` v1 (V0 seed)

**Description:** As a CLI implementer (future V1), I want `registry.json` to describe the three seed skills so the eventual generator has a reference to match.

**Override note**: `01-architecture.md` § *Generation rules* states `registry.json` is generated, not hand-edited. For V0 the file is **hand-written as a seed**; the `scripts/publish-registry.sh` generator AND the CI drift-parity check are explicitly deferred to V1. This deviation is recorded in § Non-Goals and at the top of `registry.json` itself.

**Acceptance Criteria:**

- [ ] File `.worktrees/project/mifunedev/skills/registry.json` exists
- [ ] First key in the file is a `_v0_note` string explaining the hand-written status and pointing at the V1 generator deferral
- [ ] Top-level fields present: `$schema` (commit-relative path: `./docs/schema/registry.v1.json` — V0 ships the schema in-repo; the `skills.mifune.dev` URL waits for V1), `name` (`mifunedev-skills`), `description`, `version` (CalVer matching today's date), `owner.name`, `owner.url`
- [ ] `skills` array has exactly 3 entries: `open-harness-review`, `docker-sandbox-debug`, `github-prd`
- [ ] Each skill entry has all fields from `01-architecture.md` § *registry.json format*: `name`, `path`, `version`, `checksum` (sha256 of folder, algorithm below), `description`, `category`, `requires-tools`, `clients`, `license`, `added`, `updated`
- [ ] `node -e "JSON.parse(require('fs').readFileSync('registry.json'))"` exits 0
- [ ] `docs/checksum.md` exists and documents the exact algorithm: `find skills/<name> -type f -not -path '*/.*' | LC_ALL=C sort | xargs sha256sum | sha256sum | cut -d' ' -f1`. This is the contract the V1 generator MUST honor.
- [ ] `docs/schema/registry.v1.json` exists as a placeholder JSON Schema file (V0 may ship a minimal schema or a `TODO` schema); marked V0-seed in a top-of-file comment

### US-002b: Scaffold `.claude-plugin/` placeholder directory

**Description:** As V1 implementer, I want the `.claude-plugin/` directory present from V0 so the V1 generator has a known location to write `marketplace.json` without disrupting layout.

**Acceptance Criteria:**

- [ ] Directory `.worktrees/project/mifunedev/skills/.claude-plugin/` exists
- [ ] Contains a `README.md` (per `context/rules/directory-readme.md`) explaining the directory is reserved for V1's `marketplace.json` and is intentionally empty in V0
- [ ] No `marketplace.json` file is written in V0

### US-003: Author seed skill `open-harness-review`

**Description:** As an Open Harness user, I want a portable version of `harness-audit` so I can run the same pre-merge review from any Agent-Skills-compliant client.

**Acceptance Criteria:**

- [ ] Folder `.worktrees/project/mifunedev/skills/skills/open-harness-review/` exists with `SKILL.md`
- [ ] `SKILL.md` frontmatter has all required fields per `01-architecture.md` § *Frontmatter rules*: `name`, `description` (≤ 1024 chars, includes both what + when), `license` (`Apache-2.0`), `metadata.mifune.version` (`0.1.0`), `metadata.mifune.category` (`open-harness`), `metadata.mifune.requires-tools` (array)
- [ ] Body is ≤ 500 lines (progressive disclosure)
- [ ] No Claude-Code-specific keys at top level; any client-specific extensions are nested under `metadata.mifune.claude-code.*`
- [ ] No `$CLAUDE_SKILL_DIR` references — use relative paths only
- [ ] Source content adapted from this harness's `.claude/skills/harness-audit/SKILL.md` with attribution comment at the top of the body
- [ ] Scores CURRENT under this harness's `/skill-lint` (run the skill-lint skill against the folder)

### US-004: Author seed skill `docker-sandbox-debug`

**Description:** As a sandbox operator, I want a portable skill for diagnosing common Docker sandbox failures so any agent can guide me through them.

**Acceptance Criteria:**

- [ ] Folder `.worktrees/project/mifunedev/skills/skills/docker-sandbox-debug/` exists with `SKILL.md`
- [ ] Frontmatter conforms to the same rules as US-003 with `category: dev-workflow`, `requires-tools: ["docker"]`
- [ ] Body covers at minimum: container not starting, port collisions, volume mount issues, tmux session lookup, log retrieval via `docker logs` / `tmux capture-pane`
- [ ] No platform-locked instructions (works on Linux + macOS; Windows callout if relevant)
- [ ] No Claude-Code-specific top-level frontmatter keys
- [ ] Scores CURRENT under `/skill-lint`

### US-005: Author seed skill `github-prd`

**Description:** As any AI agent user, I want a portable version of the `/prd` skill so I can generate PRDs from outside Claude Code.

**Acceptance Criteria:**

- [ ] Folder `.worktrees/project/mifunedev/skills/skills/github-prd/` exists with `SKILL.md`
- [ ] Frontmatter conforms to the rules with `category: dev-workflow`, `requires-tools: ["gh"]`
- [ ] Body adapted from this harness's `.claude/skills/prd/SKILL.md` with attribution; sections preserved: clarifying questions, PRD structure, output rules
- [ ] All Claude-Code-specific argument-hint / paths / hook references are either removed or moved to `metadata.mifune.claude-code.*`
- [ ] No `$CLAUDE_SKILL_DIR` references
- [ ] Scores CURRENT under `/skill-lint`

### US-006: Author `scripts/install.sh`

**Description:** As a no-Node, no-Docker user, I want a Bash one-liner that pulls a skill from the registry to my project, so I can adopt the library without any toolchain.

**Acceptance Criteria:**

- [ ] File `.worktrees/project/mifunedev/skills/scripts/install.sh` exists and is `chmod +x`
- [ ] First line is `#!/usr/bin/env bash` and second line is `set -euo pipefail`
- [ ] Accepts CLI: `install.sh install <skill-name> [--scope project|user] [--client agents|claude|harness]`
- [ ] Default scope is `project`; default client is `agents` (writes to `.agents/skills/<name>/`)
- [ ] `--client claude` writes to `.claude/skills/<name>/`; `--client harness` writes to BOTH paths "atomically" using the documented sequence: (1) copy to staging dirs `<dest>/.mifune-staging-<pid>/` under each target; (2) `mv` each staging dir into final position; (3) on any failure in steps 1–2, `rm -rf` all staging dirs AND any already-moved final dir, then exit non-zero. Each `mv` is per-filesystem atomic; cross-filesystem invocations are explicitly unsupported in V0 and error out with `ERR: install path on different filesystem from working tree`
- [ ] **Open-harness safeguard**: before writing to `.claude/skills/` (i.e., when `--client` is `claude` or `harness`), the installer MUST detect "this looks like the open-harness repo" by checking for the presence of BOTH `.claude/protected-paths.txt` AND `context/SOUL.md` at cwd or any walk-up parent. If detected, abort with: `ERR: refusing to write into the open-harness skill namespace; this looks like the harness repo. Run from a different project root.` Exit code 3.
- [ ] Resolves the working tree root by walking up from cwd looking for `.git`. If no `.git` is found and `--scope project`, exit non-zero with `ERR: --scope project requires a git working tree (none found by walk-up from cwd)`. Exit code 4.
- [ ] Clones the repo to a temp dir via `git clone --depth 1 --branch main`. **Immediately after clone**, captures `commit_sha=$(git -C "<clone>" rev-parse HEAD)` and uses that SHA in the lock file's `commit` field. The branch ref is used for fetch convenience; the lock pins the SHA. This is the V0 mitigation for P6 (Determinism over discovery); upgrading to tag-based fetch is V1 work.
- [ ] Copies only the requested `skills/<name>/` folder; verifies `SKILL.md` exists before declaring success
- [ ] Writes a lock entry to `.mifune/skills.lock` per `02-install-system.md` § *Lock file* schema (project-scoped lock at the git-root resolved above). The lock's `commit` field MUST be the SHA captured above, not a branch name.
- [ ] Re-running the same command is idempotent: prints `already installed at <path> (commit <sha>)` and exits 0 without overwriting. Idempotency is keyed on (skill-name, scope, client, commit-sha) matching what is recorded in the lock file.
- [ ] On failure (network, missing skill, write permission, harness-safeguard, no-git-root) exits non-zero with a single-line error to stderr; leaves no partial files (verified by the rollback sequence above)
- [ ] Has a `--help` flag that prints synopsis and exits 0
- [ ] Symlink mode and `--scope user|system` are not supported in V0; passing them errors out with `ERR: <feature> deferred to V1`. Exit code 5.
- [ ] Lints clean under `shellcheck -x scripts/install.sh`
- [ ] Negative-test AC: a script `scripts/test-install.sh` exists that exercises the four error paths (harness-safeguard, no-git-root, cross-filesystem, symlink/user-scope) and the happy path; exits 0 only when all six produce the documented exit codes

### US-007: Author `scripts/validate.sh`

**Description:** As a CI maintainer, I want a single script that runs all skill validations so CI is a one-liner.

**Acceptance Criteria:**

- [ ] File `.worktrees/project/mifunedev/skills/scripts/validate.sh` exists, `chmod +x`, `set -euo pipefail`
- [ ] Iterates every `skills/*/SKILL.md` and runs `skills-ref validate` against each (skills-ref invocation pinned per US-009)
- [ ] Verifies `registry.json` parses as JSON and lists every skill folder under `skills/`
- [ ] **Checksum integrity check**: for every entry in `registry.json[].skills`, recomputes the folder checksum using the algorithm in `docs/checksum.md` and compares against the registry's recorded value. Exits non-zero on drift with `ERR: checksum drift in skills/<name>/: registry says <X>, computed <Y>. Run scripts/refresh-checksums.sh (V0 manual procedure documented in docs/checksum.md).`
- [ ] Verifies no skill body exceeds 500 lines
- [ ] Verifies no `SKILL.md` references `$CLAUDE_SKILL_DIR`
- [ ] Verifies no Claude-Code-specific frontmatter keys at top level (deny-list: `disable-model-invocation`, `user-invocable`, `paths`, `context`, `agent`, `argument-hint`, `arguments`, `hooks`). This is stricter than the upstream spec (which says "allowed but discouraged"). The deny-list reflects Mifune's portability requirement; document this stricter rule in `docs/portability.md` and at the top of `validate.sh`.
- [ ] Exits non-zero with a clear summary listing every offending skill and rule
- [ ] Lints clean under `shellcheck -x scripts/validate.sh`
- [ ] **Helper**: `scripts/refresh-checksums.sh` exists, recomputes all checksums in-place in `registry.json`, and is the V0 manual workflow for "skill file changed". Documented in `docs/checksum.md`.

### US-008: Author repo `README.md`

**Description:** As a new contributor or first-time user, I want a README that explains what the library is, how to install a skill, and how to add a new skill in <10 minutes.

**Acceptance Criteria:**

- [ ] File `.worktrees/project/mifunedev/skills/README.md` exists
- [ ] Sections present: One-line intent, Install (curl one-liner with the exact command), Skill catalog (table of the 3 V0 skills with descriptions), Add a skill (numbered ≤10-step procedure), Layout (link to `.claude/specs/skill-library/01-architecture.md` in the open-harness repo for canonical layout), License (Apache-2.0)
- [ ] Install one-liner uses the exact pattern from roadmap: `curl -fsSL https://raw.githubusercontent.com/mifunedev/skills/main/scripts/install.sh | bash -s -- install <skill-name> --scope project`
- [ ] "Add a skill" steps are numbered and each ≤1 sentence; a person following them top-to-bottom can produce a passing skill folder + registry.json entry without consulting any other doc
- [ ] No box-drawing tree (per `context/rules/directory-readme.md`)
- [ ] Time-to-add target stated explicitly: "Adding a new skill should take <10 minutes"

### US-009: Author CI workflow `.github/workflows/ci.yml`

**Description:** As a maintainer, I want every PR validated automatically so we never merge a broken skill.

**Acceptance Criteria:**

- [ ] File `.worktrees/project/mifunedev/skills/.github/workflows/ci.yml` exists
- [ ] Triggers on `pull_request` and `push` to `main`
- [ ] Runs on `ubuntu-latest`
- [ ] Steps in order: checkout, install `skills-ref` (via npm or curl per upstream docs), install `shellcheck`, run `scripts/validate.sh`, run `shellcheck -x scripts/*.sh`
- [ ] Workflow is < 60 lines and uses pinned action versions (no `@main` or `@master`)
- [ ] Passes `actionlint` clean (if available; otherwise YAML lint clean)

### US-010: V0 acceptance verification

**Description:** As the release captain, I want every V0 acceptance gate from `06-roadmap.md` § V0 verified locally so we can declare V0 done before the harness PR merges.

**Pre-flight (US-000-style spike, must complete before any verification AC below)**:

- [ ] **Resolve Q3** (skill-lint against external folders): determine the exact invocation that runs this harness's `/skill-lint` against a skill folder at an arbitrary path. Document the recipe in `tasks/mifune-skills-library/verification.md` § "skill-lint recipe" BEFORE running US-003/US-004/US-005's "Scores CURRENT" AC.
- [ ] **Resolve Q2** (skills-ref install command + pinned version): determine the exact `skills-ref` install command and pin its version. Record the chosen invocation in `verification.md` § "skills-ref invocation" and use it consistently in US-007 and US-009.

**Verification ACs**:

- [ ] Create a fresh temp dir: `tmp=$(mktemp -d)` ; `cd "$tmp"` ; `git init -q`. Verify the dir is empty save for `.git`.
- [ ] Simulate the curl install from that temp dir: `bash <path-to-worktree>/scripts/install.sh install open-harness-review --scope project --client agents`. Verify `.agents/skills/open-harness-review/SKILL.md` is written, `.mifune/skills.lock` exists with a `commit` field set to a 40-char SHA (not a branch name), and the script exits 0.
- [ ] Re-run the exact same command from the same `$tmp`. Verify it prints `already installed at .agents/skills/open-harness-review (commit <sha>)` and exits 0 with no file changes (compare `find` output before/after).
- [ ] **Open-harness safeguard test**: from `/home/sandbox/harness` (the actual harness root), run `bash .worktrees/project/mifunedev/skills/scripts/install.sh install open-harness-review --client harness`. Verify it exits with code 3 and the documented `ERR: refusing to write into the open-harness skill namespace` message AND `.claude/skills/open-harness-review/` does NOT exist after the failed run.
- [ ] **No-git-root test**: `tmp2=$(mktemp -d)` ; `cd "$tmp2"` (no `git init`); run `install.sh install open-harness-review --scope project`. Verify exits with code 4.
- [ ] Run `scripts/validate.sh`; verify exits 0 with all three skills reported PASS and checksum integrity green.
- [ ] Run `/skill-lint` against each of the three seed skill folders using the recipe documented in pre-flight; verify all three score CURRENT (record exact invocation + result in `verification.md`).
- [ ] **Source-skill integrity check**: run `git diff --exit-code .claude/skills/harness-audit/ .claude/skills/prd/` from the harness root. Verify exits 0 (the originals are byte-unchanged). Record output in `verification.md`.
- [ ] Time the "add a skill" procedure from US-008 using a fresh test skill (`hello-world`); verify <10 minutes wall clock (record start + end timestamps in `verification.md`). After timing, remove the test skill folder and revert the registry edit before final commit.
- [ ] Write `tasks/mifune-skills-library/verification.md` with one section per gate, each containing the command run and observed output

## 4. Functional Requirements

- **FR-1**: All V0 work lives in `.worktrees/project/mifunedev/skills/` on the harness branch. Pushing to the external `mifunedev/skills` GitHub org is out of scope.
- **FR-2**: Every skill folder MUST conform verbatim to the Agent Skills spec. Mifune-specific fields go under `metadata.mifune.*`.
- **FR-3**: The bash installer MUST be the only V0 install path. No npm, no Docker, no plugin marketplace JSON.
- **FR-4**: `registry.json` is hand-written for V0. No generator script.
- **FR-5**: Every shell script MUST `set -euo pipefail` and pass `shellcheck -x`.
- **FR-6**: Every `SKILL.md` MUST score CURRENT under this harness's `/skill-lint`.
- **FR-7**: Every `SKILL.md` MUST pass upstream `skills-ref validate`.
- **FR-8**: The repo MUST work without any client-side runtime (no daemon, no MCP server, no background process).
- **FR-9**: The installer MUST default to copy semantics; symlink mode is opt-in (deferred to V1 — flag exists but errors out in V0 with a "not yet supported" message).
- **FR-10**: All file writes by the installer MUST be atomic per path; partial failures roll back.

## 5. Non-Goals (Out of Scope for V0)

- **npm package** (`@mifune/skills-cli`) — V1
- **Docker image** (`ghcr.io/mifunedev/skills`) — V1
- **`.claude-plugin/marketplace.json` content** — V1 (the directory is scaffolded by US-002b with a placeholder README)
- **`scripts/publish-registry.sh` generator + CI drift-parity check** — V1. V0's `registry.json` is hand-written as a documented seed; the V1 generator must consume `docs/checksum.md` to compute identical hashes.
- **`skills.mifune.dev` static site + the public `$schema` URL** — V1. V0 ships the schema in-repo at `docs/schema/registry.v1.json` with a relative `$schema` reference.
- **TypeScript CLI** (`packages/cli/`) — V1
- **Tag-based version pinning** (`git clone --branch <tag>`) — V1. V0 clones the `main` branch and records the commit SHA at install time in the lock file (Determinism principle P6 mitigated post-fetch).
- **Sigstore signing / tag immutability** — V2
- **`oh skills` wrapper** — V2
- **Federated registries** — V3
- **Pushing to the actual `mifunedev/skills` GitHub org** — manual, out of this PR's scope
- **Adding new skills beyond the 3 seeds** — community contributions begin V1+
- **Touching anything on `.claude/protected-paths.txt`** — explicitly forbidden. The seed skills `open-harness-review` and `github-prd` are *adaptations* of `harness-audit` and `prd` respectively, NOT deletions or replacements; the originals remain untouched in `.claude/skills/`. Source-skill byte-identical verification is in US-010.
- **Symlink install mode** — flag deferred; V0 errors out with documented exit code
- **`user` and `system` scope** — V0 supports `project` scope only; other scopes deferred to V1 (installer errors out with documented exit code)
- **Cross-filesystem atomic writes** — V0 errors out cleanly when temp dir and target are on different filesystems

## 6. Design Considerations

- The seed skills `open-harness-review` and `github-prd` are *adaptations* of `harness-audit` and `prd` from `.claude/skills/`. Originals stay in place; adaptations add the `metadata.mifune.*` block and remove Claude-Code-specific frontmatter keys.
- Lock file schema follows `02-install-system.md` § *Lock file* exactly. Do not invent fields.
- Bash installer must work on macOS and Linux (no `apt`, no `brew`, no platform-specific tools). Test in a `bash:5-alpine` container if possible.
- README "Add a skill" procedure should be a tight numbered list — not a tutorial. Link to canonical spec docs for everything else.

## 7. Technical Considerations

- **Worktree placement**: Use `.worktrees/project/mifunedev/skills/` per `.worktrees/README.md` convention for independent project clones. This is a *working copy* on the harness branch — it does not have its own `.git` initialized in this PR.
- **Skill source attribution**: When adapting from `.claude/skills/`, add a one-line comment at the top of the SKILL body (not frontmatter): `<!-- Adapted from ryaneggz/open-harness:.claude/skills/<name>/SKILL.md -->`. Do NOT modify the source skills in this harness.
- **Checksum computation**: Use `find skills/<name> -type f | sort | xargs sha256sum | sha256sum | cut -d' ' -f1` or equivalent stable hash. Document the algorithm in `01-architecture.md`-adjacent location.
- **CI cost**: V0 CI must run in <60s on a free GitHub Actions runner. No matrix builds.

## 8. Success Metrics

- All ten user stories' acceptance criteria check green in `verification.md`
- All five V0 acceptance gates from `.claude/specs/skill-library/06-roadmap.md` § V0 check green
- `/skill-lint` reports CURRENT for all three seed skills
- A naive contributor following README's "Add a skill" procedure produces a passing skill folder in <10 minutes
- Zero high-severity findings on the next critic review of this PRD's implementation

## 9. Open Questions

- **Q1**: Should `install.sh` cache the `git clone` between invocations (e.g., in `/tmp/mifune-skills-cache/`) or always fetch fresh? V0 says fresh; V1 may revisit for offline support.
- **Q2** *(now blocking pre-flight)*: The `skills-ref validate` CLI's install command + version pin must be resolved BEFORE US-007/US-009 ship. Gated by US-010's pre-flight AC.
- **Q3** *(now blocking pre-flight)*: How is this harness's `/skill-lint` invoked against external skill folders? Gated by US-010's pre-flight AC; the recipe MUST be documented in `verification.md` before US-003/US-004/US-005 can report CURRENT.

## 10. Critique synthesis (added post-/ship-spec stage 4)

Two critics (implementer + user lens) reviewed this PRD. Their raw output lives at `tasks/mifune-skills-library/critique.md`. Initial pass surfaced 6 H-severity findings, all of which have been mitigated by AC-level edits to US-002, US-002b, US-006, US-007, US-010 and additions to § Non-Goals. The mitigations are:

| Finding | Mitigation |
|---|---|
| `registry.json` hand-written contradicts spec "generated" rule | US-002 documents the V0 deviation; generator + drift-parity check deferred to V1 in Non-Goals |
| Q3 (`/skill-lint` external folder) unresolved blocker | US-010 elevates Q3 to blocking pre-flight; recipe must land in `verification.md` first |
| `install.sh` could write into harness's own `.claude/skills/` | US-006 adds open-harness-safeguard with documented exit code 3 |
| US-010 cwd ambiguity (verifiability gap) | US-010 specifies `mktemp -d` + `git init` + cwd for every install simulation |
| Branch-ref clone violates P6 (commit SHA pinning) | US-006 captures `git rev-parse HEAD` after clone and writes the SHA to the lock file |
| `validate.sh` missing registry-vs-folder checksum check | US-007 adds checksum integrity AC + `refresh-checksums.sh` helper |

Medium and low findings (lock file cwd resolution, rollback mechanism specification, README curl-bash UX, `.claude-plugin/` directory presence, `$schema` URL, skills-ref version pin, source-skill protection AC, README internal-link to harness spec) are also addressed in the same AC edits. Items deemed out-of-scope for V0 are recorded in § Non-Goals.

**Recommendation**: PROCEED.
