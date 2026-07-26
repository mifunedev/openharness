# PRD — Relicense Open Harness: MIT → Apache License 2.0

**Issue:** [#666](https://github.com/mifunedev/openharness/issues/666)
**Branch:** `feat/666-apache-relicense`
**Base / target:** `upstream/development` (`mifunedev/openharness`) — **not** the `ryaneggz` origin fork
**Status:** in progress

---

## 1. Objective

Move Open Harness from **MIT** to the **Apache License 2.0**, and write down the open-core boundary
that the license choice encodes. Mifune's hosted control plane stays proprietary and is unaffected.

## 2. Why

Open Harness ships today under MIT (`LICENSE:3` — `Copyright (c) 2026 Ryan Eggleston`). As the
project becomes infrastructure that companies clone into private repos, extend with internal
workflows, and embed in commercial dev environments, MIT's bare copyright grant stops being
sufficient. Apache-2.0 preserves the same permissive freedoms but adds three things MIT lacks:

- an **explicit patent license** from every contributor for claims their contribution infringes,
- **patent-retaliation termination** if a recipient sues over the project,
- an **explicit withholding of trademark rights** (§6) — a fork may sell the software but may not
  present itself as *Mifune*.

The trademark point is load-bearing for a project whose documented adoption model is clone-and-own
(`.oh/docs/installation.md`), which actively encourages forks.

**Rejected alternatives.** AGPL/SSPL/BSL — enterprise review friction, and they contradict the
"developer-owned, open by default" positioning. Apache + commercial dual licensing — Apache already
permits commercial use, so a paid alternative grants nothing.

**Prior MIT releases remain usable under MIT.** This governs newly relicensed code and future
releases; it does not revoke past grants.

## 3. The open-core boundary

| Apache-2.0 | Proprietary |
|---|---|
| Runtime | Mifune Console |
| `oh` CLI + public SDKs | Provisioning + fleet-management control plane |
| Container definitions + public deployment integrations | Billing, enterprise policy, RBAC, hosted ops |
| Harness spec + interop formats | — |

Customer harness repos stay customer-owned. Open core without crippling the open core — the moat is
the managed platform, not restrictions on modifying the runtime.

## 4. Decisions of record

| # | Decision | Resolution |
|---|---|---|
| DP-1 | Canonical copyright holder | **`Ryan Eggleston, d/b/a Mifune Dev (mifune.dev)`** (revised — see § 11) |
| DP-2 | The 15 Mifune-Dev per-skill `LICENSE` files | **Deleted**, not relicensed |
| DP-3 | The 5 `caveman` per-skill `LICENSE` files | **Untouched** — third-party copyright |
| DP-4 | License-consistency enforcement (eval probe, CI gate) | **Deferred** — out of scope, fast-follow |
| DP-5 | SPDX per-file headers | **No** |
| DP-6 | OCI image label + root `package.json` license field | **In scope** |
| DP-7 | Landing zone | Branch off `upstream/development`, PR to `upstream:development` |
| DP-8 | DCO | **Documented only**, not an enforcing CI gate |
| DP-9 | Root `CONTRIBUTING.md` | **Thin** — DCO + inbound license, links to `.oh/docs/contributing.md` |

**DP-2 rationale.** The 15 files name the *same* holder as the new root license, so once root is
Apache-2.0 a per-directory MIT file actively asserts that subtree is separately MIT-licensed — a real
conflict, not cosmetic drift. Verified safe: `.oh/evals/probes/skills-dir-clean.sh` walks
`find "$SKILLS" -maxdepth 1 -mindepth 1 -type f`, so depth-2 `LICENSE` files are never inspected.
Rejected alternative: relicensing all 15 (pure duplication of the root grant, 15 new drift surfaces).

**DP-3 rationale.** The `caveman*` skills are vendored from `github:JuliusBrussee/caveman`
(`.oh/skills.lock`) and carry `Copyright (c) 2026 Julius Brussee`. Mifune cannot relicense someone
else's copyright. They are attributed in `NOTICE` instead.

**DP-7 rationale.** Per `.oh/skills/sync/references/topology.md`, `origin` (`ryaneggz/openharness`)
is the operator's fork and `upstream` (`mifunedev/openharness`) is the canonical public repo — the
only place a license assertion is legally meaningful. The normal `/sync publish` sanitize-merge is
bypassed: license text carries no origin-specific customization to strip, and none of the three
preserved fork divergences (cron TZ, skills symlink, `client-slack-pi` session name) touch these
files. Upstream merges do **not** auto-close issues — close #666 manually.

**DP-8 rationale.** ~85% of commits come from the owner plus automation identities
(`OpenHarness Bot`, `Ralph Agent`) that emit no `Signed-off-by`; a hard gate would fail immediately
on unmodified automation paths for near-zero present benefit.

**DP-9 rationale.** GitHub's community-profile and PR-guidance detection scans root, `docs/`, and
`.github/` — never `.oh/docs/`. The new root file carries only the DCO clause and the Apache-2.0
inbound statement, then links to `.oh/docs/contributing.md`, which stays canonical for workflow.
Do not duplicate the workflow prose — it will drift.

## 5. Ownership evidence (guidance step 1 — satisfied)

`git shortlog -sne` → 1,533 commits across 8 identities, measured at `upstream/development` @ `94bfc2a9`
(the branch point). The count advances by one per commit made on this branch; `ownership-audit.md`
records the live figure and reconciles it against this snapshot.

| Commits | Identity | Disposition |
|---|---|---|
| 1,304 | `ryaneggz` / `Ryan Eggleston` (`kre8mymedia@gmail.com`, GH noreply) | Project owner |
| 217 | `OpenHarness Bot`, `Ralph Agent`, `Claude Haiku` | Owner-operated automation |
| 9 | `Im An AI <im.an.ai.agent@gmail.com>` | Owner-confirmed own identity. 8 are merge commits of the owner's own `ryaneggz/*` PRs; the 1 authored commit is `f27cfd57 Update README.md` (+2/−2) |
| 3 | `dependabot[bot]` | Mechanical version bumps — no protectable expression |

**Verdict: unblocked.** No outside copyright holder needs to grant permission.
`JuliusBrussee/caveman` is the only third-party *vendored* source in the repo (every other
`.oh/skills.lock` source is `mifunedev/skills`); `.pi/UPSTREAM.md` records `pi-messenger-bridge` as
an npm dependency, **not** vendored, so it carries no NOTICE obligation.

Full detail lands in `.oh/tasks/apache-relicense/ownership-audit.md` (US-001).

## 6. User stories

Every file below is owned by exactly one story, so all of Wave 1 is genuinely parallel.

### US-001 — Record the ownership audit
As Mifune's founder, I want the copyright-ownership audit recorded as a durable artifact so that the
relicense rests on cited evidence rather than recollection.

### US-002 — Replace the license text
As the maintainer, I want `LICENSE` to carry unmodified Apache-2.0 terms so that the grant is
unambiguous and machine-recognizable.

### US-003 — Add NOTICE
As a downstream distributor, I want a `NOTICE` file so that I can satisfy Apache-2.0 §4(d).

### US-004 — Retire the redundant per-skill licenses
As the maintainer, I want the 15 Mifune-Dev skill `LICENSE` files removed so that no subtree asserts
MIT after the root goes Apache-2.0.

### US-005 — README license, trademark, and boundary surface
As an evaluator, I want the README to state the license and the open/proprietary split so that I can
assess adoption risk without reading the LICENSE file.

### US-006 — Package and distribution metadata
As a packaging consumer, I want every manifest and image to declare Apache-2.0 so that automated
license scanners read the truth.

### US-007 — Open-core boundary documentation
As an enterprise reviewer, I want the open/proprietary boundary written down so that the license
choice is legible without inferring it from the code.

### US-008 — Root CONTRIBUTING.md with DCO
As a contributor, I want the inbound license terms stated so that my contribution's status is
unambiguous.

### US-009 — CHANGELOG entry (staging only)
As the release manager, I want the relicense staged under `[Unreleased]` so that the next release
carries the note without this PR cutting a release.

### US-010 — End-to-end verification
As the maintainer, I want a single verification pass proving the artifact — not just the repo files —
declares Apache-2.0, and that no third-party MIT reference was collaterally rewritten.

### US-011 — Correct the stale license claim in `.oh/skills.lock`
As the maintainer, I want the `audit` skill's lockfile note to stop asserting that the repository
LICENSE is MIT so that no metadata contradicts the new grant.

Verifiable acceptance criteria for each story live in `prd.json`.

## 7. Dependency graph

```
US-001 (ownership record) ──── blocks the MERGE GATE, not the graph
   │
W1 (parallel, disjoint file ownership)
   US-002 LICENSE   US-003 NOTICE    US-004 skill-LICENSE retirement
   US-005 README    US-006 metadata  US-007 boundary docs
   US-008 CONTRIB   US-009 CHANGELOG US-011 skills.lock note
   │
W2  US-010 verification
   │
human merge gate (no auto-merge)
   │
/release — separate, owner-triggered
```

US-001 does not block W1 — every W1 edit is reversible on a feature branch. It blocks the **merge
gate**: merging to the public repo is the moment the license assertion becomes real.

## 8. Protected-path overrides

Two stories touch entries on `.claude/protected-paths.txt`. Both declare an explicit override here,
as that file's header requires.

### 8.1 `.devcontainer/Dockerfile` (US-006)

Listed at `.claude/protected-paths.txt:47`. US-006 declares an **additive-only** override: exactly
one new `LABEL org.opencontainers.image.licenses="Apache-2.0"` line adjacent to the existing
`devcontainer.metadata` LABEL at line 230. No existing line is removed, reordered, or restructured;
no build layer changes. The file is single-`FROM`, so there is no multi-stage ordering hazard.

### 8.2 Ten protected skills (US-004)

Ten of US-004's fifteen target directories belong to skills named on the protected list:
`release` (:16), `ci-status` (:17), `agent-browser` (:19), `prd` (:20), `ralph` (:21), `audit` (:22),
`delegate` (:23), `strategic-proposal` (:24), `ship-spec` (:25), `retro` (:32).

**Override note.** The list protects load-bearing *capability* — its header forbids proposing a
protected skill "for deletion or deprecation" without an override note, and its stated origin
(issue #218) is the silent removal of working capability. US-004 deletes neither a skill nor any
functional part of one. It removes a single incidental, non-executable `LICENSE` file from each
directory. `SKILL.md`, `references/`, `scripts/`, and every other file stay untouched — US-004's
acceptance criteria assert this and US-010 re-verifies it. Each affected skill remains fully
invocable and fully licensed, now by the root Apache-2.0 grant instead of a redundant per-directory
MIT file naming the same holder. Protection of the capability is preserved, not lifted.

This override was raised by both adversarial critics and is recorded rather than assumed.

## 9. False-positive whitelist — do NOT rewrite

These eight files mention MIT in reference to **other projects**. They must be byte-identical after
this change:

| File | What it describes |
|---|---|
| `.oh/docs/harnesses/hermes.md` | Nous Research's Hermes CLI |
| `.oh/docs/integrations/debugmcp.md` | DebugMCP |
| `.oh/docs/integrations/slack.md` | `pi-messenger-bridge` |
| `.oh/docs/security-considerations.md` | third-party tooling |
| `.pi/UPSTREAM.md` | `pi-messenger-bridge` provenance |
| `.oh/templates/full/.pi/UPSTREAM.md` | same, template copy |
| `.oh/tasks/cc-safety-net/prd.md` | `cc-safety-net` package |
| `.oh/skills/wiki/corpus/raw/2026-07-18-markitdown.md` | MarkItDown, ingested corpus |
| `.oh/skills.lock:28` | the vendored `caveman` skills' upstream MIT license |

Plus the 5 `caveman*` `LICENSE` files (DP-3).

**One MIT reference in the repo is NOT a false positive.** `.oh/skills.lock:213` — the `audit`
skill's `note` field — ends `"... remains MIT in repository LICENSE."` That is a
present-tense claim about *this repository's* root license, and it becomes false the moment `LICENSE`
flips. It is owned by **US-011**, not whitelisted. Found by adversarial critique, not by the
original plan.

## 10. Out of scope

- **`license-consistency.sh` eval probe and a `publish-cli.yml` license gate** — the cheapest
  high-value fast-follow, deliberately deferred (DP-4).
- **SPDX per-file headers** (DP-5); **`CODE_OF_CONDUCT.md` / `GOVERNANCE.md`** — not required by
  Apache-2.0, not requested.
- **An enforcing DCO CI bot** (DP-8).
- **Cutting the release** — `/release` runs after this merges, as a separate owner-triggered act.
- **`mifunedev/operator`** — does not exist yet. **`mifunedev/openharness-web`** — separate repo,
  separate PR.
- **Git history rewrite, CLA, per-historical-contributor clearance beyond the flagged identities,
  retroactive changes to existing MIT tags.**

## 11. Legal note

This is strategic and structural guidance, not legal advice.

**Resolved.** DP-1 originally read `Mifune Dev (mifune.dev)`. The captain confirmed a legal entity is
being formed (most likely via Stripe Atlas) but does **not** yet exist. Copyright vests in a legal
person, so until the entity exists the rights sit with the individual author and a bare trade name
would not name a rights holder. The holder string was therefore revised to
`Ryan Eggleston, d/b/a Mifune Dev (mifune.dev)` in `LICENSE`, `.oh/cli/LICENSE`, `NOTICE`,
`.oh/cli/NOTICE`, and the README license line before merge. The `This product includes software
developed at Mifune Dev` attribution sentence is unchanged — it names where the work was developed,
not who holds the rights.

**Open follow-up, out of scope for this task.** Once the entity is formed, pre-existing IP must be
assigned to it in writing (confirm the Atlas founder package includes an IP assignment), and the same
five surfaces updated to the exact registered legal name. Counsel should confirm both steps.
