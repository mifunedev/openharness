# Loom-to-Blog Playbook

Use this reference when `/blog <scenario>` names a Loom/video walkthrough, a raw `demo.md`, screenshots, or a source folder under `.claude/specs/`. The goal is a publishable blog post, not a transcript cleanup.

## Inputs and inference

Resolve the scenario from `$ARGUMENTS`:

- Source path: prefer explicit `--source`; otherwise extract `@path`, a `.claude/specs/<slug>` folder, `demo.md`, or a Loom URL.
- Target repo/path: prefer explicit `--target`; if the user says `/worktrees <repo>`, resolve it under the harness worktrees root (`bash .oh/scripts/oh-path worktrees --no-create`) and search `project/*/<repo>` before treating it as a branch worktree.
- Post slug/date: prefer explicit `--slug`; otherwise derive a lowercase kebab-case slug from the title/subject, ≤6 words. Use UTC date unless target repo conventions require otherwise.
- Image policy: for Loom/demo.md sources, preserve source fidelity. Either embed selected screenshots with the exact source image URLs from the raw document, or save local files downloaded from those exact URLs when PR/site rendering would otherwise break.
- Promotion artifact: if `--promo linkedin,x` (or similar) is present, generate a reviewable social promotion artifact after drafting the post. Never publish from `/blog`.
- Dry-run: if `--dry-run`, perform steps through the proposed outline/assets plan and stop before writes.

If either source or target cannot be inferred, ask one concise question listing the missing value(s). Do not guess a publication target.

## Step 1 — Read local context and target conventions

1. Check applicable `AGENTS.md`/`CLAUDE.md` files for the target path and follow the most specific instructions.
2. In the target repo, read:
   - `README.md`
   - package/config files that reveal framework and validation commands (`package.json`, Docusaurus config, etc.)
   - 2-3 recent posts in the destination blog/content directory
   - authors/tags conventions if present
3. Run `git -C <target> status --short --branch`. If unrelated dirty files exist, preserve them and avoid broad rewrites.

For Docusaurus targets, default conventions are usually:

```text
blog/YYYY-MM-DD-<slug>.md
static/img/blog/YYYY-MM-DD-<slug>/...
```

Frontmatter pattern:

```yaml
---
title: "<title>"
description: "<one-sentence meta description>"
date: YYYY-MM-DD
authors: [ryan]
tags: [tag-one, tag-two]
slug: <slug>
---
```

Place `<!-- truncate -->` after the intro hook.

## Step 2 — Ingest source and enumerate media

1. Read the raw source file(s) completely enough to capture every section, timestamp, link, command, and screenshot reference.
2. Extract all Markdown images and remote screenshot URLs.
3. Download remote screenshots into a temporary cache such as `/tmp/<slug>-images/` for inspection only:

```bash
mkdir -p /tmp/<slug>-images
# extract URLs from the source, then curl -fsSL each into numbered files
```

4. Inspect every screenshot with the image-capable read tool. Account for missing screenshots explicitly.
5. Build an audit table with this shape:

```markdown
| Section/timestamp | Screenshot | What it shows | Text alignment | Keep/drop/reference-only | Caption/alt | Corrections/gaps |
```

### Media safety rules

Drop, crop, or redact screenshots that expose:

- tokens, API keys, PATs, QR/device codes, OAuth callback URLs, or auth success URLs;
- private emails, personal account menus, avatars where unnecessary, hostnames, usernames, or repo URLs that should not be public;
- model usage limits, billing/account pages, or unrelated private browser tabs;
- dangerous status text that will distract from the article, such as bypass/skip-permissions banners, unless the post is explicitly about that risk.

If you cannot safely crop/redact with available tools, do not embed the screenshot. Link the Loom instead or describe the step in prose.

## Step 3 — Advisor briefing and delegate wave

Before drafting, run the Advisor pattern:

1. Read `.oh/agents/advisor.md`.
2. Ask an expert Advisor to produce:
   - the 5-field implementation briefing;
   - a bounded delegate plan, max depth 1;
   - exact start paths and acceptance criteria.
3. Spawn specialized read-only delegates in parallel when the source has enough complexity. Use these defaults:

| Delegate | Purpose | Required return |
|---|---|---|
| Source/photo alignment | Audit every source section and screenshot for mismatch, missing media, sensitivity, and keep/drop decisions. | Media audit table + top corrections. |
| Site conventions | Identify filename, frontmatter, image paths, link style, post structure, and validation commands. | Recommended filename/frontmatter/image strategy/checklist. |
| Narrative/SEO/fact-check | Differentiate from existing posts, propose title/meta/tags/outline, and fact-check claims against current docs. | Positioning, outline, corrections, duplicate-risk notes. |

Optional delegates:

- Accessibility/media delegate when many screenshots need alt text/caption treatment.
- Legal/privacy delegate when screenshots include accounts, repos, people, or tokens.
- Target-framework delegate when the destination site is not Docusaurus.

Do not forward delegate output verbatim into the post. Synthesize it.

## Step 4 — Fact-check before writing

Fact-check all product/process claims against current docs or source files in the target/current repo. For Open Harness demo posts, always check:

- default agent CLIs vs optional image-level installs;
- `.oh/` casing and `.oh/worktrees/` path;
- Docker socket posture (off by default; opt in only on trusted hosts);
- GitHub auth wording (`gh auth login`, SSH flow, PAT scopes when relevant);
- VS Code attach vs terminal capabilities, especially port forwarding;
- claims about remote persistence: agents continue after laptop close only when the sandbox host stays awake/remote.

Prefer internal links over restating long setup docs. Example Docusaurus links:

- `/docs/installation`
- `/docs/quickstart`
- `/docs/connecting`
- `/docs/integrations/github`
- `/docs/harnesses/overview`

## Step 5 — Draft the blog post

Write for a reader who wants to repeat the workflow.

Recommended structure:

1. Hook: what the demo proves and why it matters.
2. Short Loom/source link.
3. Setup/install step.
4. Safety/defaults step.
5. Editor/connection step.
6. Agent verification/shared-state step.
7. GitHub/auth step.
8. Worktree/project payoff step.
9. Verification checklist.
10. Main takeaway and next links.

Style rules:

- Do not include a duplicate H1 when target posts use frontmatter title as H1.
- Use concise `##` headings and short paragraphs.
- Use code fences with languages (`bash`, `text`, `yaml`).
- Include only screenshots that earn their space; 3-6 images is usually enough.
- Give every image meaningful alt text. A caption sentence nearby is better than a generic filename.
- Mention the Loom as the full source when screenshots are dropped for privacy/sensitivity.
- Differentiate from existing posts; if a related post already covers auth in detail, link it and keep this post focused.

## Step 6 — Preserve source fidelity for images

For Loom/demo.md sources, every published image must trace to the raw source exactly. Use one of two safe modes:

### Mode A — exact source URLs

Use this when the target renderer reliably displays Loom hotlinks.

1. Embed selected publishable screenshots with the exact URL string found in the raw source file.
2. Verify every embedded image URL is byte-for-byte present in the source document.
3. Do not rewrite Loom URLs or strip query strings.

```markdown
![Alt text](https://loom.com/i/<id>?workflows_screenshot=true)
```

### Mode B — local files downloaded from exact source URLs

Use this when PR previews, the target site, or the user reports Loom hotlinks as broken.

1. Download each selected screenshot from the exact raw URL.
2. Save it under the target asset directory, for example:

```bash
mkdir -p static/img/blog/YYYY-MM-DD-<slug>
curl -fsSL '<exact-url-from-demo.md>' -o static/img/blog/YYYY-MM-DD-<slug>/<descriptive-name>.jpg
```

3. Verify each local file exists and is non-empty.
4. Reference localized assets with target-site paths.
5. Document in the PR/body that local files were downloaded from exact source URLs.

Never commit the temporary `/tmp` inspection cache.

## Step 7 — Generate optional social promotion artifact

When `--promo` is present, create a non-published review artifact for the requested platforms. Default path in a website repo:

```text
promos/YYYY-MM-DD-<slug>.md
```

The artifact should include:

- canonical blog URL (or `after merge: <expected URL>` if not live yet);
- target platform/profile URLs supplied by the user;
- 2-3 LinkedIn variants: one polished main post, one shorter post, one comment/CTA;
- X.com variants: one single-post draft, one 3-5 post thread, one short quote-post variant;
- a feed-native visual plan or generated card that pulls directly from the post: concrete headline, proof path/checkpoints, one relevant screenshot or diagram, and a feedback-oriented CTA;
- suggested hashtags, alt text, and image/asset references;
- UTM/link checklist if the operator wants tracking;
- explicit safety note: review manually, do not auto-publish.

Visual tone rules:

- Prefer grounded value over hype: show what the post helps the reader do, not inflated claims.
- Use copy the audience can evaluate: setup path, guardrails, before/after workflow, or a concrete artifact.
- Include a feedback CTA when the goal is learning from practitioners, e.g. "Feedback welcome from agent builders and operators."
- Avoid generic AI imagery when the post contains real screenshots, diagrams, or code that can prove the workflow.

Do not hardcode personal profile URLs in the skill. Use profile URLs provided in `$ARGUMENTS` or in the user request. If the user asks to actually publish/schedule, stop and hand off to `/post-bridge` with a confirmation gate.

## Step 8 — Verify

Run target-specific checks. For Docusaurus/pnpm sites, typical commands are:

```bash
pnpm run typecheck
pnpm run build
```

If dependencies are missing, run the documented install command only if safe for the target repo; otherwise report the blocker. Inspect build warnings for broken links or MDX parse errors even when the exit code is 0.

Manual final audit:

- Frontmatter parses and matches target conventions.
- `<!-- truncate -->` exists in the right place when target posts use it.
- Every embedded image is source-faithful: either its URL is byte-for-byte present in the source document, or its local file was downloaded from an exact source URL and resolves in the target repo.
- No sensitive screenshot survived.
- All source sections and source images are accounted for in the audit, even if not published.
- The post states what was corrected or qualified from the raw source where that matters.

## Step 9 — Report and log

Return the `/blog` output contract from `SKILL.md`, including the `Promo:` path when generated.

Append the memory log entry described in `SKILL.md`. Then run the qualify/improve loop. If the lesson is procedural, update this playbook instead of adding a MEMORY.md entry.

## Example: Open Harness Loom demo

Scenario:

```text
/blog Create blog from @.claude/specs/openharness-demo --target /worktrees openharness-web
```

Expected actions:

1. Read `.claude/specs/openharness-demo/demo.md`.
2. Extract/download every Loom screenshot.
3. Audit all source sections and images.
4. Use Advisor plus the three default delegates.
5. Write the Docusaurus post under `openharness-web/blog/`.
6. Embed selected safe screenshots with exact `demo.md` URLs or local files downloaded from those exact URLs if Loom hotlinks break.
7. Generate `promos/<date-slug>.md` if social promotion was requested.
8. Run `pnpm run typecheck` and `pnpm run build`.
9. Report changed files and verification.
