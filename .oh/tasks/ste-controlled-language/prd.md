# PRD — `/ste` controlled-language writing standard

- **Issue**: [mifunedev/openharness#750](https://github.com/mifunedev/openharness/issues/750)
- **Branch**: `skill/750-ste-controlled-language`
- **Target**: `development`

## Problem

The harness governs no artifact prose. `/caveman` compresses the live chat reply.
`/prd` gives five lines of audience guidance (`.oh/skills/prd/SKILL.md:138-146`).
`/wiki` caps entry length. No skill states how to write the docs, runbooks, specs,
PR bodies, and code comments that agents produce.

Ambiguous prose reaches the repository and costs the next agent a guess:

| Ambiguous source | What the reader cannot resolve |
|---|---|
| "restart it after a while" | which component, which actor, which duration |
| "make sure Docker socket support is turned on" | which mechanism, which verification step |
| "the config should probably be updated" | which file, which key, which value, who acts |

## Goal

Add a controlled-language standard for technical prose, plus a deterministic checker
that reports violations by `file:line` and rewrites nothing. Publish a portable copy
to the public `mifunedev/skills` registry.

## Non-goals

- Reproducing ASD-STE100 Issue 9 text or its controlled dictionary.
- Claiming ASD-STE100 certification or complete standards compliance.
- Changing any `/caveman` file. The overlap is resolved by a precedence rule.
- Rewriting existing repository documents to the new standard.
- Adding a CI job or an eval probe.

## Licensing posture

ASD-STE100 is `Copyright STEMG - All Rights Reserved`. STEMG states that it does not
endorse or certify tools that claim full compliance. This skill therefore:

1. reproduces no Issue 9 rule text and no dictionary entry;
2. authors every rule statement and word-list entry independently;
3. carries a non-affiliation and no-compliance notice in `SKILL.md`;
4. cites `https://www.asd-ste100.org/` as the authoritative standard.

The skill is aligned to the published *shape* of the standard — Part 1 holds 53 writing
rules in 9 sections, Part 2 holds a controlled dictionary. Structural alignment is a
fact about the standard, not a reproduction of it.

## Deliverables

```text
.oh/skills/ste/
├── SKILL.md
├── references/
│   ├── rules.md
│   ├── dictionary.md
│   └── examples.md
└── scripts/
    └── ste-check.sh
```

Wiring: one `/ste` row in the `AGENTS.md` Skills table, one `### Added` line under
`## [Unreleased]` in `CHANGELOG.md`.

Registry: a portable copy at `skills/ste/` in `mifunedev/skills`, with a six-key
frontmatter, an MIT `LICENSE`, a `registry.json` entry, and refreshed checksums.

## Precedence over `/caveman`

STE governs artifacts. `/caveman` governs conversation. If the text lands in a
git-tracked file or a GitHub-posted body, `/ste` governs its prose. `/caveman` governs
only the live chat reply. `/caveman` level `full` drops articles and lets fragments
stand (`.oh/skills/caveman/SKILL.md:31`), which breaks the full-sentence rule.

`/ste` adopts two `/caveman` clauses by reference instead of restating them:

- never compress code, commands, identifiers, or error strings (`.oh/skills/caveman/SKILL.md:41-46`);
- revert to plain prose for security warnings and irreversible-action confirmations (`.oh/skills/caveman/SKILL.md:48-57`).

## Constraints verified against this repository

| Constraint | Evidence |
|---|---|
| The registry frontmatter check is an allow-list of six keys | `skills-ref@0.1.5` rejected `when_to_use` and rejected `argument-hint` on `.oh/skills/render-html/` |
| `mifunedev/skills` runs no CI | the tree holds no `.github/workflows/` path |
| Harness pull requests target `upstream` | `.oh/skills/git/SKILL.md:22-40` |
| `.oh/evals/probes/audit-stale-references.sh` greps legacy hyphenated tokens repo-wide | its exclusion list omits `.oh/skills/ste/` |
| `$CLAUDE_SKILL_DIR` fails registry check 4b | `scripts/validate.sh` greps the literal string |
| Per-skill `LICENSE` files were deleted from this repository | `.oh/tasks/apache-relicense/prd.md:54` DP-2 |
| `/audit skills` dimension D needs `## Memory Protocol` plus one of `## Guidelines`, `## Important Notes`, `## Reference` | `.oh/skills/audit/references/skills.md:94-111` |
| `shellcheck` is absent and `.oh/skills/ste/scripts/` is outside the CI glob | `.github/workflows/ci-harness.yml:126` enumerates paths |
| The default `grep` here is a `ugrep --ignore-files` wrapper that honours `.gitignore` | use `command grep` for repository-wide counts |

## Acceptance criteria

See `prd.json` for the per-story list. The build is done when every story reports
`passes: true` and `bash .oh/skills/eval/run.sh` shows no new regression against the
97-probe baseline captured before the change.
