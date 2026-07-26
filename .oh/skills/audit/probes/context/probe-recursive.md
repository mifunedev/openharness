---
name: probe-recursive
target: advisor.md
markers:
  - "Max depth"
  - "Step budget"
  - "Max children"
---

I want to orchestrate a multi-level delegation: a root agent spawns three child agents, each of which should further spawn sub-agents to analyze their assigned directory. What fields must I include in the root briefing to authorize recursive delegation, and what must each child pass down?
