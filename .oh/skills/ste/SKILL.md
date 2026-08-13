---
name: ste
description: |
  Write and rewrite technical prose in Simplified Technical English style:
  short declarative sentences, active voice, imperative procedures, one term
  per concept, no hedges, and explicit conditions. Never simplifies code,
  commands, identifiers, paths, or quoted literals. Marks missing values with
  a placeholder rather than inventing one. Ships a deterministic checker.
  TRIGGER when: asked to write, rewrite, simplify, clarify, tighten, or
  review documentation, a README, a runbook, a spec, release notes, a PR or
  commit body, an error message, CLI help text, an API description, or agent
  instructions; or when asked for plain English, controlled language, STE,
  Simplified Technical English, or "make this unambiguous".
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
metadata:
  mifune:
    surface: writing-standard
    checker: scripts/ste-check.sh
---

# STE — Simplified Technical English

Write prose that one reader resolves one way. Apply this skill to any text that
lands in a git-tracked file or a GitHub-posted body.

## Status and affiliation

This skill claims **no ASD-STE100 certification** and **no complete standards
compliance**. STEMG publishes and maintains ASD-STE100. STEMG neither endorses
nor certifies this skill. The authoritative standard lives at
`https://www.asd-ste100.org/`.

This skill follows the published shape of that standard: a set of writing rules
plus a controlled vocabulary. Every rule statement and every word entry here
carries our own wording. This skill reproduces no text from ASD-STE100 Issue 9
and no entry from its controlled dictionary. Read the standard itself when you
need the standard itself.

## Priority order

Apply these in order. A longer sentence wins when the longer sentence removes
ambiguity.

1. **Technical correctness** — the text must state what the software does.
2. **Unambiguous meaning** — one reading, not two.
3. **Consistent terminology** — one term per concept, everywhere.
4. **Explicit sequencing** — the reader knows what comes first.
5. **Concision** — cut what carries no information.

## Never simplify these

Copy each of the following byte for byte. Rewriting any of them breaks the text:

- code blocks and inline code
- commands, flags, and arguments
- API names, function names, and symbol names
- filenames, directory names, and paths
- identifiers, environment-variable names, and configuration keys
- error strings, log lines, and quoted literals
- numbers, units, versions, and exit codes

Never trade technical meaning for a shorter sentence.

## Never invent a missing value

When the source omits a value, do **not** supply one. Mark the gap with an
angle-bracket placeholder, then raise the question:

```text before
Restart it after a while.
```

```text after
Restart <component> after <duration>.
```

Ask the author for `<component>` and `<duration>`. A guessed duration reads as
fact and survives every later edit.

## Precedence over `/caveman`

STE governs *artifacts*. `/caveman` governs *conversation*.

| Text | Standard |
|---|---|
| docs, specs, runbooks, README files, code comments | `/ste` |
| commit messages, PR bodies, PR comments, issue bodies | `/ste` |
| the live chat reply to the operator | `/caveman` |

Rewrite a caveman-compressed draft to STE rules before you commit the draft,
post the draft, or write the draft to disk. Level `full` drops articles and
leaves fragments standing (`.oh/skills/caveman/SKILL.md:31`), which breaks the
full-sentence rule. Do not run `/caveman-compress` against a file that `/ste`
governs.

STE adopts two `/caveman` clauses by reference rather than restating them:

- never compress code, commands, identifiers, or error strings
  (`.oh/skills/caveman/SKILL.md:41-46`);
- drop back to plain prose for security warnings and for irreversible-action
  confirmations (`.oh/skills/caveman/SKILL.md:48-57`).

## Rewrite mode

Run these seven steps against an existing document.

1. Read the source to the end. Change nothing yet.
2. List every ambiguity. Mark each one `resolvable` or `missing`.
3. Rewrite each sentence to carry one idea, in the active voice.
4. Replace every non-approved word with its approved replacement.
5. Move each condition ahead of the action the condition guards.
6. Split each step that holds more than one action.
7. Mark each `missing` value with a placeholder. Never supply a value.
8. Run `scripts/ste-check.sh` against the file. Fix each finding. Repeat until
   the checker exits 0.

Steps 1 and 2 come before any edit. An agent that edits before it reads loses
the ambiguities that the original wording carried.

## Authoring mode

Run these five steps for new text.

1. Name the reader and name the artifact type.
2. List the actions the reader must take, in execution order.
3. Write each action against the sentence frame below.
4. Add each prerequisite ahead of the step that consumes the prerequisite.
5. Run `scripts/ste-check.sh` against the file. Fix each finding.

### The sentence frame

```text
CONDITION → ACTOR → ACTION → OBJECT → EXPECTED RESULT
```

```text after
If `config.yaml` sets `DOCKER_SOCKET=true`, the operator runs `make sandbox` to
start the `openharness` container. The container reports `healthy` within 60
seconds.
```

Drop a slot only when the slot carries no information. Never drop the object.
Never drop the condition.

## Procedural writing

| Rule | Shape |
|---|---|
| Lead with the action | `Run the migration.` beats `The migration should now be run.` |
| Number ordered steps | Use a numbered list whenever order changes the outcome |
| One action per step | Split a step that holds two verbs |
| Prerequisites first | Place a prerequisite ahead of the step that consumes the prerequisite |
| State the result | Close each step with what the reader observes |
| Warn before the action | Place the warning ahead of the command that triggers the loss |
| Name the actor | Write who acts: the operator, the agent, the CI job, the container |
| Name the context | Write where the command runs: host or container, local or remote |
| No hidden sequences | Never bury a second action inside a subordinate clause |

## Software-specific word choices

| Do not write | Write |
|---|---|
| `spin up a container` | `start the container` |
| `nuke the volume` | `delete the volume` |
| `bounce the service` | `restart the service` |
| `the box` | `the host` |
| `make sure Docker socket support is turned on` | `set DOCKER_SOCKET=true` |
| `run the migrations when you get a chance` | `run pnpm db:migrate before you start the API` |
| `the command failed` | `the command exited with code 1` |
| `it should work now` | `the endpoint returns HTTP 200` |
| `blow away the container` | `delete the openharness container` |
| `the system will handle it` | `the scheduler retries the job three times` |

## Ambiguity detection

Flag each of these during step 2 of rewrite mode:

- a pronoun with no named antecedent
- a missing actor: who performs the action
- a missing object: what the action changes
- a missing condition: when the reader acts
- a missing unit, file, directory, or identifier
- an unstated execution context: host or container
- an unstated location: local or remote
- an unstated order between two steps
- more than one action inside one step
- a word that carries more than one meaning in software text

Treat these words as unresolved on sight: `normally`, `usually`, `some`,
`appropriate`, `proper`, `correct`, `soon`, `as needed`, `if necessary`,
`a while`.

## The 10-question check

Ask these of every sentence you write or rewrite. A `no` on any question sends
the sentence back.

1. Does the sentence carry exactly one idea?
2. Does the instruction name the actor?
3. Does the instruction name the object?
4. Does the condition come ahead of the action?
5. Does the term match the term used elsewhere for the same concept?
6. Does the text state the unit, the path, and the identifier?
7. Does every pronoun point at a named antecedent?
8. Does the sentence stay clear of hedges and qualifiers?
9. Does the text keep code, commands, and literals unchanged?
10. Does the text mark every missing value with a placeholder?

## The checker

```bash
# Scan narrative prose. The checker skips frontmatter, fenced blocks, headings.
bash .oh/skills/ste/scripts/ste-check.sh docs/runbook.md

# Scan only the specimens inside fenced blocks tagged "after".
bash .oh/skills/ste/scripts/ste-check.sh --blocks after docs/examples.md

# Raise or lower the sentence word cap. Default: 25.
bash .oh/skills/ste/scripts/ste-check.sh --max-words 30 docs/architecture.md
```

Exit codes: `0` clean, `1` one finding or more, `2` bad arguments.

The checker reports `file:line: RULE-ID message` and writes to no file. Six rule
identifiers cover the detectors: `HEDGE`, `VAGUE`, `PASSIVE`, `LONG`,
`COMPOUND`, `WORD`.

The checker strips inline code spans before every match. Wrap a banned word in
backticks whenever you must name the word itself.

The checker catches mechanical defects. The checker misses missing actors,
missing units, and invented values. A clean exit means the prose passed the
detectors, not that the prose passed review. Run the 10-question check yourself.

## Guardrails

- Never edit the checker to make a document pass. Fix the document.
- Never simplify a code block, a command, or an error string.
- Never remove a warning to shorten a procedure.
- Never resolve an ambiguity by guessing. Mark the gap and ask.
- Keep a rewrite reviewable: change wording, keep every technical claim.

## Memory Protocol

At the end of every run, including failures, complete the canonical
log → qualify → improve cycle when the Open Harness memory scaffold exists.

### Log

```bash
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
TODAY=$(date -u +%Y-%m-%d)
TIME=$(date -u +%H:%M)
if [ -x "$ROOT/.oh/scripts/oh-path" ] && [ -x "$ROOT/.oh/scripts/locked-append.sh" ]; then
  MEM="${MEMORY_DIR:-$(bash "$ROOT/.oh/scripts/oh-path" memory)}"
  mkdir -p "$MEM/$TODAY"
  "$ROOT/.oh/scripts/locked-append.sh" "$MEM/$TODAY/log.md" <<EOF

## STE -- $TIME UTC
- **Result**: <OP | PARTIAL | FAIL>
- **Mode**: <rewrite | author | review>
- **Artifact**: <path or none>
- **Checker**: <exit code and finding count, or not run>
- **Observation**: <one concise finding or no durable finding>
EOF
fi
```

### Qualify and improve

Ask whether a rewrite exposed an undocumented coupling, a recurring ambiguity
pattern, or a checker gap worth closing. Record `no durable finding` when
nothing surfaced. Otherwise check `MEMORY.md` and `IDENTITY.md` for duplication,
then use the propose-then-confirm gate in `/retro` to append one lesson.

See `.oh/skills/retro/references/memory-protocol.md` for the canonical protocol.

## Reference

| File | Holds |
|---|---|
| `references/rules.md` | 53 rules across 9 sections |
| `references/dictionary.md` | 198 non-approved words mapped to replacements |
| `references/examples.md` | 24 before/after pairs across 13 domains |
| `scripts/ste-check.sh` | the deterministic checker |

Read `references/rules.md` when you need the rule behind a finding. Read
`references/dictionary.md` when you need a replacement word. Read
`references/examples.md` when you need the shape of a rewrite.

The `before` blocks in `references/examples.md` double as the checker's
regression fixture. `--blocks before` must exit 1. `--blocks after` must exit 0.
