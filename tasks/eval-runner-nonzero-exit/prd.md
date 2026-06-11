# PRD: /eval Runner Non-Zero Exit on Green→Red Regression

## Introduction

The `/eval` runner (`.claude/skills/eval/run.sh`) is the harness fitness
function: it runs every probe in `evals/probes/*.sh`, writes the
`evals/RESULTS.md` scoreboard, and prints any green→red regression it detects.
But the runner **always exits `0`** — it builds a `regressions[]` array
(`run.sh:94–96`), prints it (`run.sh:130–133`), then its final command is
`echo`, which returns `0`. There is no aggregate `exit 1`.

This breaks a contract three callers depend on. The merged issue #22 hardened
the autopilot §6 eval gate to PROCEED only when "the `/eval` runner exited `0`"
and keep a PR draft on "a non-zero runner exit" — but that branch is **dead code
that can never fire** because the runner never exits non-zero. The existing
`evals/probes/eval-gate.sh` probe guards the autopilot §6 *prose*; nothing
asserts the runner actually *implements* the non-zero exit. The `eval-weekly`
cron can therefore only `grep` stdout because it cannot trust the exit code.

This feature makes the runner propagate a non-zero aggregate exit code on a NEW
green→red regression, documents that contract, and pins it with a new guard
probe — closing the implementation half of #22.

## Goals

- `run.sh` exits `1` when (and only when) a NEW green→red regression is detected
  this run; exits `0` otherwise (all-PASS, pre-existing red, or SKIPPED-only).
- The aggregate runner exit code is documented in `evals/README.md` and
  `.claude/skills/eval/SKILL.md`, distinct from the per-probe oracle.
- A new Tier-A probe `evals/probes/eval-runner-exit.sh` statically asserts the
  runner implements the regressions-gated `exit 1`, with no side effects.
- No change to the per-probe exit oracle, the `--ablate` exec path, or the
  `RESULTS.md` rewrite logic.

## User Stories

### US-001: Propagate non-zero aggregate exit from run.sh

**Description:** As an autopilot/eval-weekly caller, I want the `/eval` runner to
exit non-zero on a NEW green→red regression so I can gate on `$?` instead of
parsing stdout.

**Acceptance Criteria:**

- [ ] In `.claude/skills/eval/run.sh`, after the existing regression-summary
      `echo "ran $ran probe(s); wrote $RESULTS"` line (currently the final
      command), add an explicit terminal gate:
      `if [ "${#regressions[@]}" -gt 0 ]; then exit 1; fi` followed by `exit 0`.
- [ ] The exit gate MUST be the FINAL construct in the file: the summary `echo`
      immediately followed by the gate, with NO command between them — so the
      `echo` always runs and `set -e` cannot abort before the gate fires.
      (Critic mitigation: anchors the gate to EOF; the US-004 probe verifies this
      by grepping the file tail, not the whole file.)
- [ ] `${#regressions[@]}` is referenced safely under `set -u` (mirrors the
      existing line-130 usage; an empty array yields `0`, not an error).
- [ ] The per-probe oracle (`0`/`1`/`2`/`124`/other), the `--ablate` exec path
      (the early `exec bash ablate.sh …`), and the `RESULTS.md` rewrite block are
      byte-for-byte unchanged.
- [ ] The `### Fixed` CHANGELOG line (US-005) lands in the SAME commit as this
      `run.sh` patch, per `context/rules/git.md` § Changelog.
- [ ] Manual verification: a synthetic PASS→fail transition yields `$? == 1`; an
      all-PASS / pre-existing-red / SKIPPED-only run yields `$? == 0`.
      (Verify without clobbering the real board: copy `run.sh` + a tiny prior
      `RESULTS.md` into a temp dir, or use `--probe` against a throwaway probe in
      a temp `PROBES_DIR`; never run the live suite to assert this.)

### US-002: Document the aggregate runner exit code in evals/README.md

**Description:** As a reader of the eval contract, I want the runner's aggregate
exit code documented so I know it differs from the per-probe oracle.

**Acceptance Criteria:**

- [ ] In `evals/README.md` under the `## Runner` section, append a short
      "Runner aggregate exit code" note.
- [ ] The note states: `0` = no NEW green→red regression this run (pre-existing
      reds are `unchanged`-delta and do NOT trigger non-zero); `1` = one or more
      NEW green→red regressions.
- [ ] The note is clearly distinguished from the per-probe 3-state oracle table
      already documented in the file.

### US-003: Note the aggregate runner exit in eval/SKILL.md

**Description:** As a caller invoking `/eval`, I want the SKILL.md to mention the
runner's own exit code so I gate on the process result, not only stdout.

**Acceptance Criteria:**

- [ ] In `.claude/skills/eval/SKILL.md`, the target is the INLINE sentence in the
      `## Usage` block (≈ line 30): "Exit-code oracle (per probe): `0`=PASS, …".
      It is a sentence, not a dedicated section — extend it with a follow-on
      sentence/line, do not invent a new heading.
- [ ] State the runner's aggregate exit: `0` when no NEW regression, `1` when
      `${#regressions[@]} > 0`.
- [ ] Document how a caller observes it: when invoked via `bash …/run.sh`, check
      `$?` (the Bash-tool result surfaces the non-zero exit to an agent caller
      such as the autopilot §6 gate); the printed `REGRESSIONS (...)` stdout block
      and stderr per-probe lines remain the human-readable signal.
- [ ] Note that the `eval-weekly` cron is an intentional legacy stdout-grep
      caller (`… || true` + grep) that does NOT consume the exit code — so a
      future reader does not mistake it for broken.
- [ ] A reader can determine BOTH the per-probe oracle AND the runner aggregate
      exit from SKILL.md alone, without reading `run.sh`.

### US-004: Add the eval-runner-exit guard probe

**Description:** As the harness, I want a deterministic probe that asserts
`run.sh` implements the non-zero exit so the contract cannot silently regress.

**Depends on US-001** — implement this probe AFTER the `run.sh` patch is in
place, so it is `new-pass` on its first `/eval` run (a brand-new probe has no
prior row, so its first result is `new-pass`/`new-fail` and can never itself be a
green→red regression — `run.sh:86–88,94`).

**Acceptance Criteria:**

- [ ] Create `evals/probes/eval-runner-exit.sh`, executable (`chmod +x`).
- [ ] Header carries the three required comment lines: `# tier: A`,
      `# source: memory/MEMORY.md 2026-06-11 (eval-runner-exit) #29`,
      `# desc: …` (one line).
- [ ] Resolves repo root via `BASH_SOURCE[0]` (the canonical
      `ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"` preamble) — not
      cwd, not a hard-coded path.
- [ ] 3-state oracle: exit `2` (SKIPPED) if `run.sh` is absent; exit `1`
      (REGRESSION) if the assertion below fails; exit `0` (PASS) when it holds.
      `stderr` carries a one-line human reason for the result.
- [ ] **Exact assertion (no false-PASS):** confirm the regressions-count check
      and the `exit 1` are CO-LOCATED near the file tail — not a bare `exit 1`
      anywhere. Read the last lines of `run.sh` (e.g. `tail -n 12 "$RUN_SH"`) and
      require BOTH `${#regressions[@]}` and a `-gt 0`-gated `exit 1` to appear in
      that window. A literal `exit 1` elsewhere (or its absence) must NOT pass.
- [ ] The probe performs a STATIC source check only — it MUST NOT execute
      `run.sh`, run the probe suite, or write `evals/RESULTS.md`.
- [ ] The probe is PASS against the patched `run.sh` (verify with
      `bash evals/probes/eval-runner-exit.sh; echo $?` → `0`), and would be
      REGRESSION against the pre-patch `run.sh` (whose tail has no regressions
      gate).

### US-005: CHANGELOG entry

**Description:** As a maintainer, I want the fix recorded in the changelog.

**Acceptance Criteria:**

- [ ] In `CHANGELOG.md`, append one bullet under the EXISTING `### Fixed` heading
      inside `## [Unreleased]` — do NOT create a second `### Fixed` heading.
- [ ] The line is imperative-mood and describes the runner non-zero exit fix.
- [ ] The entry links issue #29.
- [ ] Per `context/rules/git.md` § Changelog, this entry is committed in the SAME
      commit as the US-001 `run.sh` patch (not a separate trailing commit).

## Functional Requirements

- FR-1: `run.sh` MUST exit `1` iff `${#regressions[@]} > 0` after writing
  `RESULTS.md`, else exit `0`.
- FR-2: The terminal summary `echo` MUST still execute on every code path that
  reaches the end (it precedes the exit gate).
- FR-3: `evals/README.md` and `.claude/skills/eval/SKILL.md` MUST document the
  aggregate runner exit code distinctly from the per-probe oracle.
- FR-4: `evals/probes/eval-runner-exit.sh` MUST be a side-effect-free static
  check following the existing `eval-gate.sh` 3-state-oracle pattern.
- FR-5: `CHANGELOG.md` MUST gain one `### Fixed` entry under `[Unreleased]`
  linking #29.

## Non-Goals

- No change to `.claude/skills/autopilot/SKILL.md` — issue #22 already corrected
  its §6 prose; this PRD implements the signal that prose keys on.
- No change to the `eval-weekly` cron — its `… || true` + stdout grep remains
  backward compatible and is intentionally left alone.
- No change to the per-probe exit oracle, the `--ablate` path, ablation backup
  recovery, or the `RESULTS.md` rewrite/carry-forward logic.
- No sandbox application code, no compose/entrypoint changes.
- No auto-merge — the resulting PR is finalized ready-for-review only.

## Technical Considerations

- `run.sh` runs under `set -euo pipefail`. The terminal exit must be explicit so
  the trailing `echo` (which returns `0`) does not mask a regression.
- The `regressions[]` array is populated ONLY on `prior == PASS && status !=
  PASS && status != SKIPPED` (`run.sh:94`). Pre-existing reds (`prior != PASS`)
  are excluded — so the regressions-count gate is exactly "NEW green→red", which
  matches the autopilot §6 intent (pre-existing `unchanged`-delta reds keep exit
  `0` and PROCEED).
- The guard probe must be static (grep `run.sh` source). Actually executing
  `run.sh` from a probe would clobber the real `evals/RESULTS.md` — forbidden.
- Reuse the `evals/probes/eval-gate.sh` structure: header, BASH_SOURCE root,
  3-state oracle, one-line stderr reason.
- **Caller observability**: the autopilot §6 gate runs `/eval` (i.e. `bash
  run.sh`) via the Bash tool; a non-zero process exit is surfaced in the tool
  result, so the orchestrator agent can read `$?` — making the previously-dead
  "non-zero runner exit → keep draft" branch real. This is the point of the
  change, not an incidental detail.
- **Rollback**: the behavior change is a two-line terminal gate; there is no
  feature flag — `git revert` of the US-001 commit is the escape hatch if the
  exit-1 gate ever causes unforeseen breakage.
- **Filter flags**: under `--probe`/`--tier`, the aggregate exit reflects only
  the filtered subset's regressions (a filtered green→red still exits 1). This is
  the correct/intended behavior and need not change.

## Success Metrics

- `bash .claude/skills/eval/run.sh; echo $?` returns `0` on the current
  all-PASS/SKIPPED board.
- A synthetic green→red transition makes the same command return `1`.
- `evals/probes/eval-runner-exit.sh` is green in `evals/RESULTS.md` after `/eval`.
- `/eval` introduces no NEW (green→red) regression on the existing probes.

## Open Questions

- None — the plan is fully specified by the ticket #29 body and the existing
  `eval-gate.sh` precedent.

## Critic review

Two critics (implementer + user lens) reviewed this PRD before any GitHub state
was created — see `critique.md`. Both returned REVISE-PRD; the two high-severity
findings (probe-ordering self-reference and how the exit surfaces to an agent
caller) plus all medium findings were mitigated in place (US-004 `Depends on
US-001`; US-003 documents Bash-tool `$?` observability and the eval-weekly legacy
caller; US-004 specifies the exact tail-anchored grep; US-001 anchors the gate to
EOF and co-commits the CHANGELOG). No unmitigated high-severity finding remains →
**PROCEED**.
