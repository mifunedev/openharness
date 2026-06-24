# Official-docs research wiki entries

Use this pattern when a user asks to "add to wiki" but the source is a seed URL and the actual deliverable is durable understanding of a broader topic.

## Pattern

1. Treat the task as knowledge capture unless the user explicitly asks for product/runtime changes.
   - If a social/link post is only a pointer, do not let it define the implementation scope.
   - Start from the official/source-of-truth documentation when the user names it or when the seed topic is a tool/platform feature.
2. Create a plan-only checkpoint if the user asks to inspect before implementation.
   - In Open Harness, save plans under `.claude/plans/`.
   - Open a draft PR containing only the plan and any branch-convention/doc housekeeping the user approved.
   - Stop for confirmation before writing the wiki implementation.
3. Use subagents for research and audit, not direct tracked wiki writes.
   - Research subagents collect source-backed findings and identify related official docs.
   - Subagents may draft proposed wiki text, but the orchestrator owns writes to `.mifune/skills/wiki/corpus/raw/`, `.mifune/skills/wiki/corpus/<slug>.md`, and cross-links.
4. Snapshot every authoritative source that materially supports the final entry.
   - Prefer official docs over social posts, blog summaries, or inferred behavior.
   - Keep raw snapshots immutable and synthesized entries bounded by `.mifune/skills/wiki/references/schema.md`.
5. Cross-link counterpart concepts rather than merging unrelated domains into one page.
   - Example: a Claude Code workflows page can link to an inspectable-agent-harness/Pi workflows page as a related counterpart while keeping each page focused.
6. Audit before finalizing.
   - Check source faithfulness, unsupported claims, frontmatter/schema compliance, word-count cap, and reciprocal cross-links.

## Common pitfall

Do not convert a wiki research request into a runtime/product implementation plan just because the topic is an implementation mechanism. The "implementation" may be the wiki artifact itself: raw snapshots, a synthesized entry, and related-entry cross-links.