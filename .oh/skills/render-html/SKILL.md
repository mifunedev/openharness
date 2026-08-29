---
name: render-html
description: |
  Render an artifact (or in-context material) as a bespoke, self-contained
  HTML file for one-shot human consumption. Writes to ephemeral scratch
  under $TMPDIR — these are consumption artifacts, not source, and
  nothing under .oh/ persists them.
  TRIGGER when: asked to render HTML, generate an HTML report, visualize an
  audit/council/lint/digest, "make this readable", "make a dashboard for",
  or as a follow-up to /audit harness, /strategic-proposal, /audit skills.
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
- `/audit harness` tier-ranked report → filterable findings dashboard
- `/strategic-proposal` council artifact → phase-column roadmap with critic challenges inline
- `/audit skills` verdict matrix → sortable scoring table with CURRENT/STALE/BROKEN/DELETE badges
- Weekly digest of cron liveness (`crons/.cron.log`) → timeline coloured by outcome

## When NOT to use

Skip when the artifact is **source or pipeline input** — Markdown stays the substrate of the harness:
- PRDs (`.oh/tasks/*/prd.md`), briefings, commit messages, PR bodies, `CHANGELOG.md`
- The cron liveness trail itself (`crons/.cron.log`)
- Skill/identity sources (`CLAUDE.md`, `.claude/skills/`)
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
OUT_DIR="${TMPDIR:-/tmp}/oh-render/$TODAY"             # ephemeral, outside the repo
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/<slug>.html"
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
1. The absolute path to the file (under `$TMPDIR/oh-render/<date>/`), and that it is ephemeral — copy it out to keep it.
2. A one-sentence summary of what was rendered (so the user knows what they'll see).
3. The open command suggestion: `/agent-browser file://<absolute-path>` (or `open file://...` if running locally).

## Anti-patterns

- **Templating.** "Generic dashboard template, fill in the variables." Defeats the thesis. Generate bespoke each time.
- **External assets.** CDN links to Tailwind, Google Fonts, Chart.js, etc. The artifact must work offline and travel as one file.
- **Decorative JS.** Animations, fade-ins, gradients. The reader is making a decision, not watching a demo.
- **Rendering source.** Producing `prd.html`, `CLAUDE.html`, `IDENTITY.html`. Those files are pipeline input or indexed source — leave them in Markdown.
- **Multi-file output.** Separate `.css`/`.js` companions. Single file or nothing.
- **Writing anywhere under the repo.** The output is ephemeral scratch, never a tracked or ignored path inside `.oh/`. No exceptions.
- **Overwriting an existing artifact.** Suffix `-2`, `-3` instead — older renders may still be referenced in the conversation.

## Examples

```
/render-html audit-harness-tier --from /tmp/audit-raw.md --intent "pick next 3 actions"
→ $TMPDIR/oh-render/2026-05-18/audit-harness-tier.html

/render-html roadmap-council --intent "review council deliberation before publishing pinned issue"
→ $TMPDIR/oh-render/2026-05-18/roadmap-council.html
  (source was the strategic-proposal output already in context)

/render-html week-19-digest --from crons/.cron.log --intent "what ran this week"
→ $TMPDIR/oh-render/2026-05-18/week-19-digest.html
```
