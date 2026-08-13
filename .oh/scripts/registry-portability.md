# Registry portability contract and exception list

`.oh/scripts/registry-portability.sh` reads the published copy of each skill in
the `mifunedev/skills` registry. It reports every reference an installer cannot
resolve. This file is the contract that check enforces.

The file carries two things at once. The prose explains the transform from the
canonical copy to the published copy, and the rules the check applies. One fenced
block tagged `allow` holds the machine-readable exception list the script parses.
The reviewer and the checker read the same file, so the documentation and the
enforced data cannot drift apart.

## Why this file sits beside the script

`.oh/manifest.json` lists `scripts/**` in its include list. It does not list
`docs/**`, so `.oh/docs/` is not part of the shipped payload. The linter fails
closed: it exits 2 when its exception file is missing. A copy of this file under
`.oh/docs/` would be absent from every installed harness, and the script would
hard-error on every run there. The file therefore lives in `.oh/scripts/`.
`.oh/docs/README.md` carries an index entry so a reviewer can still find it.

## The two copies

| Copy | Path |
|---|---|
| Canonical | `.oh/skills/<name>/` in this repository |
| Published | `skills/<name>/` in the `mifunedev/skills` registry, base branch `master` |

The registry holds 18 skill folders today.

## The intended deltas

A byte-for-byte comparison of the two copies cannot do this job, because the two
copies are deliberately different. For the `ste` skill the intended deltas are:

1. Invocation paths become relative. The published copy runs
   `bash scripts/ste-check.sh …` where the canonical copy runs
   `bash .oh/skills/ste/scripts/ste-check.sh …`.
2. Harness-specific sections are generalized or made conditional.
3. The published copy adds a `LICENSE` file that the canonical copy does not
   carry.

A byte-equality check reports all three as failures. The check therefore reads
the published copy on its own, and asserts that the copy names no path and no
command an installer will not have.

## The rules

The linter reads every `*.md` and `*.sh` file under each folder in
`<registry>/skills/`. It discovers the folders by scanning that directory and
hardcodes no skill name. It applies three rules.

### `OH-PATH`

Reports any `.oh/…` path in a scanned file. An installer has no `.oh/` tree, so
the reference cannot resolve.

### `HARNESS-SKILL`

Reads the first whitespace-delimited token inside a backticked span. The rule
reports that token when it starts with `/` and the remainder names no folder
under `skills/`. The registry is the installer's whole world, so a slash command
outside it is unreachable.

The backtick is required. A bare `/dev/null` or `tasks/<slug>/critique.md` is a
filesystem path, not a slash command, and a looser pattern reports over 100 false
hits across the registry. Because the rule takes the first token, an invocation
that carries arguments, such as a backticked `/name <arg>`, is still read.

Two suppression sets keep the rule honest:

- Unix filesystem roots: `bin`, `boot`, `dev`, `etc`, `home`, `lib`, `media`,
  `mnt`, `opt`, `proc`, `root`, `run`, `sbin`, `srv`, `sys`, `tmp`, `usr`, `var`.
- Metasyntactic placeholders whose name starts with `foo`, `bar`, `baz`, or
  `qux`. Documentation uses these to stand for a name rather than to name one.

### `DANGLING-REF`

Reports a backticked span that begins with `references/<f>.md` or
`scripts/<f>.sh` when that file does not exist in the skill folder being scanned.
The published folder is the installer's whole copy of the skill, so a sibling
file that is not in it cannot be opened.

The rule never double-reports a path that `OH-PATH` already reported on the same
line. A `.oh/` path is counted once.

## Running the check

```bash
bash .oh/scripts/registry-portability.sh --registry <path-to-registry-checkout>
```

Two further flags:

- `--allow <file>` reads the exception list from another file instead of this
  one.
- `--strict-exceptions` turns a stale exception entry into exit 1.

Every run prints the number of skill folders and files it read, including a clean
run. The script writes to no file under the registry it scans.

## How a publisher reads the result

The exit code alone does not tell a publisher whether their change is safe.
Against live `master` the check exits 1 today and will keep exiting 1 until the
registry repairs its five `KNOWN` defects, because `KNOWN` deliberately does not
suppress the exit code.

Read the `neither` count instead. It is the number of findings that are neither
accepted nor already triaged — that is, the drift this run is the first to see.

| Output | Meaning for a publisher |
|---|---|
| `neither: 0` | No new drift. The surviving findings are the recorded `KNOWN` backlog. |
| `neither: N` (N > 0) | Your change added N unportable references. Repair them, or add an entry with a reason. |

The exit code stays honest about the registry's true state; `neither` is the
signal that answers "did I make it worse".

## The two probes

| Probe | Reads | Skips when |
|---|---|---|
| `.oh/evals/probes/registry-portability.sh` | the published registry | `OH_REGISTRY_CHECKOUT` is unset |
| `.oh/evals/probes/registry-portability-gate.sh` | this repository | never |

The first probe scans the registry, so it needs a checkout and reports SKIPPED
without one. That is every run in CI, which has no registry clone. It is the
right result for that contract — a tree you do not have cannot be scanned — but
it means the first probe guards nothing by default.

The second probe carries the half of the contract that lives in this repository,
so it is always armed. It asserts the linter is present and still fails closed,
the `allow` block parses and every entry is well formed, and the publishing step
in `.oh/skills/builder/references/skill.md` still names the gate. Those are the
ways this check gets silently disarmed: deleted, made unparseable, or left with
no caller. None of them would turn the first probe red, because the first probe
is not running.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Every finding was suppressed by an `ALLOW` entry. |
| 1 | A finding survives, whether that finding is labelled `KNOWN` or is new. |
| 2 | A fail-closed error. |

Exit 2 covers a missing `--registry` argument, a `--registry` path that does not
exist, a registry with no `skills/` subdirectory, a `skills/` subdirectory that
holds no skill folder, a scanned-file count of zero, a missing exceptions file,
and an exceptions file that holds no fenced block tagged `allow`. A scan that
reads nothing must never look like a pass.

An `allow` block that is present but empty is a valid zero-exception
configuration. It does not exit 2.

## Exceptions

The `allow` block below holds the exception list. Inside the block, `#` comments
and blank lines are ignored. Every other line carries five `|`-separated fields:

```text
CLASS | RULE | <registry-relative path> | <12-hex line hash> | <reason>
```

### The two classes

- **`ALLOW`** — the reference is intentional and correct. `ALLOW` suppresses the
  finding. The reason states why the unreachable reference is nonetheless safe
  for an installer.
- **`KNOWN`** — the finding is real. It is triaged and reported, and left
  unrepaired. `KNOWN` does not suppress the finding and does not change the exit
  code. The reason states why this change did not repair it.

### The line hash

An entry keys on the tuple of registry-relative path, rule id, and a hash of the
whole source line. The hash is the first 12 hex characters of the sha256 of the
source line, whitespace-trimmed, with no trailing newline:

```bash
printf '%s' "$trimmed" | sha256sum | cut -c1-12
```

The key is the line, not the matched token and not the line number. Editing a
guarded line changes its hash, and the exception stops applying. Hashing also
survives a `|` inside a source line, which matters because real findings sit
inside Markdown table rows.

Every reason is non-empty. No reason contains a `|` character, because `|` is the
field separator.

Staleness is scoped to the file the entry names. An entry whose hash occurs
nowhere in that one file is reported as stale. A stale entry warns and leaves the
exit code alone, unless you pass `--strict-exceptions`.

### How to add an entry

1. Run the check against your registry checkout.
2. Copy the paste-ready stub the linter prints under the finding. The stub
   carries the class placeholder, the rule id, the registry-relative path, and
   the line hash, so you never compute the hash by hand.
3. Replace the class placeholder with `ALLOW` or `KNOWN`.
4. Write the reason. For `ALLOW`, state why the reference is safe for an
   installer. For `KNOWN`, state why the finding stands unrepaired. Use no `|`
   character.
5. Paste the completed line into the `allow` block below.

## Limitations

- `HARNESS-SKILL` reads backticked tokens only. A bare `/name` written without
  backticks is not reported.
- `HARNESS-SKILL` reads single-word routes only. A two-word route is not
  reported.
- `OH-PATH` covers `.oh/` only. The adjacent class is real and larger: the
  registry carries 79 `.claude/` references across 15 of its 18 skills. Widening
  the rule is a follow-up, deliberately left out of this change.
- A command the client provides, such as a Claude Code built-in, is
  indistinguishable from a skill the registry is missing. The rule reports both,
  and the exception list dispositions them. There is no suppression set of client
  built-ins, because that list is client-specific and would rot.
- `template/`, which a new skill author copies from, sits outside `skills/` and is
  not scanned.

## When this check actually runs

Nothing runs the registry scan automatically. `OH_REGISTRY_CHECKOUT` is set in no
GitHub workflow and no cron; it appears only in the probe that reads it and in
this file. CI runs the probe suite (`.github/workflows/ci-harness.yml` and
`release.yml` both call `.oh/skills/eval/run.sh`), so the gate probe fires on
every run — but the registry-scanning probe finds no checkout there and reports
SKIPPED every time.

So the two halves have different triggers:

| What | Runs when | Automatic |
|---|---|---|
| Gate wiring (`registry-portability-gate.sh`) | every CI run | yes |
| Registry scan (the linter, and the probe that wraps it) | a human runs it | no |

The scan's intended trigger is the publishing step in
`.oh/skills/builder/references/skill.md`: run it against a checkout before
opening the registry pull request. That is a documented manual procedure, not an
automated gate, and it catches drift only on the path that goes through this
repository.

To close that gap, a scheduled job under `.oh/crons/` would clone the registry
and run the probe armed. That is the only option that also catches a commit made
directly against the registry, which the publishing step cannot see. It is not
built here: the check exits 1 against live master until the five recorded
defects are repaired there, so a cron added today would page on a known backlog
from its first run. Repair the `KNOWN` entries first, then schedule it.

## How far this check reaches

The registry has no CI workflow. Its `.github/` directory holds issue and pull
request templates only. The registry document `docs/portability.md` is therefore
wrong where it says that `scripts/validate.sh` "runs on every PR via
`.github/workflows/ci.yml`".

This check gates publishing from the harness side. It cannot block a commit made
directly against the registry.

## An exception is not a repair

An entry in the block below records a decision. It does not change the registry.
`KNOWN` entries mark real defects that still stand in the published copy. Read
`.oh/tasks/registry-drift-lint/sweep.md` for the findings this change reported
and left unfixed.

## The exception list

Day-one state, measured against registry master `1d11ab6`: 8 `ALLOW` entries and
5 `KNOWN` entries.

```allow
# CLASS | RULE | registry-relative path | 12-hex line hash | reason
ALLOW | OH-PATH | skills/ste/references/rules.md | 4a60b23b3dfd | example prose that teaches path-naming style; the reader is shown a path shape, not told to open it
ALLOW | OH-PATH | skills/ste/references/rules.md | 15b94149666f | example prose that teaches path-naming style; the reader is shown a path shape, not told to open it
ALLOW | OH-PATH | skills/ste/references/rules.md | 0a19004bd4ad | example prose that teaches path-naming style; the reader is shown a path shape, not told to open it
ALLOW | OH-PATH | skills/ste/SKILL.md | 1a27405c7e92 | inside the [ -x ] existence guard; the whole block is a no-op outside a harness checkout
ALLOW | OH-PATH | skills/ste/SKILL.md | dc032d4b6850 | inside the [ -x ] existence guard; the whole block is a no-op outside a harness checkout
ALLOW | OH-PATH | skills/ste/SKILL.md | e6bc73aa7bbf | inside the [ -x ] existence guard; the whole block is a no-op outside a harness checkout
ALLOW | DANGLING-REF | skills/harness-context/SKILL.md | 0c9d156752cb | enumerates the harness repository per-directory READMEs; not a file this skill folder ships
ALLOW | HARNESS-SKILL | skills/reflect/SKILL.md | 7d0773a55384 | names a Claude Code built-in command, which an installer on that client already has
KNOWN | DANGLING-REF | skills/ship-spec/SKILL.md | d7a496099f8f | tells the reader to run a script this skill folder does not ship; repair is a registry change, which issue #758 criterion 5 puts out of scope
KNOWN | DANGLING-REF | skills/ship-spec/SKILL.md | b9903733862f | tells the reader to run a script this skill folder does not ship; repair is a registry change, which issue #758 criterion 5 puts out of scope
KNOWN | DANGLING-REF | skills/ship-spec/SKILL.md | 4526ba2e1c82 | tells the reader to run a script this skill folder does not ship; repair is a registry change, which issue #758 criterion 5 puts out of scope
KNOWN | HARNESS-SKILL | skills/ste/SKILL.md | 16906cfed0ee | names a skill the registry does not publish; the registry ships reflect. Repair is a registry change, out of scope here
KNOWN | OH-PATH | skills/ste/SKILL.md | 01ede414c12b | bare cross-repository pointer with no installer fallback; this is historical defect 3, repaired only into a conditional. Repair is a registry change, out of scope here
```
