# Evidence — docs-project-root

- **PR**: #859 (`mifunedev/openharness`, base `development`) · **Branch**: `task/857-docs-project-root`
- **Audit run**: `audit-20260827T022431Z-805` · **Verdict**: `AUDIT-PASS`

## Why this is better

Before this change, the 50-file GitHub-readable documentation tree lived at `.oh/docs/`. Active guidance, catalogs, and guards therefore used a control-plane path, and the `.oh` payload included the tree. The tree now lives at root `docs/`; active consumers use `docs/...`, while the payload remains `.oh`-scoped. The migration provides a claimed, unmeasured improvement in GitHub discovery and path clarity. The build measured no user-time metric. The cost was 115 changed paths across 10 branch commits, including catalog, test, probe, wiki, and CI updates.

## What the plan asked for

Move the complete tracked documentation tree to root `docs/` without a duplicate or compatibility symlink. Update current repository, CLI, script, skill, wiki, template, test, probe, and CI references while preserving historical records and the external rendered-site boundary. Keep root documentation human-facing and keep `oh init` and `oh update` writes inside target `.oh/`. Refresh current knowledge, fixtures, and generated evaluation results.

## What was built

The build moved the exact 50-file tree from `.oh/docs/` to `docs/`; `.oh/docs/` is absent and root `docs/` contains only Markdown and `_category_.json` metadata. Relative repository links, active guidance, catalogs, skills, wiki entries, templates, payload guards, lifecycle checks, and CI filters now use the root location. The manifest no longer includes `docs/**`, and the payload tests preserve a project's root docs. The build refreshed the wiki index and affected source-backed entries, and the generated eval scoreboard is green.

## Where it diverged from the plan, and why

None in product scope. The build retained historical changelog, archived task, raw snapshot, and preserved-rationale records as planned.

Process note: the post-build `/eval` ran once while `HEAD` was `0cfa5908`. Commit `4ef39eee` contains only the generated `.oh/evals/RESULTS.md` and the task eval record; the two states contain no implementation-file changes. The audit reads the record under key `4ef39eee`, its implementation `HEAD`, and reused it without a second eval run.

## What remains unverified

The task graph omits browser-verification criteria, so the UI gate does not run. The build did not run a browser session or capture a screenshot. The workflow leaves human review and merge to the reviewer. The separate final PR proof audit is a downstream promotion gate, and the PR body reports it after the workflow commits this document.

## Proof by gate

| Gate | Check | Observed | Result |
|------|------------------|----------|--------|
| Task graph | `prd.json` stories and artifact contract | `graph 4/4`; no artifact-contract violation | PASS |
| Regression floor | `/eval` runner exit and delta | `rc=0`; 97 probes; no new green→red regression; no pre-existing reds | PASS |
| Promotable / CI | Focused PR classifier | `promotable=true`, `readyForReview=true`, `evidenceComplete=true`, `CI PASS`, `MERGEABLE/CLEAN` | PASS |
| UI | Browser criteria | `n/a` — no story declares browser verification | N/A |

## Observed output

```text
$ find docs -type f -print | wc -l; test -e .oh/docs && echo yes || echo no
50
no
$ find docs -type f ! -name '*.md' ! -name '_category_.json' -print | wc -l
0
$ jq '[.paths[]? | select(test("(^|/)docs"))] | length' .oh/manifest.json
0
$ grep -n 'docs/**' .github/workflows/ci-harness.yml
12:      - "docs/**"
35:      - "docs/**"
$ jq -r '[.userStories[] | select(.passes == true)] | length' .oh/tasks/docs-project-root/prd.json
4

$ bash .oh/evals/probes/audit-stale-references.sh
PASS: no active legacy audit references across tracked active surfaces
$ bash .oh/evals/probes/docs-build-fast-path.sh
PASS: docs site externalized to mifunedev/openharness-web; docs holds markdown only (no build machinery)
$ bash .oh/evals/probes/oh-payload-manifest.sh
PASS: .oh payload manifest excludes root docs and patches; matcher + integration wired
$ bash .oh/evals/probes/artifact-contract-audit.sh
PASS: production implementation Gate 1 behavior and adversarial contracts
$ bash .oh/evals/probes/wiki-readme-index.sh
PASS: .oh/skills/wiki/corpus/README.md Index matches the git-tracked corpus/*.md frontmatter

$ bash .claude/skills/eval/run.sh
...
skills-vendored                  PASS        unchanged
...
wiki-readme-index                PASS        unchanged
workflow-boundaries              PASS        unchanged
ran 97 probe(s); wrote /home/sandbox/harness/.oh/worktrees/task/857-docs-project-root/.oh/evals/RESULTS.md
$ cat /tmp/docs-project-root-eval.rc
0

$ gh pr checks 859 --repo mifunedev/openharness --json name,state,bucket,workflow --jq '.[] | {name,state,bucket,workflow}'
{"bucket":"pass","name":"Lint, Typecheck, Build \u0026 Test","state":"SUCCESS","workflow":"CI: Harness"}
{"bucket":"pass","name":"Validate sandbox compose and image build","state":"SUCCESS","workflow":"CI: Sandbox Boot Guard"}
{"bucket":"pass","name":"Boot Path Lint (shellcheck + hadolint)","state":"SUCCESS","workflow":"CI: Harness"}
{"bucket":"pass","name":"Eval Probe Regression Gate","state":"SUCCESS","workflow":"CI: Harness"}

$ .oh/skills/audit/scripts/audit-run.sh implementation docs-project-root --pr 859 --repo mifunedev/openharness --base development --branch task/857-docs-project-root
Gate 4 not applicable — no browser-verification criteria in the task graph; `agent-browser` was not invoked.
- **Verdict**: AUDIT-PASS
- **Gates**: graph 4/4 · eval 0 (reused record, commit `4ef39ee` == HEAD; no new regressions, no pre-existing reds) · promotable `promotable=true, readyForReview=true, evidenceComplete=true, CI PASS, MERGEABLE/CLEAN` · ui n/a
AUDIT-EVIDENCE: AUDIT-PASS
audit -- run-id=audit-20260827T022431Z-805 target=implementation state=complete verdict=AUDIT-PASS exit=0 started=2026-08-27T02:24:31Z finished=2026-08-27T02:25:02Z
```

## Acceptance criteria → proof

| Story | Criterion | Proof |
|-------|-----------|-------|
| US-001 | Exact relocation with no legacy tree or symlink | Observed counts show 50 root files, `.oh/docs` absent, and 0 disallowed root-doc file types. The implementation audit reports `graph 4/4`. |
| US-001 | Links, external-site boundary, and quality checks | `audit-stale-references.sh` and `docs-build-fast-path.sh` pass. CI reports `Lint, Typecheck, Build & Test` pass. |
| US-002 | Current guidance, catalogs, skills, wiki, templates, and active references | `audit-stale-references.sh` passes; the implementation audit reports all four stories pass. CI reports the harness checks pass. Historical exceptions remain unchanged. |
| US-003 | `.oh` payload boundary and root-doc preservation | The manifest has 0 docs entries; `oh-payload-manifest.sh` and `artifact-contract-audit.sh` pass. `ci-harness.yml` has `docs/**` filters at lines 12 and 35. |
| US-004 | Durable knowledge, index, fixtures, and generated eval results | `wiki-readme-index.sh` passes; `/eval` exits 0 after 97 probes; `RESULTS.md` is runner-generated; the implementation audit reports no new regression. |

## Gaps and non-gating findings

- UI gate: not applicable; no browser criterion exists.
- The classifier reported `size-convention` and `readyToMerge=false` because PR #859 was still a draft. The implementation audit identifies these as non-gating downstream promotion state.
- The run observed no pre-existing eval reds and no new eval regression.
