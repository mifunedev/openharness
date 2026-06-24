---
name: spec-plan
description: >-
  The plan node of the canonical workflow (AGENTS.md § The Workflow) — turn a
  topic, plan file, or issue into a fully-scaffolded tasks/<slug>/ folder (the
  universal interface): /prd → wiki alignment → /ralph → prompt.md + progress.txt.
  Produces ONLY local artifacts (no critics, no GitHub-side state); hands off to
  /spec-critique. The folder-producing first member of the spec-* family that
  decomposes /ship-spec into independently runnable, fan-out-able skills.
  TRIGGER when: a topic/plan/issue needs to become a buildable task folder; the
  plan step of AGENTS.md § The Workflow; "plan <topic>", "scaffold the task for
  <issue>", "spec-plan <slug>".
argument-hint: "<topic> [--plan <path>] [--issue <N>] [--slug <slug>] [--prefix feat|bug|task|audit|skill|agent] [--repo <owner/name>] [--base <branch>]"
---

# Spec Plan — produce the `tasks/<slug>/` folder

The **plan** member of the `spec-*` family (`AGENTS.md § The Workflow`:
`select → spec-plan ⇄ spec-critique → spec-execute → merge → reset|clean`). It takes
a topic / plan file / issue and produces the **`tasks/<slug>/` folder** — the universal
interface every other `spec-*` skill is pointed at.

**Core principle: plan cheaply, commit nothing.** `spec-plan` writes only local files
under `tasks/<slug>/`. It runs no critics and creates no GitHub-side state — that keeps
the plan ⇄ critique loop fully reversible (`rm -rf tasks/<slug>/`) until `/spec-critique`
clears it (`AGENTS.md § The Workflow` invariant: critic-before-commitment).

This is the decomposed form of `/ship-spec` Stages 1–2.5, 6–7. `/ship-spec` remains the
all-in-one composer that runs the whole `plan → critique → execute → retro` pipeline in
one invocation (what `/autopilot` drives); the `spec-*` family is the same pipeline split
so each stage can be run independently or fanned out at scale via `/delegate`.

---

## Inputs

| Arg | Meaning |
|-----|---------|
| `<topic>` | Free-text feature description — the seed for `/prd`. Required unless `--plan` or `--issue` supplies the spec. |
| `--plan <path>` | A plan file (e.g. `/imagine` output) used as comprehensive `/prd` input; skips `/prd`'s clarifying questions. |
| `--issue <N>` | The issue number this spec builds — **consumed by the `/ralph` step** (the branch name embeds it, so `/ralph` hard-fails without it). In the canonical `select → spec-plan` flow, `/autopilot` supplies the selected issue (`AGENTS.md § The Workflow` seam: *autopilot hands the issue to spec-plan*). For a fresh manual topic with no issue, open one first (per `/git`) or use `/ship-spec`, which opens the issue after its own critic gate. `spec-plan` only **reads** `<N>` — it never opens, edits, or closes an issue. |
| `--slug <slug>` | Override the derived slug. Must match `[a-z0-9-]+`, ≤5 words, not `archive`. |
| `--prefix <type>` | Branch/issue prefix (default `feat`), per `.claude/skills/git/SKILL.md`. |
| `--repo <owner/name>` | Recorded for downstream `/spec-execute`; not acted on here. Default `mifunedev/openharness`. |
| `--base <branch>` | Recorded for downstream `/spec-execute`; not acted on here. Default `development`. |

`spec-plan` never touches GitHub — `--issue`, `--repo`, `--base` are recorded into the
folder for `/spec-execute` to consume.

---

## The pipeline

Run these in order; each is an existing primitive — compose, don't re-derive.

1. **Derive `<slug>`** (`/ship-spec` Stage 1 rules): lowercase kebab-case, `[a-z0-9-]+`,
   ≤5 hyphen-words, not `archive`. The slug is the universal key — task directory, branch
   second segment, tmux session name. Choose once; reject and ask for a shorter name if
   invalid. `--slug` overrides derivation.

2. **`/prd` → `tasks/<slug>/prd.md`** (Stage 2). Invoke the `prd` skill with `<topic>`
   (or `--plan` content, with an explicit instruction to skip clarifying questions when a
   plan is supplied). Verify `tasks/<slug>/prd.md` exists before continuing.

3. **Wiki alignment** (Stage 2.5). Read `.mifune/skills/wiki/references/schema.md`, compare the topic against
   the public DeepWiki for this repo, and record a `## Wiki Alignment` section in
   `prd.md` (`Impact: REQUIRED | NOT-APPLICABLE`, local entries, spec alignment, DeepWiki
   comparison, and — when REQUIRED — the wiki acceptance criteria a story must carry). The
   exact shape is `/ship-spec` Stage 2.5; reuse it verbatim so `/spec-execute`'s wiki gate
   can read it.

4. **`/ralph` → `tasks/<slug>/prd.json`** (Stage 6). Invoke the `ralph` skill:
   `tasks/<slug>/ --issue <N> --prefix <prefix>`. It writes `prd.json` with
   `branchName: <prefix>/<N>-<slug>`. Verify it parses
   (`node -e "require('./tasks/<slug>/prd.json')"`). **`/ralph` hard-fails without
   `--issue <N>`** (the branch name embeds it) — in the canonical flow `<N>` is the issue
   `/autopilot` selected; for a fresh manual topic with no issue, open one first per `/git`
   or use `/ship-spec`. `spec-plan` consumes the number; it never creates the issue.

5. **Scaffold `prompt.md` + `progress.txt`** (Stage 7). Clone
   `.claude/skills/ship-spec/templates/prompt.md`, substituting `<slug>`,
   `<prefix>/<N>-<slug>`, and `#<issue>`. Write `tasks/<slug>/progress.txt` with the
   `# progress` header only.

Verify the four-file contract before handing off:

```bash
for f in prd.md prd.json prompt.md progress.txt; do
  [ -f "tasks/<slug>/$f" ] || { echo "MISSING: $f"; exit 1; }
done
```

---

## Output

`tasks/<slug>/` holding the four-file contract (`prd.md`, `prd.json`, `prompt.md`,
`progress.txt`). No `critique.md` yet (that is `/spec-critique`). No issue, branch, or PR.

---

## What this skill does NOT do

- **Run critics or decide.** That is `/spec-critique` (which composes `/critique` +
  `/approve`). `spec-plan` only produces the folder.
- **Create GitHub-side state.** No `gh issue create`, no branch, no PR — the whole point
  is to keep the plan ⇄ critique loop reversible before commitment. It *consumes* a
  pre-existing issue number (`--issue <N>`) for the branch name but never opens, edits, or
  closes an issue/PR.
- **Build.** Implementation is `/spec-execute`.

---

## Memory Protocol

After a run, append to `memory/<UTC-date>/log.md` per `.mifune/skills/retro/references/memory-protocol.md`:

```markdown
## spec-plan -- HH:MM UTC
- **Result**: OP | PARTIAL | FAIL
- **Slug**: <slug>
- **Artifacts**: prd.md / prd.json / prompt.md / progress.txt (four-file contract)
- **Wiki impact**: REQUIRED | NOT-APPLICABLE
- **Observation**: <one sentence>
```

Then run the qualify/improve pass.

---

## Pipeline position

Within `AGENTS.md § The Workflow` (`select → spec-plan ⇄ spec-critique → spec-execute →
merge → reset|clean`), `spec-plan` is the **plan** node; the next step is
`/spec-critique <slug>`. On a complete four-file folder, print this bare token as the final
line:

    STATUS: SPEC-PLANNED

The `spec-*` family's authority is `AGENTS.md § The Workflow`. If the
four-file contract is incomplete, print the missing file and emit no `STATUS:` line — a
missing artifact is a failure, not a clean plan.
