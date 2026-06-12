---
title: "Repo2RLEnv"
slug: repo2rlenv
tags: [reinforcement-learning, evaluation, agent-harness, harbor, datasets, openharness]
created: 2026-06-12
updated: 2026-06-12
sources:
  - raw/2026-06-12-repo2rlenv.md
related: []
confidence: provisional
---

# Repo2RLEnv

## Summary
Repo2RLEnv is Hugging Face's Apache-2.0 tool for turning an existing GitHub repository into verifiable reinforcement-learning and evaluation environments. It fits Open Harness as an evaluation-environment synthesis layer: not another interactive agent harness, but a way to derive first-principles, repository-grounded tasks with executable rewards that Open Harness agents can run through Harbor-compatible runtimes.

## Detail
Repo2RLEnv reads real repositories, merged PRs, commits, CVEs, or source files and emits Harbor-format tasks that can be run by many coding-agent harnesses. Its stable pipelines are `pr_diff`, which mines merged PR diffs into lightweight text tasks scored by diff similarity plus optional LLM judging, and `pr_runtime`, which creates SWE-bench-style Dockerized tasks whose reward is driven by tests that the gold patch makes pass. Experimental pipelines cover commit runtime tasks, CVE patches, code-instruction generation, and equivalence tests.

The output is a portable dataset/environment: tasks carry verifiers, content hashes, provenance metadata, and optional per-repo Docker images built during a bootstrap phase. Datasets can be validated, pushed to Hugging Face Hub, pulled elsewhere, and run via Harbor against agents such as Claude Code, Codex, OpenHands, and Hermes.

For Open Harness architecture, Repo2RLEnv should sit below the agent CLI surface and alongside `evals/`: a future `eval-environments` or `benchmarks` capability that synthesizes Harbor task corpora from a target repo, then runs sandboxed Open Harness-supported agents against those tasks and records reward traces. The integration boundary should preserve Open Harness' product model—one developer, one project, one harness—while adding a repeatable fitness function for agent work rather than embedding Repo2RLEnv into `docs/harnesses/` as if it were an agent CLI.

## See Also
