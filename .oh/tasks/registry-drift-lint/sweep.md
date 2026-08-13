# Registry portability sweep — one pass over every published skill

Issue #758 criterion 5 asks for one sweep of the skills already in the registry,
with hits **reported rather than silently fixed**. This file is that report.

Nothing in the registry was changed. Every repair named below is still
outstanding. The registry is a separate repository; a fix there is a pull
request against `mifunedev/skills`, which this change deliberately does not make.

## What was scanned

| Item | Value |
|---|---|
| Registry | `mifunedev/skills` |
| Commit | `1d11ab6` on `master` |
| Skill folders | 18 |
| Files read | 31 (`*.md` and `*.sh` under each skill folder) |
| Command | `bash .oh/scripts/registry-portability.sh --registry <checkout>` |

The issue says 17 skills. The registry holds 18 folders as of `1d11ab6`, because
`ste` landed after the issue was written. All 18 were swept.

## Result

14 findings in 4 skills. The other 14 skills are clean.

| Skill | Findings | Disposition |
|---|---|---|
| `ste` | 9 | 7 `ALLOW`, 2 `KNOWN` |
| `ship-spec` | 3 | 3 `KNOWN` |
| `harness-context` | 1 | 1 `ALLOW` |
| `reflect` | 1 | 1 `ALLOW` |

The 14 clean folders are not listed here by name. Three of them are still
published under the audit vocabulary this repository retired in #645, and
`.oh/evals/probes/audit-stale-references.sh` fails any tracked file that revives
those tokens. Reproduce the list from the command instead:

```bash
# an exceptions file holding an empty allow block, so nothing is suppressed
printf 'none\n```allow\n```\n' > /tmp/none.md
comm -13 \
  <(bash .oh/scripts/registry-portability.sh --registry <checkout> --allow /tmp/none.md \
      | sed -n 's#^skills/\([^/]*\)/.*#\1#p' | sort -u) \
  <(ls -d <checkout>/skills/*/ | xargs -n1 basename | sort)
```

Pass the empty allow block, not the shipped one: the default run hides the
`ALLOW`-suppressed skills and reports 16 clean folders rather than 14.

That omission is itself a finding. The registry still ships three skills under
names this repository replaced with the `/audit` dispatcher, so the published
tree is a vocabulary generation behind the canonical one. The portability linter
does not catch this: a stale *name* resolves fine for an installer, who never
had the new one. It is drift of the kind issue #758 is about, and it needs a
different check — a published-name-versus-canonical-name comparison, which is
the diff-based Option A the issue describes, not the standalone lint of Option C
built here.

The check exits **1** against live `master`. That is the correct result, not a
bug in the check: five real defects stand in the published copies, `KNOWN` does
not suppress the exit code, and a green result would misreport the registry.

## The 5 unrepaired defects (`KNOWN`)

These are live. An installer hits every one of them.

| # | File and line | Rule | Reference | Why it is wrong for an installer |
|---|---|---|---|---|
| 1 | `skills/ship-spec/SKILL.md:262` | `DANGLING-REF` | `scripts/ralph.sh` | The published `ship-spec` folder ships no `scripts/` directory. The reader is told to run a file that is not there. |
| 2 | `skills/ship-spec/SKILL.md:309` | `DANGLING-REF` | `scripts/ralph.sh` | Same script, second invocation site. |
| 3 | `skills/ship-spec/SKILL.md:340` | `DANGLING-REF` | `scripts/ralph.sh` | Same script, third invocation site. |
| 4 | `skills/ste/SKILL.md:280` | `HARNESS-SKILL` | `/retro` | The registry publishes `reflect`, not `retro`. The named command does not exist for an installer. |
| 5 | `skills/ste/SKILL.md:282` | `OH-PATH` | `.oh/skills/retro/references/memory-protocol.md` | A cross-repository pointer with no fallback. This is historical defect 3 from #751, repaired only into a conditional sentence; the unreachable path survived the repair. |

Suggested repairs, for whoever opens the registry pull request:

- **1–3**: either publish `scripts/ralph.sh` inside the `ship-spec` folder, or
  rewrite the three lines to stop naming a file the folder does not carry.
- **4**: rename the reference to `/reflect`, which the registry does publish.
- **5**: delete the path, or restate the sentence so it does not point outside
  the installer's tree.

## The 9 accepted references (`ALLOW`)

These resolve to nothing for an installer too, and are accepted anyway. Each
reason is recorded in the `allow` block of `.oh/scripts/registry-portability.md`.

| File and line | Rule | Reference | Why accepted |
|---|---|---|---|
| `skills/ste/SKILL.md:260` | `OH-PATH` | `.oh/scripts/oh-path` | Inside an `[ -x … ]` existence guard. The block is a no-op outside a harness checkout. |
| `skills/ste/SKILL.md:260` | `OH-PATH` | `.oh/scripts/locked-append.sh` | Same guarded block. One source line carries two tokens under one hash. |
| `skills/ste/SKILL.md:261` | `OH-PATH` | `.oh/scripts/oh-path` | Same guarded block. |
| `skills/ste/SKILL.md:263` | `OH-PATH` | `.oh/scripts/locked-append.sh` | Same guarded block. |
| `skills/ste/references/rules.md:141` | `OH-PATH` | `.oh/scripts/ralph.sh` | Example prose teaching path-naming style. The reader is shown a path shape, not told to open it. |
| `skills/ste/references/rules.md:371` | `OH-PATH` | `.oh/scripts/ralph.sh` | Same, second example. |
| `skills/ste/references/rules.md:517` | `OH-PATH` | `.oh/crons/autopilot.md` | Same, third example. |
| `skills/harness-context/SKILL.md:23` | `DANGLING-REF` | `scripts/README.md` | Enumerates the harness repository's per-directory READMEs. Not a file this skill folder ships or claims to. |
| `skills/reflect/SKILL.md:148` | `HARNESS-SKILL` | `/update-config` | Names a Claude Code built-in command. An installer on that client already has it. |

Eight `ALLOW` entries cover these nine findings: `skills/ste/SKILL.md:260`
carries two distinct tokens on one source line, and the exception keys on the
line, so one entry suppresses both.

## What this sweep does not cover

- **`.claude/` references.** The registry carries 79 of them across 15 of its 18
  skills. The same class of defect, an order of magnitude larger. `OH-PATH`
  covers `.oh/` only. Widening the rule is left as a follow-up so this sweep
  reports a number that was actually measured.
- **`template/`.** It sits outside `skills/` and is not scanned.
- **Unbackticked slash commands.** `HARNESS-SKILL` reads backticked tokens only.
  A looser pattern produced over 100 false hits across the registry.
- **Two-word routes.** `HARNESS-SKILL` reads single-word routes only.

Each limitation is also recorded in `.oh/scripts/registry-portability.md`
§ Limitations, so a reader who finds only the contract still learns the same
boundaries.
