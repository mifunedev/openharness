---
title: "UAT Testing"
sidebar_position: 8
---


The **uat-tester** agent performs visual acceptance testing of deployed web applications using headless Chromium (`agent-browser`). It navigates every user flow as a real user would, identifies bugs, and produces a deduplicated, impact-ranked findings list as user stories.

## Capabilities

- **Multi-project**: test multiple deployed apps concurrently, each with isolated findings
- **Top-20 findings list**: per-project, ranked by severity, with archive overflow
- **3-viewport responsive testing**: desktop (1920x1080), tablet (768x1024), mobile (375x812)
- **Accessibility audits**: WCAG A/AA compliance via dedicated sub-agent
- **Screenshot evidence**: every finding includes visual proof
- **Recheck loop**: re-verify specific findings after fixes are deployed
- **Self-improving**: skills, agents, and rules evolve via the Karpathy autoresearch loop

## Quick Start

### 1. Provision the agent

```bash
make NAME=uat-tester quickstart
```

### 2. Enter the sandbox

```bash
make NAME=uat-tester shell
claude
```

### 3. Register a project

Edit `uat/projects.json` or let the agent prompt you when you run a sweep:

```json
{
  "projects": [
    {
      "slug": "my-app",
      "name": "My Application",
      "url": "https://my-app.example.com",
      "login_instructions": "Username: test@example.com, Password: test123",
      "created": "2026-04-14"
    }
  ]
}
```

### 4. Run a UAT sweep

```
/visual-uat my-app
```

### 5. Review findings

- `uat/my-app/findings.md` — human-readable report with user stories
- `uat/my-app/findings.json` — machine-readable source of truth

### 6. Recheck after fixes

```
/recheck my-app UAT-001 UAT-005
```

## Skills

The agent ships with 10 testing skills — 2 orchestrator skills and 8 atomic testing skills that compose into focused sub-agents.

### Orchestrator Skills

| Skill | Purpose |
|-------|---------|
| `/visual-uat <slug>` | Full 6-phase UAT sweep: setup, discovery, testing, finding registration, report generation, memory protocol |
| `/recheck <slug> [IDs]` | Re-verify specific findings after fixes. Reports PASS/FAIL/CHANGED per item. Promotes archived items on PASS. |

### Testing Skills Library

| Skill | What It Tests |
|-------|--------------|
| `/test-auth` | Login, logout, registration, password reset, session persistence, protected routes |
| `/test-forms` | Empty submit, invalid input, boundary values, multi-step forms, file upload |
| `/test-nav` | All links resolve, breadcrumbs, footer links, 404 handling, back/forward |
| `/test-a11y` | WCAG A/AA: keyboard nav, focus indicators, ARIA, alt text, heading hierarchy, contrast |
| `/test-responsive` | 3-viewport sweep, layout breakage, text overflow, touch targets, image scaling |
| `/test-visual-regression` | Before/after screenshot comparison, layout shift detection |
| `/test-crud` | Create, read, update, delete operations, data persistence, error recovery |
| `/test-search` | Search, filter, sort, pagination, empty states, URL param persistence |

## Sub-Agents

During a `/visual-uat` sweep, the agent spawns focused specialists in parallel:

| Sub-Agent | Skills | Mandate |
|-----------|--------|---------|
| **A11y Auditor** | `/test-a11y` | WCAG compliance on every page |
| **Responsive Tester** | `/test-responsive` | 3-viewport sweep on every page |
| **Flow Walker** | `/test-auth`, `/test-forms`, `/test-nav`, `/test-crud`, `/test-search` | Walk user flows end-to-end |
| **Visual Diff** | `/test-visual-regression` | Before/after comparison for rechecked items |

## Rules (Auto-loaded Guards)

| Rule | What It Guards |
|------|---------------|
| `uat-testing.md` | Core protocol: evidence required, dedup before report, top-20 cap, user story format, no app code modification |
| `agent-browser.md` | Browser hygiene: session isolation, wait-before-capture, viewport naming conventions, timeout handling |
| `findings-management.md` | Data integrity: JSON source of truth, severity classification, dedup key logic, archive overflow, recheck protocol |
| `multi-project.md` | Project isolation: scoped to slug, registration required, no cross-contamination between projects |

## Findings Format

### Severity Classification

| Level | Criteria | Examples |
|-------|----------|---------|
| **Critical** | App crash, data loss, auth bypass, complete blocker | White screen of death, can't log in, data saved to wrong user |
| **High** | Broken flow, wrong data, missing critical feature | Form submits but data not saved, nav leads to 404 |
| **Medium** | Visual glitch, poor UX, a11y violation (WCAG A) | Button overlaps text, no focus indicator, missing alt text |
| **Low** | Cosmetic, minor alignment, nice-to-have | Inconsistent padding, could-be-better wording |

### User Story Format

```
As a [user type], I [action], but [observed behavior] instead of [expected behavior].
Impact: [severity].
```

### Top-20 Cap

Each project maintains at most 20 active findings. When exceeded, the lowest-severity items are archived to `findings-archive.json`. When items are fixed during recheck, archived items are promoted back into the active list.

## Workflow

```
SWEEP -> DELEGATE -> RANK -> CAP -> REPORT -> (user reviews) -> RECHECK -> PROMOTE
```

1. **Sweep**: `/visual-uat <slug>` — discovers pages and flows
2. **Delegate**: sub-agents test in parallel (a11y, responsive, flows, visual)
3. **Rank**: merge, deduplicate, sort by severity then frequency
4. **Cap**: enforce top-20, archive overflow
5. **Report**: write `findings.json` + `findings.md`
6. **Recheck**: `/recheck <slug> [IDs]` — replay reproduction steps
7. **Promote**: fixed items removed, archived items promoted

## Self-Improvement (Autoresearch Loop)

The agent follows the [Karpathy autoresearch pattern](https://github.com/karpathy/autoresearch) — an autonomous optimization cycle where each iteration's output feeds the next:

1. **Hypothesize**: based on this run's results, what change might improve detection?
2. **Experiment**: apply the change to the skill/agent/rule file
3. **Evaluate**: on the next run, did detection improve? Check MEMORY.md effectiveness tables
4. **Keep or Discard**: if improved, keep. If not, revert
5. **Synthesize**: update MEMORY.md Lessons Learned — feeds the next hypothesis

Effectiveness is tracked in MEMORY.md with tables for skill runs/findings, agent spawns/findings, and rule enforcements/true positives/false positives.

## Scheduled reporting

No UAT-specific scheduled report ships by default. Recurring UAT reporting should be defined as a repo-root `crons/*.md` file and can report open findings by severity per project, new pages discovered, stale findings (>7 days without recheck), and recommendations for next actions.

## Architecture

```
workspace/
  uat/
    projects.json                    # Project registry
    <slug>/
      findings.json                  # Active top-20 (source of truth)
      findings.md                    # Human-readable report
      findings-archive.json          # Overflow beyond top-20
      test-plan.md                   # Discovered pages and flows
      screenshots/YYYY-MM-DD/        # Evidence by date
  .claude/
    skills/
      visual-uat/    recheck/        # Orchestrator skills
      test-auth/     test-forms/     # Testing library
      test-nav/      test-a11y/
      test-responsive/ test-crud/
      test-search/   test-visual-regression/
    agents/
      a11y-auditor.md                # Accessibility specialist
      responsive-tester.md           # Viewport specialist
      flow-walker.md                 # User flow specialist
      visual-diff.md                 # Regression specialist
    rules/
      uat-testing.md                 # Core testing protocol
      agent-browser.md               # Browser session rules
      findings-management.md         # Findings lifecycle
      multi-project.md               # Project isolation
```
