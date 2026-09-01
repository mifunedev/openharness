# `/spec plan` — recall → ground → plan

> Detail doc for the **`plan`** subcommand of the `/spec` skill
> (`.oh/skills/spec/SKILL.md`). Argument form:
> `plan <topic> [--plan <path>] [--issue <N>] [--slug <slug>] [--prefix feat|bug|task|audit|skill|agent] [--repo <owner/name>] [--base <branch>]`.
> The dispatcher passes the argument string after `plan` to this procedure as
> `$ARGUMENTS`. Authority: `.oh/skills/spec/SKILL.md`.

The **plan** node takes a topic / plan file / issue and produces the
**`.oh/tasks/<slug>/` folder** — the universal interface every other `/spec` node
is pointed at.

**Core principle: plan cheaply, commit nothing.** `plan` writes only local files
under `.oh/tasks/<slug>/`. It creates no GitHub-side state, so the folder stays
fully reversible (delete `.oh/tasks/<slug>/`) until the operator approves the
`prd.md`. **That approval is the commitment gate** (`.oh/skills/spec/SKILL.md`).

**Second principle: recall before you plan.** The harness accumulates
understanding of its own repository. A plan written without reading it re-derives
what is already known, and — worse — re-derives it differently. Recall is a step
of this node, not an optional habit.

**Third principle: knowledge is a cache, not an authority.** A recalled page can
be out of date the moment a source it depends on moves. Every material claim the
plan leans on is verified against the current repository before the PRD is
written.

---

## Inputs

| Arg | Meaning |
|-----|---------|
| `<topic>` | Free-text feature description — the seed for recall and `/prd`. Required unless `--plan` or `--issue` supplies the spec. |
| `--plan <path>` | A plan file (e.g. `/imagine` output) used as comprehensive `/prd` input; skips `/prd`'s clarifying questions. **Its presence is the operator's approval** — see `## Plan Reconciliation`. |
| `--issue <N>` | The issue number this spec builds — **consumed by the `/ralph` step** (the branch name embeds it, so `/ralph` hard-fails without it). The human selects the issue. For a fresh manual topic with no issue, open one first (per `/git`) or let `/spec execute` open one in a standalone run. `plan` only **reads** `<N>`. |
| `--slug <slug>` | Override the derived slug. Must match `[a-z0-9-]+`, ≤5 words, not `archive`. |
| `--prefix <type>` | Branch/issue prefix (default `feat`), per `.oh/skills/git/SKILL.md`. |
| `--repo <owner/name>` | Recorded for downstream `/spec execute`; not acted on here. Default `mifunedev/openharness`. |
| `--base <branch>` | Recorded for downstream `/spec execute`; not acted on here. Default `development`. |

`plan` never touches GitHub — `--issue`, `--repo`, `--base` are recorded into the
folder for `/spec execute` to consume.

---

## The pipeline

Run these in order; each is an existing primitive — compose, don't re-derive.

### 1. Derive `<slug>`

Per the `/prd` skill's rules: lowercase kebab-case, `[a-z0-9-]+`, ≤5
hyphen-words, not `archive`. The slug is the universal key — task directory,
branch second segment, tmux session name, status file. Choose once; reject and
ask for a shorter name if invalid. `--slug` overrides derivation.

### 2. Recall tracked knowledge

Record the base commit first — it is what `/spec execute` re-grounds against:

```bash
BASE_COMMIT=$(git rev-parse HEAD)
```

Then, in order:

1. **Derive the task's vocabulary** from the topic, the plan file, or the issue:
   the subsystems, file surfaces, and concepts the work touches. Three to six
   terms, in the knowledge base's own vocabulary (`spec`, `wiki`, `evals`,
   `docs`, `sandbox`, `cli`, …), not the phrasing of the request.
2. **Query tracked entity knowledge**: `/wiki query <terms>` — `kind: repo` and
   `kind: external` pages, ≤3 read.
3. **Query accumulated patterns**: `/wiki query <terms> --patterns` — `kind:
   pattern` pages, ≤5 read. **This is the planner/proposer role, which is why it
   gets patterns**; `/spec execute` does not load the pattern set
   (`.oh/skills/wiki/references/schema.md` § 3).
4. **Read the matched entries** whole.

Both queries read tracked knowledge only — `.oh/knowledge/source/` and
`.oh/knowledge/patterns/`. `.oh/knowledge/local/` is per-machine scratch and no
query path reads it, because a plan grounded in a page one machine can see is a
plan nobody else can reproduce.

An empty result is a normal outcome on a young knowledge base, not a failure.
Record `none` and continue.

### 3. Ground the recalled claims against current sources

For every recalled claim the plan will lean on, open the authoritative source and
check it. **The order of authority is fixed**: code and tests are implementation
truth; canonical `docs/`, RFCs, and ADRs are intended-design truth; a knowledge
page is orientation and is never either.

A page's `sources:` list names exactly what to open, and
`.oh/skills/wiki/scripts/knowledge-impact.sh --verified` will already have
flagged a page whose declared dependencies moved after its `verified_at` commit.
A `NEEDS-REVIEW` page is not unusable — it is a page whose claims must be checked
before use rather than after.

Where a page and the source disagree, **the source wins and the page is wrong**.
Record the reconciliation in `## Knowledge Context` under *Conflicts discovered*
and repair the page during `/spec execute`'s knowledge-impact gate — not here,
because `plan` writes no repository state.

### 4. `/prd` → `.oh/tasks/<slug>/prd.md`

Invoke the `prd` skill with `<topic>` (or the `--plan` content, with an explicit
instruction to skip clarifying questions when a plan is supplied), building the
PRD from **operator intent + current repository reality + recalled knowledge**.
Verify `.oh/tasks/<slug>/prd.md` exists before continuing.

### 5. Record the three knowledge sections in `prd.md`

Reuse these block shapes verbatim — `/spec execute`'s gates read them.

#### `## Knowledge Context` — what informed this plan

```markdown
## Knowledge Context

- **Base commit**: `<sha>`
- **Queries**: `<queries used>`
- **Knowledge used**: `[[slug]]`, ... or `none`
- **Grounded against**: `<repo-relative paths>`
- **Conflicts discovered**: `none` or concise reconciliation
```

`Base commit` is load-bearing: `/spec execute` diffs it against the execution
base to decide whether the plan's assumptions still hold. `Grounded against`
lists the authoritative sources step 3 actually opened — it is the list the
execution Advisor re-reads, so an unchecked claim left off this list is a claim
nobody verifies twice.

#### `## Expected Knowledge Impact` — the planner's prediction

```markdown
## Expected Knowledge Impact

- **Impact**: REQUIRED | NOT-APPLICABLE
- **Expected entries**: `<slugs or none>`
- **Affected source paths**: `<paths/patterns>`
- **Reason**: `<why>`
```

`Impact: REQUIRED` when the task changes harness architecture, skill behavior,
agent roles, runtime flow, conceptual vocabulary, or public prose that introduces
a reusable mechanism. `Impact: NOT-APPLICABLE` is allowed for narrow code/test
chores, but it must say why.

**This is a prediction, not the oracle.** `Knowledge Context` records what
informed the plan; `Expected Knowledge Impact` records only what the planner
thinks the implementation may invalidate. The final answer is derived in
`/spec execute` from the actual diff plus each page's declared dependencies,
because implementation reaches paths the planner never saw.

#### `## Plan Reconciliation` — did grounding preserve the approved intent?

```markdown
## Plan Reconciliation

- **Source plan**: `<path>`
- **Intent preserved**: YES | NO
- **Material deviations**: `none` or list
- **Constraints discovered during grounding**: `none` or list
```

**The gate.** Passing a plan file satisfies the commitment gate only while
grounding preserves the approved intent. A *material* deviation is one the
operator would want to decide: a goal that cannot be met as written, a
non-goal the work would have to cross, a different mechanism than the plan
names, or a scope change. A *constraint discovered* is something grounding
revealed that the plan did not contradict — record it and continue.

If `Intent preserved: NO`, **stop before execution**. Report the deviation, leave
the folder in place, and require operator re-approval. Do not silently convert an
approved plan into a materially different PRD and treat the original approval as
covering it. With no `--plan` file the field is `Source plan: none` and the PRD
itself is the first artifact anyone could approve.

`## Wiki Alignment` is superseded by these three sections. Do not write it.

### 6. `/ralph` → `.oh/tasks/<slug>/prd.json`

Invoke the `ralph` skill: `.oh/tasks/<slug>/ --issue <N> --prefix <prefix>`. It
writes `prd.json` with `branchName: <prefix>/<N>-<slug>`. Verify it parses
(`node -e "require('./.oh/tasks/<slug>/prd.json')"`). **`/ralph` hard-fails
without `--issue <N>`** (the branch name embeds it). `plan` consumes the number;
it never creates the issue.

When `Expected Knowledge Impact` is `REQUIRED`, at least one story must carry
acceptance criteria for the knowledge update: the named entries aligned with the
PRD's goals, non-goals, and final behavior; the source-backed body shape
(`.oh/skills/wiki/references/schema.md` § 3); `verified_at:` advanced for any
`kind: repo` page whose claims were re-read; and a regenerated
`.oh/knowledge/README.md` index verified by
`bash .oh/evals/probes/wiki-readme-index.sh`.

### 7. Scaffold `progress.txt`

Write `.oh/tasks/<slug>/progress.txt` with the `# progress` header, then append
one dated plan-phase line recording the base commit, the queries run, and the
slugs read. A resumed session recovers from that line instead of re-deriving it.

**There is no `prompt.md`.** The Advisor launch prompt is rendered at execution
time from `.oh/skills/spec/templates/task-prompt.md` plus `prd.md` and
`prd.json`; persisting a generated copy of a template only lets it drift from the
template.

Verify the three-file contract before handing off:

```bash
for f in prd.md prd.json progress.txt; do
  [ -f ".oh/tasks/<slug>/$f" ] || { echo "MISSING: $f"; exit 1; }
done
```

---

## Output

`.oh/tasks/<slug>/` holding the three-file contract (`prd.md`, `prd.json`,
`progress.txt`), with `prd.md` carrying `## Knowledge Context`,
`## Expected Knowledge Impact`, and `## Plan Reconciliation`. No issue, branch,
or PR. Report the folder path, the story count, and the recalled slugs.

---

## What this node does NOT do

- **Decide whether to build.** Approving the `prd.md` this node writes **is** the
  commitment gate — the operator makes that call.
- **Create GitHub-side state.** No `gh issue create`, no branch, no PR. It
  *consumes* a pre-existing issue number for the branch name but never opens,
  edits, or closes an issue/PR.
- **Write knowledge.** Recall is read-only. A page this node found to be wrong is
  repaired in `/spec execute`'s knowledge-impact gate, where the repository state
  it must match actually exists.
- **Build.** Implementation is `/spec execute`.

## Pipeline position

Within the workflow owned by `.oh/skills/spec/SKILL.md`, `plan` is the first
node. The operator approves `prd.md`, then runs `/spec execute <slug>`.

Running `plan` by name is the deliberate stop-after-scaffolding path. The default
entry point — a bare plan path — runs this node and then continues into
`execute`, because handing in a plan file is itself the approval.

If the three-file contract is incomplete, print the missing file and report the
folder as incomplete — a missing artifact is a failure, not a clean plan.
