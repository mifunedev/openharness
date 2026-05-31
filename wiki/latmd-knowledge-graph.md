---
title: "Lat.md Project Knowledge Graph for Agent Context"
slug: latmd-knowledge-graph
tags: [agent-context, knowledge-graph, markdown, test-specs, semantic-search]
created: 2026-05-30
updated: 2026-05-30
sources:
  - raw/2026-05-30-latmd-knowledge-graph.md
related: [inspectable-agent-harness]
confidence: provisional
---

# Lat.md Project Knowledge Graph for Agent Context

## Summary
A LinkedIn post by Eric Vyacheslav argues that agents lose context when a growing codebase relies on a single flat `AGENTS.md` file. It presents Lat.md as a project-root markdown knowledge graph: a `lat.md/` folder with linked architecture, business-logic, and test-spec documents plus CLI validation and search.

## Detail
The source claims `AGENTS.md` becomes overloaded as repositories grow because design decisions and domain constraints are buried in one flat file. Lat.md’s proposed fix is a folder of markdown files at the project root, connected with wiki-style links. The files document architecture, business logic, and test specifications, while links can connect sections to source symbols, implementation concepts, and inline comments. The described CLI includes `lat init` for scaffolding, `lat check` for reference validation, `lat search` for semantic queries, and `lat section` for graph navigation. The post’s value proposition is that agents stop grepping blindly and can retrieve decisions, constraints, domain context, and past-session knowledge quickly. It also highlights test-spec backlinks as a way to require implementation/tests to stay connected to documented requirements. For Open Harness, the relevant insight is not necessarily a new `lat.md/` directory, but the broader pattern: durable, linked project knowledge that is validated and queryable by agents rather than loaded wholesale into startup context.

## See Also
- [[inspectable-agent-harness]]
