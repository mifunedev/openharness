---
name: retro
argument-hint: "[--dry-run] [--focus <subsystem>]"
allowed-tools: Read, Grep, Bash, Edit
description: |
  Scientific session-closing retrospective: scan the current conversation,
  turn each signal into a falsifiable hypothesis, cite session evidence for
  AND against it, assign a verdict (supported / refuted / inconclusive) and a
  confidence level, then promote only supported, sufficiently-confident
  hypotheses into the harness memory tiers (.oh/memory/MEMORY.md,
  .oh/context/IDENTITY.md) behind a propose-then-confirm gate. Reflects on six
  learning/knowledge subsystems through the lens of this session — continual
  learning, context compression, reinforcement learning, wiki, docs, and
  memory scaffolding — and points at the deep-dive lint/audit skills rather
  than running them. Operationalizes the Memory Improvement Protocol
  (.oh/skills/retro/references/memory-protocol.md) as an explicit, evidence-driven, session-closing
  skill rather than a per-run afterthought. Always appends a log entry.
  TRIGGER when: /retro invoked, or session closing with decisions,
  surprises, or failures worth preserving.
---

# Retro

Scientific session-closing retrospective. Turn the current conversation's signals into falsifiable hypotheses, test each against session evidence (for and against), assign a verdict and confidence, and promote only the supported, sufficiently-confident ones — with explicit confirmation — into the harness memory tiers (`.oh/memory/MEMORY.md`, `.oh/context/IDENTITY.md`). Always appends a log entry regardless of outcome.

This is the deliberate "Improve" pass of the Memory Improvement Protocol defined in `.oh/skills/retro/references/memory-protocol.md`, now evidence-driven. Running it as a named skill turns an optional afterthought into a first-class, propose-then-confirm operation — and the scientific layer guards against overfitting a single session into a durable lesson.

Use the self-contained helpers in `${CLAUDE_SKILL_DIR}/scripts/` for deterministic checks and log rendering; use `${CLAUDE_SKILL_DIR}/references/report-schema.md` as the output contract. Shared repo primitives such as `.oh/scripts/locked-append.sh` are allowed only for cross-skill infrastructure.

## When to use

- `/retro` invoked explicitly to close a session.
- Proactively, after a session that produced decisions, surprises, regressions, or failure modes the next agent would benefit from knowing.

## When NOT to use

- **`/harness-audit`** — audits harness code health via four parallel sub-agents. That is a structural audit, not a behavioral/conversational pass.
- **`/context-audit`** — scores the default-loaded context budget across four dimensions. It trims files, not behaviors.
- **`/skill-lint`** — scores individual skills for staleness. It reviews skill quality, not session outcomes.
- **`/wiki lint`** — health-checks the wiki corpus for staleness and broken links. It curates the wiki, not the session.
- **Trivial sessions** — if the session contained only mechanical read-only queries or single-command invocations with no surprises, announce the skip and proceed to log.

Key boundary: `/retro` is *session-scoped reflection*. The lint/audit skills above are the *deep-dive tooling* it points at — not what it runs. It is the only skill whose domain is *current-session signals → falsifiable hypotheses → memory/identity*.

## Scope

Current conversation only. `/retro` does not read prior daily logs, prior sessions, or the `~/.claude/projects/...` auto-memory store. It works from what is already in context.

## Deterministic contract

Before writing anything except the required log entry, produce a report that follows `${CLAUDE_SKILL_DIR}/references/report-schema.md`. At minimum it contains:

```markdown
## Session signals
## Hypotheses
| ID | Subsystem | Hypothesis | Evidence for | Evidence against | Verdict | Confidence | Promotion |
|----|-----------|------------|--------------|------------------|---------|------------|-----------|
## Promotion candidates
## Log entry
STATUS: RETRO-DONE
```

Run the helper when a report artifact exists:

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/validate-retro-report.sh" /path/to/retro-report.md
```

If no artifact exists because the response is generated inline, still follow the schema exactly. The final non-empty line must be `STATUS: RETRO-DONE`.

## The scientific loop

Every signal from the session passes through four moves before it can become a memory candidate:

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

- Only `supported` + `medium`-or-higher confidence may reach `.oh/memory/MEMORY.md`.
- `.oh/context/IDENTITY.md` *additionally* requires cross-session generalization (a single session, however well-supported, is not a principle).
- `refuted`, `inconclusive`, and any `low`-confidence hypothesis stay in the log only — never promoted.

## The six-subsystem lens

Seed hypotheses by asking, for each subsystem, what *this session* revealed about how well it worked. A `--focus <subsystem>` arg narrows the whole pass to one lens.

| Subsystem | Guiding question (what did this session reveal?) | Lives in / deep-dive skill |
|-----------|--------------------------------------------------|----------------------------|
| Continual learning | Did prior memory/identity get used, ignored, or contradicted? Did anything durable emerge? | `.oh/memory/MEMORY.md`, `.oh/context/IDENTITY.md` |
| Context compression | Was loaded context bloated/redundant, or did a rule prove load-bearing? | `/context-audit`, `/caveman` |
| Reinforcement learning | Did advisor/executor or recursive-decomposition patterns help or hurt? Over/under-delegation? | `.oh/agents/advisor.md` |
| Wiki | Did the session surface knowledge that belongs in the wiki, or hit stale/missing entries? | `/wiki ingest`, `/wiki lint` |
| Docs | Did human-facing doc gaps or inaccuracies surface? | `docs/` (site/blog live in `mifunedev/openharness-web`) |
| Memory scaffolding | Did the log/tier protocol itself create friction or work cleanly? | `.oh/skills/retro/references/memory-protocol.md`, `/retro` |

## Instructions

### 1. Gather session signals

Scan the current conversation, organized by the six lenses above:
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

Discard any surviving hypothesis that matches a row in the "What Does NOT Go in Memory" table (`.oh/skills/retro/references/memory-protocol.md`):

| Discard if | Reason |
|------------|--------|
| Contains a secret, token, or credential | Memory may be committed |
| Is raw stdout or command output | Use interpretation, not transcript |
| Belongs in a commit message or PR body | Duplication causes drift |
| Is a step-by-step task plan | Plans belong in `.oh/tasks/<name>/prd.json` |
| Re-derivable in under a minute | Reading one file answers it — don't memorize |

Also discard any hypothesis already captured, verbatim or in substance, in `.oh/memory/MEMORY.md` or `.oh/context/IDENTITY.md` — link or skip; never double-write. Finally, drop from promotion every hypothesis whose verdict is `refuted` or `inconclusive`, or whose confidence is `low` (these remain in the log only).

### 5. Classify survivors by tier

For each surviving hypothesis — now carrying its evidence and confidence — classify:

| Tier | Write to | Criterion |
|------|----------|-----------|
| **Log** | `.oh/memory/<UTC-date>/log.md` | Transient observation: true of this run, not necessarily future ones. Free to write. |
| **MEMORY.md** | `.oh/memory/MEMORY.md` under `## Lessons Learned` | Experiential, session-specific: "this session showed X is true of this codebase." Descriptive tone. Propose-then-confirm. |
| **IDENTITY.md** | `.oh/context/IDENTITY.md` under `## Lessons learned (append-only)` | Graduated principle: applies across contexts, not just this run. Prescriptive tone ("always X"). **Never auto-write.** Propose a diff for approval. A lesson earns this only when it generalizes across sessions. |

When in doubt between MEMORY.md and IDENTITY.md: if you would scope it to "this session" or "this codebase right now," it belongs in MEMORY.md. If you would remove the scoping and say "always," it belongs in IDENTITY.md.

### 5a. Triage tag — route each promotable lesson to its correction surface

For every lesson that survived to the promotion list (verdict `supported`, confidence `medium` or higher), assign exactly one triage tag before proposing it. Route to the **cheapest reliable surface** per `.oh/evals/README.md § Correction-surface triage`:

| Tag | Use when | Proposed artifact |
|-----|----------|-------------------|
| `harden` | Lesson is a guardrail — something that must not happen | A hook + a unit-test probe (`.oh/evals/probes/<id>.sh`, tier A) |
| `proceduralize` | Lesson is a technique — a step, pattern, or workflow improvement | A skill step addition + a doc-lint probe (`.oh/evals/probes/<id>.sh`, tier A) |
| `eval` | Genuine judgment residue only — cannot be mechanically checked | Tier-B deferred; never a hard gate in v1 |

**Default away from `eval`.** Proposing the `eval` tag requires an explicit justification note: state why neither `harden` nor `proceduralize` can close the lesson. If no justification is given, demote to `proceduralize` (or `harden` if the lesson is a guardrail).

Each proposed MEMORY.md line must carry its triage tag and a proposed probe id:

```
- YYYY-MM-DD: <lesson> [<subsystem> · <confidence> · harden|proceduralize|eval] — probe: <id> | basis: <one clause>
```

The probe id follows the pattern `<subsystem-slug>-<YYYYMMDD>` (e.g., `memory-scaffolding-20260610`). For `eval`-tagged lessons, use `probe: deferred-tier-b` and append the justification note. The probe id is a forward reference — the actual `.oh/evals/probes/<id>.sh` file is created separately and is out of scope for `/retro` itself.

### 6. Propose-then-confirm gate

Before writing to `.oh/memory/MEMORY.md` or `.oh/context/IDENTITY.md`, present the proposed additions as a clearly formatted block. Each proposed line shows its `[subsystem · confidence]` tag and a one-clause evidence basis:

```
Proposed MEMORY.md addition(s):
- YYYY-MM-DD: <one-sentence lesson> [<subsystem> · <confidence> · harden|proceduralize|eval] — probe: <id> | basis: <one clause>

Proposed IDENTITY.md addition(s):
- <prescriptive principle, "always X" or "never Y"> [<subsystem> · <confidence> · harden|proceduralize|eval] — probe: <id> | basis: <one clause>

Type APPROVE to write, SKIP to discard any item, or EDIT <n> <new text> to revise.
```

Do not write to either file until the user responds. Log-tier entries do not require approval. If `--dry-run` was passed, write only the required `.oh/memory/<UTC-date>/log.md` entry with `Result: DRY-RUN`; never write MEMORY.md or IDENTITY.md in dry-run mode.

Before proposing, pipe candidate lines through the self-contained duplicate helper and skip exact/substantive duplicates it reports:

```bash
printf "%s\n" "<candidate line>" | bash "${CLAUDE_SKILL_DIR}/scripts/check-memory-duplicates.sh"
```

### 7. Write approved changes

First ensure the durable ledger exists (it is gitignored/local-per-instance, so
a fresh clone lacks it; this seeds the `## Lessons Learned` header idempotently
and never overwrites):

```bash
sh .oh/scripts/ensure-memory-file.sh
```

For each APPROVED item:

**`.oh/memory/MEMORY.md`** — append under `## Lessons Learned`:
```markdown
- **YYYY-MM-DD**: <lesson>
```

**`.oh/context/IDENTITY.md`** — append under `## Lessons learned (append-only)`:
```markdown
- **YYYY-MM-DD**: <principle>
```

Both files are append-only. Never edit existing entries.

### 8. Append the log entry

Always run this step, regardless of whether anything was promoted. Get the current UTC time first:

```bash
date -u +%H:%M
TODAY=$(date -u +%Y-%m-%d)
MEM="${MEMORY_DIR:-$(bash .oh/scripts/oh-path memory)}"; mkdir -p "$MEM/$TODAY"
```

Render the log entry with the skill-local helper, then append it with the shared locked append primitive:

```bash
LOG_ENTRY=$(bash "${CLAUDE_SKILL_DIR}/scripts/render-log-entry.sh" \
  --result OP \
  --subsystems "<which of the 6 produced signals, or focus: name>" \
  --hypotheses <total> --supported <n> --refuted <n> --inconclusive <n> \
  --memory <n> --identity <n> \
  --observation "<one sentence — strongest supported finding, or no durable patterns>")
printf "%s\n" "$LOG_ENTRY" | .oh/scripts/locked-append.sh ".oh/memory/$TODAY/log.md"
```

Use `--result DRY-RUN` for dry-runs and `--result SKIPPED-TRIVIAL` for trivial skips.

## MEMORY.md vs IDENTITY.md boundary

| | `.oh/memory/MEMORY.md` | `.oh/context/IDENTITY.md` |
|-|--------------------|-----------------------|
| **Tone** | Descriptive — "this session showed…" | Prescriptive — "always X", "never Y" |
| **Scope** | Session or codebase-specific observation | Generalizes across contexts |
| **Written by** | This skill, immediately after the session | Only after deliberate review confirms generalization |
| **Changed how** | Append-only; entries are never edited | Deliberate revision; graduation is rare |

A lesson graduates from MEMORY.md to IDENTITY.md when it has recurred across multiple sessions or contexts, not from a single run. Do not graduate prematurely.

## Example

```markdown
## Session signals
- The session required manual release, PR land, and duplicate-PR cleanup command sequences.

## Hypotheses
| ID | Subsystem | Hypothesis | Evidence for | Evidence against | Verdict | Confidence | Promotion |
|----|-----------|------------|--------------|------------------|---------|------------|-----------|
| H1 | memory scaffolding | Release and PR cleanup have deterministic substeps worth scripting. | Repeated command sequences handled release verification and PR cleanup. | Canonical PR choice and /teach prose still required judgment. | supported | high | MEMORY |
| H2 | docs | Every workflow gap found this session belongs in docs. | Several gaps were procedural. | Some were already encoded in skills and would be duplicate memory. | inconclusive | low | discarded |

## Promotion candidates
Proposed MEMORY.md addition(s):
- 2026-06-18: Multi-step GitHub release and PR-cleanup workflows have deterministic substeps that should be scripted while leaving judgment gates explicit. [memory scaffolding · high · proceduralize] — probe: memory-scaffolding-20260618 | basis: release and PR cleanup repeated as command sequences

Proposed IDENTITY.md addition(s):
- none

## Log entry
- would append the rendered `Retro -- HH:MM UTC` block.

STATUS: RETRO-DONE
```

## Auto-trigger note

Claude Code skills cannot self-trigger. True automatic firing at session end would require a `Stop` hook configured in `settings.json` via `/update-config`. That is explicitly deferred from v1 of this skill.

## Anti-patterns

- **Proposing without filtering.** Running the qualify filter is not optional — a candidate list that hasn't been filtered is not ready to propose.
- **Writing without confirmation.** MEMORY.md and IDENTITY.md entries require explicit approval. The log entry does not.
- **Double-writing.** If a lesson already exists in MEMORY.md or IDENTITY.md, link or skip. Never add a duplicate.
- **Graduating prematurely.** One session is evidence, not a principle. IDENTITY.md entries need cross-session generalization.
- **Reading outside current context.** Do not read prior `log.md` files or external transcripts. Scope is the open conversation only.
- **Skipping the log.** Every invocation — op, dry-run, trivial skip — appends a log entry. No exceptions.
- **Promoting an unfalsifiable claim.** If no session evidence could refute it, it's not a hypothesis — it cannot be promoted.
- **Overfitting one session.** Single-session support is not a principle; that is the MEMORY.md → IDENTITY.md graduation bar.
- **Confirmation bias.** Every hypothesis must be tested for disconfirming evidence, not just supporting evidence.
- **Scope creep into the lint tools.** Point at `/context-audit`, `/wiki lint`, `/skill-lint`, etc.; do not run them inline.
- **Bypassing the schema/scripts.** The evidence table, duplicate check, and rendered log entry are part of the contract, not optional formatting.
