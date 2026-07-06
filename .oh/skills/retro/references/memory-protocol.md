# Memory

Every agent session produces observations that should outlive the session. Memory
is the lightweight, append-only mechanism for capturing those observations so
the next session — or any sub-agent — can start informed rather than blank.

## What Memory Is

Memory operates on two tiers:

| Tier | Path | What it holds |
|------|------|---------------|
| Daily log | `.oh/memory/YYYY-MM-DD/log.md` | Time-stamped entries from each skill or agent run that day |
| Long-term lessons | `.oh/memory/MEMORY.md` | Distilled lessons that survived qualify/improve review; one bullet per lesson |

Topic notes (e.g. campaign planning, integration state) go directly under
`.oh/memory/<topic>.md` (example: `.oh/memory/x-campaign.md`). They are neither daily
nor long-term: they are reference notes an agent would otherwise re-derive from
scratch.

Memory is **not** a database, an audit trail, or a prompt cache. It is the
minimum record needed to avoid repeating the same mistakes across sessions.

## Where memory lives — resolve it, don't hardcode it

The memory directory has ONE source of truth, resolved deterministically by
`.oh/scripts/oh-path` (the same pattern `CRONS_DIR` uses for `crons/`):

| Precedence | Source | Notes |
|---|---|---|
| 1 | env override `MEMORY_DIR` | exported into the sandbox by `docker-compose.yml` + `entrypoint.sh` |
| 2 | `harness.yaml` → `paths.memory` | uncomment to relocate the directory project-wide |
| 3 | default `.oh/memory` | what every fresh harness/`oh init` uses |

```bash
MEM="${MEMORY_DIR:-$(bash .oh/scripts/oh-path memory)}"   # absolute, CWD-independent
```

`oh-path` anchors to the repo root (the parent of its own `.oh/`), so it returns
the same absolute path no matter the caller's working directory — a cron in a
worktree, a sub-agent, and the orchestrator all land in the same place. **Resolve
the path this way; never write a bare relative `memory/`.** A bare `memory/`
silently creates a *phantom* `memory/` at the repo root whenever no back-compat
symlink is present (e.g. a fresh `oh init` project), splitting the journal in two.
To move memory in future, change `paths.memory` once — every caller follows, with
no per-skill edits.

Every path below shows the **default** (`.oh/memory`); read each as
`"$MEM"/…`.

## Layout

```
.oh/memory/
  MEMORY.md              # long-term lessons (gitignored - local-per-instance; auto-seeded)
  <topic>.md             # per-topic reference notes (tracked or gitignored per need)
  YYYY-MM-DD/
    log.md               # daily append log (gitignored - local-only; not committed)
```

Both `MEMORY.md` and the `.oh/memory/YYYY-MM-DD/` directory are gitignored (via
`.gitignore`'s `.oh/memory/MEMORY.md` and `.oh/memory/[0-9]*/` rules), so the
durable ledger and daily logs are **local-per-instance** — they do not survive a
fresh clone. Because `MEMORY.md` is therefore absent on a fresh clone/sandbox,
it is auto-seeded (header only) by `.oh/scripts/ensure-memory-file.sh` — the
container entrypoint runs it at boot, and `/retro` runs it before its first
write, so the session-start read never hits ENOENT. Only `README.md` and
explicitly reviewed topic notes persist in git. Public release branches should
not carry `MEMORY.md`, daily logs, or maintainer-private notes.

Date format: always `date -u +%Y-%m-%d` (UTC). Never local time.

The `YYYY-MM-DD/` subdirectory is the canonical path. The heartbeat cron
writes there; using a flat `YYYY-MM-DD.md` file is incorrect — the
subdirectory won in practice. Resolve the memory root, then create the dated
directory before writing:

```bash
TODAY=$(date -u +%Y-%m-%d)
MEM="${MEMORY_DIR:-$(bash .oh/scripts/oh-path memory)}"   # → .oh/memory by default
mkdir -p "$MEM/$TODAY"
# then append to "$MEM/$TODAY/log.md"
```

For directory anchor and gitignore conventions see `.oh/context/directory-readme.md`.

## Read

**Orchestrator (full session):** `.oh/memory/MEMORY.md` is listed in `CLAUDE.md`
under "Session start" and is auto-loaded at the top of every session alongside
`.oh/context/SOUL.md`, `.oh/context/IDENTITY.md`, `.oh/context/TOOLS.md`, and
`.oh/context/USER.md`. No explicit read step needed.

**Sub-agents (on demand):** Sub-agents do not auto-load memory. When a briefing
is relevant, the advisor should include the pertinent excerpt or instruct the
sub-agent to read `.oh/memory/MEMORY.md` and `.oh/memory/<today>/log.md` as its first
step.

**Heartbeat cron:** The hourly heartbeat reads `.oh/memory/<today>/log.md` at the
start of each pulse (creating the directory if it does not exist) and appends a
result entry. See `.oh/crons/heartbeat.md` for the full heartbeat spec.

## Write — Memory Improvement Protocol

Run at the end of **every** skill or agent execution — op, dry-run, or error.

**a) Log** — append to `.oh/memory/YYYY-MM-DD/log.md`:

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

**c) Improve** — if actionable, append to `.oh/memory/MEMORY.md` under
`## Lessons Learned`. Keep each lesson to one bullet. Lessons that already
appear in `.oh/context/IDENTITY.md` or an existing rule must not be duplicated —
link or skip.

The qualify/improve loop is not optional. A log entry without a qualify pass
is an incomplete execution.

## Concurrency

Memory files are plain markdown. Shared runtime logs — especially
`.oh/memory/<today>/log.md` and `.oh/crons/.cron.log` written from cron, isolated
worktrees, or kept tmux sessions — should append through
`scripts/locked-append.sh` (or an equivalent `flock`-guarded helper) so a whole
multi-line record is serialized. Local scratch writes that only one process can
see do not need the helper.

The helper provides record-level serialization on this host. It is not a
durable queue, database, or cross-host lock, and it does not migrate historical
entries. The first migrated critical path is autopilot/caps logging; broader
heartbeat, watchdog, and manual-skill writers are follow-up surfaces.

The convention that prevents corruption:

- Only the agent or skill that produced an entry writes it.
- Sub-agents may write to the daily log; they must not modify `MEMORY.md`
  directly. Only the orchestrating session promotes a lesson from the daily log
  to `MEMORY.md`.
- Cron/shared-root runtime append snippets use `scripts/locked-append.sh` when
  writing multi-line records or liveness lines consumed by watchdogs.
- Heartbeat writes happen inside a single cron invocation — overlap is
  disabled (`overlap: false` in `.oh/crons/heartbeat.md`).

Appending a new `##` section to an existing `log.md` is safe when the writer uses
the locked append convention for shared runtime paths. Editing an existing entry
is not: treat existing entries as immutable once written.

## What Does NOT Go in Memory

| Anti-pattern | Why |
|-------------|-----|
| Secrets, tokens, credentials | Memory files may be committed; secrets go in environment variables or a vault |
| Raw stdout / command output | Transient logs belong in `/tmp`; only the interpretation goes in memory |
| Content destined for commit messages or PR bodies | Those belong in the commit/PR; duplicating here creates drift |
| Step-by-step task plans | Plans belong in `.oh/tasks/<name>/prd.json` or the PRD; memory holds outcomes, not intentions |
| Anything re-derivable in under a minute | If reading one file answers the question, don't memorize the answer |

## Boundary with `.oh/context/IDENTITY.md`

`.oh/context/IDENTITY.md` and `.oh/memory/MEMORY.md` are related but distinct:

| | `.oh/context/IDENTITY.md` | `.oh/memory/MEMORY.md` |
|-|-----------------------|--------------------|
| **Holds** | Operating principles — how the orchestrator behaves; distilled rules-of-thumb | Experiential observations — what specific runs revealed |
| **Tone** | Prescriptive ("always do X", "never do Y") | Descriptive ("run on YYYY-MM-DD showed that…") |
| **Written by** | Orchestrator sessions, after deliberate review | Any session or skill, immediately after a run |
| **Changed how** | Deliberate revision when evidence overturns a principle | Append-only; entries are never edited after writing |

A lesson graduates from `.oh/memory/MEMORY.md` to `.oh/context/IDENTITY.md` only when
it has generalized into a principle — that is, it applies across contexts, not
just the run that produced it. Do not double-write: once a lesson is in
`IDENTITY.md`, remove or link it from `MEMORY.md`.

When in doubt: if it says "this session proved X is true of this codebase,"
it goes in `MEMORY.md`. If it says "always do X regardless of session," it
goes in `IDENTITY.md`.

## Pointers

| Resource | Path |
|----------|------|
| Directory README convention | `.oh/context/directory-readme.md` |
| Heartbeat cron (daily log writer) | `.oh/crons/heartbeat.md` |
| Long-term lessons (instance) | `.oh/memory/MEMORY.md` |
| Identity / operating principles | `.oh/context/IDENTITY.md` |
