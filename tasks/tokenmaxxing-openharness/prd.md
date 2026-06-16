# PRD: Tokenmaxxing With Open Harness

## Introduction

Add a Docusaurus blog post explaining how Open Harness treats "tokenmaxxing" as a harness-building pattern rather than a productivity leaderboard. The post should use the current tokenmaxxing discourse as the hook, then land on a concrete workflow: spend frontier tokens where they improve comparison, critique, and spec quality, while routing implementation through project-specific Pi or Hermes workflows and lower-cost models where appropriate.

## Goals

- Publish one dated blog post at `blog/2026-06-16-tokenmaxxing-openharness.md`.
- Preserve the provided thesis and frontmatter exactly where specified.
- Keep the voice consistent with recent Open Harness posts: concrete, opinionated, grounded in workflow mechanics, and light on abstract hype.
- Verify Docusaurus frontmatter, MDX syntax, route generation, tags, and links with `pnpm docs:build`.

## User Stories

### US-001: Select and verify the trend-hook sources

**Description:** As a maintainer, I want the external tokenmaxxing references verified before drafting so that the post uses the current discourse as context without depending on vague or inaccessible claims.

**Acceptance Criteria:**

- [ ] Verify at least three of these source URLs are reachable enough to confirm title/date or source context:
  - Business Insider: `https://www.businessinsider.com/pylon-ceo-tokenmaxxing-era-coming-to-end-ai-spend-limits-2026-6`
  - Fortune: `https://fortune.com/2026/05/28/tokenmaxxing-is-dead-companies-didnt-get-the-roi-from-ai-they-wanted-to-see/`
  - WSJ: `https://www.wsj.com/cio-journal/why-some-companies-say-ai-tokenmaxxing-is-key-to-survival-e699a128`
  - Windows Central: `https://www.windowscentral.com/artificial-intelligence/microsoft-ceo-satya-nadella-says-ai-tokenmaxxing-is-costly-im-a-tokenmaxxer-too-its-addictive`
- [ ] If a source is paywalled or only partially accessible, use it only as a link/context marker and do not make unsupported factual claims from behind the wall.
- [ ] The post must summarize trend reporting only as the hook; the center of the post must remain Open Harness workflow mechanics.
- [ ] Typecheck/build validation is deferred to US-003.

### US-002: Add the tokenmaxxing blog post

**Description:** As a maintainer, I want a concrete Open Harness blog post about tokenmaxxing so that readers understand when frontier-token spend improves the harness and when it becomes a fake productivity metric.

**Acceptance Criteria:**

- [ ] Create `blog/2026-06-16-tokenmaxxing-openharness.md`.
- [ ] Include this exact frontmatter:
  - `title: "Tokenmaxxing is how you build the harness, not how you measure the work"`
  - `description: "Tokenmaxxing is a bad leaderboard metric, but a useful harness-building pattern: spend frontier tokens on comparison and critique, then route implementation through custom Pi or Hermes workflows."`
  - `date: 2026-06-16`
  - `authors: [ryan]`
  - `tags: [agents, ai-engineering, tokenmaxxing, open-harness]`
  - `slug: tokenmaxxing-openharness`
- [ ] Include `<!-- truncate -->` near the top, consistent with existing posts.
- [ ] Include a section or paragraph that explicitly rejects usage leaderboards and token burn as fake productivity.
- [ ] Include a section or paragraph that defines useful tokenmaxxing as frontier comparison that improves a custom harness.
- [ ] Include the required role claims:
  - Codex `xhigh`: ideation, brainstorming, plan comparison, `/ship-spec` shaping, and spec critique.
  - Pi: the main coding harness when the goal is project-specific implementation behavior with fallback models.
  - Hermes: an optional primary harness when the workflow needs persistent memory, self-improving skills, or Slack/chat operator surfaces.
  - Claude: audit, compound, compress, eval, and high-confidence review loops.
  - Haiku or similar smaller models: cleanup, summarization, formatting, and low-risk polish.
- [ ] Frame those roles as situational choices inside one single-developer, single-project workflow, not as an enterprise model-routing product or simultaneous multi-tenant orchestration layer.
- [ ] Distinguish default/current Open Harness behavior from optional Pi/Hermes harness choices.
- [ ] Close with the claim that frontier models should raise the quality of the harness and spec, while implementation should increasingly flow through the custom harness.
- [ ] Do not rank vendors, publish a model benchmark, or claim one harness is universally superior.
- [ ] Use the source links selected in US-001 only as the hook.
- [ ] Read these source paths before writing role claims: `AGENTS.md`, `context/TOOLS.md`, `context/USER.md`, `.claude/skills/ship-spec/SKILL.md`, and any relevant `wiki/*hermes*.md` / `wiki/*pi*.md` entries that exist.

### US-003: Record and verify the blog addition

**Description:** As a maintainer, I want the new public blog post recorded and built so that the release notes include the user-visible documentation addition and the Docusaurus route is known-good.

**Acceptance Criteria:**

- [ ] Add one `CHANGELOG.md` entry under `## [Unreleased]` → `### Added`.
- [ ] The changelog entry is one imperative-mood line and includes the task issue or PR link per `.claude/rules/git.md`.
- [ ] The entry references the tokenmaxxing Open Harness blog post.
- [ ] `pnpm docs:build` passes after the changelog update.
- [ ] After `pnpm docs:build`, `test -f packages/docs/build/blog/tokenmaxxing-openharness.html` passes.

## Functional Requirements

- FR-1: The post must be a Docusaurus-compatible Markdown/MDX blog document.
- FR-2: The post must use `<!-- truncate -->` near the top, consistent with existing blog posts.
- FR-3: The post must not claim token usage itself is a valid productivity metric.
- FR-4: The post must position Open Harness as a single-developer harness and not as an enterprise token-governance product.
- FR-5: The post must not add or remove protected-path files.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: `wiki/ship-spec-orchestration.md`
- **Spec alignment**: The branch now updates `/ship-spec` itself, so the wiki must describe the skill as the spec-to-implementation commitment boundary and include the new wiki-alignment responsibility.
- **DeepWiki comparison**: Compared against `https://deepwiki.com/mifunedev/openharness`, whose Open Harness pages use relevant source files, line-backed architecture prose, subsystem relationship diagrams, and navigation. The local entry now follows that page shape and cites `AGENTS.md`, `.claude/skills/ship-spec/SKILL.md`, and `scripts/ralph.sh`.
- **Acceptance criteria**: Keep `wiki/ship-spec-orchestration.md` aligned with the `/ship-spec` skill, preserve DeepWiki-style relevant source files and system relationships, and verify `bash evals/probes/wiki-readme-index.sh`.

### US-004: Align ship-spec wiki handling with DeepWiki

**Description:** As a maintainer, I want `/ship-spec` to require wiki updates that match the spec and are compared against DeepWiki so that conceptual changes leave durable, source-backed documentation.

**Acceptance Criteria:**

- [ ] Update `.claude/skills/ship-spec/SKILL.md` so PRDs include a `## Wiki Alignment` section before critics run.
- [ ] Require required wiki updates to compare the local spec/wiki against the relevant DeepWiki page(s).
- [ ] Require post-implementation wiki revision when `Wiki Alignment` is `REQUIRED`.
- [ ] Update the Ralph prompt template so workers see the wiki alignment gate.
- [ ] Keep `wiki/ship-spec-orchestration.md` aligned with the revised `/ship-spec` behavior and DeepWiki-style source-backed structure.
- [ ] Verify `bash evals/probes/wiki-readme-index.sh`.

## Non-Goals

- Do not add new docs pages, landing pages, components, images, or Docusaurus configuration.
- Do not implement usage metering, token dashboards, model routers, or runtime behavior.
- Do not edit protected-path entries or orchestrator skills.
- Do not write a broad industry analysis post; external links are only the hook for the Open Harness workflow argument.
- Do not publish a model benchmark, vendor ranking, cost/performance leaderboard, or claim that one harness is universally superior.
- Do not present Open Harness as an enterprise token-governance product or multi-tenant orchestration layer.

## Technical Considerations

- Existing blog posts live in `blog/` and use YAML frontmatter, `authors: [ryan]`, tags, and a `slug`.
- The docs build command is `pnpm docs:build`.
- Current tokenmaxxing references include Business Insider, Fortune, WSJ, and Windows Central coverage; US-001 pins exact URLs and defines how to handle paywalled/partially accessible sources.

## Critique Resolution

Critics found 0 high-severity findings, 6 medium-severity findings, and 3 low-severity findings. The risks were acknowledged and mitigated by splitting the work into source-selection, article-authoring, and verification stories; pinning source URLs; adding built-route verification; requiring single-developer framing; clarifying Hermes as optional; and tightening the changelog requirement.

## Success Metrics

- `pnpm docs:build` completes successfully.
- The new route for `tokenmaxxing-openharness` is generated by Docusaurus.
- The post reads like a concrete Open Harness workflow essay rather than a metric-governance essay.

## Open Questions

- None. The supplied plan is authoritative for scope and thesis.
