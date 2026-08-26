---
name: retro
argument-hint: "[--dry-run] [--focus <subsystem>] [auto-approve]"
allowed-tools: Read, Grep, Bash, Edit
description: |
  Scientific session-closing retrospective: scan the current conversation,
  turn each signal into a falsifiable hypothesis, cite session evidence for
  AND against it, assign a verdict (supported / refuted / inconclusive) and a
  confidence level, then promote only supported, sufficiently-confident
  hypotheses into .oh/context/IDENTITY.md behind a propose-then-confirm gate.
  Reflects on five learning/knowledge subsystems through the lens of this
  session — continual learning, context compression, reinforcement learning,
  wiki, and docs — and points at the deep-dive lint/audit skills rather than
  running them. The report is terminal output: /retro writes no file except an
  approved IDENTITY.md line.
  TRIGGER when: /retro invoked, or session closing with decisions,
  surprises, or failures worth preserving.
---

# Retro

Scientific session-closing retrospective. Turn the current conversation's signals into falsifiable hypotheses, test each against session evidence (for and against), assign a verdict and confidence, and promote only the supported, sufficiently-confident ones — with explicit confirmation — into `.oh/context/IDENTITY.md`.

`/retro` is **report-only**. It emits its report to the terminal and writes exactly one kind of file change: an approved append to `.oh/context/IDENTITY.md`. There is no durable lessons ledger and no dated run log; code is the source of truth, and a lesson that cannot be argued into IDENTITY.md is spoken once and left in the transcript.

Use the self-contained helpers in `${CLAUDE_SKILL_DIR}/scripts/` for deterministic checks; use `${CLAUDE_SKILL_DIR}/references/report-schema.md` as the output contract.

## When to use

- `/retro` invoked explicitly to close a session.
- Proactively, after a session that produced decisions, surprises, regressions, or failure modes the next agent would benefit from knowing.

## When NOT to use

- **`/audit harness`** — audits harness code health via four parallel sub-agents. That is a structural audit, not a behavioral/conversational pass.
- **`/audit context`** — scores the default-loaded context budget across four dimensions. It trims files, not behaviors.
- **`/audit skills`** — scores individual skills for staleness. It reviews skill quality, not session outcomes.
- **`/wiki lint`** — health-checks the wiki corpus for staleness and broken links. It curates the wiki, not the session.
- **Trivial sessions** — if the session contained only mechanical read-only queries or single-command invocations with no surprises, announce the skip and stop.

Key boundary: `/retro` is *session-scoped reflection*. The lint/audit skills above are the *deep-dive tooling* it points at — not what it runs. It is the only skill whose domain is *current-session signals → falsifiable hypotheses → identity*.

## Scope

Current conversation only. `/retro` does not read prior sessions or the `~/.claude/projects/...` auto-memory store. It works from what is already in context.

## Deterministic contract

Before opening the approval gate, produce a report that follows `${CLAUDE_SKILL_DIR}/references/report-schema.md`. At minimum it contains:

```markdown
## Session signals
## Hypotheses
| ID | Subsystem | Hypothesis | Evidence for | Evidence against | Verdict | Confidence | Promotion |
|----|-----------|------------|--------------|------------------|---------|------------|-----------|
## Promotion candidates
## Summary
STATUS: RETRO-DONE
```

Run the helper when a report artifact exists:

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/validate-retro-report.sh" /path/to/retro-report.md
```

If no artifact exists because the response is generated inline, still follow the schema exactly. The final non-empty line must be `STATUS: RETRO-DONE`.

## The scientific loop

Every signal from the session passes through four moves before it can become a promotion candidate:

1. **Observation** — something that happened in *this* session (a decision, a surprise, a failure, a correction, a repeated request).
2. **Hypothesis (falsifiable)** — restate the observation as one statement that session evidence *could* refute. If nothing in the session could disconfirm it, it is not a hypothesis — drop it.
3. **Evidence (for AND against)** — cite concrete moments from the conversation that support the hypothesis, and actively look for moments that undercut it. Confirmation-only testing is not testing.
4. **Verdict + Confidence** — judge the hypothesis against its evidence.

**Verdict rubric:**

| Verdict | Meaning |
|---------|---------|
| `supported` | Session evidence backs the hypothesis and no in-session evidence refutes it. |
| `refuted` | In-session evidence contradicts the hypothesis. |
| `inconclusive` | Evidence is mixed, thin, or absent; the session cannot decide. |

**Confidence rubric:**

| Confidence | Meaning |
|------------|---------|
| `low` | A single weak signal. |
| `medium` | Clear single-session evidence. |
| `high` | Repeated or corroborated within the session. |

**Promotion rule:**

- Only `supported` + `medium`-or-higher confidence may be proposed for `.oh/context/IDENTITY.md`.
- IDENTITY.md *additionally* requires cross-session generalization (a single session, however well-supported, is not a principle).
- `refuted`, `inconclusive`, and any `low`-confidence hypothesis are reported and discarded — never promoted.

A supported, medium-confidence lesson that does **not** generalize has no file to land in. Say it in the report, name the code or doc change that would encode it, and let it go. That is the intended outcome, not a gap.

## The five-subsystem lens

Seed hypotheses by asking, for each subsystem, what *this session* revealed about how well it worked. A `--focus <subsystem>` arg narrows the whole pass to one lens.

| Subsystem | Guiding question (what did this session reveal?) | Lives in / deep-dive skill |
|-----------|--------------------------------------------------|----------------------------|
| Continual learning | Did prior identity get used, ignored, or contradicted? Did anything durable emerge? | `.oh/context/IDENTITY.md` |
| Context compression | Was loaded context bloated/redundant, or did a rule prove load-bearing? | `/audit context` |
| Reinforcement learning | Did advisor/executor or recursive-decomposition patterns help or hurt? Over/under-delegation? | `.oh/agents/advisor.md` |
| Wiki | Did the session surface knowledge that belongs in the wiki, or hit stale/missing entries? | `/wiki ingest`, `/wiki lint` |
| Docs | Did human-facing doc gaps or inaccuracies surface? | `docs/` (site/blog live in `mifunedev/openharness-web`) |

## Instructions

### 1. Gather session signals

Scan the current conversation, organized by the five lenses above:
- Decisions made and the reasoning behind them.
- Surprises — things that failed that seemed straightforward, or worked unexpectedly.
- Couplings, constraints, or edge cases that were non-obvious.
- Corrections the user made to the agent's behavior.
- Patterns in what the user asked for repeatedly.

Do not invent signals not present in the conversation. If `--focus <subsystem>` was passed, gather signals for that lens only.

### 2. Form hypotheses

For each signal, write one falsifiable statement and tag it with its subsystem. If a candidate statement could not be refuted by any session evidence, it is not a hypothesis — discard it before testing.

### 3. Test each hypothesis

For every hypothesis, cite session evidence for it and actively search for evidence against it. Then assign a **verdict** (`supported` / `refuted` / `inconclusive`) and a **confidence** (`low` / `medium` / `high`) per the rubric above. Record every hypothesis in the required `## Hypotheses` table, including `Evidence against`; write `none found in-session` only after actively checking.

### 4. Qualify filter

Discard any surviving hypothesis that matches a row below:

| Discard if | Reason |
|------------|--------|
| Contains a secret, token, or credential | IDENTITY.md is committed |
| Is raw stdout or command output | Use interpretation, not transcript |
| Belongs in a commit message or PR body | Duplication causes drift |
| Is a step-by-step task plan | Plans belong in `.oh/tasks/<name>/prd.json` |
| Re-derivable in under a minute | Reading one file answers it — don't memorize |

Also discard any hypothesis already captured, verbatim or in substance, in `.oh/context/IDENTITY.md` — link or skip; never double-write. Finally, drop from promotion every hypothesis whose verdict is `refuted` or `inconclusive`, or whose confidence is `low`.

### 5. Classify survivors

For each surviving hypothesis — now carrying its evidence and confidence — classify:

| Tier | Outcome | Criterion |
|------|---------|-----------|
| **Report-only** | Named in the report; no file written | Transient or session-scoped: true of this run, not necessarily future ones. |
| **IDENTITY.md** | `.oh/context/IDENTITY.md` under `## Lessons learned (append-only)` | Graduated principle: applies across contexts, not just this run. Prescriptive tone ("always X"). **Never auto-write.** Propose a diff for approval. |

The test: if you would scope it to "this session" or "this codebase right now," it is report-only. If you would remove the scoping and say "always," it is an IDENTITY.md candidate.

### 5a. Triage tag — route each promotable lesson to its correction surface

For every lesson that survived to the promotion list (verdict `supported`, confidence `medium` or higher, generalizes across sessions), assign exactly one triage tag before proposing it. Route to the **cheapest reliable surface** per `.oh/evals/README.md § Correction-surface triage`:

| Tag | Use when | Proposed artifact |
|-----|----------|-------------------|
| `harden` | Lesson is a guardrail — something that must not happen | A hook + a unit-test probe (`.oh/evals/probes/<id>.sh`, tier A) |
| `proceduralize` | Lesson is a technique — a step, pattern, or workflow improvement | A skill step addition + a doc-lint probe (`.oh/evals/probes/<id>.sh`, tier A) |
| `eval` | Genuine judgment residue only — cannot be mechanically checked | Tier-B deferred; never a hard gate in v1 |

**Default away from `eval`.** Proposing the `eval` tag requires an explicit justification note: state why neither `harden` nor `proceduralize` can close the lesson. If no justification is given, demote to `proceduralize` (or `harden` if the lesson is a guardrail).

Each proposed IDENTITY.md line must carry its triage tag and a proposed probe id:

```
- <principle> [<subsystem> · <confidence> · harden|proceduralize|eval] — probe: <id> | basis: <one clause>
```

The probe id follows the pattern `<subsystem-slug>-<YYYYMMDD>` (e.g., `context-compression-20260610`). For `eval`-tagged lessons, use `probe: deferred-tier-b` and append the justification note. The probe id is a forward reference — the actual `.oh/evals/probes/<id>.sh` file is created separately and is out of scope for `/retro` itself.

### 6. Propose-then-confirm gate

#### 6a. Filter duplicates, then fix the candidate list

Pipe candidate lines through the self-contained duplicate helper and skip exact/substantive duplicates it reports:

```bash
printf "%s\n" "<candidate line>" | bash "${CLAUDE_SKILL_DIR}/scripts/check-identity-duplicates.sh"
```

What survives is the proposal list. Do not change it after this point in the run.

#### 6b. Present the proposal block

Before writing to `.oh/context/IDENTITY.md`, present the proposed additions as a clearly formatted block. Each proposed line shows its `[subsystem · confidence]` tag and a one-clause evidence basis:

```
Proposed IDENTITY.md addition(s):
- <prescriptive principle, "always X" or "never Y"> [<subsystem> · <confidence> · harden|proceduralize|eval] — probe: <id> | basis: <one clause>

Type APPROVE to write, SKIP to discard any item, or EDIT <n> <new text> to revise.
```

**This block is the last thing you write before your turn ends.** Do not write to IDENTITY.md until the user responds. If `--dry-run` was passed, print the report and the proposal block, then stop — never write IDENTITY.md in dry-run mode.

`auto-approve` resolves the gate inside the same turn — you present, decide, and write without handing control back. This is the common unattended path (a build session running `/spec execute`'s tail).

### 7. Write approved changes

For each APPROVED item, append under `## Lessons learned (append-only)` in `.oh/context/IDENTITY.md`:

```markdown
- **YYYY-MM-DD**: <principle>
```

The file is append-only. Never edit existing entries.

### 8. Close the report

End with the `## Summary` section and the terminal line. Report what you actually appended in §7, not the length of the proposal list — an operator who answered `SKIP` to two of three items promoted one, not three.

```markdown
## Summary
- **Result**: OP | DRY-RUN | SKIPPED-TRIVIAL
- **Subsystems**: <which of the 5 produced signals, or focus: name>
- **Hypotheses**: <total> (supported <n> / refuted <n> / inconclusive <n>)
- **Promoted**: <n> to IDENTITY.md
- **Observation**: <one sentence — strongest supported finding, or no durable patterns>

STATUS: RETRO-DONE
```

## Example

```markdown
## Session signals
- The session required manual release, PR land, and duplicate-PR cleanup command sequences.

## Hypotheses
| ID | Subsystem | Hypothesis | Evidence for | Evidence against | Verdict | Confidence | Promotion |
|----|-----------|------------|--------------|------------------|---------|------------|-----------|
| H1 | continual learning | Multi-step release workflows should be scripted while judgment gates stay explicit. | Repeated command sequences handled release verification and PR cleanup. | Canonical PR choice and /teach prose still required judgment. | supported | high | IDENTITY |
| H2 | docs | Every workflow gap found this session belongs in docs. | Several gaps were procedural. | Some were already encoded in skills and would duplicate them. | inconclusive | low | discarded |

## Promotion candidates
Proposed IDENTITY.md addition(s):
- Always script the deterministic substeps of a multi-step release workflow and leave the judgment gates explicit. [continual learning · high · proceduralize] — probe: continual-learning-20260618 | basis: release and PR cleanup repeated as command sequences

## Summary
- **Result**: OP
- **Subsystems**: continual learning, docs
- **Hypotheses**: 2 (supported 1 / refuted 0 / inconclusive 1)
- **Promoted**: 1 to IDENTITY.md
- **Observation**: Release and PR-cleanup command sequences repeated often enough to be worth scripting.

STATUS: RETRO-DONE
```

## Auto-trigger note

Claude Code skills cannot self-trigger. True automatic firing at session end would require a `Stop` hook configured in `settings.json` via `/update-config`. That is explicitly deferred from v1 of this skill.

## Anti-patterns

- **Proposing without filtering.** Running the qualify filter is not optional — a candidate list that hasn't been filtered is not ready to propose.
- **Writing without confirmation.** IDENTITY.md entries require explicit approval.
- **Double-writing.** If a lesson already exists in IDENTITY.md, link or skip. Never add a duplicate.
- **Graduating prematurely.** One session is evidence, not a principle. IDENTITY.md entries need cross-session generalization.
- **Reading outside current context.** Do not read external transcripts. Scope is the open conversation only.
- **Inventing a file to save a lesson in.** A supported lesson that does not generalize is reported and dropped. Do not create a ledger, a dated log, or a scratch note to hold it.
- **Promoting an unfalsifiable claim.** If no session evidence could refute it, it's not a hypothesis — it cannot be promoted.
- **Overfitting one session.** Single-session support is not a principle; that is the IDENTITY.md graduation bar.
- **Confirmation bias.** Every hypothesis must be tested for disconfirming evidence, not just supporting evidence.
- **Scope creep into the lint tools.** Point at `/audit context`, `/wiki lint`, `/audit skills`, etc.; do not run them inline.
- **Bypassing the schema/scripts.** The evidence table, duplicate check, and `## Summary` block are part of the contract, not optional formatting.
