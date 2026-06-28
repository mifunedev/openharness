# External Proposal Implementation Audit Pattern

Use this reference when the user asks whether an external article/repo/social post should be implemented into Open Harness and wants an audit/council result captured in a GitHub issue.

## Workflow

1. **Capture the source first**
   - If the request says “Add to Wiki,” run `/wiki ingest` for the URL before or alongside the audit.
   - For LinkedIn/social pages, metadata may be enough to extract the claim when the full body is gated.
   - Prefer small, auditable tool calls: fetch/snapshot, write wiki entry, append log. Avoid one large ingest script that combines network fetch + writes + logging.

2. **Frame the proposal as a decision, not an implementation request**
   - Ask: “Should Open Harness implement this pattern?” not “How do we clone this tool?”
   - Preserve Open Harness’s existing architecture and knowledge surfaces unless the council proves they are insufficient.

3. **Convene at least three perspectives**
   - Product/alignment: user value, fit with Open Harness thesis, overlap with existing surfaces.
   - Implementer/feasibility: file locations, commands, data model, staged MVP, tests, CI.
   - Critic/security/reliability: reasons not to build, sprawl, privacy, concurrency, stale-state risks, gating criteria.

4. **Synthesize into a GitHub issue**
   - Include source URL and wiki entry/snapshot paths.
   - Include council verdict, evidence from repo files, risks, non-goals, recommended MVP, acceptance criteria, and gates before expansion.
   - Use existing labels such as `eval`, `audit`, and `enhancement` when available.

5. **Decide issue create vs update before writing**
   - Search existing issues for the external tool/pattern name and nearby concepts before creating a new issue.
   - If an existing issue already owns the evaluation, update it with a council/audit comment and add missing labels instead of creating a duplicate.
   - Create a new issue only when no existing issue has the same decision scope, or when an accepted evaluation needs a separate implementation build task.

6. **Verify side effects**
   - Verify the GitHub issue URL/comment URL with `gh issue view` or create/comment output.
   - Verify the wiki entry frontmatter and raw snapshot size/path.
   - Append the daily memory log with both wiki ingest and audit/issue outcomes.

## Reusable verdict shape

When the external idea overlaps with an existing Open Harness subsystem, prefer:

> Implement the insight, not the shape.

Then specify:
- What to build inside the existing subsystem.
- What not to introduce yet.
- What gates must be met before a standalone clone/new surface is justified.

## Lat.md case study summary

Source claim: a single flat `AGENTS.md` loses context as codebases grow; Lat.md proposes a project-root markdown knowledge graph with linked architecture/business/test-spec pages plus `lat init`, `lat check`, `lat search`, and `lat section`.

Council-aligned recommendation for Open Harness:
- Extend existing `.mifune/skills/wiki/corpus/` into a codebase knowledge graph v0.
- Keep `AGENTS.md` authoritative for operating rules and permissions.
- Add optional wiki metadata for `type`, `paths`, `symbols`, and `tests`.
- Extend `/wiki lint` or add `/wiki-check` for broken links plus repo-relative path/test validation.
- Defer `lat.md/`, standalone `lat` CLI, semantic/vector search, embeddings, and automatic symbol indexing until current wiki retrieval gaps are proven.

Key risks to include in future issues:
- Knowledge surface sprawl across `AGENTS.md`, `context`, `memory`, `wiki`, `docs`, `skills`, and `tasks`.
- Semantic search privacy/reproducibility concerns.
- Stale source-symbol/test backlinks creating false confidence.
- Concurrent graph/index writes and generated-artifact drift.

## CodeGraph MCP case study summary

Source claim: CodeGraph reduces Claude Code repository-exploration cost by pre-indexing a codebase into a local MCP-accessible code graph. The social post emphasized Tree-sitter parsing, SQLite symbol/caller/edge storage with full-text search, file watching, local-only execution, and large reductions in tool calls/time. Upstream README numbers may change over time; treat social/vendor benchmarks as prior art, not acceptance evidence.

Council-aligned recommendation for Open Harness:
- Use the existing CodeGraph evaluation issue if present; update it with a council/audit comment instead of creating a duplicate issue.
- Treat CodeGraph as live source-code navigation infrastructure, not as durable project memory and not as a replacement for `.mifune/skills/wiki/corpus/`/Lat.md-style knowledge.
- Run Open Harness-local A/B benchmarks before integration: baseline vs CodeGraph for tool calls, wall-clock, tokens/cost, correctness, files read/searched, index time, DB size, watcher freshness, and CPU/memory if practical.
- If benchmarks pass, implement first as an opt-in sandbox capability (for example `INSTALL_CODEGRAPH=false`) with pinned package, minimal reviewed MCP config, generated-state ignores, and docs/rules for when to use graph queries vs direct reads.
- Do not bake into the default base image, run upstream broad auto-installers, or auto-grant MCP permissions until security/reliability gates pass.

Key risks to include in future CodeGraph/MCP issues:
- Third-party MCP server inside a high-trust sandbox can expand file/content exposure and permission surface.
- MCP-delivered usage instructions can conflict with harness governance if they encourage trusting graph output without source verification.
- Generated graph state such as `.codegraph/` must be ignored and cleaned up; never commit indexes.
- Watcher/index freshness over Docker bind mounts can vary by host platform and branch/worktree operations.
- Graph extraction gaps can create false confidence; require direct source verification before edits, security claims, or final assertions.
