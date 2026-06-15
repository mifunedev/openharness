# Probe hermeticity audit — US-002

Mandatory US-002 deliverable. Classifies every probe in `evals/probes/*.sh` by
its dependency profile, records its committed `RESULTS.md` status, and states
whether it already returns SKIPPED (`exit 2`) — rather than ERROR/REGRESSION —
when a live runtime dependency is absent in a cold CI runner.

Audit performed on `feat/103-eval-probes-ci-gate` in the sandbox, 2026-06-13.

## Dependency classes

- **static-grep** — asserts a string/pattern over a *committed* file; no live
  dependency. SKIPs (`exit 2`) only if the target file is genuinely absent
  (never the case in a normal `actions/checkout` tree → always PASS in CI).
- **file-exec** — executes a committed hook/fixture with synthetic input written
  to `/tmp`; depends only on `bash` + coreutils.
- **process-inspection** — inspects live processes / tmux / `/proc`; the one
  class that genuinely varies between sandbox and cold CI.
- **extract-and-run** — extracts a bash block from a `SKILL.md` and runs it
  against its own `mktemp` fixtures; deterministic, no real runtime needed.
- **tool-dep** — needs a non-baseline tool (`zsh`, PCRE `grep -P`).

## Classification table

| probe | class | committed RESULTS status | exits 2 on missing dep? |
|-------|-------|--------------------------|-------------------------|
| boot-lint-glob | static-grep (`ci-harness.yml`) | PASS | yes — SKIP if workflow absent |
| clean-restore | static-grep (`autopilot/SKILL.md`) | PASS | yes — SKIP if skill absent |
| cleanup-tasks-scoped-guard | static-grep (`crons/cleanup-tasks.md`) | PASS | yes — SKIP if cron absent |
| cron-claude-codex-fallback | static-grep (`scripts/cron-runtime.ts`) | PASS | yes — SKIP if runtime absent. NB: despite the name it statically reads the `.ts` file; it does **not** touch a running cron-system. |
| devtcp-hook | file-exec (`hooks/warn-devtcp.sh` + `/tmp` fixtures) | PASS | yes — SKIP if hook absent/not-executable; only `bash`+`mktemp` needed |
| drift-check-cron-staleness-glob | extract-and-run + **tool-dep** (Step C-2 block shells out to `node` + the `croner` package from `node_modules`) | PASS | yes — SKIP if SKILL absent or `stat` missing; **PATCHED post-CI**: also SKIPs when `node`/`croner` is unresolvable (cold `eval-probes` job has no `node_modules`), after the extraction-integrity REGRESSION checks still gate |
| eval-gate | static-grep/awk (`autopilot/SKILL.md`) | PASS | yes — SKIP if skill absent |
| eval-results-atomic | static-grep (`eval/run.sh`) | PASS | yes — SKIP if runner absent |
| eval-runner-exit | static-grep (`eval/run.sh` tail) | PASS | yes — SKIP if runner absent |
| health-check-docker-stats | static-grep (`health-check/SKILL.md`) | PASS | yes — SKIP if skill absent. Greps the literal string `docker stats`; does **not** invoke docker. |
| next-dev-prod | process-inspection (`pgrep`/`/proc`/`tmux`) | REGRESSION | yes — `exit 2` when no `mifunedev/website` process AND no `app-website` tmux session (the cold-CI case) |
| owned-surface-guard | static-grep + tool-dep (`zsh`, PCRE `grep -P`) | PASS | **PATCHED this story** — already SKIPed on absent `zsh`; now also SKIPs on absent `grep -P` |
| ralph-fallback-order | static-grep/awk (`scripts/ralph.sh`, `autopilot/SKILL.md`) | PASS | yes — SKIP if Ralph runner absent |
| rl-delegation-write-worker | static-grep/awk (`delegate/SKILL.md`) | PASS | yes — SKIP if skill absent |
| skill-paths | static-grep (`.claude/skills/` recursive) | PASS | yes — SKIP if skills dir absent |
| submitted-by-trailers | static-grep (`ship-spec`/`autopilot` files) | PASS | yes — SKIP if any required file absent |

**Tooling confirmation (US-003 input — corrected post-CI):** no probe's *own
source* shells out to `node`/`jq`/`python`/`ruby`. The original audit missed an
**indirect** dependency: `drift-check-cron-staleness-glob` EXTRACTS and RUNS the
Step C-2 block from `drift-check/SKILL.md`, and that block's
`is_valid_cron_schedule()` shells out to `node` + the `croner` package resolved
from `node_modules`. The first cold-CI run of the `eval-probes` job
(`checkout + bash`, no `pnpm install`) therefore false-REGRESSED that probe. Fix:
the probe now SKIPs (`exit 2`) when `node`/`croner` is unresolvable, so a missing
dep can never masquerade as a regression (FR-5). With that guard, `actions/checkout`
+ `bash` still suffices and no Node/tooling setup is needed in the job — the
node-dependent probe simply SKIPs in CI and is exercised by manual `/eval` /
the weekly cron where deps are installed. Lesson: classify a probe's *transitive*
deps (what its extracted/exec'd code calls), not just its own source text.

## The one patch: `owned-surface-guard.sh` (`grep -oP` PCRE dependency)

This was the only probe that could transition **PASS → REGRESSION/ERROR** in a
cold runner purely from a missing tool. Its zsh-fidelity check (only reached when
`zsh` is present) extracts the `OWNED_PATHS=(...)` declaration with
`grep -oP '...\K...'` (PCRE `\K`). On a `grep` built **without** PCRE, `-P`
errors; the existing `|| true` would swallow that and leave `$decl` empty, firing
the "could not extract" **REGRESSION** (exit 1) — a false green→red.

**Fix:** a defensive PCRE-support probe added *before* the `grep -oP` use (after
the existing `zsh`-absent SKIP), so a missing tool can never masquerade as a
regression:

```sh
if ! printf 'x\n' | grep -qP 'x' 2>/dev/null; then
  echo "SKIPPED: grep -P (PCRE) unavailable — cannot extract OWNED_PATHS for the zsh word-split check" >&2
  exit 2
fi
```

**Why not the literal AC idiom `grep -P . /dev/null`:** verified in-sandbox that
`grep -P . /dev/null` exits **1** even when `-P` IS supported (an empty file
yields no match), so that form would *always* SKIP. The `printf 'x\n' | grep -qP 'x'`
form returns 0 on real PCRE support and only non-zero (exit 2, "not compiled")
when `-P` is genuinely unavailable.

**ubuntu-latest confirmation:** GNU `grep` on `ubuntu-latest` is compiled with
PCRE — `grep -P` is supported — so this probe will PASS (not SKIP) in the real CI
gate. The guard is belt-and-braces for any future/minimal runner. Both
remediation options the AC permits (add a guard *or* document the ubuntu-latest
confirmation) are satisfied.

`shellcheck -S warning evals/probes/owned-surface-guard.sh` → clean.

## drift-check-cron-staleness-glob determinism (extract-and-run)

Confirmed deterministic in a clean temp working directory with **no real cron
runtime**: the probe `cd`s into its own `mktemp -d` and runs the extracted
Step C-2 predicate against eight self-written fixtures with `RUNTIME_START=1`
(epoch 1s, before every fixture mtime) and `DRIFT_CHECK_ROOT="$ROOT"`. It reads
nothing from the live `crons/` tree for its verdict. Verified by running it from
a throwaway `cwd` (`cd "$(mktemp -d)" && bash …probe`) → **exit 0 (PASS)**. It
SKIPs (`exit 2`) only if `drift-check/SKILL.md` or `stat` is absent.

## Behavioral proof of hermeticity

### Full-suite run (post-patch), this iteration

`bash .claude/skills/eval/run.sh` → **exit 0**, zero ERROR rows; every row PASS
or SKIPPED except the pre-existing `next-dev-prod` REGRESSION (unrelated to this
PR; unchanged → not a *new* green→red, so it does not gate per `run.sh:106`):

```
boot-lint-glob                   PASS        unchanged
clean-restore                    PASS        unchanged
cleanup-tasks-scoped-guard       PASS        unchanged
cron-claude-codex-fallback       PASS        unchanged
devtcp-hook                      PASS        unchanged
drift-check-cron-staleness-glob  PASS        unchanged
eval-gate                        PASS        unchanged
eval-results-atomic              PASS        unchanged
eval-runner-exit                 PASS        unchanged
health-check-docker-stats        PASS        unchanged
next-dev-prod                    REGRESSION  unchanged
owned-surface-guard              PASS        unchanged
ralph-fallback-order             PASS        unchanged
rl-delegation-write-worker       PASS        unchanged
skill-paths                      PASS        unchanged
submitted-by-trailers            PASS        unchanged
ran 16 probe(s); wrote .../evals/RESULTS.md
exit 0
```

### Masked-dependency demonstrations (simulating a cold runner)

Each live-dep-sensitive probe was re-run with its dependency masked via a
restricted `PATH`/shim; all return SKIPPED (`exit 2`), none ERROR:

| scenario | probe | result |
|----------|-------|--------|
| `grep -P` unavailable (faithful PCRE-less `grep` shim, honours `--`) | owned-surface-guard | `exit 2` SKIPPED — reason line clean (`SKIPPED: grep -P (PCRE) unavailable…`) |
| `zsh` absent (PATH without zsh) | owned-surface-guard | `exit 2` SKIPPED (pre-existing guard) |
| `pgrep` + `tmux` absent (coreutils-only PATH) | next-dev-prod | `exit 2` SKIPPED (`no … process or app-website tmux session`) |
| clean cwd, no real cron runtime | drift-check-cron-staleness-glob | `exit 0` PASS (self-contained mktemp fixtures) |

## Baseline-refresh & PASS→SKIPPED note

The committed `evals/RESULTS.md` was regenerated this iteration (only the
`last-run` timestamps changed; **no status transitions**). The sandbox baseline
therefore records `owned-surface-guard = PASS` and `next-dev-prod = REGRESSION`.

**Sandbox↔CI divergence is expected and non-regressing.** In cold CI a probe may
return SKIPPED where the sandbox returned PASS (e.g. `owned-surface-guard` if a
runner ever lacked PCRE; `next-dev-prod` will SKIP in CI since no website process
runs there). `run.sh:106` gates a regression **only** on a `PASS → (REGRESSION
| TIMEOUT | ERROR)` transition — `PASS → SKIPPED` is explicitly excluded — so
this divergence never false-fails the gate. Keeping the committed `RESULTS.md`
fresh (operator responsibility, documented for US-005) keeps the baseline an
honest reference, but the gate's correctness does not depend on it matching CI
row-for-row.
