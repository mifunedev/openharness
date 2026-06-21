---
name: interview
description: |
  Adaptive pre-work clarifier. Picks 2–4 task-specific questions
  via AskUserQuestion, echoes a brief scope summary, then proceeds.
  Refuses for trivial tasks.
  TRIGGER when: /interview invoked explicitly, OR before non-trivial
  work where scope/intent/constraints are ambiguous AND the user
  hasn't already specified them.
argument-hint: "[task description]"
---

# Interview

Resolve scope ambiguity before non-trivial work by batching 2–4 task-specific multiple-choice questions through `AskUserQuestion`, then proceeding with a short scope brief that reflects the answers.

## When to use

- `/interview` invoked explicitly (with or without a task description).
- Proactively, before non-trivial work where scope, intent, or constraints are ambiguous AND the user hasn't already specified them in the prompt.

The structured tool (`AskUserQuestion`) earns its keep when the user can resolve scope in one click rather than a paragraph of free-text Q&A.

## When NOT to use

Skip — and announce the skip — when any of these hold:

- **Trivial edits** — single-file typo, comment-only edit, format/whitespace pass.
- **Already specified** — the user's prompt already names goal + scope + constraints + acceptance criteria.
- **Follow-up turn** — same task, context already established earlier in the conversation.
- **Trivial CLI invocations** — `/release`, `/ci-status`, `gh pr list`, etc.
- **Plan approval moments** — that's `ExitPlanMode`, not this skill. `AskUserQuestion` is for *picking among options*, not approving a finished plan.
- **About to run `/prd` or `/ship-spec`** — those have their own clarifier. For v1 the user chooses one or the other; do not stack.

## Instructions

### 1. Classify trivial vs non-trivial

If the task is trivial (per § *When NOT to use*), announce the skip and continue:

> Skipping interview — this looks trivial. Proceeding directly.

Do not refuse silently. The skip is a signal, not an absence.

### 2. Extract what's already known

Read the conversation context. List, internally, what's already specified — goal, files touched, mode, constraints, acceptance. **Do not re-ask anything the context already answers.** A question whose answer is already in the prompt is a tell that the model didn't read.

### 3. Pick 2–4 questions

Each question must clear the bar in § *Question quality bar* below. If you can't write 2 that clear the bar, ask 1 (sequential calls are fine) or skip and announce why. **Don't quota-fill** to reach 4.

### 4. Issue one batched `AskUserQuestion` call

Pass all questions in one tool call. Each `options` array has 2–4 entries; never 1, never 5+. The user UI auto-adds "Other" — do not add it manually. Use `multiSelect: true` only when the choices are genuinely not mutually exclusive.

Sequential calls are the rare exception: only when a later question's option set genuinely depends on an earlier answer (e.g., "which file?" depends on "which mode?").

### 5. Echo a 2–3 sentence scope brief, then proceed

After answers come back, write a 2–3 sentence brief that:

- Names the goal, the chosen path, and any non-default constraints from the answers.
- Surfaces any *stated* assumption you're making that wasn't in an answer.
- Has no plan-approval gate. Brief, then work.

If the user types **STOP** during the brief, halt — do not finish the thought, do not start the work.

### 6. Memory Protocol

Append to `memory/<UTC-date>/log.md`:

```markdown
## interview -- HH:MM UTC
- **Result**: OP | SKIPPED-TRIVIAL | INTERRUPTED
- **Questions**: <count>
- **Brief**: <one-line summary of the scope brief>
- **Observation**: <one sentence on whether the questions landed (changed the work, or were noise)>
```

Then run the qualify/improve loop per `context/rules/memory.md`. If a question pattern landed especially well or poorly across runs, that may merit a line in `memory/MEMORY.md`.

## Question quality bar

Every question must satisfy **all** of:

- **Decision-shaping** — the answer changes *what* gets built, not how it's described. If both options lead to the same code, it's not a question.
- **Task-specific options** — options reference real files, components, modes, or thresholds from *this* task. Not "small / medium / large". Not "yes / no / maybe".
- **Mutually exclusive** — options don't overlap (or set `multiSelect: true` and acknowledge they don't).
- **Gut-answerable** — the user shouldn't need to read code to decide. If they would, the question is too deep — ask a shallower one first or do the reading yourself.
- **2–4 options** — never 1 (not a question), never 5+ (decision paralysis). "Other" is automatic.
- **Generic-filler ban** — refuse to emit: "what are your constraints?", "any preferences?", "any concerns?", "what's your goal?". These are tells the model didn't think hard enough about *this* task.

## Anti-patterns

- **Generic filler.** Banned (see above). If your question would work verbatim on a different task, it's filler.
- **Re-asking the answered.** Context already named the file or mode; don't ask again.
- **Quota-filling to 4.** Two sharp questions beat four mushy ones.
- **Plan-approval via `AskUserQuestion`.** Use `ExitPlanMode`. The two tools are not interchangeable.
- **Interviewing trivial tasks.** Typos, format passes, single-command invocations. Announce the skip and proceed.
- **Templated question banks.** A "standard 4 questions to ask before any refactor" defeats the adaptive thesis. Pick questions from this task.
- **Asking, then ignoring.** If the brief doesn't reflect the answers, the interview was theater.
- **Brief longer than the answers.** The brief is 2–3 sentences. If you need a paragraph, you're writing a plan — use `ExitPlanMode`.
- **Smuggled assumptions.** If the brief asserts something the user didn't pick, either surface it as a stated assumption ("Assuming X — say so if not") or ask another question.
- **Ignoring STOP.** If the user interjects "STOP" while you're writing the brief, halt. Do not finish the thought; do not start the work.

## Examples

### Example 1 — refactor request

**Invocation:** `/interview refactor the audit skill`

**BAD (generic filler):**

> What are your constraints for this refactor?
> Options: Time-constrained / Quality-first / Other

**GOOD (task-specific):**

```
AskUserQuestion:
  question: "Which axis of the audit skill is most worth changing?"
  header: "Refactor axis"
  options:
    - label: "Sub-agent prompts"
      description: "Tighten PM/Implementer/Critic/Explorer briefs to reduce overlap"
    - label: "Synthesis step"
      description: "Replace the tier-ranked report with a different output shape"
    - label: "Trigger conditions"
      description: "Change when the skill fires (manual vs heartbeat vs both)"
  multiSelect: false

  question: "What does success look like?"
  header: "Success signal"
  options:
    - label: "Fewer duplicate findings"
      description: "Sub-agents stop reporting the same issue under different framings"
    - label: "Faster wall-clock"
      description: "Audit completes meaningfully sooner without losing coverage"
    - label: "Higher action-rate"
      description: "More of the top-3 recommendations actually get worked on"
  multiSelect: false
```

**Scope brief (after answers come back):**

> Refactoring the audit skill to tighten the four sub-agent prompts so duplicate findings drop. Holding wall-clock and trigger conditions constant. Will land as edits to `.claude/skills/harness-audit/SKILL.md` only.

### Example 2 — new feature

**Invocation:** `/interview add a "dry-run" mode to /release`

**BAD (generic filler):**

> Any concerns about backward compatibility?
> Options: Yes / No / Maybe

**GOOD (task-specific):**

```
AskUserQuestion:
  question: "What does --dry-run skip?"
  header: "Skip set"
  options:
    - label: "Only the push + tag"
      description: "Compute version, write CHANGELOG, commit locally — stop before pushing"
    - label: "Push + tag + CHANGELOG promote"
      description: "Compute version only, print intended actions, no file changes"
    - label: "Everything except CI poll"
      description: "Do the full release but skip the CI verification step"
  multiSelect: false

  question: "How does the user invoke it?"
  header: "Flag shape"
  options:
    - label: "--dry-run flag"
      description: "/release --dry-run, default off"
    - label: "DRY_RUN env var"
      description: "DRY_RUN=1 /release, no flag"
    - label: "Separate skill"
      description: "/release-preview as its own SKILL.md"
  multiSelect: false
```

**Scope brief:**

> Adding `--dry-run` to `/release` that computes the version and prints intended actions, but writes no files and runs no git operations. Implementation goes in `.claude/skills/release/SKILL.md` only.

The contrast is the teaching tool: same axis, but the GOOD form's options would only make sense for *this* task.

## Reference

### `AskUserQuestion` contract

| Field | Shape | Notes |
|---|---|---|
| `question` | string | Full question, ends in `?` |
| `header` | string ≤12 chars | Short chip/tag shown above the question |
| `options` | array, 2–4 entries | Each has `label` (1–5 words) + `description` (one line, context/tradeoff). No `Other` — auto-added. |
| `multiSelect` | bool, default `false` | `true` when choices aren't mutually exclusive |
| `questions` | array, 1–4 entries | Multiple questions batch into one tool call |

### When `AskUserQuestion` is the wrong tool

| Situation | Use instead |
|---|---|
| User needs to approve a finished plan | `ExitPlanMode` |
| Question requires free-text input (a filename, a number) | Plain prose question in chat |
| Question is one of many in a deep tree | Sequential `AskUserQuestion` calls — but reconsider whether you should be reading code first |
| Want to confirm before a destructive action | Plain prose confirmation in chat |

Future skills wanting structured elicitation can copy the option-shape contract above — `/interview` is the in-tree reference pattern.
