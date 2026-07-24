# Ownership Audit — MIT → Apache-2.0 Relicense (US-001)

**Issue:** [#666](https://github.com/mifunedev/openharness/issues/666)
**Purpose:** Durable record that copyright ownership across `git log` history is clear enough to
relicense, per `prd.md` § 5 and the guidance's "step 1" ownership check. This is a record of
evidence, not an argument — every number below is the literal output of the command shown above it.

---

## 1. Full identity table

Command:

```bash
git shortlog -sne HEAD
```

Output (captured on branch `feat/666-apache-relicense`, HEAD `7c995438`):

```
   848	ryaneggz <kre8mymedia@gmail.com>
   438	Ryan Eggleston <kre8mymedia@gmail.com>
   208	OpenHarness Bot <noreply@openharness.local>
    19	Ryan Eggleston <ryaneggz@users.noreply.github.com>
     9	Im An AI <im.an.ai.agent@gmail.com>
     8	Ralph Agent <ralph@openharness.dev>
     3	dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com>
     1	Claude Haiku <kre8mymedia@gmail.com>
```

```bash
git shortlog -sne HEAD | awk '{sum+=$1} END {print sum, "identities:", NR}'
# → 1534 identities: 8
```

**8 identities, 1,534 commits at current HEAD.** See § 4 (Discrepancy) for why this is 1,534, not
the 1,533 quoted in `prd.md` § 5, and why the discrepancy does not change any disposition below.

| Commits | Identity | Disposition |
|---|---|---|
| 1,305 (848 + 438 + 19) | `ryaneggz` / `Ryan Eggleston` (`kre8mymedia@gmail.com`, and `ryaneggz@users.noreply.github.com`) | Project owner. Same person, three git identity strings. No permission needed — this is the relicensing party. |
| 217 (208 + 8 + 1) | `OpenHarness Bot`, `Ralph Agent`, `Claude Haiku` | Owner-operated automation — bots and agent identities run under the owner's infrastructure and authorization. No permission needed. |
| 9 | `Im An AI <im.an.ai.agent@gmail.com>` | Owner-confirmed own identity (see § 3). No permission needed. |
| 3 | `dependabot[bot]` | Excluded — mechanical version bumps, no protectable expression (see § 3). |

Sum check: 1,305 + 217 + 9 + 3 = 1,534. ✓ (matches `git rev-list --count HEAD` below)

```bash
git rev-list --count HEAD
# → 1534
```

**Verdict: unblocked.** Every commit in history is attributable to the owner, owner-operated
automation, the owner's own secondary identity, or mechanical dependency bumps carrying no
protectable expression. No outside copyright holder needs to grant permission for the relicense.

---

## 2. `Im An AI <im.an.ai.agent@gmail.com>` — all 9 commits, classified

Command (full listing):

```bash
git log --author='im.an.ai.agent@gmail.com' --format='%h %ad %s' --date=short HEAD
```

Output:

```
f27cfd57 2026-04-14 Update README.md
f473a203 2026-04-13 Merge pull request #46 from ryaneggz/development
267b2ad3 2026-04-13 Merge pull request #45 from ryaneggz/feat/harden-default-harness
ec4d98f3 2026-04-12 Merge pull request #41 from ryaneggz/development
e6ddd40c 2026-04-12 Merge pull request #40 from ryaneggz/feat/consolidate-cli-in-packages-sandbox
50ae7a29 2026-04-12 Merge pull request #39 from ryaneggz/feat/consolidate-cli-in-packages-sandbox
4e9e76bc 2026-04-12 Merge pull request #38 from ryaneggz/feat/consolidate-cli-in-packages-sandbox
118b7e5d 2026-04-12 Merge pull request #37 from ryaneggz/feat/consolidate-cli-in-packages-sandbox
1f2022df 2026-04-12 Merge pull request #33 from ryaneggz/spec/event-thread-support-1776020354
```

Command (isolate content-bearing commits, excluding merges):

```bash
git log --author='im.an.ai.agent@gmail.com' --no-merges --format='%h %ad %s' --date=short HEAD
```

Output:

```
f27cfd57 2026-04-14 Update README.md
```

Command (confirm the remaining 8 are merges):

```bash
git log --author='im.an.ai.agent@gmail.com' --merges --format='%h %ad %s' --date=short HEAD
```

Output: the same 8 `Merge pull request #NN from ryaneggz/...` lines shown above.

### Classification table (9 commits)

| SHA | Date | Subject | Class |
|---|---|---|---|
| `f27cfd57` | 2026-04-14 | Update README.md | **Content-bearing** |
| `f473a203` | 2026-04-13 | Merge pull request #46 from ryaneggz/development | Merge |
| `267b2ad3` | 2026-04-13 | Merge pull request #45 from ryaneggz/feat/harden-default-harness | Merge |
| `ec4d98f3` | 2026-04-12 | Merge pull request #41 from ryaneggz/development | Merge |
| `e6ddd40c` | 2026-04-12 | Merge pull request #40 from ryaneggz/feat/consolidate-cli-in-packages-sandbox | Merge |
| `50ae7a29` | 2026-04-12 | Merge pull request #39 from ryaneggz/feat/consolidate-cli-in-packages-sandbox | Merge |
| `4e9e76bc` | 2026-04-12 | Merge pull request #38 from ryaneggz/feat/consolidate-cli-in-packages-sandbox | Merge |
| `118b7e5d` | 2026-04-12 | Merge pull request #37 from ryaneggz/feat/consolidate-cli-in-packages-sandbox | Merge |
| `1f2022df` | 2026-04-12 | Merge pull request #33 from ryaneggz/spec/event-thread-support-1776020354 | Merge |

All 8 merge commits merge branches under `ryaneggz/...` — the owner's own fork/branches — into the
mainline. There is exactly **one** content-bearing commit: `f27cfd57 Update README.md`.

### `f27cfd57` diffstat

Command:

```bash
git show --stat f27cfd57
```

Relevant output:

```
 README.md | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

**+2/−2, matches the briefing.** Full patch for completeness:

```bash
git show f27cfd57 -- README.md
```

```diff
diff --git a/README.md b/README.md
index 58db6cd2..ec82ee84 100644
--- a/README.md
+++ b/README.md
@@ -14,13 +14,13 @@ Isolated, pre-configured sandbox containers for AI coding agents — [Claude Cod

 ```bash
 git clone https://github.com/ryaneggz/open-harness.git && cd open-harness
-cp .devcontainer/.example.env .env        # configure name, password, etc.
+cp .devcontainer/.example.env .devcontainer/.env        # configure name, password, etc.
 ```

 ### 2. Start the sandbox

 ```bash
-docker compose -f .devcontainer/docker-compose.yml up -d --build
+docker compose --env-file .devcontainer/.env -f .devcontainer/docker-compose.yml up -d --build
 ```

 ### 3. Connect
```

A two-line quickstart command-path correction — a minor documentation fix, not a substantial
creative contribution.

---

## 3. Dispositions

### The owner's identities — no permission needed

`ryaneggz <kre8mymedia@gmail.com>`, `Ryan Eggleston <kre8mymedia@gmail.com>`, and
`Ryan Eggleston <ryaneggz@users.noreply.github.com>` are the same person under three git identity
strings (838 + 438 + 19 commits at HEAD — see § 1 and § 4). As the project owner and the party
relicensing the repository, no external permission is required.

### Owner-operated automation — no permission needed

`OpenHarness Bot <noreply@openharness.local>` (208), `Ralph Agent <ralph@openharness.dev>` (8), and
`Claude Haiku <kre8mymedia@gmail.com>` (1) are automation identities operated by the owner as part
of the harness's own tooling — the `Claude Haiku` identity even shares the owner's commit email.
These are the owner's own agents acting under the owner's authorization; no separate permission is
required for their commits.

### `Im An AI <im.an.ai.agent@gmail.com>` — owner-attested own identity

Per the owner's attestation during planning for this relicense, `Im An AI` is the project owner's
own identity (an earlier or alternate account under his control), not a third party. This disposition
is recorded here as the durable artifact of that attestation. Independent of the attestation, the
commit-content evidence in § 2 is consistent with it: 8 of the 9 commits are merges of the owner's
own `ryaneggz/*` branches, and the sole content-bearing commit is a trivial two-line documentation
fix carrying no substantial protectable expression of its own. No permission is required.

### `dependabot[bot]` — excluded, no protectable expression

Command:

```bash
git log --author='dependabot' --format='%h %ad %s' --date=short HEAD
```

Output:

```
4dd0ae5a 2026-06-12 build(deps-dev): bump esbuild from 0.24.2 to 0.25.0 in /packages/oh
a4eb6fd1 2026-06-11 build(deps-dev): bump vitest from 3.2.4 to 3.2.6
1d68f80f 2026-06-11 build(deps-dev): bump vitest from 3.2.4 to 3.2.6
```

All 3 `dependabot[bot]` commits are mechanical `package.json`/lockfile dependency-version bumps
generated by GitHub's automated tooling. They carry no protectable creative expression (a version
number is not copyrightable subject matter) and are excluded from the ownership analysis on that
basis — there is no human or entity to seek permission from for a machine-generated version bump.

### Vendored third party — `caveman` skills stay third-party MIT, not relicensed

Command:

```bash
grep -n 'source' .oh/skills.lock
```

Relevant output — every `source` entry in the lockfile:

```
10:      "source": "github:mifunedev/skills",
20:      "source": "github:JuliusBrussee/caveman",
31:      "source": "github:JuliusBrussee/caveman",
42:      "source": "github:JuliusBrussee/caveman",
53:      "source": "github:JuliusBrussee/caveman",
64:      "source": "github:JuliusBrussee/caveman",
75:      "source": "github:mifunedev/skills",
85:      "source": "github:mifunedev/skills",
95:      "source": "github:mifunedev/skills",
105:      "source": "github:mifunedev/skills",
115:      "source": "github:mifunedev/skills",
125:      "source": "github:mifunedev/skills",
135:      "source": "github:mifunedev/skills",
145:      "source": "github:mifunedev/skills",
155:      "source": "github:mifunedev/skills",
165:      "source": "github:mifunedev/skills",
175:      "source": "github:mifunedev/skills",
185:      "source": "github:mifunedev/skills",
195:      "source": "github:mifunedev/skills",
205:      "source": "consolidated:github:mifunedev/skills",
```

`github:JuliusBrussee/caveman` (5 entries: `caveman`, `caveman-commit`, `caveman-review`,
`caveman-compress`, `caveman-stats`) is the **only** non-`mifunedev` source in `.oh/skills.lock`;
every other entry is `github:mifunedev/skills` or `consolidated:github:mifunedev/skills`, i.e. the
owner's own registry. The lockfile's own note at line 28 confirms this is third-party copyright, not
project property:

```bash
sed -n '18,29p' .oh/skills.lock
```

```
    },
    "caveman": {
      "source": "github:JuliusBrussee/caveman",
      "registry_version": "vendored",
      "skill_version": "0.1.0",
      "commit": "655b7d9c5431f822264b7732e9901c5578ac84cf",
      "checksum": "sha256:afb7d709f83d3d7f259fe50ad08c1e55ec1574631d68d84b9ded98147eb29405",
      "installed_paths": [
        ".oh/skills/caveman"
      ],
      "note": "Manual/vendored adaptation of JuliusBrussee/caveman (MIT) to harness skill conventions; not from the mifunedev registry. Upstream curl|bash installer intentionally not used."
    },
```

Mifune cannot relicense someone else's copyright. Per `prd.md` DP-3, the `caveman*` skills' `LICENSE`
files (5 of them, one per skill directory above) stay **untouched** as third-party MIT and are
attributed in `NOTICE` (US-003) rather than relicensed.

### `pi-messenger-bridge` — npm dependency, not vendored, no NOTICE obligation

Command:

```bash
cat .pi/UPSTREAM.md
```

Relevant lines from the provenance table:

```
| **Package** | `pi-messenger-bridge` ([tintinweb/pi-messenger-bridge](https://github.com/tintinweb/pi-messenger-bridge)) |
| **License** | MIT |
| **Vendored** | No — npm package dependency, not a port |
```

`.pi/UPSTREAM.md` explicitly records `pi-messenger-bridge` as installed via `npm install` into a
gitignored `.pi/bridge/` directory and loaded via `--extension` — it is never copied into the
repository's committed source tree. Because it is a runtime dependency and not vendored code, it
carries no copyright-inclusion or NOTICE obligation for this relicense.

---

## 4. Discrepancy — total commit count

`prd.md` § 5 states "1,533 commits across 8 identities." The commands above, run at the current
worktree HEAD (`7c995438 task: add apache-relicense task artifacts (#666)`), return **1,534**
commits across the same 8 identities. This is a real, verified discrepancy — reported as observed,
not adjusted to match the briefing.

Cause, verified directly:

```bash
git show --no-patch --format='%H %an <%ae> %ad %s' 7c995438
# → 7c9954389cf974fd88c1625a8f88b4c7e7ca5b56 ryaneggz <kre8mymedia@gmail.com> ... task: add apache-relicense task artifacts (#666)

git shortlog -sne HEAD~1
#    847	ryaneggz <kre8mymedia@gmail.com>
#    438	Ryan Eggleston <kre8mymedia@gmail.com>
#    208	OpenHarness Bot <noreply@openharness.local>
#     19	Ryan Eggleston <ryaneggz@users.noreply.github.com>
#      9	Im An AI <im.an.ai.agent@gmail.com>
#      8	Ralph Agent <ralph@openharness.dev>
#      3	dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com>
#      1	Claude Haiku <kre8mymedia@gmail.com>
# → sums to exactly 1,533
```

`HEAD~1` — the state before this task's own `prd.md`/`prd.json`/`progress.txt` scaffolding commit
landed — sums to exactly 1,533, matching `prd.md` § 5 precisely. The scaffolding commit `7c995438`
is authored by `ryaneggz`, the project owner, and is itself the commit that added the
`apache-relicense` task folder (including `prd.md`) to this branch. It advanced the owner's own
`ryaneggz` count from 847 to 848 (1,304 → 1,305 combined owner identities), which is the entire
source of the 1,533 → 1,534 delta.

**This does not change any disposition above.** The extra commit belongs to the owner, adds one to
an already-unblocked identity, introduces no new identity, and does not touch the `Im An AI`,
`dependabot[bot]`, or `caveman`/`pi-messenger-bridge` evidence in any way. The verdict in § 1 stands
against the real, current count of 1,534.

---

## 5. Legal note

This is strategic and structural guidance, not legal advice. Counsel should confirm the copyright
position and the `Mifune Dev (mifune.dev)` holder string — specifically whether that is a formal
entity holding or assigned the copyright, or whether it should read `Ryan Eggleston, d/b/a Mifune
Dev` — before the relicensing commit lands on the public repo. (Reproduced verbatim from `prd.md`
§ 11.)

---

GO
