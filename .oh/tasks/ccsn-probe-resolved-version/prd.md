# PRD — cc-safety-net-wiring assertion (d) asserts the resolved version

**rev 2** — rev 1 was audited by two adversarial critics and revised against all
thirteen findings. Dispositions are in [`critique.md`](critique.md).

- **Issue**: [#759](https://github.com/mifunedev/openharness/issues/759)
- **Branch**: `bug/759-ccsn-probe-resolved-version`
- **Base**: `development` on `upstream` (`mifunedev/openharness`)
- **Target file**: `.oh/evals/probes/cc-safety-net-wiring.sh`, assertion (d) only

## Problem

`.oh/evals/probes/cc-safety-net-wiring.sh` is a tier-A probe. It reports
`REGRESSION` while every piece of wiring it guards is correct. The report is a
false positive.

```
$ bash .oh/evals/probes/cc-safety-net-wiring.sh      # run from /home/sandbox/harness
REGRESSION: cc-safety-net wiring gaps:
  - (d) .pi/npm/package.json exists but pins a different cc-safety-net than 1.0.6
rc=1
```

A tier-A probe that cries wolf is worse than no probe. It trains every later
reader to skip the one line that would name a real gap.

## Root cause

Assertion (d) matches the **declared range string**, not the **resolved
version**:

```bash
if [[ -f "$PI_PKG" ]] && ! grep -Eq "\"cc-safety-net\"[[:space:]]*:[[:space:]]*\"${PIN}\"" "$PI_PKG"; then
```

`.pi/npm/package.json` is boot-generated. Pi installs through npm, and npm's
default `save-prefix` writes a caret range. The manifest therefore holds
`"cc-safety-net": "^1.0.6"`. The regex rejects that string.

Every other oracle agrees the pin is correct. Each value below was read directly
during planning:

| Source | Value |
|---|---|
| `.pi/settings.json:34` | `npm:cc-safety-net@1.0.6` |
| `.devcontainer/Dockerfile:156` | `npm install -g cc-safety-net@1.0.6` |
| `npm ls -g cc-safety-net --depth=0` | `cc-safety-net@1.0.6` |
| `.pi/npm/package-lock.json:439` | `1.0.6` |
| `.pi/npm/node_modules/cc-safety-net/package.json:3` | `1.0.6` |
| `cc-safety-net --version` | `1.0.6` |

## Why loosening the regex is the wrong fix

Accepting `^1.0.6` makes the probe green and makes it assert nothing. `^1.0.6`
permits any `1.x.y` at or above the pin. That is exactly the runtime drift
assertion (d) exists to catch. The probe's own comment states the intent: *"If it
exists, its pin must match; a mismatch means runtime drift from settings.json."*
A range cannot answer that question. Only the resolved version can.

## Where the defect reproduces

This matters for every claim of proof in this task, and rev 1 got it wrong.

- The bug reproduces **only where `.pi/npm/` exists**. In the main checkout
  `/home/sandbox/harness` the probe exits 1.
- The work happens in the worktree
  `.oh/worktrees/bug/759-ccsn-probe-resolved-version`, which has **no**
  `.pi/npm/`. There assertion (d) short-circuits and the probe already exits 0 at
  `HEAD`, before any fix.

So a green probe in the worktree, and a `PASS` row in `.oh/evals/RESULTS.md`, are
**satisfied by a no-op**. They are bookkeeping, not evidence. The proof of the fix
is a controlled before/after over an identical fixture on the default code path,
specified in US-002.

`.pi/npm/` inside the worktree is gitignored (`git check-ignore -v --no-index
.pi/npm/package.json` → `.pi/.gitignore:3:npm/`), so a fixture can be
materialized there and removed without touching git or the live pi installation
at `/home/sandbox/harness/.pi/npm/`.

## Solution

Assertion (d) reads the resolved version from the runtime tree under `.pi/npm/`.
Two files carry it:

1. `.pi/npm/package-lock.json` → `.packages["node_modules/cc-safety-net"].version`
   (lockfileVersion 3; `.dependencies["cc-safety-net"].version` is also read for
   older lock shapes)
2. `.pi/npm/node_modules/cc-safety-net/package.json` → `.version`

### Rules

`PI_NPM` is `$ROOT/.pi/npm`, or `$CC_SAFETY_NET_PROBE_PI_NPM` when that variable
is set and non-empty.

| # | Condition | Result |
|---|---|---|
| R1 | Override set, `PI_NPM` is not a directory | **fail** — the override cannot point at nothing |
| R2 | Default path, `PI_NPM` absent | **pass, silent** — fresh clone; absent runtime state is not a regression |
| R3 | A resolved source exists and resolves a version other than `1.0.6` | **fail** — one line per source, naming the file, the version found, the pin, and the remediation |
| R4 | A resolved source exists but is unparseable, or no JSON interpreter is available | **fail** — names the file and the reason |
| R5 | No source resolves a version, and `PI_NPM/package.json` declares `cc-safety-net` | **fail** — declared but unresolved |
| R6 | No source resolves a version, and the override is set | **fail** — the override resolves nothing |
| R7 | No source resolves a version, no declaration, default path | **pass, silent** — nothing is installed |

R1 and R6 together close the disarm hole a critic found in rev 1: a set override
must resolve a real version, so `CC_SAFETY_NET_PROBE_PI_NPM=$(mktemp -d)` fails
instead of silently passing. R2 and R7 preserve the fresh-clone posture on the
default path, which is the only path CI ever takes.

## Design decisions

- **DD-1** — Read the resolved version, never the declared range. The declared
  range is consulted for one purpose only: deciding whether an unresolved tree is
  "declared but unresolved" (R5).
- **DD-2** — Check both resolved sources, not the first one found. A lock and an
  installed tree can disagree; each disagreement gets its own line.
- **DD-3** — A tree that declares `cc-safety-net` but resolves nothing is a
  failure, not a pass (R5). A fresh clone has no `.pi/npm/package.json` at all,
  so this costs nothing at AC 3 and closes the reading of issue AC 2 under which
  a permitting range must not, by itself, pass.
- **DD-4** — Parse with `node -e`, not `jq`. `jq` is provisioned by no workflow
  (`command grep -rn 'jq' .github/workflows/` → no hits); the `eval-probes` job
  provisions Node 22 explicitly because "the self-hosted runner does not" ship it
  (`.github/workflows/ci-harness.yml:151-157`). The dependency is reached only
  when a resolved source file exists, which never happens in CI, because
  `.pi/npm/` is boot-generated and gitignored. A `.pi/npm/` tree cannot exist
  without npm having run, so a tree without a Node interpreter is not a state the
  harness can reach. A missing interpreter produces a `(d)` failure line and
  never a top-level `exit 2`, so no other assertion can be disarmed by it.
- **DD-5** — Touch assertion (d) only. Assertions (a), (b), (c), (e), (f) and
  the live-binary block keep their current behavior, proven behaviorally rather
  than by diff inspection alone.
- **DD-6** — The failure line states the file, the version found, the pin, and
  one remediation clause, so an on-call reader knows what to do.
- **DD-7** — `CC_SAFETY_NET_PROBE_PI_NPM` is justified on its own terms: the
  rejection tests need to reach a drifted tree without corrupting the live one.
  It is not justified by precedent — `CC_SAFETY_NET_PROBE_BIN` exists but is set
  by nothing in the repo, so it proves nothing about caller compatibility. For
  the same reason the new variable breaks no existing caller: there are none.

## Scope

**In scope**

- Assertion (d) of `.oh/evals/probes/cc-safety-net-wiring.sh`, and its comment.
- `.oh/evals/RESULTS.md`, regenerated by the `/eval` runner.
- A `CHANGELOG.md` entry under `[Unreleased]` / `Fixed`.
- Task artifacts under `.oh/tasks/ccsn-probe-resolved-version/`.

**Out of scope**

- The pinned version itself. `1.0.6` stays.
- The other five assertions and the live-binary check.
- The real `.pi/npm/` tree at `/home/sandbox/harness/.pi/npm/`. The running pi
  installation depends on it and it stays unmodified.
- Any other probe.

## Constraints

- **C-1** — `.oh/tasks/*` is gitignored (`.gitignore:12`). The task folder needs
  `git add -f` to reach the diff.
- **C-2** — The interactive shell wraps `grep` in a `ugrep --ignore-files`
  function that hides gitignored paths. Scripts get GNU grep 3.8 and are
  unaffected; use `command grep` for manual inspection under `.pi/npm/`.
- **C-3** — `shellcheck` is not installed. Gate on `bash -n` and on real runs.
- **C-4** — `.oh/evals/probes/audit-stale-references.sh` `git grep`s a list of
  retired audit tokens repo-wide. New files write `/audit pr`, never the retired
  lowercase namespace token. The probe reads tracked files only, so it turns red
  after `git add`, not before.
- **C-5** — Exit 0 proves nothing. A rejection test in a bare fixture root proves
  nothing either: a critic observed that such a root already exits 1 with six
  failure lines, `(a)` through `(f)`, so a *deleted* assertion (d) would satisfy
  it. Rejection runs keep `ROOT` at the real repo, vary only the override, and
  assert exactly one failure line beginning with `(d)`.
- **C-6** — A second unattended session owns `task/758-registry-drift-lint`. This
  branch owns `.oh/evals/RESULTS.md`; that one does not commit it.

## User stories

| ID | Title | Depends on |
|----|-------|-----------|
| US-001 | Assertion (d) reads the resolved version | — |
| US-002 | Before and after on the default path | US-001 |
| US-003 | Verification by rejection | US-001 |
| US-004 | Scoreboard, changelog, tracked artifacts | US-002, US-003 |

### US-001 — Assertion (d) reads the resolved version

As a harness maintainer, I want assertion (d) to compare the resolved
cc-safety-net version against the pin, so that the probe reports drift that is
real and stays silent when there is none.

Acceptance criteria:

1. Assertion (d) reads the resolved version from
   `.pi/npm/package-lock.json` (`.packages["node_modules/cc-safety-net"].version`,
   falling back to `.dependencies["cc-safety-net"].version`) and from
   `.pi/npm/node_modules/cc-safety-net/package.json` (`.version`).
2. The old range match is gone: `git diff` shows the
   `grep -Eq "\"cc-safety-net\"...` line removed, and no assertion compares the
   declared range against the pin.
3. Every resolved source that exists is checked, and a mismatch in either source
   fails the probe with its own line.
4. Each `(d)` failure line names the file, the version found, the pin, and one
   remediation clause.
5. Rules R1 through R7 in this PRD are implemented as written.
6. The JSON interpreter is invoked only when a source file exists; the probe
   never exits 2 for a missing interpreter, and never aborts under
   `set -euo pipefail` on unparseable JSON.
7. The assertion-(d) comment describes resolved-version semantics rather than
   the removed range match.
8. `bash -n .oh/evals/probes/cc-safety-net-wiring.sh` exits 0.
9. `git diff` shows no textual change to assertions (a), (b), (c), (e), (f) or
   to the live-binary block.
10. Behavioral proof that (a) through (f) are unchanged: with `node` removed from
    `PATH` and `.claude/settings.json` deliberately broken in a scratch copy, the
    probe still exits 1 and still names `(a)`.

### US-002 — Before and after on the default path

As a reviewer, I want one controlled comparison over identical input, so that I
can tell a real fix from a probe that was already green.

Acceptance criteria:

1. A throwaway fixture is materialized at the worktree's own gitignored
   `.pi/npm/`, carrying the three real shapes: `package.json` declaring
   `"cc-safety-net": "^1.0.6"`, `package-lock.json` resolving `1.0.6`, and
   `node_modules/cc-safety-net/package.json` at `1.0.6`.
2. With `CC_SAFETY_NET_PROBE_PI_NPM` **unset**, the probe at `HEAD`
   (`git show HEAD:.oh/evals/probes/cc-safety-net-wiring.sh`) run against that
   fixture exits 1 and names `(d)`. This is the "before".
3. With `CC_SAFETY_NET_PROBE_PI_NPM` **unset**, the fixed probe run against the
   same fixture exits 0 and prints its `PASS:` line. This is the "after".
4. With the override unset and the fixture's resolved version changed to a
   version other than `1.0.6`, the fixed probe exits 1. The default path is
   therefore proven to read `$ROOT/.pi/npm` rather than only the override.
5. The fixture is removed afterwards, and `git status --porcelain` is clean of
   it.
6. With no `.pi/npm/` present, the fixed probe exits 0 and assertion (d)
   contributes no failure line.
7. Read-only cross-check: pointed by the override at the real tree
   `/home/sandbox/harness/.pi/npm`, the fixed probe exits 0.
8. `sha256sum` of the three real files under `/home/sandbox/harness/.pi/npm/` is
   recorded before and after all verification runs, and is identical.
9. Both raw outputs from criteria 2 and 3 are captured verbatim for
   `evidence.md`.

### US-003 — Verification by rejection

As a harness maintainer, I want proof that assertion (d) rejects, so that its
green state is evidence rather than decoration.

Acceptance criteria:

1. Every rejection run keeps `ROOT` at the real repo and varies only
   `CC_SAFETY_NET_PROBE_PI_NPM`, so unrelated assertions cannot supply the
   exit code.
2. Pointed at a tree whose resolved version is not `1.0.6`, the probe exits 1,
   stderr carries **exactly one** failure line, and that line begins with `(d)`
   and names the file and the version found.
3. A lock-only tree and an installed-package-only tree each fail on their own.
4. A tree whose declared range is exactly `1.0.6` but whose resolved version is
   not still fails. The range does not rescue the check.
5. A tree that declares `cc-safety-net` but resolves nothing fails (R5).
6. `CC_SAFETY_NET_PROBE_PI_NPM` set to a path that does not exist fails (R1).
7. `CC_SAFETY_NET_PROBE_PI_NPM` set to an existing empty directory fails (R6).
   The override cannot disarm the assertion.
8. Mutation check: with assertion (d) stripped from a scratch copy of the probe,
   the drifted tree from criterion 2 exits 0. This proves the exit code in
   criterion 2 came from assertion (d) and from nothing else.
9. Every rejection run uses a temporary tree under the scratchpad, and the real
   `.pi/npm/` tree keeps the checksums recorded in US-002.

### US-004 — Scoreboard, changelog, tracked artifacts

As a reviewer, I want the suite scoreboard and the changelog to record this fix,
so that the change is auditable from the diff alone.

Acceptance criteria:

1. `bash .oh/skills/eval/run.sh` completes and `.oh/evals/RESULTS.md` shows
   `cc-safety-net-wiring` with status `PASS`. This is bookkeeping: the row was
   `SKIPPED` and would have flipped to `PASS` without this fix, because the
   binary is now reachable on `PATH`.
2. A pre-change and a post-change run of the same 99-probe suite are compared,
   and no probe moves `PASS` to `REGRESSION`. This is the regression floor and it
   **is** evidence.
3. `CHANGELOG.md` gains one bullet under `[Unreleased]` / `Fixed` that cites
   issue #759.
4. `evidence.md` follows `.oh/skills/audit/references/reviewer-evidence-doc.md`:
   it records the audit run id and the verbatim native verdict, maps each of the
   six issue acceptance criteria to observed proof, quotes the US-002 before and
   after outputs verbatim, and states in its gaps section that the
   `SKIPPED -> PASS` row is not evidence of the fix.
5. `.oh/tasks/ccsn-probe-resolved-version/` holds `prd.md`, `prd.json`,
   `critique.md`, `progress.txt` and `evidence.md`, and `git ls-files` reports
   all five as tracked.

## Definition of done

- All four stories report `passes: true`, each validated against its own
  acceptance criteria by the First Mate rather than self-certified.
- All six acceptance criteria in issue #759 hold, including verification by
  rejection and the fresh-clone case.
- `/audit pr` classifies the pull request promotable, and its proof is recorded
  in `evidence.md`.
- A pull request exists on `upstream`, base `development`, whose body contains
  `Closes #759` and links `evidence.md`.
