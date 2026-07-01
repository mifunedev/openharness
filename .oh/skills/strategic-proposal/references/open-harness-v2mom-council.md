# Open Harness V2MOM Council Pattern

Session: 2026-06-04. Trigger: user linked Marc Benioff / Salesforce V2MOM post and asked to "Use a council to determine what our initial V2MOM should be and create a plan to add to wiki."

## What worked

- Loaded strategy + wiki + planning skills, then grounded in repo truth: README, context files, wiki schema, existing wiki entries, and live GitHub signal.
- Used three council lenses instead of the roadmap skill's five roadmap-specific experts:
  - Product/Founder
  - Systems/Ops
  - Market/Community/Docs
- Ran an adversarial strategy critic after the council. The critic caught the main failure modes:
  - Methods list was too roadmap-like for an initial V2MOM.
  - Optional integrations could violate focused-core strategy.
  - Extra wiki entries (`open-harness-positioning`, `open-harness-docs-ia`) were premature sprawl.
  - Measures needed sharper operational definitions like fresh clone → first useful diff.

## Final synthesized V2MOM

**Vision:** Open Harness is the simplest reliable Docker-native home for long-lived coding agents: one project, one sandbox, one branch, durable context, inspectable operation.

**Tagline:** You bring the agent. Open Harness provides the sandbox.

**Values:** Simplicity over platform breadth; inspectable autonomy; one project / one sandbox / one branch as default isolation; durable context; bounded bring-your-own-agent; Docker-only host contract; focused core with packs outside core.

**Methods:**
1. Make fresh install to first useful agent diff reliable.
2. Make sandbox state legible: auth, branches, crons, logs, mounts, disk, and recovery paths.
3. Capture operational truths in docs/wiki only after validation.
4. Convert eval/issues into explicit decisions: reject, keep opt-in, or promote with evidence.

**Obstacles:** Category confusion, complexity creep, install/auth friction, trust gap for sleeping/resuming agents, Docker disk pressure, boundary erosion between core and packs, docs/wiki sprawl, low external validation.

**Measures:** Median/P90 fresh clone → shell and → first useful diff; install success + failure taxonomy; activation funnel through accepted diff and resumed session; rebuild success; sleep/wake continuation success; disk growth/recovery; eval decisions merged/rejected; docs-only completion rate; wiki lint/reuse; external successful installs/repeat users.

## Wiki plan rule of thumb

For strategic operating models, create one provisional bounded entry first (e.g. `.oh/skills/wiki/corpus/open-harness-v2mom.md`) plus a raw source snapshot. Do not paste council minutes into the wiki. Do not create multiple adjacent strategy entries until distinct durable facts exist.

## Approval gates used

Before implementing, ask the maintainer to approve or edit:
1. Vision sentence.
2. Tagline.
3. Any narrow strategic constraint (e.g. "one branch" vs "one working context").
4. Source policy for wiki frontmatter (raw snapshot only vs README/context relative sources).