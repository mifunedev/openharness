# B-state primitive-taxonomy migration (M1–M6)

Execute the full A→B migration described in the merged roadmap
(`docs/roadmap.md`) and its source-of-truth plan
(`.claude/plans/context-as-a-logical-marble.md`) as **one branch → one PR**.
M0 (the roadmap north-star page) already shipped; this task builds M1–M6.

The headline: collapse five behavior surfaces `{skills, agents, hooks, rules,
identity}` into **three portable primitives** (`.mifune/{skills,agents,hooks}`)
**plus one small always-on identity core** (`context/` minus the rules tier).

## Global invariants (every story must honor)

1. **One branch.** `task/mifune-b-state-migration`, already checked out. Never
   `git checkout` another branch, never create worktrees, never push to
   `development`/`main`. Commit incrementally — one commit per story.
2. **Eval suite is the oracle.** Before marking ANY story `passes: true`, run
   `bash .mifune/skills/eval/run.sh` and confirm **zero `REGRESSION` rows**
   (every probe `PASS` or `SKIPPED`). If a migration reddens a probe, repoint
   that probe **in the same story** so the guard moves with the thing it guards.
   Then `git checkout evals/RESULTS.md` to drop timestamp churn (no probe is
   being added, so the benchmark file's content must not change beyond that).
3. **Move = symlink-back pattern** (for `agents/`, `hooks/`): make `.mifune/<x>`
   the canonical home via `git mv`, then leave a back-symlink at `.claude/<x> ->
   ../.mifune/<x>`. This preserves the ~40 existing `.claude/agents` refs and
   settings.json hook paths exactly as `.claude/skills -> ../.mifune/skills`
   already does. Verify `.codex/agents -> ../.claude/agents` still resolves.
4. **Deprecate = pointer pattern** (for rules): the proven template is
   `context/rules/git.md` — a 3-line pointer whose source of truth is the `/git`
   skill. Move rule *content* into the owning skill (as `SKILL.md` body or a
   `references/<name>.md` doc), then either leave a thin pointer or delete the
   rule when it has zero inbound refs.
5. **CHANGELOG.** Add one bullet per milestone under `## [Unreleased] → ###
   Added`/`### Changed` in `CHANGELOG.md`. Do not rewrite existing entries.
6. **Docs stay MDX-safe.** Any `docs/*.md` edit must backtick bare `<...>` and
   bare `{...}` so the Docusaurus build passes.
7. **Commit trailers.** Every commit ends with `Submitted-by: Claude` and
   `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
8. **Scope discipline.** No migration beyond the chosen story. Do not "improve"
   unrelated files. The roadmap `docs/roadmap.md` Status column should be ticked
   for each milestone as it lands (M1→M6: `Planned`/`Next` → `✅ Done`).

## Stories (dependency order)

### US-001 — M1: Agents → `.mifune/agents`
`.claude/agents/` (7 real files) becomes `.mifune/agents/` (canonical) with a
`.claude/agents -> ../.mifune/agents` back-symlink. The `mifunedev/skills`
registry + 4 providers are the external consumer, so agents earn the `.mifune/`
namespace exactly as skills did. Update `.mifune/README.md` to list `agents/`.

### US-002 — M5: Hooks → `.mifune/hooks`
`.claude/hooks/` (4 real scripts) becomes `.mifune/hooks/` (canonical) with a
`.claude/hooks -> ../.mifune/hooks` back-symlink. settings.json hook paths
(`.claude/hooks/...`) keep resolving through the symlink. The CI hooks-path probe
must stay green.

### US-003 — M6: Skill-private scripts → skill dirs
Move `scripts/autopilot-caps.sh` → `.mifune/skills/autopilot/` and
`scripts/prompt-miner-caps.sh` → `.mifune/skills/prompt-miner/` (the `eval/run.sh`
precedent: a script owned by exactly one skill rides along with it). Repoint the
cron `preflight:` paths and body refs in `crons/autopilot.md` +
`crons/prompt-miner.md` + `crons/README.md`. Shared scripts
(`locked-append.sh`, `ralph.sh`, `cron-runtime.ts`, `ablate.sh`,
`sandbox-healthcheck.sh`) STAY at root. Update any coupled probe.

### US-004 — M2: `.oh/` config surface
Establish `.oh/` as the `oh`-CLI / installer config surface (rescoping the dead
`.openharness/` — only a stale comment in `install/banner.sh:20` survives). Add
`.oh/README.md` per the directory-README convention documenting the namespace
and its external consumer (the `oh` CLI / `oh harness add` / container build).
Fix the stale `.openharness` reference in `install/banner.sh`. Relocate
installer/lifecycle config under `.oh/` **only** where every Makefile / CI /
devcontainer / cross-script reference can be updated with CI **and** eval
staying green; if a relocation cannot be made green, leave the script at root
and record the rationale — the deliverable is the namespace + the rescope, not
blind relocation.

### US-005 — M3: Rules → skills (easy first)
- Delete `context/rules/remote-installers.md` (0 inbound refs) after confirming
  none; fold its safety norm into a skill reference if any consumer appears.
- Create the `/advisor` skill (`.mifune/skills/advisor/`) from
  `advisor-model.md`, with `recursive-delegation.md` as
  `.mifune/skills/advisor/references/recursive-delegation.md`. Leave thin
  pointers at the two rule paths; repoint `evals/probes/advisor-monitored-loop.sh`
  to the skill location.
- Move `wiki.md` schema → `.mifune/skills/wiki-ingest/references/schema.md`,
  leave a pointer at `context/rules/wiki.md`; keep wiki probes green.
- Move `sandbox-processes.md` → a skill `references/` (cloudflared / t3), leave
  a pointer.
- `directory-readme.md` stays a small `context/` doc (repo-authoring convention,
  not portable behavior).

### US-006 — M4: Always-on collapse (identity core)
- Move `memory.md` (the Memory Improvement Protocol + schema) into `/retro`
  (`.mifune/skills/retro/references/memory-protocol.md`) and add a **one-line
  always-on pointer** in `AGENTS.md`/`CLAUDE.md` so the protocol still fires
  after every skill. Repoint `evals/probes/memory-gitignore-claim.sh` and
  `evals/probes/git-skill.sh` as needed.
- Remove the `context/rules/` tier: delete the now-pointer rule files, remove the
  `.claude/rules -> ../context/rules` symlink, and rewrite the `AGENTS.md`
  "Session start" loader + the `:31` rules-autoload sentence to load identity +
  name the canonical skills instead of `context/rules/*`.
- Keep `directory-readme.md`'s convention reachable (relocate to a `context/`
  doc or skill reference, per US-005), and keep every eval probe green.

## Wiki Alignment

Impact: **NOT-APPLICABLE** for the migration mechanics (this is a structural
refactor of harness primitives, not new domain knowledge). The `wiki.md` schema
*relocates* in US-005 but its content is unchanged; `/wiki-*` skills continue to
implement it from the new path. No new `wiki/<slug>.md` entry is required.

## Definition of done

All six stories `passes: true`; `bash .mifune/skills/eval/run.sh` green; CI green
on the pushed branch; `docs/roadmap.md` Status column ticked through M6; one PR
opened against `origin/development`.
