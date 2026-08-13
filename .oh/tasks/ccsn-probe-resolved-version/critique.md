# Critique — ccsn-probe-resolved-version

Two adversarial critics audited plan rev 1 (`prd.md` + `prd.json`) in parallel.
Both returned **REVISE**. Their HIGH findings overlap, which is the strongest
signal in the set. Every finding below was re-verified by the First Mate against
real state before disposition; no critic claim was accepted on assertion alone.

- **Critic A** — implementer / correctness lens.
- **Critic B** — user / reviewer lens (does the plan deliver issue #759, and can
  a reviewer believe it from the diff alone).

Plan **rev 2** is the result. Disposition: 13 findings, 13 accepted, 0 rejected.

## Verified independently before disposition

| Claim | Command | Observed |
|---|---|---|
| CI provisions Node, never `jq` | `command grep -rn 'jq' .github/workflows/` | no hits |
| CI provisions Node 22 for the suite | `.github/workflows/ci-harness.yml:151-159` | `Setup Node 22.x` then `bash .oh/skills/eval/run.sh`, comment: "the self-hosted runner does not" ship Node |
| `jq` is image-only | `.devcontainer/Dockerfile:10` | `jq` in the `apt-get` list |
| Runner exit mapping | `.oh/skills/eval/run.sh:91-96` | `0=PASS 1=REGRESSION 2=SKIPPED` |
| `SKIPPED` hides a red | `.oh/skills/eval/run.sh:109-111` | green→red fires only when `status != SKIPPED` |
| Worktree `.pi/npm/` is gitignored | `git check-ignore -v --no-index .pi/npm/package.json` | `.pi/.gitignore:3:npm/` |
| Committed row is SKIPPED, not REGRESSION | `.oh/evals/RESULTS.md:32` | `\| cc-safety-net-wiring \| A \| 2026-08-03 03:38 \| SKIPPED \|` |

## Findings and dispositions

### F-1 [HIGH, both critics] — A green probe in this worktree is vacuous

The worktree has no `.pi/npm/`, so assertion (d) short-circuits and the probe
already exits 0 at `HEAD`, before any fix. `RESULTS.md` showing `PASS` is
therefore satisfied by a no-op, and the committed row says `SKIPPED` rather than
`REGRESSION`, so the diff a reviewer sees is `SKIPPED -> PASS` — a flip caused by
the binary being reachable on `PATH`, not by assertion (d).

**Accepted.** rev 2 demotes the scoreboard row to bookkeeping and moves the real
proof to a controlled before/after on the **default path**: materialize a
throwaway `.pi/npm/` fixture inside the worktree (gitignored), run the probe with
the override **unset** on `HEAD`'s probe (`git show HEAD:...`) and on the fixed
probe, record both raw outputs, then remove the fixture. `evidence.md` must state
plainly that the `SKIPPED -> PASS` row is not evidence of the fix.

### F-2 [HIGH, Critic A] — Rejection by exit code alone is satisfied by a deleted assertion

Critic A copied the probe to a bare fixture root and observed rc=1 with six
failure lines — `(a)` through `(f)` — because every repo-static file was missing.
An exit-1-plus-substring criterion is therefore satisfied even if assertion (d)
were deleted outright.

**Accepted.** rev 2 requires every rejection run to keep `ROOT` at the real repo
and vary only `CC_SAFETY_NET_PROBE_PI_NPM`, and to assert that stderr carries
**exactly one** failure line and that it starts with `(d)`. rev 2 adds a mutation
check: with assertion (d) stripped, the rejection fixture must exit 0. That is
the only form of this test that cannot pass for the wrong reason.

### F-3 [HIGH, both critics] — The override can disarm the assertion, and rev 1 claimed it could not

rev 1 paired "a set override must exist" with DD-3 "no resolved source means (d)
passes". An existing but empty directory satisfies both, so
`CC_SAFETY_NET_PROBE_PI_NPM=$(mktemp -d)` would turn a tier-A assertion into a
silent no-op. rev 1 stated the opposite as a design guarantee, unobserved.

**Accepted.** The false claim is struck. rev 2 rule: when the override is set, at
least one resolved source must be found, or (d) fails. The default path keeps its
fresh-clone posture untouched.

### F-4 [HIGH, Critic B] — The default path, where the bug lives, was never exercised

rev 1 made the override the vehicle for all real-state evidence. A fix that works
only under the override and mis-resolves `$ROOT/.pi/npm` — a typo, a wrong join,
`ROOT` versus `PWD` — would pass every rev 1 criterion and still ship the bug.

**Accepted.** rev 2 adds a criterion that the default path is proven twice with
the override unset: once against a matching fixture (rc=0) and once against a
drifted fixture (rc=1).

### F-5 [MED, both critics] — `jq` is the wrong dependency, and neither exit code is safe

`jq` appears in no workflow. The `eval-probes` job explicitly provisions Node 22
because the self-hosted runner ships neither. A top-of-file `jq` guard exiting 1
would be a brand-new false positive; exiting 2 would silently skip assertions
(a), (b), (c), (e), (f), which the probe's own header forbids — the same
disarmed-guard class the repo paid for in #753.

**Accepted, with the stronger of the two proposed fixes.** DD-4 is rewritten:
parse with `node -e`, not `jq`. The dependency is reached only when a resolved
source file actually exists, which never happens in CI because `.pi/npm/` is
boot-generated and gitignored. A missing interpreter produces a `(d)` failure
line, never a top-level `exit 2`, so no other assertion can be disarmed by it.

### F-6 [MED, both critics] — A manifest-only tree passes silently

Under rev 1 the declared range is never read again, so a tree declaring `^9.9.9`
with no lock and no `node_modules` — an interrupted install, or
`--package-lock=false` — passes (d) with no output. Issue #759 AC 2 states that a
permitting range does not, by itself, pass. rev 1's rebuttal ("the pass comes
from absent runtime state") is a semantic dodge a reviewer can reject, and a
fresh clone has no `.pi/npm/package.json` at all, so failing here costs nothing.

**Accepted.** rev 2: if `$PI_NPM/package.json` exists and declares
`cc-safety-net` but no resolved source does, (d) fails as "declared but
unresolved" and names the manifest.

### F-7 [MED, Critic A] — Malformed JSON aborts the probe

The probe runs under `set -euo pipefail`. A truncated `package-lock.json`, which
is exactly what a half-finished `npm install` leaves behind, would abort the
script before the `fail[]` summary and print a parser error instead of a named
`(d)` line.

**Accepted.** rev 2: extraction failure is caught and reported as
`(d) <file> is not readable JSON`.

### F-8 [MED, Critic B] — "assertions unchanged" was a diff-level criterion, not a behavioral one

`git diff shows no change` stays true while a top-of-file dependency guard
changes what (a) through (f) do. Issue #759 AC 6 says *unchanged in behavior*.

**Accepted.** rev 2 keeps the diff criterion and adds a behavioral one: with the
JSON interpreter removed from `PATH`, a deliberately broken (a) must still exit 1
naming `(a)`.

### F-9 [MED, Critic B] — `evidence.md` was required to exist, not to be evidence

rev 1 required only presence and tracking. An empty file satisfied it.

**Accepted.** rev 2 replaces that criterion with the
`.oh/skills/audit/references/reviewer-evidence-doc.md` contract: run id, verbatim
native verdict, a row per issue acceptance criterion, the raw before/after
outputs, and an explicit gaps line naming the `SKIPPED -> PASS` caveat.

### F-10 [LOW, Critic A] — The (d) comment and `PI_PKG` go stale

The existing comment says "its pin must match", which describes the defect being
removed.

**Accepted.** rev 2 requires the comment to describe resolved-version semantics.
`PI_PKG` is retained and repurposed by F-6 rather than left dangling.

### F-11 [LOW, Critic A] — The override's "precedent" has never been exercised

`command grep -rn CC_SAFETY_NET_PROBE_BIN .` returns only the probe itself and
rev 1's own prose. No workflow or runner sets it, so no caller-compatibility
conclusion follows from it.

**Accepted.** rev 2 justifies the override on its own terms and notes that the
rejection tests are its first real caller. There is no false-positive risk for
existing callers precisely because there are none.

### F-12 [LOW, Critic B] — The failure message says what is wrong, not what to do

**Accepted.** rev 2 requires the line to name the file, the version found, the
pin, and one remediation clause.

### F-13 [LOW, Critic B] — "the real tree keeps its checksums" had no proof method

**Accepted.** rev 2 requires `sha256sum` of the three real files recorded before
and after the verification runs.

## Second-round verdict

rev 2 answers all thirteen findings. The two HIGH classes that mattered — proof
that could pass for the wrong reason (F-1, F-2, F-4) and a knob that could disarm
a tier-A guard (F-3) — are closed by construction rather than by promise:

- the before/after runs on the default path with an identical fixture,
- the exactly-one-`(d)`-line assertion plus the assertion-stripped mutation check,
- the override's set-but-unresolved failure rule.

Approved to build.
