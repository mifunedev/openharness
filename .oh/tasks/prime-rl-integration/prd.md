# PRD — Prime Intellect `prime-rl` Integration

**Issue:** #623 — *Spec: Prime Intellect `prime-rl` integration*
**Branch:** `feat/623-prime-rl-integration`
**Target repo:** `mifunedev/openharness`, base `development`

---

## 1. Introduction / Overview

Open Harness already ships two precedents for optional, image-level agent/RL
tooling: the **DeepAgents CLI** (`ARG INSTALL_DEEPAGENTS`, a build-only `uv tool
install`) and **Hermes** (`ARG INSTALL_HERMES`, a venv-based install +
runtime). [Prime Intellect](https://docs.primeintellect.ai)'s `prime` CLI adds
a third kind of capability: a **local-authoring, cloud-executing RL training
workflow** — `prime lab setup` scaffolds a workspace, an AI coding agent
authors a `verifiers`-based (`StatefulToolEnv` pattern) training environment
from `prompt.md`, `prime env init` / `prime eval run` / `prime eval tui` /
`prime gepa run` validate it locally or against hosted baselines, and `prime
train run configs/rl/<config>.toml` submits the actual RL training job to
Prime Intellect's hosted cloud (LoRA adapters deploy one-click from
[app.primeintellect.ai](https://app.primeintellect.ai)).

This PRD scopes **wiring the `prime` CLI into the harness as an opt-in,
manual-invoke capability** — install, skill, docs, wiki entry, eval coverage —
**not** any actual hosted training run. Two properties of the upstream tool
make this a security-sensitive integration rather than a routine CLI add:

1. **Its config surfaces don't match the harness's existing secret-guard
   naming assumption.** `secrets.env` and `configs/endpoints.toml` are *not*
   dot-prefixed, so they slip past **all three** existing guard layers by
   construction: `.gitignore`'s `**/.env*` pattern, `.oh/hooks/deny-secret-paths.sh`'s
   Read/Write/Edit path guard (mirrored in `.claude/settings.json`), and
   `.oh/hooks/deny-env-dump.sh`'s Bash-command guard alike — every one of
   them is anchored on a leading dot these filenames lack. This PRD closes
   the gap in the same change that introduces the integration, not after,
   and does so for the two **confirmed** surfaces only (§ 5 scopes W&B out
   pending a confirmed filename).
2. **`prime eval run` / `prime train run` execute LLM-authored code** (the
   `verifiers` environment an AI coding agent wrote from `prompt.md`) against
   **real cloud credits**. This is arbitrary-code-execution-adjacent and
   real-money-adjacent — it must never run from an unattended context (cron,
   autopilot, delegate fan-out).

Everything this PRD builds is **wiring**: an opt-in Dockerfile build-arg, a
manual-invoke skill documenting the lifecycle with `prime train run` marked
STOP-for-human, an integration doc, a wiki entry, and a wiring-only eval
probe. No hosted training is run or automated by this work.

## 2. Goals

Measurable outcomes that define "the integration is correctly wired":

- **G1 — Opt-in installability.** `INSTALL_PRIME_RL=true` builds resolve
  `prime --version` on `PATH` inside the image; a default build
  (`INSTALL_PRIME_RL` unset/`false`) has no `prime` on `PATH` and is otherwise
  byte-identical in behavior to today's default build.
- **G2 — Documented manual-invoke skill.** `/prime-rl` (`disable-model-invocation:
  true`, mirroring `/rlm`) documents the full local lifecycle (`prime lab
  setup` → env authoring via `verifiers`/`StatefulToolEnv` → `prime env init`
  → `prime eval run`/`tui`/`gepa run` → LoRA-adapter deployment) and
  explicitly marks `prime train run` **STOP-for-human** — never invoked from
  cron, autopilot, or an unattended `/delegate` fan-out.
- **G3 — Secret-guard coverage closes the confirmed gap, three layers deep.**
  For the two **confirmed** config-surface filenames, `secrets.env` and
  `configs/endpoints.toml`: they are (a) git-ignored with depth-agnostic
  globs, (b) denied by `.oh/hooks/deny-secret-paths.sh` + its
  `.claude/settings.json` mirror (the Read/Write/Edit path guard), and (c)
  denied by `.oh/hooks/deny-env-dump.sh`'s `SECRET_PATH` (the Bash-command
  guard) — three layers, not two, verified by direct grep and
  `git check-ignore` against both root-relative **and nested** paths, not by
  inspection alone. W&B config guarding is explicitly out of scope (§ 5)
  pending a confirmed filename.
- **G4 — Wiki entry lands schema-valid, no broken links.** `.oh/skills/wiki/corpus/prime-rl-training.md`
  passes `/wiki lint --dry-run` with **no broken-link findings** and the
  `wiki-readme-index.sh` probe, is whitelisted into git via `git add -f`, and
  carries a reciprocal inbound `[[prime-rl-training]]` link from
  `recursive-language-models.md`.
- **G5 — Wiring-only eval coverage, zero network.** A new eval probe asserts
  skill/doc/wiki existence + Dockerfile/compose ARG wiring + **all three**
  secret-guard layers' wiring, with **no** `prime` invocation and **no**
  network egress; `/eval` shows no green→red regression.
- **G6 — Local validation runbook, isolated build, credential-gated steps
  explicit and redacted.** A real `prime lab setup` → `prime env init`
  walkthrough runs against an isolated `SANDBOX_NAME` and is recorded
  verbatim after a mandatory redaction pass; `prime eval run`/`prime train
  run` steps are marked **BLOCKED — pending human-supplied credentials**
  (distinct from any early network/login BLOCKED failure), never silently
  skipped or faked.

## 3. Architecture Decision Record (ADRs)

### ADR-1 — Install mechanism: opt-in build-arg, `uv tool`, DeepAgents pattern

**Decision:** Add `ARG INSTALL_PRIME_RL=false` to `.devcontainer/Dockerfile`
immediately after the existing DeepAgents block (lines 69–79), using the same
**build-only `uv tool install`** pattern (`UV_TOOL_DIR=/opt/uv/tools
UV_TOOL_BIN_DIR=/usr/local/bin`) — **not** the Hermes venv pattern.

**Rationale:** `prime` is a `uv`-installable Python CLI with no
Slack/Teams-style runtime extras, so it matches DeepAgents' shape exactly:
image-build-time install, no runtime config beyond env vars. Reusing the
build-only `uv tool` path keeps root-owned image paths out of the sandbox
user's runtime environment, same as DeepAgents. **Unpinned version, by
precedent:** `uv tool install prime` installs whatever version is latest at
build time — unpinned, exactly like the existing DeepAgents and Hermes
installs (neither pins a version either). This PRD does not introduce a new
inconsistency; a follow-up issue to add version pinning across all three
opt-in CLIs is a reasonable post-merge item, not a blocker here.

**Rejected:** the Hermes pattern (venv + runtime install-hook + dashboard).
Unwarranted complexity — `prime` needs none of the runtime surface Hermes
does.

### ADR-2 — Skill invocation model: manual-invoke, mirrors `/rlm`

**Decision:** `.oh/skills/prime-rl/SKILL.md` ships with `disable-model-invocation:
true`, `allowed-tools: Bash`, an `argument-hint`, and a `RESULT:` tag
convention — the same shape as `.oh/skills/rlm/SKILL.md`.

**Rationale:** Both skills spawn real work (agent recursion / hosted training
jobs) that costs tokens or credits — neither should auto-trigger from
conversational language. Manual-invoke costs nothing until explicitly called,
consistent with the harness's existing precedent.

**Rejected:** model-invocable (auto-trigger on phrases like "train a model").
Too easy to accidentally burn cloud credits or trip the never-unattended
guardrail (ADR-5).

### ADR-3 — Skill vs. wiki split: how-to-behave vs. what-is-true

**Decision:** `.oh/skills/prime-rl/SKILL.md` + `references/lifecycle.md` hold
**prescriptive procedure** (how to run the lifecycle, what never to do
unattended). `.oh/skills/wiki/corpus/prime-rl-training.md` holds **descriptive
fact + synthesis** (what Prime Intellect's platform is, how the pieces relate)
per `.oh/skills/wiki/references/schema.md` § 1's boundary table.

**Rationale:** This is the harness's standing convention (`.claude/skills/*/SKILL.md`
= *how to do*; wiki = *what is true*) — reusing it here avoids inventing a
third home for platform facts.

**Rejected:** folding platform facts into the skill body. Would duplicate
content across the skill (read every invocation) and the wiki (read on
demand), and violate the wiki's "facts belong in the wiki" boundary.

### ADR-4 — Secret-guard hardening for non-dot-prefixed config surfaces: THREE layers, IN SCOPE, same change

**Decision:** In the **same PR** that introduces `prime-rl`, extend all
**three** independent guard layers for the two confirmed filenames,
`secrets.env` and `configs/endpoints.toml`:

1. **`.gitignore`** — add **glob-anchored, depth-agnostic** entries:
   `**/secrets.env` and `**/configs/endpoints.toml`. A bare mid-slash literal
   (`configs/endpoints.toml` with no `**/` prefix) is anchored to the
   directory level of the `.gitignore` file per git's own semantics — it would
   match only at the repo root, defeating the "scaffold lands somewhere
   in-tree despite ADR-6" defense this ADR exists for.
2. **`.oh/hooks/deny-secret-paths.sh`** (the Read/Write/Edit path guard) —
   add `(^|/)secrets\.env$` and `(^|/)configs/endpoints\.toml$` to
   `DENY_PATH`, matching the file's existing anchored-term style.
   **`.claude/settings.json`**'s `permissions.deny` gets the mirrored
   `Read(file_path=**/secrets.env)` and
   `Read(file_path=**/configs/endpoints.toml)` entries in the same change —
   the hook's own header comment states it mirrors this file, so both move
   together.
3. **`.oh/hooks/deny-env-dump.sh`** (the Bash-**command** guard) — add
   `configs/endpoints\.toml` and an explicit `(^|/)secrets\.env\b` term to
   `SECRET_PATH`. **Not** the `$`-anchored form used in layer 2: this hook
   matches against the **entire raw Bash command string** (newlines collapsed
   to spaces), so a `$` anchor only fires when the filename is the literal
   end of the whole command and silently misses `cat foo/secrets.env | grep
   TOKEN`, `cat foo/secrets.env; echo done`, and similar common shapes. Use
   the word-boundary form, matching the hook's existing `\.pem\b` /
   `\.aws/credentials\b` convention. This layer is currently **absent** for
   `prime-rl`'s surfaces entirely: there is no `.toml` term at all today, and
   `secrets.env` is only caught **by accident** (the existing `\.env`
   fragment matches it as a substring, with no guarantee that accident holds
   for every command shape).

**Rationale:** `.gitignore`'s `**/.env*` and the path-guard's
`(^|/)\.env([^/]*)?$` both require a **dot-prefixed** filename; the
command-guard's `SECRET_PATH` has no `.toml` coverage and only an accidental
substring match for `.env`-suffixed names. `secrets.env` and
`configs/endpoints.toml` are readable, committable, and catable by default
today. Since this PRD is what introduces the first concrete file names the
harness knows about, it is the right place to close all three gaps at once —
partial coverage (e.g. blocking `Read` but not `Bash cat`) is not real
coverage.

**Rejected:** deferring the guard update to a follow-up, or covering only the
path-guard layer. A HIGH-severity gap introduced and left open — or only
two-thirds closed — in the same change it's discovered is not acceptable; all
three mitigations ship atomically with the integration.

### ADR-5 — Never-unattended guardrail for `prime train run` (and hosted `eval run`)

**Decision:** The skill procedure states, in prose, that `prime train run
configs/rl/<config>.toml` (and any `prime eval run` / `prime eval tui` /
`prime gepa run` invocation that would consume paid Prime Intellect credits)
**MUST only be invoked from an interactive, human-present turn** — never from
`.oh/crons/`, `/autopilot`, or an unattended `/delegate` fan-out worker,
regardless of any confirmation flag the CLI itself might expose.

**Rationale:** `prime train run` executes LLM-authored `verifiers` code
against real hosted infrastructure and real credits. This is exactly the
class of action the harness's `Bash` deny-hooks already treat as
higher-consequence (irreversible-action confirmations) — the guardrail here
is procedural (skill text) rather than mechanical (no hook can distinguish
"cron" from "human" reliably), so it is documented as a hard operator rule,
not a soft suggestion.

**Rejected:** a runtime hook that tries to detect "unattended" context and
block `prime train run` automatically. No reliable signal distinguishes an
autopilot-driven Bash call from a human-driven one at the hook layer today;
a false sense of mechanical safety is worse than an explicit, loud procedural
rule.

### ADR-6 — `prime lab setup` scaffolds land OUTSIDE the tracked repo tree, at a pinned default location

**Decision:** The canonical default scaffold location is **`$HOME/prime-labs/<name>`**
(i.e. `/home/sandbox/prime-labs/<name>` inside the sandbox) — pinned now, not
left as an open question. The skill and doc both mandate that `prime lab
setup <name>` runs against a workspace at this location: **outside**
`/home/sandbox/harness`, never at the harness root, never inside any path
`git status` from the harness root would report as untracked/new.

**Rationale:** `prime lab setup` scaffolds a **foreign** Python
project + `AGENTS.md` + starter Agent Skills. An `AGENTS.md` inside the
tracked repo tree collides with this repo's own scope-resolution rules
(`AGENTS.md § Scope and local instructions`); a scaffolded Python project at
harness root is also "application code at root," which the orchestrator does
not own. Pinning one canonical location now (rather than leaving it an open
question) means US-003/US-004 (skill + reference) and US-008 (runbook,
executed in a separate, memory-less ralph iteration) name the *same* path
without re-deriving it.

**Persistence / drift-risk note:** `$HOME/prime-labs/` is **not** one of the
named Docker volumes the compose file already persists (`claude-auth`,
`codex-auth`, `pi-auth`, `gh-config`, etc. — see `.devcontainer/docker-compose.yml`).
It is therefore **container-ephemeral**: it survives a `make stop` / restart
of the *same* container, but is wiped by `make destroy` (`docker compose down
-v`) along with every other unmounted path. This means a `prime-rl` workspace
does not survive a full sandbox rebuild — a known limitation, not a bug — and
creates a drift risk (re-scaffolding after every rebuild, no continuity of an
authored environment across image rebuilds) worth a future named-volume
enhancement if this workflow proves durable enough to warrant persistence.
Not a blocker for this PRD's wiring scope.

**Rejected:** scaffolding under `.oh/worktrees/` or another in-tree gitignored
directory. Still collides with scope-resolution (any `AGENTS.md` under the
repo root is in-scope per the root `AGENTS.md`'s own rule), and worktrees are
a project/agent-identity concept, not a generic scratch space.

### ADR-7 — CLAUDE.md registration; protected-paths deferred (experimental)

**Decision:** Register `/prime-rl` as a new row in `CLAUDE.md § Skills`
(landed in US-004), noting in the same row (or an adjacent note) that `/rlm`
is **currently absent** from that table — a pre-existing gap, not introduced
here. Do **NOT** add `.oh/skills/prime-rl/` to `.claude/protected-paths.txt`
at this time.

**Rationale:** The Skills table is the discoverability surface; a new
manual-invoke skill should be findable the same way `/rlm` should be (but
presently isn't — flagged, not silently perpetuated). Protected-paths status
is reserved for load-bearing machinery that critics must not casually
recommend deleting; a brand-new, experimental, credit-spending integration
does not meet that bar on day one.

**Rejected:** protecting the skill immediately. Premature — protection should
follow demonstrated load-bearing use, not precede it.

## 4. User Stories

> Priority = dependency order. US-002 (secret-guard hardening) has no
> dependency on US-001 and could run in parallel — it is sequenced second not
> because US-001 names the protected filenames (it doesn't; US-001 is
> Dockerfile/compose/harness-config wiring only), but because the concrete
> filenames it protects (`secrets.env`, `configs/endpoints.toml`) are the
> config surfaces the `/prime-rl` skill (US-003/US-004) documents — landing
> the three-layer guard *before* the skill exists ensures no window where the
> skill's own reference doc points at unprotected paths. US-003 and US-004
> split what would otherwise be one oversized story (skill body vs.
> supporting reference + registration). US-005–US-008 are strictly
> sequential — each cites artifacts the prior story creates. Every
> code-bearing story ends with a real, non-"looks good" check.

### US-001: Devcontainer opt-in provisioning

**Description:** As the harness maintainer, I want `prime` CLI installation
gated behind an opt-in build arg mirroring the DeepAgents pattern, so default
sandboxes are unaffected and only operators who opt in pay the install cost.

**Acceptance Criteria:**
- [ ] `.devcontainer/Dockerfile` gains a new `ARG INSTALL_PRIME_RL=false`
      block placed immediately after the existing DeepAgents block (~lines
      69–79), using the build-only `UV_TOOL_DIR=/opt/uv/tools
      UV_TOOL_BIN_DIR=/usr/local/bin` + `uv tool install prime` pattern
      (ADR-1, unpinned version — by precedent, not oversight). The diff to
      this **protected path** is a **pure addition** — no existing line
      modified or removed.
- [ ] `.devcontainer/docker-compose.yml` passes `INSTALL_PRIME_RL:
      ${INSTALL_PRIME_RL:-false}` as a build arg alongside
      `INSTALL_DEEPAGENTS`/`INSTALL_HERMES` (~lines 43–44); pure addition.
- [ ] `.oh/scripts/harness-config.sh` gains
      `envmap["install.prime_rl"] = "INSTALL_PRIME_RL"` alongside the
      existing `install.*` entries.
- [ ] `harness.yaml.example` gains a commented
      `# prime_rl: false          # INSTALL_PRIME_RL — Prime Intellect \`prime\` CLI (build arg)`
      line under `install:`, matching the existing commented-default style —
      this is the **primary** documented opt-in path (edit `harness.yaml`,
      uncomment the key, `make destroy && make sandbox`); the
      `INSTALL_PRIME_RL=true make sandbox` env-var form is documented only as
      a shorthand (US-005), mirroring `sshd.md`'s harness.yaml-first
      convention.
- [ ] **Real check:** `INSTALL_PRIME_RL=true make sandbox` (or the equivalent
      `docker build --build-arg INSTALL_PRIME_RL=true`) resolves `prime
      --version` inside the built image; a default build has no `prime` on
      `PATH`; `shellcheck -S warning .oh/scripts/harness-config.sh` passes
      clean — the exact invocation (flag included) CI runs at
      `.github/workflows/ci-harness.yml:126`.

### US-002: Secret-guard hardening for prime-rl config surfaces (three layers)

**Description:** As the harness security owner, I want `secrets.env` and
`configs/endpoints.toml` covered by all three guard layers that protect every
other credential file, so prime-rl's non-dot-prefixed secret filenames don't
slip past `.gitignore`, the Read/Edit path hook, *and* the Bash-command hook
by construction (ADR-4).

**Acceptance Criteria:**
- [ ] `.gitignore` gains **glob-anchored** entries: `**/secrets.env` and
      `**/configs/endpoints.toml` (not the bare mid-slash form, which only
      matches at repo root).
- [ ] `.oh/hooks/deny-secret-paths.sh`'s `DENY_PATH` alternation gains two new
      terms (with the existing one-glob-per-line comment convention):
      `(^|/)secrets\.env$` and `(^|/)configs/endpoints\.toml$`.
- [ ] `.claude/settings.json`'s `permissions.deny` gains the mirrored
      `Read(file_path=**/secrets.env)` and
      `Read(file_path=**/configs/endpoints.toml)` entries in the same change.
- [ ] `.oh/hooks/deny-env-dump.sh`'s `SECRET_PATH` (the Bash-**command**
      guard — a separate layer from the two above) gains `configs/endpoints\.toml`
      and an explicit `(^|/)secrets\.env\b` term (word-boundary, **not**
      `$`-anchored — this hook matches the whole command string, not an
      isolated file path, so a `$` anchor misses `cat foo/secrets.env | grep
      TOKEN`-style commands; see ADR-4), closing the gap where this
      layer today has no `.toml` coverage at all and only an accidental
      `.env`-substring match for `secrets.env`. Both new terms must land
      **inside** the existing `SECRET_PATH` outer-paren alternation group.
- [ ] **Real check:** `grep -q 'secrets\\.env' .oh/hooks/deny-secret-paths.sh
      && grep -q 'endpoints\\.toml' .oh/hooks/deny-secret-paths.sh` exits 0;
      `grep -q 'endpoints\\.toml' .oh/hooks/deny-env-dump.sh && grep -qF
      'secrets\.env\b' .oh/hooks/deny-env-dump.sh` exits 0 (the `-qF` check
      asserts the **word-boundary** form specifically, so a mistakenly
      `$`-anchored term fails the check); **and**
      `git check-ignore -v secrets.env configs/endpoints.toml
      foo/secrets.env foo/configs/endpoints.toml` (root-relative **and**
      nested throwaway paths) reports all four as ignored — a root-only
      check would not have caught the anchoring bug this ADR fixes.

### US-003: `/prime-rl` skill body

**Description:** As an operator who has opted into the install, I want the
`/prime-rl` skill's core body and invocation shape defined, so the
manual-invoke contract (never auto-triggers, never silently trains) is locked
before the supporting reference doc is written.

**Acceptance Criteria:**
- [ ] Create `.oh/skills/prime-rl/SKILL.md`: frontmatter (`name: prime-rl`,
      an `argument-hint` describing the `<lab-name|env-name>
      [lab-setup|env-init|eval-run|eval-tui|gepa-run|train-run] [--model
      <id>] [--n N]` shape, `disable-model-invocation: true`,
      `allowed-tools: Bash`, a TRIGGER-style description) mirroring
      `.oh/skills/rlm/SKILL.md`'s shape (ADR-2); a `RESULT:` tag convention
      section (e.g. `PRIME-RL-WIRED | BLOCKED-NO-CREDS | STOP-FOR-HUMAN`).
- [ ] Procedure body covers, in order: `prime lab setup <name>` (scaffold
      location = `$HOME/prime-labs/<name>`, ADR-6, pinned) → the
      AI-agent-authored training env from `prompt.md`, naming the
      **`verifiers` Python package** and its **`StatefulToolEnv` pattern** as
      the mechanism the authored environment implements (this skill does not
      author that content itself — out of scope, § 5) → `prime env init
      my-env` → `prime eval run my-env -m <model> -n 5` / `prime eval tui` /
      `prime gepa run` for baselines.
- [ ] `prime train run configs/rl/<config>.toml` is explicitly marked
      **STOP-for-human** per ADR-5; the procedure also names the
      **LoRA-adapter deployment step** (one-click deploy from
      `https://app.primeintellect.ai` after a completed hosted run) as the
      lifecycle's terminal step, described but never invoked.
- [ ] **Real check:** `test -f .oh/skills/prime-rl/SKILL.md` **AND**
      `test -f .claude/skills/prime-rl/SKILL.md` both exit 0 — the second
      directly asserts the skill resolves through the provider symlink,
      which a bare `link-providers.sh --check` would not catch on its own
      (its `required_execs` list is hardcoded and does not cover
      `prime-rl`, so it can pass even if this skill were entirely missing).

### US-004: `/prime-rl` lifecycle reference + CLAUDE.md registration

**Description:** As an operator, I want the config-surface/TOML/guardrail
detail split into its own reference doc and the skill registered in
CLAUDE.md's Skills table, so `SKILL.md` (US-003) stays a lean procedure and
the skill is discoverable the same way every other skill is.

**Acceptance Criteria:**
- [ ] Create `.oh/skills/prime-rl/references/lifecycle.md` documenting the
      config surfaces (`configs/endpoints.toml`, optional `secrets.env`, and
      an explicit note that W&B config is **not yet guarded** pending a
      confirmed filename — § 5 Non-Goals), the TOML knobs (`model`,
      `max_steps`, `batch_size`, `rollouts_per_example`), and the guardrails
      (never-unattended per ADR-5, scaffold-location `$HOME/prime-labs/<name>`
      per ADR-6, and the three-layer secret-guard coverage per US-002 —
      pointing at the hardened files by name).
- [ ] `.oh/skills/prime-rl/SKILL.md` (US-003) is updated with a one-line
      pointer to this new reference file.
- [ ] `CLAUDE.md § Skills` gains a `/prime-rl` row (ADR-7), and the same
      change notes `/rlm`'s pre-existing absence from that table.
- [ ] **Real check:** `bash .oh/scripts/link-providers.sh --check` passes,
      and `grep -q '/prime-rl' CLAUDE.md` exits 0.

### US-005: Integration doc

**Description:** As an operator, I want a doc mirroring the existing
integrations (`sshd.md`, `slack.md`) so enabling and using `prime-rl` follows
the same prerequisites → enable → configure → verify shape as every other
opt-in capability.

**Acceptance Criteria:**
- [ ] Create `.oh/docs/integrations/prime-rl.md`: title frontmatter, an
      "accurate as of `<build date>`" disclaimer (per `slack.md`'s pattern,
      since example model names / CLI flags may go stale), Prerequisites, an
      **Enable** section whose primary documented path is a `harness.yaml`
      edit (`install: prime_rl: true`, uncommenting US-001's key) followed by
      `make destroy && make sandbox` — with `INSTALL_PRIME_RL=true make
      sandbox` shown only as an env-var shorthand, mirroring `sshd.md`'s
      harness.yaml-first convention (not the other way around) — a secrets
      section stating `secrets.env`/`configs/endpoints.toml` must use env-var
      interpolation only, never literal keys, and pointing at US-002's three
      guard layers by name, a usage walkthrough (lab setup at
      `$HOME/prime-labs/<name>` → env init → eval run/tui → gepa run → train
      run STOP-for-human → LoRA-adapter deployment from
      `https://app.primeintellect.ai`) that names the **`verifiers`** package
      and its **`StatefulToolEnv`** pattern as the environment-authoring
      mechanism, and a Security posture section.
- [ ] Doc cross-links `.oh/skills/prime-rl/SKILL.md`,
      `.oh/skills/prime-rl/references/lifecycle.md`, and the wiki entry
      (US-006) under a "See also" section.
- [ ] **Real check:** `grep -c '^## ' .oh/docs/integrations/prime-rl.md`
      shows the required sections present (Prerequisites, Enable, a secrets
      section, a usage walkthrough, Security posture); `grep -q
      'STOP-for-human'`, `grep -q 'verifiers'`, `grep -q 'StatefulToolEnv'`,
      and `grep -q 'app.primeintellect.ai'` against the same file all pass.

### US-006: Wiki entry

**Description:** As a future session reading this repo, I want a
schema-conformant wiki entry capturing what Prime Intellect's `prime-rl`
ecosystem *is*, distinct from the skill's *how to behave* content (ADR-3),
correctly cross-linked so it isn't a guaranteed orphan on day one.

**Acceptance Criteria:**
- [ ] Create `.oh/skills/wiki/corpus/prime-rl-training.md` per
      `.oh/skills/wiki/references/schema.md`: frontmatter (`title`, `slug:
      prime-rl-training`, `tags: [prime-rl, verifiers, rl-training,
      prime-intellect, gepa]`, `created`/`updated` = build date, `sources:`
      citing at least one snapshot — `/wiki ingest
      https://docs.primeintellect.ai/llms.txt --slug prime-rl-training` if
      network access is available at execute time, else this PRD
      (`.oh/tasks/prime-rl-integration/prd.md`) and the US-003/US-004/US-005
      artifacts as the provisional source — `confidence: provisional`,
      `related: [recursive-language-models]`).
- [ ] Body in schema order (`## Relevant Source Files`, `## Summary`, `##
      Detail`, `## System Relationships`, `## See Also`), ≤ 900 words
      (architecture/harness entry cap).
- [ ] `## Detail` records the DeepWiki comparison: Prime Intellect's `prime`
      CLI / `verifiers` RL-training ecosystem has **no existing page** on
      `https://deepwiki.com/mifunedev/openharness` — it is new harness-adjacent
      surface, not core harness code; the closest existing entries are
      [[recursive-language-models]] (agent-harness RL/recursion adjacency)
      and the DeepAgents/Hermes opt-in-CLI-install precedent. `## Detail`
      also names the **`verifiers`** package + **`StatefulToolEnv`** pattern
      (the RL-environment-authoring mechanism `prime env init` wraps) and the
      LoRA-adapter deployment step at `https://app.primeintellect.ai` as
      facts the entry states.
- [ ] `## See Also` links `[[recursive-language-models]]` at minimum, **AND**
      in the **same change**, `.oh/skills/wiki/corpus/recursive-language-models.md`'s
      own `## See Also` is updated to add the reciprocal `[[prime-rl-training]]`
      link. A brand-new entry with zero inbound `[[slug]]` references is a
      **true-positive orphan finding by design** (`.oh/skills/wiki/references/lint.md`
      § 6) — the reciprocal backlink is what makes the entry non-orphaned,
      not a lint exemption.
- [ ] Whitelisted into git via `git add -f` — both the new entry and the
      edited `recursive-language-models.md` (already tracked, so only the
      new file strictly needs `-f`, but both are staged together).
- [ ] **Real check:** `/wiki lint --dry-run` reports **no broken-link
      findings** (broken links — `[[slug]]` references to a non-existent
      entry — are the real correctness signal here; the orphan check is
      informational-only per `.oh/skills/wiki/references/lint.md` § 6 and is
      not itself a pass/fail gate, though the reciprocal backlink above
      resolves it too), and `bash .oh/evals/probes/wiki-readme-index.sh`
      passes.

### US-007: Wiring-only eval probe

**Description:** As the harness's regression floor, I want a deterministic,
network-free probe asserting this integration's wiring — including all three
secret-guard layers — exists, so future changes can't silently regress it.

**Acceptance Criteria:**
- [ ] Create `.oh/evals/probes/prime-rl-wiring.sh` (`# tier: A`) asserting:
      `.oh/skills/prime-rl/SKILL.md` exists with `disable-model-invocation:
      true` in frontmatter; `.claude/skills/prime-rl/SKILL.md` resolves
      through the provider symlink; `.oh/skills/prime-rl/references/lifecycle.md`
      exists; `.oh/docs/integrations/prime-rl.md` exists; `.oh/skills/wiki/corpus/prime-rl-training.md`
      exists with a parseable `slug:`/`confidence:` frontmatter;
      `.devcontainer/Dockerfile` contains `ARG INSTALL_PRIME_RL`;
      `.devcontainer/docker-compose.yml` contains `INSTALL_PRIME_RL`;
      `harness.yaml.example` contains `prime_rl`; `.oh/hooks/deny-secret-paths.sh`
      contains the `secrets\.env`/`endpoints\.toml` guard terms (US-002 layer
      2); **and** `.oh/hooks/deny-env-dump.sh`'s `SECRET_PATH` contains the
      `configs/endpoints\.toml` and `secrets\.env` guard terms (US-002 layer
      3) — all three guard layers are asserted, not just the first two.
- [ ] The probe invokes **no** `prime`/`uv`/`docker` command and makes **no**
      network call — grep/file-existence assertions only. Its header comment
      states this explicitly and flags itself as an `/eval-lint`
      always-SKIP-candidate watch item (wiring-only, no runtime behavior to
      exercise) per the Critic finding.
- [ ] **Real check:** `bash .oh/evals/probes/prime-rl-wiring.sh` exits 0
      standalone, and a full `/eval` run shows no green→red regression
      against the current `.oh/evals/RESULTS.md` baseline.

### US-008: Local validation runbook (isolated build, redacted, STOP-for-human where credentials are needed)

**Description:** As the platform operator, I want a recorded runbook proving
the wiring is real up to the point credentials are required, on an isolated
sandbox that can't collide with a running one, with pasted output scrubbed
before it's committed.

**Acceptance Criteria:**
- [ ] The validation build uses an **isolated `SANDBOX_NAME`** (e.g.
      `SANDBOX_NAME=oh-prime-rl-validation`) so it never collides with
      `container_name: openharness`'s default on a shared host already
      running another sandbox.
- [ ] `.oh/skills/prime-rl/references/lifecycle.md` (or a dedicated
      `.oh/skills/prime-rl/references/validation.md`) records a real,
      verbatim walkthrough: `SANDBOX_NAME=oh-prime-rl-validation
      INSTALL_PRIME_RL=true make sandbox` → inside the sandbox, `prime lab
      setup <name>` scaffolds a workspace at `$HOME/prime-labs/<name>`
      (ADR-6's pinned location) → `prime env init my-env` output pasted
      verbatim.
- [ ] **Mandatory redaction pass before commit:** every captured CLI output
      pasted into the runbook is grepped against `.oh/hooks/deny-secret-paths.sh`'s
      `DENY_PATH` and `.oh/hooks/deny-env-dump.sh`'s `SECRET_NAME` patterns,
      **plus** a manual token/credential visual review, before the runbook is
      committed — the harness's existing hooks screen tool-call **paths and
      commands**, not pasted **prose content**, so a verbatim paste
      containing a live token or key would not be caught by any existing
      guard without this explicit step.
- [ ] `prime eval run` / `prime eval tui` / `prime gepa run` / `prime train
      run` steps are recorded as **BLOCKED — pending human-supplied
      credentials**, stating exactly which credential/account each blocked
      step needs — **distinct** from any **early network/login failure**
      encountered earlier at `prime lab setup`/`prime env init` (e.g.
      DNS/registry unreachable, or a `prime login` requirement the sandbox
      has no credential for). Both are BLOCKED evidence, but the runbook
      labels which failure mode occurred at which step — never conflating
      "no credentials supplied yet" with "couldn't reach the network."
- [ ] The runbook states explicitly: "testing stops at wiring-correct; hosted
      training is unverifiable in this environment."
- [ ] **Real check:** every step that actually ran has verbatim (and
      redacted, per above) output in the runbook, and `git status
      --porcelain` (run from the harness root after the scaffold step) shows
      **no** new untracked files from the scaffold — proving ADR-6
      compliance — while `bash .oh/evals/probes/prime-rl-wiring.sh` (US-007)
      still exits 0.

## 5. Non-Goals (Out of Scope)

- **Autonomous or hosted `prime train run`.** No RL training job is ever
  submitted by this PRD's work, from cron, autopilot, or otherwise (ADR-5).
- **RL-environment generation from harness session traces or eval probes.**
  Authoring a `verifiers` environment from the harness's own data is a
  distinct, future capability — not this integration's job.
- **`prompt.md`-driven env-authoring content.** The AI-agent-authored
  training-environment step is upstream `prime` UX, not something this PRD's
  skill generates or scripts.
- **Cron scheduling of any `prime-rl` step.** Nothing here is added to
  `.oh/crons/`.
- **Guarding a concrete W&B config file path.** No confirmed W&B config
  filename exists in this PRD's authoritative source facts (only "optional
  W&B config" is known generically) — guarding an unconfirmed filename risks
  a wrong-pattern guard that provides false confidence rather than real
  coverage. W&B file-guarding is deferred to a follow-up once the actual
  config filename is confirmed against `docs.primeintellect.ai`; US-002's
  three-layer hardening covers only the two confirmed surfaces,
  `secrets.env` and `configs/endpoints.toml` (G3 states this explicitly).
- **Training Python code living in this repo.** `prime lab setup` scaffolds
  land outside the tracked tree, at the pinned `$HOME/prime-labs/<name>`
  (ADR-6); nothing is committed here.
- **Protecting `.oh/skills/prime-rl/` in `.claude/protected-paths.txt`.**
  Deferred — experimental status (ADR-7).
- **A dedicated Dockerfile linter / hadolint adoption** beyond what CI already
  runs. Out of scope; the Dockerfile diff is reviewed as a pure addition
  (§ 6).

## 6. Technical Considerations

- **Protected paths, pure-addition diffs only.** `.devcontainer/Dockerfile`
  and `.devcontainer/entrypoint.sh` are protected (`.claude/protected-paths.txt`
  lineage); US-001's Dockerfile change must be reviewable as a strict
  insertion — no existing line touched.
- **Three secret guards move together, not two.** `.oh/hooks/deny-secret-paths.sh`
  (Read/Write/Edit path guard), its `.claude/settings.json` `permissions.deny`
  mirror, and `.oh/hooks/deny-env-dump.sh` (Bash-command guard) are three
  independent enforcement layers; US-002 must update all three in the same
  commit — updating only the first two leaves `Bash cat secrets.env`
  unguarded even after "the secret guard" is believed fixed.
- **Unpinned CLI version, by precedent.** `uv tool install prime` is
  unpinned, same as the existing DeepAgents and Hermes installs — not a new
  gap this PRD introduces, but worth a follow-up issue to pin all three
  opt-in CLIs' versions together.
- **Scaffold-location persistence.** `$HOME/prime-labs/<name>` (ADR-6) is
  container-ephemeral — it survives `make stop`/restart but not `make
  destroy` (no named volume backs it). This is a known limitation and drift
  risk (re-scaffolding after every rebuild), not a defect in this PRD's
  scope.
- **Offline egress risk.** `uv tool install prime` and `prime lab setup` both
  require network egress; document that an offline sandbox build/run hangs
  or fails at these steps rather than silently no-op-ing. US-008's runbook
  distinguishes this **early network/login BLOCKED** failure mode from the
  later **credential-BLOCKED** steps — they are not the same finding.
- **Staleness disclaimer.** Example model names (`Qwen/Qwen3-30B-A3B-Instruct-2507`),
  CLI flags, and UI labels will drift; the integration doc carries an
  "accurate as of `<date>`" disclaimer per the `slack.md` precedent.
- **Arbitrary-code-execution + real-money risk.** `prime eval run` / `prime
  train run` execute LLM-authored `verifiers` code against hosted
  infrastructure and real credits — this is the load-bearing reason ADR-5's
  guardrail is procedural, not just documentation.
- **Pasted-content leaks are a distinct threat from path-based leaks.**
  US-008's redaction pass exists because none of the three secret-guard
  layers (§ 5, ADR-4) screen **pasted prose content** in a committed
  markdown file — they screen tool-call paths and commands. A verbatim CLI
  output containing a live token is a leak vector none of those hooks catch.
- **Testing boundary.** Hosted training is unverifiable in CI or this
  sandbox; this PRD's stories explicitly stop verification at
  wiring-correctness (US-007's probe, US-008's runbook) rather than
  attempting to fake a green hosted-training result.

## 7. Success Metrics

Maps 1:1 to the Goals (§ 2):

- **SM-1** (→ G1) — `INSTALL_PRIME_RL=true` build resolves `prime --version`;
  default build has no `prime` on `PATH`; `shellcheck -S warning` clean.
- **SM-2** (→ G2) — `/prime-rl` documents the full local lifecycle
  (naming `verifiers`/`StatefulToolEnv`/LoRA deployment); `prime train run`
  is marked STOP-for-human in the skill body.
- **SM-3** (→ G3) — All **three** guard layers (`.gitignore`,
  `deny-secret-paths.sh` + `.claude/settings.json`, `deny-env-dump.sh`) cover
  `secrets.env` / `configs/endpoints.toml`, verified by grep and
  `git check-ignore` against **root-relative and nested** paths; W&B is
  explicitly out of scope, not silently unguarded.
- **SM-4** (→ G4) — `/wiki lint --dry-run` reports no broken-link findings
  and `wiki-readme-index.sh` passes for the new entry; entry is `git add
  -f`'d; the reciprocal `[[prime-rl-training]]` backlink lands in
  `recursive-language-models.md` in the same change.
- **SM-5** (→ G5) — `prime-rl-wiring.sh` (asserting all three guard layers)
  passes standalone and inside a full `/eval` run with no green→red
  regression.
- **SM-6** (→ G6) — Runbook runs against an isolated `SANDBOX_NAME`; pasted
  output is redaction-reviewed before commit; credential-gated steps are
  labeled BLOCKED and distinguished from early network/login BLOCKED
  failures; `git status --porcelain` proves no scaffold leakage into the
  tracked tree.

## 8. Open Questions

- **OQ-1 — Harness-wide Dockerfile linting.** Whether to expand beyond the
  CI-run `hadolint`/`shellcheck -S warning` gate this PRD relies on (§ 6) is
  out of scope here (§ 5) but worth a follow-up issue given this PRD reviews
  the Dockerfile diff as a pure-addition manual review on top of that
  existing gate.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: `.oh/skills/wiki/corpus/prime-rl-training.md` to create
  (US-006, at execute time), plus a reciprocal `## See Also` edit to the
  existing `.oh/skills/wiki/corpus/recursive-language-models.md` in the same
  change.
- **Spec alignment**: The entry must capture the landed architecture — the
  opt-in `uv tool install` mechanism (ADR-1), the manual-invoke skill vs.
  wiki split (ADR-2/ADR-3), the local-authoring/cloud-executing lifecycle
  (`lab setup` → `env init` → `eval run`/`tui`/`gepa run` → STOP-for-human
  `train run` → LoRA-adapter deployment), the three-layer secret-guard
  hardening for `secrets.env`/`configs/endpoints.toml` (ADR-4), and the
  pinned `$HOME/prime-labs/<name>` scaffold location (ADR-6) — so future work
  does not re-litigate settled questions or reintroduce the secret-guard gap.
- **DeepWiki comparison**: Recorded at execute time against
  `https://deepwiki.com/mifunedev/openharness` — Prime Intellect's `prime-rl`
  ecosystem is a *new* subsystem not yet represented there; expect "no
  relevant DeepWiki page found," with [[recursive-language-models]] as the
  closest existing entry (shared RL/agent-harness adjacency, though RLM is a
  harness-owned inference-time pattern and `prime-rl` is an external
  hosted-training platform — the entry must not conflate the two).
- **Acceptance criteria**: US-006 creates
  `.oh/skills/wiki/corpus/prime-rl-training.md` following
  `.oh/skills/wiki/references/schema.md` (schema-valid frontmatter,
  line-cited claims, `## See Also`), whitelisted via `git add -f` (the corpus
  is gitignored-by-default), carries a reciprocal inbound `[[prime-rl-training]]`
  link from `recursive-language-models.md` (closing the true-positive orphan
  finding a brand-new entry would otherwise carry), and passes both `/wiki
  lint --dry-run` (no broken-link findings) and `bash
  .oh/evals/probes/wiki-readme-index.sh`.
