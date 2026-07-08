---
name: blog
argument-hint: "<scenario> [--source <path|url>] [--target <repo|path>] [--slug <slug>] [--promo linkedin,x] [--dry-run]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent
description: |
  Turn a source scenario into a publishable blog post. First supported playbook:
  Loom/demo-to-blog, where a raw notes file plus Loom screenshots become a
  polished site post after Advisor briefing, photo/text alignment audit, site
  convention audit, narrative/fact-check audit, source-faithful image handling
  (exact URLs or local files downloaded from them), optional social-promotion
  artifact generation, and build verification. Manual-invoke only because it writes content and may spawn
  delegates.
  TRIGGER when: /blog <scenario> invoked; asked to create a blog post from a
  Loom/video/demo/transcript/screenshots; asked to turn .claude/specs/<name>/
  demo.md into an openharness-web blog post.
---

# Blog

Create a publishable blog post from `$ARGUMENTS`. This is a **task skill**: it may write files, localize assets, spawn delegates, and run target-site validation. Do not use it for casual copy edits.

Arguments received: `$ARGUMENTS`

## Dispatch

1. If `$ARGUMENTS` is empty, ask for a one-line scenario and stop.
2. Parse any explicit flags:
   - `--source <path|url>` — raw notes, transcript, Loom URL, or source folder.
   - `--target <repo|path>` — blog repo or site root. Treat `/worktrees ...` as repo-relative `.oh/worktrees/...`, never filesystem root.
   - `--slug <slug>` — target post slug, lowercase kebab-case.
   - `--promo linkedin,x` — also generate a reviewable social promotion artifact; never publish.
   - `--dry-run` — perform audits and propose filename/outline only; write nothing.
3. Route to the first playbook, `references/loom-to-blog.md`, when the scenario mentions Loom, video, demo, transcript, screenshots, `demo.md`, or a source under `.claude/specs/`.
4. If no playbook fits, say the only implemented reference is `loom-to-blog` and ask whether to adapt it.

## Required first read

For Loom/demo work, read and follow:

- `${CLAUDE_SKILL_DIR}/references/loom-to-blog.md`

That reference is authoritative for the workflow details. This `SKILL.md` only defines dispatch, boundaries, and shared completion rules.

## Shared rules

- **Use Advisor before drafting.** For non-trivial source material, read `.oh/agents/advisor.md` and obtain a tight implementation briefing/delegate plan before spawning workers or writing the post. If the custom `advisor` agent is unavailable, use a planning-capable agent and require the same 5-field Advisor Briefing contract.
- **Audit all media before publishing.** Every source image/video screenshot must be accounted for as keep/drop/reference-only/missing. For Loom/demo.md sources, use source-faithful image handling: either embed the exact source image URLs or save local copies downloaded from those exact URLs when PR/site rendering would otherwise break. Do not publish unredacted screenshots that expose tokens, OAuth callback URLs, private accounts, hostnames, sensitive usage panels, or unrelated personal UI.
- **Target conventions win.** Read the target repo's local `AGENTS.md`/`CLAUDE.md` if present, then inspect existing posts and build scripts before writing.
- **No raw transcript dump.** A blog post needs a hook, narrative structure, concise steps, useful captions, and verified links. Timestamps can inform the outline; they are not the post.
- **Verify before done.** Run the target site's lightweight checks (`typecheck`, `build`, or documented equivalents) unless `--dry-run` was passed. Report exact blockers.
- **Respect existing work.** Check `git status --short` in the target repo before editing. Do not overwrite unrelated dirty files.

## Output contract

At completion, report:

```markdown
Post: <path>
Assets: <path or none>
Promo: <path or none>
Audits: <summary of delegates/media coverage>
Verify: <commands and pass/fail>
Result: CREATED | DRY-RUN | BLOCKED
```

## Memory Protocol

Append a log entry to `.oh/memory/<UTC-date>/log.md` for every invocation:

```markdown
## blog -- HH:MM UTC
- **Result**: CREATED | DRY-RUN | BLOCKED | FAIL
- **Scenario**: <one-line scenario>
- **Source**: <source path/url or inferred>
- **Target**: <target repo/path or inferred>
- **Post**: <post path or none>
- **Promo**: <promo artifact path or none>
- **Observation**: <one sentence about source quality, media risk, promotion readiness, or verification>
```

Then run the qualify/improve loop from `.oh/skills/retro/references/memory-protocol.md`. Prefer improving this skill or its references over adding duplicate MEMORY.md notes when the lesson is procedural.

## Example

```text
/blog Create blog from @.claude/specs/openharness-demo --target /worktrees openharness-web
```

Expected behavior: read `demo.md`, audit all Loom images, use Advisor plus specialized delegates, write a Docusaurus post in the target blog repo, embed only selected safe screenshots using exact `demo.md` URLs or local files downloaded from those URLs, run validation, and report changed paths.
