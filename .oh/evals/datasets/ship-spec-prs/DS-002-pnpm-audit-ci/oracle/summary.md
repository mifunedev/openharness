# Oracle summary — DS-002 pnpm security audits in CI

PR #172 (closes issue #171) wires a pnpm security-audit gate into the harness build path:

- **CI gate** — `.github/workflows/ci-harness.yml` runs the audit as a dedicated step before
  dependency install, invoked through the repo's pinned pnpm version (no ad-hoc `npx`/global
  pnpm), so a vulnerable lockfile fails the check before merge.
- **Release parity** — `.github/workflows/release.yml` mirrors the same audit step in the
  release-gate job, so the release line is held to the identical bar as CI.
- **Local parity script** — `package.json` gains a `security:audit` script so a contributor can
  reproduce the exact gate locally before pushing.
- **Regression probe** — `evals/probes/pnpm-audit-ci-gate.sh` asserts the audit wiring stays
  present in both workflows and the package script; `evals/RESULTS.md` records its green row and
  `CHANGELOG.md` notes the change under `[Unreleased]`.

Net diff: 6 files, +96/-27.

## Reward
- **diff_similarity** — score the candidate's changed-file set against `oracle/diff.patch`.
- **test_execution** — the `pnpm-audit-ci-gate` probe (`evals/probes/pnpm-audit-ci-gate.sh`) is green.
- **artifact_presence** — PR #172 merged into the repo (merge commit `997e232`).
