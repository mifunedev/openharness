# evals/datasets/ — Verifiable harness-trajectory corpus

This directory is the harness's **example corpus**: a catalogue of concrete,
verifiable *trajectories* — a real prompt, the real change it produced, and a
machine-checkable oracle for that change. Inspired by HuggingFace's
[Repo2RLEnv](https://github.com/huggingface/Repo2RLEnv), each example turns a
shipped PR, an autopilot run, or a retro lesson into a reward-bearing instance a
candidate trajectory can be **scored against** (or an existing trajectory
**improved from**). Where the probe suite asks "did we break it?" and the
capability benchmark asks "did we get better?", this corpus supplies the
concrete instances both draw from.

## Floor / Ceiling / Corpus — the three legs of the eval system

| Leg | Path | Asks | Shape |
|---|---|---|---|
| **Floor** (regression) | [`../README.md`](../README.md) | "Did we **break** it?" | Deterministic 3-state probes (`PASS`/`REGRESSION`/`SKIPPED`); must stay green |
| **Ceiling** (progress) | [`../capability/README.md`](../capability/README.md) | "Did we **get better**?" | Graded end-to-end tasks scored on success · cost-time · unattended |
| **Corpus** (examples) | here (`evals/datasets/`) | Concrete verifiable example trajectories | One folder per example: prompt + oracle + `verify.sh`, reward-scored 0..1 |

The floor and ceiling are *instruments*; this corpus is the *material* they
score with. A capability task can sample these instances; a probe can assert a
candidate diff still earns its example's reward.

## Per-example folder layout

Each example lives at `evals/datasets/<dataset>/<DS-id>-<slug>/`. `<dataset>` is
the trajectory class (`ship-spec-prs`, `autopilot-runs`, `retro-cycles`);
`<DS-id>` is the never-reused `DS-NNN` id; `<slug>` is a short kebab label.

| Path | Holds |
|---|---|
| `manifest.json` | The example's metadata record (schema below) — the single source of truth for its `id`, source, and reward. |
| `prompt.md` | The trajectory **input**: the task/prompt as the harness received it. |
| `oracle/` | The verified ground truth. `summary.md` (always) and `changed-files.txt` (always); `diff.patch` for small diffs; `lesson.md` for retro examples. |
| `verify.sh` | Dual-mode scorer. **Self-check** with no args (validate the example is internally consistent — manifest, oracle, hash). **Score mode** `verify.sh <candidate-diff>` prints exactly one line `score=<0..1>` rating the candidate against the oracle. |

`oracle/`:

| File | Required | Holds |
|---|---|---|
| `summary.md` | always | Prose statement of what a correct trajectory does and why. |
| `changed-files.txt` | always | Sorted list of paths the trajectory touched — the `content_hash` is taken over this file. |
| `diff.patch` | small diffs only | The literal patch (see *Size discipline*). |
| `lesson.md` | retro examples | The distilled lesson the retro produced. |

## `manifest.json` fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | `DS-NNN`; matches the folder's `DS-id` and the `## Catalogue` row. |
| `slug` | string | yes | Kebab label; matches the folder's `<slug>`. |
| `dataset` | string | yes | Trajectory class: `ship-spec-prs` \| `autopilot-runs` \| `retro-cycles`. |
| `title` | string | yes | Human-readable one-line title. |
| `created` | date | yes | UTC `YYYY-MM-DD` the example was captured. |
| `source` | object | yes | Provenance. PR examples: `{repo, pr, issue, merge_commit, url}`. Retro examples: `{repo, memory_ref, lesson_date, origin}`. |
| `trajectory` | object | yes | `{kind, outcome}` — e.g. `kind: "ship-spec"`, `outcome: "merged"`. |
| `skills` | array | yes | Skills the trajectory exercised (e.g. `["ship-spec","eval"]`). |
| `reward_kind` | array | yes | One or more reward modes (table below). |
| `oracle` | object | yes | `{summary, changed_files, changed_file_count, diff?, lesson?}` — relative paths into `oracle/` plus the file count; `diff`/`lesson` present only when stored. |
| `content_hash` | string | yes | `sha256:<hex>` taken over `oracle/changed-files.txt` — the drift anchor. |
| `capability_tasks` | array | yes | `CB-NNN` ids in [`../capability/`](../capability/README.md) this example feeds (may be empty). |
| `notes` | string | no | Free-form caveats. |

## `reward_kind` modes (Repo2RLEnv-style)

`reward_kind` is an **array** — an example may carry several, and `verify.sh`
combines them into its single `score=<0..1>`.

| Mode | Reward signal |
|---|---|
| `diff_similarity` | Candidate diff scored against `oracle/diff.patch` (small diffs) or `oracle/changed-files.txt` (large diffs — path-set overlap). |
| `test_execution` | A named probe/test gates the reward — the candidate must make it pass. |
| `artifact_presence` | Expected files / PR-state exist (e.g. the PR merged, the changed files are present). |

## Size discipline

Keep the corpus small and git-friendly:

- **Small diffs (≲ 200 lines):** store the literal `oracle/diff.patch`. It is the
  canonical oracle and `diff_similarity` scores directly against it.
- **Large diffs:** do **not** vendor the patch. Store `oracle/changed-files.txt`
  + the `source.merge_commit` ref (git history is the canonical oracle) + a prose
  `oracle/summary.md`. `diff_similarity` falls back to path-set overlap over
  `changed-files.txt`, and the commit ref lets a scorer reconstruct the full diff
  on demand.

## Catalogue

Every example folder's `id` appears here, and every row id maps to a real
folder (the `evals/probes/datasets-schema.sh` drift guard enforces both
directions; column 1 is the bare `DS-NNN`).

| id | dataset | title | source | reward_kind |
|---|---|---|---|---|
| DS-001 | ship-spec-prs | Add default Pi Monitor support | PR #147 (closes #146) | diff_similarity, artifact_presence |
| DS-002 | ship-spec-prs | Run pnpm security audits in CI | PR #172 (closes #171) | diff_similarity, artifact_presence, test_execution |
| DS-010 | autopilot-runs | Correct the /harness-audit memory path | PR #177 (closes #176) | diff_similarity, artifact_presence |
| DS-020 | retro-cycles | Brief critics with diverse lenses (retro lesson) | /retro 2026-05-11 → memory/MEMORY.md | artifact_presence, diff_similarity |

## Pointers

- [`../README.md`](../README.md) — the probe suite (the regression **floor**).
- [`../capability/README.md`](../capability/README.md) — the capability benchmark (the progress **ceiling**).
- Source inspiration: [huggingface/Repo2RLEnv](https://github.com/huggingface/Repo2RLEnv) — turning a repo's history into verifiable RL environments.
- `context/rules/directory-readme.md` — the directory-README convention this file follows.
