# PRD — portability lint for published skill copies

- **Issue**: mifunedev/openharness#758
- **Branch**: `task/758-registry-drift-lint`
- **Slug**: `registry-drift-lint`
- **Registry under test**: `mifunedev/skills` (base branch `master`, 18 skill folders, no CI workflow)

## Problem

A skill this repo publishes exists twice. The canonical copy is `.oh/skills/<name>/`.
The portable copy is `skills/<name>/` in the `mifunedev/skills` registry. Nothing
keeps the two aligned and nothing reports divergence.

Three defects reached the registry and a human caught them by hand, one commit
before the publishing pull request merged. Registry commit `036a53f` still holds
all three:

| # | Location at `036a53f` | Defect |
|---|---|---|
| 1 | `skills/ste/references/rules.md:420` | names `` `/caveman` `` as the example compression mode |
| 2 | `skills/ste/SKILL.md:102` | claims Open Harness ships that mode as `` `/caveman` `` |
| 3 | `skills/ste/SKILL.md:285` | points at `.oh/skills/retro/references/memory-protocol.md` |

Every one is the same failure: **the portable copy names something an installer
will not have.** `/caveman` was deleted from this repo by #754. No installer has
a `.oh/` tree.

## Why a diff cannot detect this

The two copies are deliberately different. For `ste` the intended deltas are:

1. invocation paths are relative in the registry — `bash scripts/ste-check.sh …`
   replaces `bash .oh/skills/ste/scripts/ste-check.sh …`;
2. harness-specific sections are generalized or made conditional;
3. the registry copy adds a `LICENSE` file that the canonical copy does not carry.

A byte-equality check reports all three as failures. It is useless.

## Decision — issue Option C

The issue offers three options and recommends **Option C**: do not diff the two
trees. Lint the portable copy on its own, and assert it never names a path or a
skill an installer will not have.

Option C is chosen. It catches all three historical defects, needs only the
registry tree, and adds no build step or marker syntax to the canonical files.
Option A (a manifest of intended diff hunks) and Option B (generate the portable
copy) stay open; C composes with A.

## Solution shape

### Rules

The linter reads every `*.md` and `*.sh` file under `<registry>/skills/<name>/`
and applies two rules.

- **`OH-PATH`** — the text contains a `.oh/…` path. An installer has no `.oh/`
  tree, so the reference cannot resolve. Catches defect 3.
- **`HARNESS-SKILL`** — the text contains a backticked slash token `` `/name` ``
  and `<registry>/skills/<name>/` does not exist. The registry is the installer's
  whole world, so a slash command outside it is unreachable. Catches defects 1
  and 2.
- **`DANGLING-REF`** — a file under `skills/<name>/` cites a backticked
  `references/<f>.md` or `scripts/<f>.sh` that does not exist under
  `skills/<name>/`. The published folder is the installer's whole copy, so a
  sibling file that is not in it cannot be opened.

`HARNESS-SKILL` matches backticked tokens only. A bare `/dev/null`, `/usr/local`,
or `tasks/<slug>/critique.md` is a filesystem path, not a slash command, and a
looser pattern reports 100+ false hits across the registry. Two further
suppressions keep the rule honest: Unix filesystem roots (`/bin`, `/usr`, `/etc`,
`/var`, `/tmp`, `/home`, and the rest) and metasyntactic placeholders (`/foo…`,
`/bar…`, `/baz…`, `/qux…`), which documentation uses to stand for a name rather
than to name one.

The registry runs its own gate, `scripts/validate.sh`, for frontmatter, line
count, registry parity, and checksums. This linter does not restate those checks.

### Exceptions, and where the intended deltas are written down

`.oh/scripts/registry-portability.md` is a single artifact that serves both
readers. Prose explains the transform from canonical copy to portable copy and
the rule set. One fenced block tagged `allow` holds the machine-readable
exception list that the linter parses:

```
CLASS | RULE | <registry-relative path> | <12-hex sha256 of the trimmed line> | <reason>
```

The documentation and the exception data cannot drift apart, because the checker
reads the same file a reviewer reads. It sits beside the script rather than in
`.oh/docs/` because `.oh/manifest.json` ships `scripts/**` and excludes `docs/**`
— a fail-closed script whose exception file is not in the payload would be a
permanent hard error for every installed harness. `.oh/docs/README.md` carries an
index entry so a reviewer can still find it.

An entry keys on a hash of the **whole source line**, not on the matched token
and not on a line number. Keying on the token is unsafe, and the measurement
shows why. The human repair of historical defect 3 did not delete the `.oh/`
path; it kept the path and made the sentence conditional. So the same file cites
the same path in both trees:

```
master   skills/ste/SKILL.md:282   In an Open Harness checkout, `.oh/skills/retro/...`
036a53f  skills/ste/SKILL.md:285   See `.oh/skills/retro/...` for the canonical protocol.
```

A token-keyed exception cannot separate those, so the entry needed to accept the
repair would have whitelisted the defect. Hashing the line separates them
outright — `01ede414c12b` against `27bf235ad29e` — so the shipped exception list
still reports all three historical defects at `036a53f`. Editing a guarded line
changes its hash and the exception stops applying, which is the property the
design needs. Hashing also survives `|` inside a source line, which matters
because real findings sit inside Markdown table rows.

`CLASS` is `ALLOW` or `KNOWN`, and only one of them touches the exit code.

- **`ALLOW`** — intentional and correct. The reference is unreachable for a bare
  installer by design, and the reason states why that is safe: a runtime
  existence guard, example prose that teaches a style rather than instructing a
  read, or a command the client provides rather than the registry. `ALLOW`
  suppresses the finding.
- **`KNOWN`** — a real finding, triaged and reported, left unrepaired because
  acceptance criterion 5 forbids repairing it here. **`KNOWN` does not suppress
  the exit code.** It records that a human has already seen the finding and
  written down why it stands, so the output can separate a triaged backlog from
  something new.

That split is the correction to an earlier draft of this plan in which `KNOWN`
zeroed the exit code. It did satisfy criterion 5, but it broke criterion 1: the
delivered check would have exited 0 against a registry that today names
`` `/retro` `` in `skills/ste/SKILL.md:280`, which is precisely "a skill an
installer will not have". A check that is green while the defect stands is the
thing this issue exists to prevent. The check therefore exits 1 against live
`master` until those findings are repaired by a registry change, and says why.

Two further properties stop the list rotting:

1. An entry whose line occurs nowhere in the tree is stale. The linter always
   prints stale entries; `--strict-exceptions` makes them exit 1. The default is
   a warning because the linter is deliberately run against other registry
   commits, where an entry written for `master` is expected not to match.
2. Every entry needs a non-empty reason.

### Placement

| Artifact | Path | Why |
|---|---|---|
| Linter | `.oh/scripts/registry-portability.sh` | plain script; peers are `check-pnpm-pin.sh`, `sandbox-healthcheck.sh` |
| Contract + exceptions | `.oh/scripts/registry-portability.md` | the linter parses its `allow` block; inside the shipped payload, unlike `.oh/docs/` |
| Test suite | `.oh/scripts/__tests__/registry-portability.test.ts` | `vitest.config.ts` includes `.oh/scripts/__tests__/**/*.test.ts`, so CI runs it |
| Opt-in probe | `.oh/evals/probes/registry-portability.sh` | runs the linter against a real checkout; SKIPPED unless opted in |
| Sweep report | `.oh/tasks/registry-drift-lint/sweep.md` | the one-time sweep, findings reported not fixed |
| Invocation site | `.oh/skills/builder/references/skill.md` | the procedure a skill author already follows; names the check as a pre-publish step |
| Index entry | `.oh/docs/README.md` | every other file in `.oh/docs/` is indexed there; an unindexed doc is not findable |

The test suite is the enforcement surface. Tests under `.oh/skills/**` are
outside the vitest include globs and never run in CI, so an acceptance criterion
gated there is unenforceable. `.oh/scripts/__tests__/` is inside them
(`vitest.config.ts:6`).

`.oh/scripts/*.sh` is also inside the CI shellcheck glob
(`.github/workflows/ci-harness.yml:126`), so the linter is linted at
`-S warning` on every run.

The architect memo proposed a different home: a fourth `/sync` subcommand, with
the linter at `.oh/skills/sync/scripts/` and the contract at
`.oh/skills/sync/references/`. That placement is rejected, and the memo names the
same objection as its own leading risk. Three reasons decide it:

1. `.oh/skills/sync/scripts/` is in neither CI glob. The vitest include list and
   the shellcheck argument list both cover `.oh/scripts/` and neither covers
   `.oh/skills/sync/scripts/`. Choosing that home trades away every automated
   gate this change depends on.
2. `/sync` describes one fork pair, `origin` and `upstream`, both of them this
   repository. The registry is a third repository and not a git remote here.
3. A new subcommand edits a skill whose contract a probe pins, for no gain.

This does not duplicate `/audit drift`, which compares `origin` to `upstream` and
reports cron staleness — a different pair of trees and a different question. It
does not duplicate `/audit skills`, which scores the canonical `.oh/skills/` tree
for staleness and breakage. Neither reads the published registry. The `/audit`
dispatcher's target list is pinned by a probe and is not touched.

### Failure modes the design closes

- **Zero-target fail-open.** A scan that reads no files exits 0 and reads exactly
  like a pass. The linter exits 2 when the registry path is missing, when it holds
  no `skills/` directory, when that directory holds no skill folder, **when the
  scanned-file count is zero**, or when the exceptions file or its `allow` block
  is absent. Fail closed, never silent. Every run prints the number of skill
  folders and files it read, including a clean run, so a green result that read
  nothing is visually impossible.
- **Silent Bash fail-open.** Two mechanics produce that same silence and are
  called out for the implementation: `mapfile -t x < <(find /nonexistent …)`
  leaves an empty array with status 0, because process substitution failure is
  invisible to `set -e`; and `printf … | while read; do arr+=(…); done` loses the
  array with the subshell. Neither may be used to collect targets or findings.
- **Unverified guard.** The suite reintroduces a `.oh/` reference, a bogus slash
  command, and a dangling sibling reference into fixtures and asserts a non-zero
  exit that names file and line. It asserts that removing an exception makes a
  previously clean fixture fail, and that a stale entry is reported. The
  strongest case is not a fixture at all: the shipped exception list, run against
  the real pre-fix tree, must still name all three historical defects.

## Day-one state, measured

Registry `master` at `1d11ab6`: 18 skill folders, 31 files, 14 findings.

| Class | Count | Where |
|---|---|---|
| `ALLOW` | 8 | `ste` example prose ×3 and runtime-guarded lines ×3, `harness-context` layout enumeration ×1, `reflect` client built-in ×1 |
| `KNOWN` | 5 | `ship-spec` `scripts/ralph.sh` instructions ×3, `ste` `` `/retro` `` ×1, `ste` bare `.oh/` pointer ×1 |

The check exits **1** on live `master`. That is the correct steady state. The
registry does carry portability defects today, criterion 5 forbids repairing them
here, and a green check would be a lie.

## Acceptance criteria (issue #758)

| # | Criterion | Where satisfied |
|---|---|---|
| 1 | A check fails when a portable copy references a path or skill an installer will not have | `.oh/scripts/registry-portability.sh`, rules `OH-PATH`, `HARNESS-SKILL`, `DANGLING-REF` |
| 2 | The check names the offending file and line | finding format `<path>:<line>: <RULE-ID> <message>` |
| 3 | The intended harness↔registry deltas are written down where a reviewer can find them | `.oh/scripts/registry-portability.md`, indexed from `.oh/docs/README.md` |
| 4 | Verified by rejection: reintroduce a `.oh/` reference and confirm failure | `.oh/scripts/__tests__/registry-portability.test.ts`, plus the shipped exception list run against the real `036a53f` tree |
| 5 | The pre-existing registry skills are swept once and hits are reported, not fixed | `.oh/tasks/registry-drift-lint/sweep.md` |

Criterion 5 is read literally. The sweep reports. It does not edit the registry.
This change opens no pull request against `mifunedev/skills`, and the sweep
records that choice and its cost: a reviewer working inside the registry is not
pointed at this contract from there. Adding that pointer is a one-line change to
the registry's pull request template and is left as a follow-up rather than
bundled into a harness change.

### The check needs somewhere to be run

A guard nobody invokes is documentation. Searching this repository for
`mifunedev/skills` returns no hit under `.oh/skills/`, so no skill, runbook, or
procedure currently describes publishing to the registry. The registry has no CI.
The probe is SKIPPED unless someone opts in. Without wiring, the next skill is
published exactly the way the last one was: a human who thinks to look.

`.oh/skills/builder/references/skill.md` is the procedure a skill author already
reads. It gains a publishing step that names the command as a required gate
before a registry pull request. That is the smallest tracked, provider-portable
change that gives the check a caller.

## Known limitations, stated rather than hidden

- `HARNESS-SKILL` reads backticked tokens only. A bare `/name` written without
  backticks is not reported. Both historical `/caveman` defects were backticked,
  so the rule catches the motivating cases, but the gap is real. A looser pattern
  was measured on the live registry and produced over 100 filesystem-path false
  hits, which is worse than the gap.
- `HARNESS-SKILL` reads single-word tokens only. A two-word route such as
  `` `/audit pr` `` is not reported. The live registry contains none today, so
  the gap is currently theoretical.
- A slash command the *client* provides is indistinguishable from one the
  registry should provide. `skills/reflect/SKILL.md:148` names `/update-config`,
  which is a Claude Code built-in, so an installer on that client does have it.
  The rule reports it and the exception list dispositions it. There is no
  suppression set of client built-ins, because that list is client-specific and
  would rot.
- `OH-PATH` covers `.oh/` only, which is what the issue's Option C specifies.
  The adjacent class is real and larger: the registry carries **79 `.claude/`
  references across 15 of its 18 skills**, including `.claude/agents/` and
  `.claude/rules/` paths that a bare installer does not get. Widening the rule is
  a follow-up, not this change, and the sweep records the count so the decision is
  visible rather than implied.
- `template/`, which a new skill author copies from, sits outside `skills/` and
  is not scanned.
- The registry has no CI workflow. `.github/` there holds issue and pull request
  templates only, so `docs/portability.md`'s claim that `scripts/validate.sh`
  "runs on every PR via `.github/workflows/ci.yml`" is false. This check
  therefore gates publishing from the harness side; it cannot block a commit made
  directly against the registry.
- The check reads the registry, so it cannot run in this repository's default CI,
  which has no registry checkout. CI enforces the linter's behaviour through
  fixtures instead.

## Non-goals

- Generating the portable copy from the canonical copy (issue Option B).
- Diffing the two trees hunk by hunk (issue Option A).
- Repairing anything the sweep finds.
- Adding the check to the default CI path against a live registry clone. CI has
  no registry checkout, so that surface stays opt-in.
- Reimplementing the registry's own `scripts/validate.sh`.

## Constraints

- A probe uses `#!/usr/bin/env bash`, then `# tier:`, `# source:`, `# desc:`,
  and a three-state oracle: exit 0 PASS, 1 REGRESSION, 2 SKIPPED.
- `.oh/tasks/*` is gitignored. Task artifacts need `git add -f`.
- `.oh/evals/probes/audit-stale-references.sh` greps the repository for a set of
  retired vocabulary tokens. New files must not contain them, which rules out
  the obvious name for this work and rules out naming three registry folders
  whose names are themselves retired tokens. The linter therefore discovers skill
  folders by scanning the directory and hardcodes no name, and the sweep reports
  by count plus named findings only where the name is safe to write.
- `.oh/evals/RESULTS.md` is not committed on this branch. A parallel branch owns it.
