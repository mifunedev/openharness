# Critique — plan and PRD gate

Two adversarial critics reviewed the plan, `prd.md`, and `prd.json` before any file was built.
Critic A held the alignment and verifiability lens. Critic B held the correctness, licensing, and
blast-radius lens. Both critics found the same blocking defect independently.

## Blocking defects and their resolutions

### 1. The self-application requirement was unsatisfiable (found by both critics)

`examples.md` holds before and after pairs. The before text is deliberately bad prose. The plan
ran the checker over the whole file and expected exit 0. The command would report the before text
as violations, so the file could never pass its own checker. Neither the plan nor `prd.json`
defined a machine-readable way to separate the two halves.

**Resolution — tagged fences plus a block mode.** Every specimen in `examples.md` goes inside a
fenced block whose info string ends in `before` or `after`:

````text
```text before
The system should probably be restarted.
```

```text after
Restart the `openharness` container.
```
````

The checker gains one flag:

| Invocation | What it lints | Expected result |
|---|---|---|
| `ste-check.sh <file>` | narrative prose, all fenced blocks skipped | exit 0 |
| `ste-check.sh --blocks after <file>` | only fences tagged `after` | exit 0 |
| `ste-check.sh --blocks before <file>` | only fences tagged `before` | exit 1, many findings |

This resolves four findings at once. The self-application claim becomes testable, the checker
proves it rejects as well as accepts, the before blocks become a committed regression fixture, and
no throwaway file in `/tmp` is needed.

### 2. The fail-open self-test printed instead of asserting (critic B)

The plan ran `ste-check.sh /tmp/ste-bad.md; echo "rc=$? (expect 1 ...)"`. A checker with a stray
`exit 0` prints `rc=0` and the verification block continues. Exit 0 proves nothing.

**Resolution.** Every checker assertion in `verify.sh` compares the code and exits non-zero on a
mismatch. Both directions are pinned: the `before` blocks must produce exit 1, and the narrative
prose plus the `after` blocks must produce exit 0.

### 3. Same-priority stories held hard dependencies (critic A)

US-001, US-002, US-003, and US-004 were all priority 1, and two of them required the checker from
US-004 to exist.

**Resolution.** US-004 is priority 1 alone. The three reference files move to priority 2. Each
dependent story states the dependency in `notes`.

### 4. The task folder is not tracked by Git (critic A)

`.gitignore:12` holds `.oh/tasks/*` with one exception for `README.md`. Older task folders such as
`.oh/tasks/apache-relicense/` are tracked because someone force-added them. As specified, the
evidence file would never reach the pull request diff, which defeats the purpose of US-007.

**Resolution.** US-007 requires `git add -f .oh/tasks/ste-controlled-language/`. The command is
stated in the acceptance criteria, not left implicit.

### 5. Work units D, F, and G had no story (critic A)

`prd.md` defined done as "every story passes", but the registry pull request and the follow-up
issue were tracked only in the plan.

**Resolution.** US-009 covers both.

## Non-blocking findings adopted

| Finding | Change |
|---|---|
| Acceptance criteria were not mechanically checkable | Each pair carries a `**Domain:**` label; rules use `### N.` headings; both become `command grep -c` counts |
| The detector classes were listed only in the plan | The six classes are enumerated in the US-004 criteria |
| `dictionary.md` had no self-check | The checker strips inline code spans, so a fully backticked table passes; the criterion is added |
| The dictionary needed an affirmative authorship statement | `dictionary.md` states that entries were authored from software documentation practice, not filtered from Part 2 |
| US-003 was missing the no-cross-link rule | The criterion is added |

## Non-blocking findings rejected, with reasons

| Finding | Verdict |
|---|---|
| Rename the slug from `ste` to `controlled-language` to reduce endorsement risk | **Rejected.** The risk that STEMG names is a tool that claims full compliance, not a tool that names the standard it aligns to. `SKILL.md` carries an explicit non-affiliation and no-compliance notice. The issue, the branch, and the operator's request all use `ste`. Renaming after the fact costs more than the residual risk. |
| Add a directory or batch mode to the checker | **Deferred.** The checker accepts one or more file arguments, which covers the reviewer flow through shell globbing. A recursive walk is scope creep. |
| State a synchronisation policy between the harness copy and the registry copy | **Deferred to a follow-up issue.** Every vendored skill in the registry shares this gap. Solving it for one skill is the wrong layer. |

## Claims the critics re-verified as correct

- `.oh/evals/probes/audit-stale-references.sh` holds no exclusion for `.oh/skills/ste/`.
- `/audit skills` dimension D needs `## Memory Protocol` plus one of `## Guidelines`,
  `## Important Notes`, `## Reference`.
- A reference file longer than 100 lines needs `## Contents`; `SKILL.md` must stay under 500 lines.
- Only the five `caveman*/LICENSE` files remain under `.oh/skills/`.
- `skills-dir-clean.sh` walks `.oh/skills` at `-maxdepth 1 -type f`, so a new subdirectory is
  invisible to it. `skill-paths.sh` and `skills-vendored.sh` check unrelated fixed token lists.
  None of the three goes red for a new skill directory.
- `shellcheck` is absent from this environment.
- The default `grep` is a shell function that wraps `ugrep --ignore-files`, which honours
  `.gitignore`. Use `command grep` for repository-wide counts.

## Correction to one critic claim

Critic B described the no-cross-link rule as a hard repository rule. It is guidance at
`.oh/skills/builder/references/skill.md:129-130` against chains that make a reference unusable on
its own. No probe enforces it. This task still applies the stricter form, but the stricter form is
a local choice and is not precedent for other skills.
