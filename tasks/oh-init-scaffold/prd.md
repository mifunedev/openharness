# PRD — `oh init` + `.oh/templates/` scaffold (RFC #531 Phase 2, slice 1)

**Issue:** [mifunedev/openharness#531](https://github.com/mifunedev/openharness/issues/531) — *"RFC: Make OpenHarness portable via project-local `.oh` infrastructure."*
**Branch:** `feat/531-oh-init-scaffold` · **Base:** `development` · **Repo:** `ryaneggz/openharness`
**Phase:** 2 (the `oh init` capability) — **slice 1 of N** (compat-file generation; defers full `.oh` vendoring + the live-asset restructure).

---

## Background

RFC #531 is a three-phase migration so OpenHarness can *equip* any existing repository
in place (`oh init`) instead of requiring a standalone checkout. Its guiding principle:

> OpenHarness equips a repository. It should not become the repository.

**Phase 1** (shipped, PR #333 — `OH_PROJECT_ROOT` project-root seam) introduced the
project-root indirection with **zero behavior change**. This PRD is the first slice of
**Phase 2**, whose RFC bullets are: *implement `oh init`* · *vendor/install `.oh` into
arbitrary repositories* · *generate compatibility files*.

The current CLI (`.oh/cli/src/cli.ts`) is a clean `main(argv)` dispatcher exposing
`oh config <integration>` (no integrations registered), `oh --version`, `oh --help`. It
has **no `oh init`**. `.oh/templates/` does not exist.

## Goals

1. Add an `oh init [targetDir]` command that **generates the project-side compatibility
   files** that equip a repo: `harness.yaml`, a `.devcontainer/` compat layer,
   `AGENTS.md`, and `.gitignore` entries — read from a new **`.oh/templates/`** scaffold
   source.
2. Make `oh init` **safe and idempotent**: never clobber an existing file without
   `--force`; support `--dry-run`; append-only, dedup'd `.gitignore` handling; clear
   per-file report and next-steps.
3. Keep the command **purely testable** — a dependency-injected core (`runInit(opts, io)`)
   with no `process.exit`/global I/O, covered by integration tests that scaffold into a
   temp dir.
4. **Zero live-boot impact.** The live `.devcontainer/` and the running sandbox are not
   touched. `oh init` only writes into a *target* directory (default: cwd).

## Non-Goals (explicitly deferred)

- **No live-asset restructure.** We do NOT move the canonical `.devcontainer/` under
  `.oh/templates/.devcontainer/`, and we do NOT regenerate the root `.devcontainer/` as a
  generated compat layer. (Phase 2 slice 2 — touches the live boot path.)
- **No full `.oh/` vendoring.** `oh init` does not copy the entire `.oh/` control plane
  (CLI, scripts, docs) into the target. The generated `.devcontainer/devcontainer.json`
  references the published image as a stub. (Phase 2 slice 3 / `oh update` — Phase 3.)
- **No installed-binary template bundling (keeps the Dockerfile UNTOUCHED).** The on-PATH
  `oh` (`/usr/local/bin/oh` → `/opt/oh/dist/oh.js`, installed by `COPY .oh/cli/ /opt/oh/`)
  resolves its default `templatesDir` to `/opt/templates`, which the Dockerfile does **not**
  COPY. Adding that COPY is a boot-path change the operator scoped OUT ("live `.devcontainer/`
  → UNTOUCHED"). This slice instead ships a `--templates <dir>` flag + a contextual
  "templates not found" error; auto-bundling into the image is deferred to Phase 2 slice 2/3.
  `oh init` is fully usable today from a built checkout or via `--templates`.
- **No boot guarantee.** This slice does not claim the equipped repo *builds and boots*.
  Correctness = "`oh init` faithfully materializes `.oh/templates/` with safe idempotent
  mechanics." Real-world bootability of the generated devcontainer is Phase 2 slice 2.
- **No `OH_PROJECT_ROOT` value flip**, no `oh update`, no `oh sandbox`/`oh shell`.

## Architecture / design

### Template source: `.oh/templates/`

A new directory holding the scaffold payload `oh init` materializes:

| Template file | Materializes to | Notes |
|---|---|---|
| `harness.yaml` | `<target>/harness.yaml` | Project harness config (commented defaults; a fresh init changes nothing until uncommented). |
| `AGENTS.md` | `<target>/AGENTS.md` | Minimal project-workspace AGENTS.md stub. |
| `.devcontainer/devcontainer.json` | `<target>/.devcontainer/devcontainer.json` | Compat-layer devcontainer — **plain JSON** (no comments), `workspaceFolder: /home/sandbox/project` (the RFC runtime path), `image` stub. |
| `.devcontainer/.example.env` | `<target>/.devcontainer/.example.env` | Minimal env template. |
| `gitignore` | appended to `<target>/.gitignore` | Special handling (append-only, dedup) — see mapping rule. |
| `README.md` | (not copied) | Documents what `.oh/templates/` is. Excluded from scaffold by name. |

### Core command contract (pin exactly — both the command worker and the CLI-wiring worker code to this)

```ts
// .oh/cli/src/commands/init.ts
export interface InitIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
}
export interface InitOptions {
  targetDir: string;     // dir to scaffold into (resolved by caller; default cwd)
  templatesDir: string;  // absolute path to .oh/templates
  force?: boolean;       // overwrite existing files (default false)
  dryRun?: boolean;      // print plan, write nothing (default false)
}
// Returns process exit code: 0 success (incl. all-skipped), 1 precondition/usage error.
// Never calls process.exit; never writes outside `io`.
export async function runInit(opts: InitOptions, io: InitIO): Promise<number>;
```

### Scaffold mapping rule (pin exactly)

1. Recursively enumerate **files** under `templatesDir` (skip directories themselves and
   the literal top-level `README.md`).
2. The file named `gitignore` (top-level) → **append** its non-empty, non-duplicate lines
   to `<target>/.gitignore` (create the file if absent). Report `update .gitignore (+N)` or
   `skip .gitignore (no new entries)`.
3. Every other file at relpath `R` → copy to `<target>/R`, creating parent dirs. If
   `<target>/R` exists: **skip** (report `skip R (exists)`) unless `force` → overwrite
   (report `overwrite R`). Otherwise report `create R`.
4. **Precondition errors (exit 1, nothing written):** `templatesDir` missing/not a dir
   (with a **contextual** message naming the path + `--templates`); `targetDir` exists but
   is a file. If `targetDir` is missing **and not dry-run**, create it (`mkdir -p`) —
   supports the `mkdir proj && cd proj && oh init` and `oh init proj` flows.
5. **Path safety:** every resolved target path must satisfy `resolved === t ||
   resolved.startsWith(t + path.sep)` where `t = resolve(targetDir)` — a bare `startsWith(t)`
   wrongly admits a sibling (`/tmp/target-x` vs `/tmp/target`).
6. **`--dry-run`:** compute and print the same report prefixed `[dry-run]`, write nothing —
   **no file created, no `.gitignore` touched, and no `mkdir` of a missing `targetDir`** (a
   missing target is reported as if it would be created). The `targetDir`-is-a-file
   precondition still exits 1.

### CLI wiring (`.oh/cli/src/cli.ts`)

- Add an `init` branch to `main()`: positional `[targetDir]` (default `process.cwd()`),
  flags `--force` / `--dry-run` / `--help`/`-h`. Reject unknown flags (exit 1).
- Resolve the default `templatesDir` once from the module location:
  `resolve(dirname(fileURLToPath(import.meta.url)), "../../templates")` — this path is
  correct from **both** `src/cli.ts` and the bundled `dist/oh.js` (both live two levels
  under `.oh/cli`). Inject it into `runInit`.
- Add `oh init` to `printOhHelp()` usage and a dedicated `printInitHelp()`.
- Keep the existing pure helpers (`isHelpFlag`/`isVersionFlag`) and export any new pure
  parse helper the tests assert on.

### Testing

- `.oh/cli/src/__tests__/init.test.ts` (vitest; runs under root `vitest run` via the
  existing `.oh/cli/**/__tests__/**` include). Scaffolds into an OS temp dir
  (`mkdtempSync(join(tmpdir(), ...))`), passing the **real** `.oh/templates/` resolved
  from `import.meta.url`, and an in-memory `io` capturing stdout/stderr. Cleans up in
  `afterEach`. Covers: create-from-empty, skip-without-force, overwrite-with-force,
  dry-run-writes-nothing, `.gitignore` append idempotency (run twice → no dup lines),
  precondition error when target is a file, exit codes.
- `cli.property.test.ts` stays green (existing property tests on the pure flag helpers).

## User Stories

- **US-001 — `.oh/templates/` scaffold source.** Create the template payload + a
  `README.md`. Owns only files under `.oh/templates/`.
- **US-002 — `oh init` core command + tests.** Create `.oh/cli/src/commands/init.ts`
  (implementing the pinned contract + mapping rule) and
  `.oh/cli/src/__tests__/init.test.ts`. Owns only those two files.
- **US-003 — wire `init` into the CLI dispatcher + help.** Edit `.oh/cli/src/cli.ts`.
  Owns only `cli.ts`.
- **US-004 — eval probe + docs + CHANGELOG.** Add `evals/probes/oh-init-scaffold.sh`
  (3-state oracle), one `evals/RESULTS.md` row, a `CHANGELOG.md` [Unreleased] entry
  (full-URL #531 link to mifunedev), and an `.oh/README.md` `oh init` pointer. Owns only
  those four files.

Disjoint file ownership → US-001..004 run as parallel EDIT-only `/delegate` workers in
one wave; the Advisor integrates, commits per-story, and runs the single suite (workers
never run the test suite or git — they edit + static-verify only, matching the
shared-worktree pattern). US-002 and US-003 are coupled only by the **pinned contract**
above, so both code against it without a barrier.

## Wiki Alignment

**Impact: NOT-APPLICABLE.** `oh init` is a new, experimental CLI command whose portability
story is incomplete until Phase 2 slice 2 (live restructure) and Phase 3 (`oh update`).
Per the Phase 1 precedent (PR #333, seam), in-repo docs (`.oh/README.md` + `CHANGELOG.md`)
carry this slice; a public wiki onboarding entry ("equip a repo with `oh init`") is
premature and should land once the full portability path is real. No local wiki corpus
entry exists for the `oh` CLI; the DeepWiki has no `oh init` page to align against. **A
Phase-2-slice-2 / Phase-3 story SHOULD add the wiki onboarding entry.**

## Acceptance criteria (rollup)

1. `oh init <tmp>` into an empty dir creates `harness.yaml`, `.devcontainer/devcontainer.json`,
   `.devcontainer/.example.env`, `AGENTS.md`, and a `.gitignore` with the template entries.
2. Re-running `oh init <tmp>` without `--force` skips every existing file and adds **no**
   duplicate `.gitignore` lines (idempotent); exit 0.
3. `oh init <tmp> --force` overwrites existing files; `--dry-run` writes nothing.
4. `oh init` on a path that is a file exits 1 with a one-line stderr reason; nothing written.
5. `oh --help` lists `init`; `oh init --help` prints its usage.
6. `npm --prefix .oh/cli run typecheck` clean; `npm --prefix .oh/cli run build` succeeds;
   root `vitest run` green including the new `init.test.ts` and the unchanged property tests.
7. `evals/probes/oh-init-scaffold.sh` exits 0 (PASS) on the built branch; full eval suite
   0 REGRESSION; one new RESULTS.md row, no timestamp churn on other rows.
8. `devcontainer.json` template parses as JSON with `workspaceFolder === "/home/sandbox/project"`.
9. The live `.devcontainer/` (incl. `Dockerfile`) and root `harness.yaml`/`AGENTS.md` are
   **unchanged** by this PR. (`oh init` run in-place at the repo root would only ever append
   dedup'd entries to the live `.gitignore` — idempotent and benign — and skip every existing
   file; it is never run as part of this PR's build or CI.)
10. `oh init --templates .oh/templates <tmp>` materializes the payload end-to-end from the
    wired CLI (proves the `--templates` escape hatch + dispatcher integration).
