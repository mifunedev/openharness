---
name: render-html
description: |
  Render an artifact (or in-context material) as a bespoke, self-contained
  HTML file for one-shot human consumption. Writes to
  memory/<UTC-date>/<slug>.html. Output is gitignored — these are
  consumption artifacts, not source.
  TRIGGER when: asked to render HTML, generate an HTML report, visualize an
  audit/council/lint/digest, "make this readable", "make a dashboard for",
  or as a follow-up to /harness-audit, /strategic-proposal, /skill-lint.
argument-hint: "<slug> [--from <path>] [--intent <one-line>]"
---

# Render HTML

Take an artifact (file path or in-context material) plus a one-line intent and produce a single, self-contained HTML file optimized for the moment a human reads it once to make a decision.

**Core principle (from Thariq's HTML-over-Markdown thesis):** every invocation produces bespoke HTML, picked widget-by-widget for *this* artifact. **No templates.** A template forces the format back into the Markdown mindset of pre-baked structure and defeats the point.

## When to use

Use when **all three** are true:
1. The artifact is a synthesis the human will read once to decide something.
2. The Markdown version would exceed ~100 lines or carry signal a table/SVG/collapsible would express more cleanly (severity, dependency, status, time).
3. No downstream pipeline (Ralph, GitHub, another LLM, grep) consumes the artifact.

Common targets in this harness:
- `/harness-audit` tier-ranked report → filterable findings dashboard
- `/strategic-proposal` council artifact → phase-column roadmap with critic challenges inline
- `/skill-lint` verdict matrix → sortable scoring table with CURRENT/STALE/BROKEN/DELETE badges
- Weekly memory digest from N days of `log.md` → timeline coloured by skill outcome

## When NOT to use

Skip when the artifact is **source or pipeline input** — Markdown stays the substrate of the harness:
- PRDs (`tasks/*/prd.md`), briefings, commit messages, PR bodies, `CHANGELOG.md`
- Memory log entries themselves (`memory/<date>/log.md`)
- Skill/rule/identity sources (`CLAUDE.md`, `context/rules/`, `.claude/skills/`)
- Agent-to-agent handoffs (advisor → executor briefings)

If asked to render any of the above, refuse and explain.

## Instructions

### 1. Parse arguments

Arguments received: `$ARGUMENTS`

| Position | Meaning |
|----------|---------|
| `$0` | **slug** (required, kebab-case, no extension) — becomes the filename |
| `--from <path>` | optional source artifact to read |
| `--intent <one-line>` | optional human-purpose hint (e.g. "pick next 3 audit actions") |

If `slug` is missing, ask the user for one. Slug rules: lowercase, kebab-case, no slashes, no `.html` extension.

If `slug` collides with an existing file in today's date directory, append `-2`, `-3`, etc. — never overwrite.

### 2. Resolve output path

```bash
TODAY=$(date -u +%Y-%m-%d)
mkdir -p "memory/$TODAY"
OUT="memory/$TODAY/<slug>.html"
```

Always use UTC. Always create the directory first.

### 3. Gather source material

- If `--from` is given: read the file. If it does not exist, error out — do not invent content.
- If `--from` is absent: use the conversation context the orchestrator already has. Do not re-fetch what you already know.
- If both are absent and the conversation has no obvious artifact: ask the user what to render.

### 4. Generate bespoke HTML

Produce **one** self-contained `.html` file. Rules:

- **Single file, inline everything.** All CSS in `<style>`. All SVG inline. No `<link>` to external CSS or fonts. No `<script src="https://...">`. The artifact must work offline and travel as one file.
- **Semantic HTML5.** `<header>`, `<main>`, `<section>`, `<nav>`, `<table>`, `<details>`/`<summary>` for collapsibles. Skip divs when a semantic tag fits.
- **System-font stack.** `font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;` — no Google Fonts.
- **Colour as meaning, not decoration.** Severity, status, phase. Pick a small palette (3–5 tokens) and apply consistently. Include a legend if non-obvious.
- **Pick widgets for the data shape:**
  - tabular → `<table>` with sortable headers (inline JS allowed for sort/filter only)
  - dependency / flow → inline `<svg>`
  - long evidence → `<details>` (collapsed by default past the third one)
  - timelines → flex row with date axis, or inline SVG
  - multi-perspective synthesis → tabs or side-by-side columns
- **Print-friendly.** Add `@media print` rules that expand `<details>` and drop interactive chrome.
- **Header block.** Title, generated-at UTC timestamp, source citation (path or "in-context"), one-line intent.
- **JavaScript is opt-in, not default.** Only include JS when interaction earns its keep (filter, sort, copy-to-clipboard, expand-all). Never for animations. Never for analytics.
- **No external fetches at runtime.** No `fetch()`, no images by URL — use inline SVG or data URIs only.

### 5. Write the file

Use the `Write` tool. Confirm the byte size is plausible (>2 KB for any non-trivial artifact, <500 KB unless the artifact genuinely warrants it).

### 6. Report to the user

Return three lines:
1. Absolute path: `memory/<date>/<slug>.html`
2. A one-sentence summary of what was rendered (so the user knows what they'll see).
3. The open command suggestion: `/agent-browser file:///home/sandbox/harness/memory/<date>/<slug>.html` (or `open file://...` if running locally).

### 7. Memory Protocol

Append to `memory/<UTC-date>/log.md`:

```markdown
## render-html -- HH:MM UTC
- **Result**: OP | DRY-RUN | PARTIAL | FAIL
- **Slug**: <slug>
- **Source**: <path or "in-context">
- **Intent**: <one-line>
- **Path**: memory/<date>/<slug>.html
- **Size**: <bytes>
- **Observation**: <one sentence — what shape the artifact took, e.g. "filterable severity table with 17 rows + inline SVG dependency map">
```

Then run the qualify/improve loop per `context/rules/memory.md`. If you learned something non-obvious about which HTML shape suited this artifact type, that may merit a line in `memory/MEMORY.md`.

## Anti-patterns

- **Templating.** "Generic dashboard template, fill in the variables." Defeats the thesis. Generate bespoke each time.
- **External assets.** CDN links to Tailwind, Google Fonts, Chart.js, etc. The artifact must work offline and travel as one file.
- **Decorative JS.** Animations, fade-ins, gradients. The reader is making a decision, not watching a demo.
- **Rendering source.** Producing `prd.html`, `CLAUDE.html`, `MEMORY.html`. Those files are pipeline input or indexed source — leave them in Markdown.
- **Multi-file output.** Separate `.css`/`.js` companions. Single file or nothing.
- **Writing outside `memory/<date>/`.** No exceptions. The location is the convention.
- **Overwriting an existing artifact.** Suffix `-2`, `-3` instead — older renders may still be referenced in the conversation.
- **Skipping the memory log.** Every run logs, op or fail. The qualify/improve loop is not optional.

## Examples

```
/render-html harness-audit-tier --from memory/2026-05-18/audit-raw.md --intent "pick next 3 actions"
→ memory/2026-05-18/harness-audit-tier.html

/render-html roadmap-council --intent "review council deliberation before publishing pinned issue"
→ memory/2026-05-18/roadmap-council.html
  (source was the strategic-proposal output already in context)

/render-html week-19-digest --from memory/ --intent "what shipped this week"
→ memory/2026-05-18/week-19-digest.html
```
