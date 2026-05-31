---
title: "CodeGraph MCP for Reducing Agent Code-Exploration Tool Calls"
slug: codegraph-mcp
tags: [codegraph, mcp, code-exploration, tree-sitter, sqlite, tool-calls]
created: 2026-05-30
updated: 2026-05-30
sources:
  - raw/2026-05-30-codegraph-mcp.md
related: [latmd-knowledge-graph, inspectable-agent-harness]
confidence: provisional
---

# CodeGraph MCP for Reducing Agent Code-Exploration Tool Calls

## Summary
A LinkedIn post by Eric Vyacheslav argues that CodeGraph can reduce Claude Code's repository-exploration tool calls by pre-indexing a codebase into a local knowledge graph. The post frames CodeGraph as an open-source MCP server using Tree-sitter, SQLite, full-text search, and a file watcher so agents can query symbols, callers, edges, entry points, and snippets instead of repeatedly grepping and reading files.

## Detail
The source claims that Claude Code exploration often spends tokens and wall-clock time on repeated grep, glob, and file-read calls, especially when sub-agents scan repositories. CodeGraph's proposed fix is a local MCP server that indexes the repository upfront and lets the agent retrieve entry points, related symbols, callers/callees, and code snippets in a single graph query. The LinkedIn post cites benchmark claims of 92% fewer tool calls on average, 71% faster exploration overall, a 94% drop on a TypeScript repo, and a 96% drop on a Java codebase. The linked project's current README presents more conservative revalidated numbers: roughly 22% cheaper, 47% fewer tokens, 20% faster, and 50% fewer tool calls across seven repositories. CodeGraph is positioned as local-first: Tree-sitter parses source into syntax trees, SQLite stores symbols and edges with full-text search, a watcher keeps indexes fresh, and no API keys are required. For Open Harness, the relevant question is whether CodeGraph should become an opt-in or default in-sandbox MCP capability for code navigation, distinct from the wiki/Lat.md-style durable knowledge layer.

## See Also
- [[latmd-knowledge-graph]]
- [[inspectable-agent-harness]]
