# `/spec plan` — produce the `.oh/tasks/<slug>/` folder

> Detail doc for the **`plan`** subcommand of the `/spec` skill
> (`.oh/skills/spec/SKILL.md`). Argument form:
> `plan <topic> [--plan <path>] [--issue <N>] [--slug <slug>] [--prefix feat|bug|task|audit|skill|agent] [--repo <owner/name>] [--base <branch>]`.
> The dispatcher passes the argument string after `plan` to this procedure as
> `$ARGUMENTS`. Authority: `AGENTS.md § The Workflow`.

The **plan** node of the `spec-*` family (`AGENTS.md § The Workflow`:
`select → spec-plan → spec-execute → merge → reset|clean`). It takes
a topic / plan file / issue and produces the **`.oh/tasks/<slug>/` folder** — the universal
interface every other `/spec` node is pointed at.

**Core principle: plan cheaply, commit nothing.** `plan` writes only local files
under `.oh/tasks/<slug>/`. It creates no GitHub-side state, so the folder stays fully
reversible (delete `.oh/tasks/<slug>/`) until the operator approves the `prd.md`.
**That approval is the commitment gate** (`AGENTS.md § The Workflow`).

This is the planning half of the pipeline; `/spec execute` is the
all-in-one composer that runs the whole `plan → execute → retro` pipeline in
one invocation; the `/spec` dispatcher is the same pipeline split
so each node can be run independently or fanned out at scale via `/delegate`.

---

## Inputs

| Arg | Meaning |
|-----|---------|
| `<topic>` | Free-text feature description — the seed for `/prd`. Required unless `--plan` or `--issue` supplies the spec. |
| `--plan <path>` | A plan file (e.g. `/imagine` output) used as comprehensive `/prd` input; skips `/prd`'s clarifying questions. |
| `--issue <N>` | The issue number this spec builds — **consumed by the `/ralph` step** (the branch name embeds it, so `/ralph` hard-fails without it). In the canonical `select → spec-plan` flow, `/autopilot` supplies the selected issue (`AGENTS.md § The Workflow` seam: *autopilot hands the issue to spec-plan*). For a fresh manual topic with no issue, open one first (per `/git`) or let `/spec execute` open one in a standalone run. `plan` only **reads** `<N>` — it never opens, edits, or closes an issue. |
| `--slug <slug>` | Override the derived slug. Must match `[a-z0-9-]+`, ≤5 words, not `archive`. |
| `--prefix <type>` | Branch/issue prefix (default `feat`), per `.claude/skills/git/SKILL.md`. |
| `--repo <owner/name>` | Recorded for downstream `/spec execute`; not acted on here. Default `mifunedev/openharness`. |
| `--base <branch>` | Recorded for downstream `/spec execute`; not acted on here. Default `development`. |

`plan` never touches GitHub — `--issue`, `--repo`, `--base` are recorded into the
folder for `/spec execute` to consume.

---

## The pipeline

Run these in order; each is an existing primitive — compose, don't re-derive.

1. **Derive `<slug>`** (per the `/prd` skill's rules): lowercase kebab-case, `[a-z0-9-]+`,
   ≤5 hyphen-words, not `archive`. The slug is the universal key — task directory, branch
   second segment, tmux session name. Choose once; reject and ask for a shorter name if
   invalid. `--slug` overrides derivation.

2. **`/prd` → `.oh/tasks/<slug>/prd.md`**. Invoke the `prd` skill with `<topic>`
   (or `--plan` content, with an explicit instruction to skip clarifying questions when a
   plan is supplied). Verify `.oh/tasks/<slug>/prd.md` exists before continuing.

3. **Wiki alignment**. Read `.oh/skills/wiki/references/schema.md` and record a
   `## Wiki Alignment` section in `prd.md` (`Impact: REQUIRED | NOT-APPLICABLE`, local
   entries, spec alignment, and — when REQUIRED — the wiki acceptance criteria a story must
   carry). The exact shape is the `## Wiki Alignment` block below; reuse it verbatim so
   `/spec execute`'s wiki gate can read it.

   **There is no DeepWiki comparison step.** The public DeepWiki for this repo does not
   regenerate on any schedule this workflow can depend on, so a comparison against it
   measures upstream lag, not the plan. Alignment is judged against the repo's own sources
   and the local corpus only.

   ```markdown
   ## Wiki Alignment

   - **Impact**: REQUIRED | NOT-APPLICABLE
   - **Local entries**: `.oh/skills/wiki/corpus/<slug>.md` to create/update, or `none`
   - **Spec alignment**: <how the wiki entry must reflect this PRD's goals, non-goals, and acceptance criteria>
   - **Acceptance criteria**: <wiki update checks to add to the relevant story when REQUIRED>
   ```

   `Impact: REQUIRED` when the task changes harness architecture, skill behavior, agent
   roles, runtime flow, conceptual vocabulary, or public prose that introduces a reusable
   mechanism. `Impact: NOT-APPLICABLE` is allowed for narrow code/test chores, but it must
   say why. When impact is REQUIRED, revise the PRD so at least one story carries acceptance
   criteria for: the local entry aligned with goals/non-goals/final behavior; the
   source-backed body shape (relevant source files, line-cited claims, system relationships
   when applicable, `## See Also`); and `.oh/skills/wiki/corpus/README.md` index freshness
   via `/wiki lint` or `bash .oh/evals/probes/wiki-readme-index.sh`.

4. **`/ralph` → `.oh/tasks/<slug>/prd.json`**. Invoke the `ralph` skill:
   `.oh/tasks/<slug>/ --issue <N> --prefix <prefix>`. It writes `prd.json` with
   `branchName: <prefix>/<N>-<slug>`. Verify it parses
   (`node -e "require('./.oh/tasks/<slug>/prd.json')"`). **`/ralph` hard-fails without
   `--issue <N>`** (the branch name embeds it) — in the canonical flow `<N>` is the issue
   was selected; for a fresh manual topic with no issue, open one first per `/git`
   or let `/spec execute` open one in a standalone run. `plan` consumes the number; it never creates the issue.

5. **Scaffold `prompt.md` + `progress.txt`.** There is one prompt template — the build
   executor's own, `.oh/skills/spec/templates/session-prompt.md`. Render it into
   `.oh/tasks/<slug>/prompt.md` with the same closed three-placeholder substitution
   `render_session_prompt` in `.oh/scripts/spec-build.sh` performs: `<slug>` → this task's
   slug; `<branch>` → `prd.json`'s `branchName`; `<issue>` → the issue number as **bare
   digits** (the body writes `#<issue>` itself). Strip the template's contract header
   (everything through the `END CONTRACT HEADER -->` line) and confirm no `<placeholder>`
   token survives the render. Write `.oh/tasks/<slug>/progress.txt` with the
   `# progress` header only.

Verify the four-file contract before handing off:

```bash
for f in prd.md prd.json prompt.md progress.txt; do
  [ -f ".oh/tasks/<slug>/$f" ] || { echo "MISSING: $f"; exit 1; }
done
```

---

## Output

`.oh/tasks/<slug>/` holding the four-file contract (`prd.md`, `prd.json`, `prompt.md`,
`progress.txt`). No issue, branch, or PR.

---

## What this node does NOT do

- **Decide whether to build.** Approving the `prd.md` this node writes **is** the
  commitment gate — the operator makes that call. `plan` only produces the folder.
- **Create GitHub-side state.** No `gh issue create`, no branch, no PR — the whole point
  is to keep the folder reversible before commitment. It *consumes* a
  pre-existing issue number (`--issue <N>`) for the branch name but never opens, edits, or
  closes an issue/PR.
- **Build.** Implementation is `/spec execute`.

## Pipeline position

Within `AGENTS.md § The Workflow` (`select → spec-plan → spec-execute →
merge → reset|clean`), `plan` is the **plan** node; the next step is the operator's
approval of `prd.md`, then `/spec execute <slug>`.

The terminal artifact is the folder itself: `.oh/tasks/<slug>/` carrying the four-file
contract, with `prd.md` awaiting the operator's approval. Report the folder path and the
story count. There is no `STATUS: SPEC-PLANNED` token — it had no executable consumer, so
printing it bought nothing.

The `/spec` family's authority is `AGENTS.md § The Workflow`. If the
four-file contract is incomplete, print the missing file and report the folder as incomplete — a
missing artifact is a failure, not a clean plan.
