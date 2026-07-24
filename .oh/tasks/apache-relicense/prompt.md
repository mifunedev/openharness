# prompt — apache-relicense

Relicense Open Harness from MIT to the Apache License 2.0, and write down the open-core boundary
that the license choice encodes. Mifune's hosted control plane stays proprietary.

**Authoritative artifacts** (read before touching anything):

- `.oh/tasks/apache-relicense/prd.md` — objective, decisions of record (DP-1..DP-9), ownership
  evidence, false-positive whitelist, out-of-scope
- `.oh/tasks/apache-relicense/prd.json` — the ten user stories with verifiable acceptance criteria
- `.oh/tasks/apache-relicense/progress.txt` — dependency graph, delegate assignment, running log

**Issue:** [#666](https://github.com/mifunedev/openharness/issues/666)
**Branch:** `feat/666-apache-relicense`, cut from and targeting `upstream/development`
(`mifunedev/openharness`) — not the `ryaneggz` origin fork.

## Non-negotiable constraints

1. **Never run a blind repo-wide MIT→Apache replacement.** Eight files mention MIT in reference to
   *other* projects (prd.md § 9), and five vendored `caveman*/LICENSE` files carry a third party's
   copyright. All thirteen must be byte-identical when this lands.
2. **`.devcontainer/Dockerfile` is a protected path.** Additive-only: exactly one new `LABEL` line,
   zero deletions, no layer restructuring.
3. **Apache-2.0 terms text is verbatim.** No clause added, removed, or reworded. The holder string
   goes in the appendix boilerplate and in `NOTICE` — never inside the terms body.
4. **Stage, do not release.** A CHANGELOG bullet under `## [Unreleased]`; no version promoted, no
   tag, no `/release`.
5. **Prior MIT releases remain usable under MIT.** Say so wherever the change is described; this
   governs new code and future releases and does not revoke past grants.
6. A delegate is not done until its `progress.txt` entry is written and its `prd.json` story is
   updated. Delegates never self-certify `passes: true` — the First Mate marks passes after
   validating against the acceptance criteria.

## Definition of done

All eleven stories `passes: true`, the shipped-tarball proof in US-010 recorded with real command
output in `verification.md`, `/eval` re-run with `.oh/evals/RESULTS.md` regenerated and no green→red
regression, and a ready-for-review PR to `upstream:development` that stays at the human merge gate.
No auto-merge.

**Resolved before merge, by the captain:** the holder string is
`Ryan Eggleston, d/b/a Mifune Dev (mifune.dev)`. The entity named by the trade name is being formed
but does not yet exist, so the individual author is the rights holder today. See `prd.md` § 11 for
the reasoning and the post-formation IP-assignment follow-up, which counsel should confirm.
