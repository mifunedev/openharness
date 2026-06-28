# GitHub repository research wiki ingest

Use this when the source to study/index is a GitHub repository and the user asks for knowledge, technique, best approach, integration fit, or a quantified judgment.

## Goal

Produce a bounded wiki entry that is more useful than a README summary: capture what the project does, how it is implemented, how mature it appears, how it maps to the local project, and what concrete integration/evaluation path is recommended.

## Data to collect

Prefer GitHub API and raw-content reads when a clone is unnecessary or blocked by approval/sandbox policy.

Minimum source packet for `.mifune/skills/wiki/corpus/raw/<date>-<slug>.md`:

- `gh repo view owner/repo --json nameWithOwner,description,stargazerCount,forkCount,defaultBranchRef,licenseInfo,repositoryTopics,pushedAt,createdAt,updatedAt,url,homepageUrl`
- README raw content or a concise README summary
- latest release metadata when relevant: tag, date, assets
- repository tree/file list via `gh api repos/owner/repo/git/trees/<branch>?recursive=1`
- focused excerpts from implementation/test/config files that explain the technique, not a full mirror
- local project scan results only when the user asked about integration into the current project

## Synthesis shape

In `.mifune/skills/wiki/corpus/<slug>.md`, include:

1. What it is and why it matters.
2. Implementation mechanics that a future agent can reuse.
3. Local integration recommendation, explicitly separating:
   - required dependency fit
   - optional/documentation fit
   - probe/eval fit
4. A quantitative judgment when the user asks to “quantify and judge” (e.g. `conceptual fit 9/10`, `direct dependency fit 5/10`, `docs/probe fit 8/10`).
5. Limitations and failure modes, especially where the tool can be misused.

Keep the wiki entry under the standard 600-word cap. Put raw excerpts and scan details in the raw snapshot.

## Local integration scans

When assessing integration into OpenHarness or another current repo, scan for direct touchpoints. For example, for installer-safety tools, search for `curl | bash`, `wget | sh`, and installer docs/examples, then recommend a measurable gate such as “0 public one-liners without nearby safe-review alternative.”

## Pitfalls

- Do not require a new third-party tool as a host dependency just because it is useful; preserve the project’s stated dependency contract unless the user explicitly asks to change it.
- If `git clone` is blocked by an approval or sandbox gate, do not retry the same outcome by another command. Use non-clone GitHub API/raw reads if sufficient, and state the limitation in the final report.
- Do not turn the raw snapshot into a full repository mirror. Capture concise excerpts that justify the wiki judgment.
