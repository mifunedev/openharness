# Memory

Every agent session produces observations that should outlive the session. Memory
is the lightweight, append-only mechanism for capturing those observations so
the next session — or any sub-agent — can start informed rather than blank.

## What Memory Is

Memory operates on two tiers:

| Tier | Path | What it holds |
|------|------|---------------|
| Daily log | `memory/YYYY-MM-DD/log.md` | Time-stamped entries from each skill or agent run that day |
| Long-term lessons | `memory/MEMORY.md` | Distilled lessons that survived qualify/improve review; one bullet per lesson |

Topic notes (e.g. campaign planning, integration state) go directly under
`memory/<topic>.md` (example: `memory/x-campaign.md`). They are neither daily
nor long-term: they are reference notes an agent would otherwise re-derive from
scratch.

Memory is **not** a database, an audit trail, or a prompt cache. It is the
minimum record needed to avoid repeating the same mistakes across sessions.

## Layout

```
memory/
  MEMORY.md              # long-term lessons (tracked)
  <topic>.md             # per-topic reference notes (tracked or gitignored per need)
  YYYY-MM-DD/
    log.md               # daily append log (gitignored directory; log.md tracked inside)
```

Date format: always `date -u +%Y-%m-%d` (UTC). Never local time.

The `memory/YYYY-MM-DD/` subdirectory is the canonical path. The heartbeat cron
writes there; using a flat `memory/YYYY-MM-DD.md` file is incorrect — the
subdirectory won in practice. Create the directory before writing:

```bash
TODAY=$(date -u +%Y-%m-%d)
mkdir -p "memory/$TODAY"
# then append to memory/$TODAY/log.md
```

For directory anchor and gitignore conventions see `context/rules/directory-readme.md`.
For the repo layout source of truth see `context/rules/repo-layout-source.md`.

## Read

**Orchestrator (full session):** `memory/MEMORY.md` is listed in `CLAUDE.md`
under "Session start" and is auto-loaded at the top of every session alongside
`context/SOUL.md`, `context/IDENTITY.md`, `context/TOOLS.md`, and
`context/USER.md`. No explicit read step needed.

**Sub-agents (on demand):** Sub-agents do not auto-load memory. When a briefing
is relevant, the advisor should include the pertinent excerpt or instruct the
sub-agent to read `memory/MEMORY.md` and `memory/<today>/log.md` as its first
step.

**Heartbeat cron:** The hourly heartbeat reads `memory/<today>/log.md` at the
start of each pulse (creating the directory if it does not exist) and appends a
result entry. See `crons/heartbeat.md` for the full heartbeat spec.

## Write — Memory Improvement Protocol

Run at the end of **every** skill or agent execution — op, dry-run, or error.

**a) Log** — append to `memory/YYYY-MM-DD/log.md`:

```markdown
## <Skill-Name> -- HH:MM UTC
- **Result**: OP | DRY-RUN | PARTIAL | FAIL
- **<field>**: [skill-specific fields follow here — see note below]
- **Observation**: [one sentence]
```

Each skill defines its own field shape. For example, the `/delegate` skill
uses `Plan`, `Action`, and `Duration`; a different skill might use `Branch`,
`Tests`, and `Duration`. The `Result` and `Observation` fields are universal —
every entry carries them. The heading format `## <Skill-Name> -- HH:MM UTC`
is universal; replace `<Skill-Name>` with the name of the skill or agent that
produced the entry.

**b) Qualify** — ask:
- Did anything fail that seemed straightforward?
- Did the run reveal a coupling, constraint, or edge case not captured in any rule?
- Would the next agent start better if this were written down?

**c) Improve** — if actionable, append to `memory/MEMORY.md` under
`## Lessons Learned`. Keep each lesson to one bullet. Lessons that already
appear in `context/IDENTITY.md` or an existing rule must not be duplicated —
link or skip.

The qualify/improve loop is not optional. A log entry without a qualify pass
is an incomplete execution.

## Concurrency

Memory files are plain markdown appended by a single writer at a time. There
is no locking mechanism. The convention that prevents corruption:

- Only the agent or skill that produced an entry writes it.
- Sub-agents may write to the daily log; they must not modify `MEMORY.md`
  directly. Only the orchestrating session promotes a lesson from the daily log
  to `MEMORY.md`.
- Heartbeat writes happen inside a single cron invocation — overlap is
  disabled (`overlap: false` in `crons/heartbeat.md`).

Appending a new `##` section to an existing `log.md` is always safe. Editing
an existing entry is not: treat existing entries as immutable once written.

## What Does NOT Go in Memory

| Anti-pattern | Why |
|-------------|-----|
| Secrets, tokens, credentials | Memory files may be committed; secrets go in environment variables or a vault |
| Raw stdout / command output | Transient logs belong in `/tmp`; only the interpretation goes in memory |
| Content destined for commit messages or PR bodies | Those belong in the commit/PR; duplicating here creates drift |
| Step-by-step task plans | Plans belong in `tasks/<name>/prd.json` or the PRD; memory holds outcomes, not intentions |
| Anything re-derivable in under a minute | If reading one file answers the question, don't memorize the answer |

## Boundary with `context/IDENTITY.md`

`context/IDENTITY.md` and `memory/MEMORY.md` are related but distinct:

| | `context/IDENTITY.md` | `memory/MEMORY.md` |
|-|-----------------------|--------------------|
| **Holds** | Operating principles — how the orchestrator behaves; distilled rules-of-thumb | Experiential observations — what specific runs revealed |
| **Tone** | Prescriptive ("always do X", "never do Y") | Descriptive ("run on YYYY-MM-DD showed that…") |
| **Written by** | Orchestrator sessions, after deliberate review | Any session or skill, immediately after a run |
| **Changed how** | Deliberate revision when evidence overturns a principle | Append-only; entries are never edited after writing |

A lesson graduates from `memory/MEMORY.md` to `context/IDENTITY.md` only when
it has generalized into a principle — that is, it applies across contexts, not
just the run that produced it. Do not double-write: once a lesson is in
`IDENTITY.md`, remove or link it from `MEMORY.md`.

When in doubt: if it says "this session proved X is true of this codebase,"
it goes in `MEMORY.md`. If it says "always do X regardless of session," it
goes in `IDENTITY.md`.

## Pointers

| Resource | Path |
|----------|------|
| Directory README convention | `context/rules/directory-readme.md` |
| Repo layout source of truth | `context/rules/repo-layout-source.md` |
| Heartbeat cron (daily log writer) | `crons/heartbeat.md` |
| Long-term lessons (instance) | `memory/MEMORY.md` |
| Identity / operating principles | `context/IDENTITY.md` |
