> **Redaction note.** Six deprecated audit-skill names are banned across tracked surfaces by
> `.oh/evals/probes/audit-stale-references.sh`. Where this report needed to quote them, they are
> replaced with `<legacy-audit-name>` so this document does not itself trip that drift guard.

# US-010 — End-to-end verification

**Date (UTC):** 2026-07-24T21:40:43Z
**HEAD verified:** `41544890` (`feat: relicense Open Harness to Apache License 2.0 (#666)`), on top of `upstream/development` @ `94bfc2a9`
**Scope:** proves the artifact declares Apache-2.0, not just the repo files, and that no whitelisted third-party MIT reference was collaterally rewritten. Failures in other stories' work are reported, not fixed.

---

## 1. No MIT leakage in our own surfaces

```
$ grep -rn 'License-MIT' README.md .oh/cli/README.md
(no output, exit 1)
```
No matches. **MET.**

```
$ grep -c 'MIT License' LICENSE .oh/cli/LICENSE
.oh/cli/LICENSE:0
LICENSE:0
```
Both counts are 0 (grep's exit 1 here is expected — it's the "zero matches" signal, not a failure). **MET.**

```
$ diff LICENSE .oh/cli/LICENSE
(no output, exit 0)
```
Empty diff. **MET.**

```
$ jq -e '.license == "Apache-2.0"' package.json
true
$ jq -e '.license == "Apache-2.0"' .oh/cli/package.json
true
```
Both exit 0. **MET.**

---

## 2. False-positive whitelist is intact

`git diff upstream/development -- <path>` for each of the 8 whitelisted files:

```
$ git diff upstream/development -- .oh/docs/harnesses/hermes.md            → EMPTY
$ git diff upstream/development -- .oh/docs/integrations/debugmcp.md       → EMPTY
$ git diff upstream/development -- .oh/docs/integrations/slack.md          → EMPTY
$ git diff upstream/development -- .oh/docs/security-considerations.md    → EMPTY
$ git diff upstream/development -- .pi/UPSTREAM.md                        → EMPTY
$ git diff upstream/development -- .oh/templates/full/.pi/UPSTREAM.md     → EMPTY
$ git diff upstream/development -- .oh/tasks/cc-safety-net/prd.md         → EMPTY
$ git diff upstream/development -- .oh/skills/wiki/corpus/raw/2026-07-18-markitdown.md → EMPTY
```
All 8 byte-identical to `upstream/development`. **MET.**

> **Superseded 2026-08-13.** The five `caveman` skills were removed entirely by
> [#752](https://github.com/mifunedev/openharness/issues/752) after usage evidence showed zero invocations.
> The observations below were accurate when recorded and are kept as the dated evidence for that task.

**caveman LICENSE files:**
```
$ ls -la .oh/skills/caveman*/LICENSE
-rw-r--r-- 1 sandbox sandbox 1071 Jul 24 15:16 .oh/skills/caveman-commit/LICENSE
-rw-r--r-- 1 sandbox sandbox 1071 Jul 24 15:16 .oh/skills/caveman-compress/LICENSE
-rw-r--r-- 1 sandbox sandbox 1071 Jul 24 15:16 .oh/skills/caveman-review/LICENSE
-rw-r--r-- 1 sandbox sandbox 1071 Jul 24 15:16 .oh/skills/caveman-stats/LICENSE
-rw-r--r-- 1 sandbox sandbox 1071 Jul 24 15:16 .oh/skills/caveman/LICENSE

$ git diff upstream/development -- '.oh/skills/caveman*/LICENSE'
(no output, exit 0)
```
All 5 exist, byte-identical to upstream. **MET.**

**`.oh/skills.lock` line 28 / line 213:**
```
$ git show upstream/development:.oh/skills.lock | sed -n '28p'
      "note": "Manual/vendored adaptation of JuliusBrussee/caveman (MIT) to harness skill conventions; not from the mifunedev registry. Upstream curl|bash installer intentionally not used."
$ sed -n '28p' .oh/skills.lock
      "note": "Manual/vendored adaptation of JuliusBrussee/caveman (MIT) to harness skill conventions; not from the mifunedev registry. Upstream curl|bash installer intentionally not used."

$ git diff upstream/development -- .oh/skills.lock
diff --git a/.oh/skills.lock b/.oh/skills.lock
index c08b119d..4ed5d799 100644
--- a/.oh/skills.lock
+++ b/.oh/skills.lock
@@ -210,7 +210,7 @@
       "installed_paths": [
         ".oh/skills/audit"
       ],
-      "note": "Consolidates implementation, PR, harness, context, skill, eval-quality, drift and campaign audits. Migrated LICENSE provenance from <legacy-audit-name>, <legacy-audit-name>, <legacy-audit-name> and <legacy-audit-name> remains MIT in repository LICENSE."
+      "note": "Consolidates implementation, PR, harness, context, skill, eval-quality, drift and campaign audits. Migrated LICENSE provenance from <legacy-audit-name>, <legacy-audit-name>, <legacy-audit-name> and <legacy-audit-name> (MIT at time of consolidation, now Apache-2.0)."
     }
   }
 }
```
Line 28 unchanged; the full-file diff shows exactly one changed line (213, owned by US-011). **MET.**

---

## 3. Repo-wide MIT sweep

```
$ grep -rnw --exclude-dir=.git 'MIT' .
```
52 hits total. Accounted for below (all four named buckets, plus three legitimate categories the task's four buckets don't literally name — flagged explicitly rather than silently folded in):

| Count | Category | Files |
|---|---|---|
| 7 | Whitelisted third-party provenance (§2 list, incl. `.oh/skills.lock:28`) | `.pi/UPSTREAM.md:9`, `.oh/templates/full/.pi/UPSTREAM.md:9`, `.oh/docs/integrations/debugmcp.md:9`, `.oh/docs/integrations/slack.md:11`, `.oh/docs/security-considerations.md:87`, `.oh/docs/harnesses/hermes.md:28`, `.oh/skills.lock:28` |
| 5 | caveman LICENSE files | `.oh/skills/{caveman,caveman-commit,caveman-compress,caveman-review,caveman-stats}/LICENSE:1` |
| 29 | Third-party dependency licenses in the lockfile | `.oh/cli/package-lock.json` (`"license": "MIT"` entries) |
| 1 | Historical caveman-vendoring CHANGELOG entry | `CHANGELOG.md:542` |
| 3 | Intentional "prior MIT releases remain under MIT" prose | `README.md:276`, `CHANGELOG.md:18`, `.oh/docs/open-core.md:49` |
| 4 | Third-party NOTICE attribution (caveman, required by US-003 AC) — not one of the four named buckets, flagged rather than folded silently | `NOTICE:15,19`, `.oh/cli/NOTICE:15,19` |
| 2 | Explanatory "why Apache-2.0 not MIT" license-comparison prose (`.oh/docs/open-core.md`, US-007) — same reasoning as the "prior MIT" bucket but a different sentence shape, flagged rather than folded silently | `.oh/docs/open-core.md:24,27` |
| 1 | US-011's own corrected line, in transit — historical fact ("MIT at time of consolidation, now Apache-2.0"), not a present-tense MIT claim | `.oh/skills.lock:213` |

7+5+29+1+3+4+2+1 = **52**, matching the sweep total. No unaccounted hit.

Full raw sweep output (for audit trail). The `README.md:276` line was re-captured after DP-1 was
revised to `Ryan Eggleston, d/b/a Mifune Dev (mifune.dev)` (see `prd.md` § 11); every other line is
as originally recorded, and the bucket counts are unchanged because the revision altered the holder
string, not the MIT-mention topology:
```
README.md:276:[Apache License 2.0](LICENSE) — copyright Ryan Eggleston, d/b/a Mifune Dev (mifune.dev). Prior MIT releases remain available under MIT; this change governs new code and future releases and does not revoke past grants.
.pi/UPSTREAM.md:9:| **License** | MIT |
NOTICE:15:  Licensed under the MIT License.
NOTICE:19:  or modify the MIT terms.
.oh/docs/integrations/debugmcp.md:9:[DebugMCP](https://github.com/microsoft/DebugMCP) is an MIT-licensed VS Code
.oh/cli/NOTICE:15:  Licensed under the MIT License.
.oh/cli/NOTICE:19:  or modify the MIT terms.
CHANGELOG.md:18:- Relicense from MIT to Apache License 2.0 with patent grants and trademark clarity; prior MIT releases remain available under MIT and the hosted Console stays proprietary ([#666](https://github.com/mifunedev/openharness/issues/666)).
CHANGELOG.md:542:- `/caveman` token-compression skill + subcommands ... Vendored adaptation of [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) (MIT, commit `655b7d9`) ...
.oh/cli/package-lock.json: 29 x `"license": "MIT",` (third-party npm dependency entries)
.oh/skills.lock:28:      "note": "Manual/vendored adaptation of JuliusBrussee/caveman (MIT) ..."
.oh/skills.lock:213:      "note": "... <legacy-audit-name> (MIT at time of consolidation, now Apache-2.0)."
.oh/templates/full/.pi/UPSTREAM.md:9:| **License** | MIT |
.oh/skills/caveman{,-stats,-review,-commit,-compress}/LICENSE:1:MIT License   (5 files)
.oh/docs/security-considerations.md:87:- **What it is:** [cc-safety-net](...) `@1.0.6` (MIT), ...
.oh/docs/open-core.md:24:## Why Apache-2.0 rather than MIT
.oh/docs/open-core.md:27:the runtime. MIT's bare copyright grant is sufficient for that but leaves ...
.oh/docs/open-core.md:49:Prior MIT releases remain usable under MIT. This change governs new code ...
.oh/docs/integrations/slack.md:11:(MIT, multi-transport — Slack / Telegram / WhatsApp / Discord / Matrix). The
.oh/docs/harnesses/hermes.md:28:- MIT-licensed; current upstream release is v0.14.0.
```

**MET** — every hit accounted for; none unexplained.

---

## 4. SHIPPED-TARBALL PROOF (most important check)

`npm pack` requires the `prepare` build step, which needs `node_modules` (esbuild). Installed first (see §5), then packed:

```
$ cd .oh/cli && npm pack
> @mifune/openharness@0.2.0 prepare
> npm run build
> node build.mjs
  dist/oh.js  72.6kb
⚡ Done in 7ms
npm notice Tarball Contents
npm notice 11.4kB LICENSE
npm notice 1.5kB NOTICE
npm notice 3.5kB README.md
npm notice 74.3kB dist/oh.js
npm notice 985B package.json
npm notice Tarball Details
npm notice name: @mifune/openharness
npm notice version: 0.2.0
npm notice filename: mifune-openharness-0.2.0.tgz
npm notice package size: 25.8 kB
npm notice unpacked size: 91.8 kB
npm notice total files: 5
```

Extracted to a scratch dir and inspected:
```
$ tar -xzf mifune-openharness-0.2.0.tgz -C <scratch>/tarball-extract
$ find <scratch>/tarball-extract -type f
.../package/LICENSE
.../package/package.json
.../package/README.md
.../package/NOTICE
.../package/dist/oh.js

$ grep -c 'Apache License' .../package/LICENSE
4
$ grep -c 'MIT License' .../package/LICENSE
0
$ ls -la .../package/NOTICE
-rw-r--r-- 1 sandbox sandbox 1540 Oct 26  1985 .../package/NOTICE
$ wc -c < .../package/NOTICE
1540
```
`package/LICENSE` contains "Apache License" (4 occurrences), zero "MIT License". `package/NOTICE` exists, 1540 bytes, non-empty. **MET.**

Cleanup:
```
$ rm -f .oh/cli/mifune-openharness-0.2.0.tgz
$ rm -rf <scratch>/tarball-extract
$ git status --porcelain
(empty)
```
Tarball and extraction removed; worktree verified clean afterward. **MET.**

---

## 5. Typecheck

`.oh/cli/node_modules` was absent (as US-006 flagged). Installed and ran:

```
$ npm ping
npm notice PING https://registry.npmjs.org/
npm notice PONG 264ms
```
Network reachable.

```
$ npm --prefix .oh/cli ci --ignore-scripts
added 5 packages, and audited 6 packages in 490ms
found 0 vulnerabilities
```
Install succeeded (exit 0).

```
$ npm --prefix .oh/cli run typecheck
> @mifune/openharness@0.2.0 typecheck
> tsc --noEmit
(exit 0)
```
**MET** — typecheck passes cleanly.

`node_modules` gitignore/cleanliness check:
```
$ git status --porcelain
(empty)
$ git check-ignore -v .oh/cli/node_modules
.oh/cli/.gitignore:1:node_modules/	.oh/cli/node_modules
```
`node_modules` is gitignored and does not appear in `git status`. **MET.**

---

## 6. Named probes

```
$ bash .oh/evals/probes/oh-npm-package.sh
PASS @mifune/openharness is npm-publishable (public, dist-only, bin oh, README+LICENSE) + publish-npm wired
(exit 0)

$ bash .oh/evals/probes/skills-dir-clean.sh
PASS: .oh/skills/ top level is clean — only skill subdirs (no loose README/LICENSE/desc-less .md a provider would mis-load)
(exit 0)
```
Both **MET.**

---

## 7. Full probe suite

Runner located at `.oh/skills/eval/run.sh` (what `/eval` maps to). Ran the full suite and regenerated `.oh/evals/RESULTS.md`:

```
$ bash .oh/skills/eval/run.sh
... 92 probe rows ...
REGRESSIONS (2):
  - audit-stale-references (issue #645 — clean-breaking audit migration): was PASS, now REGRESSION
  - next-dev-prod (.oh/memory/MEMORY.md 2026-06-04): was PASS, now REGRESSION
ran 92 probe(s); wrote .../.oh/evals/RESULTS.md
```

**Totals:** 92 probes run → 87 PASS, 3 SKIPPED (excluded from pass-rate), 2 REGRESSION.

```
$ tail -n +8 .oh/evals/RESULTS.md | grep -oE '\| (PASS|SKIPPED|REGRESSION|TIMEOUT|ERROR) \|' | sort | uniq -c
     87 | PASS |
      2 | REGRESSION |
      3 | SKIPPED |
```

### Failure 1 — `audit-stale-references`: REGRESSION, attributed to THIS BRANCH

`audit-stale-references.sh` bans stale audit vocabulary (`<legacy-audit-name>`, `<legacy-audit-name>`, etc.) across tracked surfaces, with a whitelist for `.oh/tasks/audit-consolidation/*` files that quote the old names historically. Manual reproduction of its grep isolates the exact offending lines:

```
$ git grep -n -E '(^|[^A-Za-z0-9-])(<legacy-audit-name>|<legacy-audit-name>|<legacy-audit-name>|<legacy-audit-name>|<legacy-audit-name>|<legacy-audit-name>)([^A-Za-z0-9-]|$)|...' -- ':!CHANGELOG.md' ':!.oh/evals/RESULTS.md' ':!.oh/evals/datasets/**' | grep -i 'apache-relicense\|<legacy-audit-name>'
...
.oh/tasks/apache-relicense/prd.json:178:        ".oh/skills.lock line 213 — the `audit` entry's `note` field — no longer claims the repository LICENSE is MIT. Its trailing clause currently reads `... and <legacy-audit-name> remains MIT in repository LICENSE.`",
.oh/tasks/apache-relicense/prd.json:179:        "The historical provenance meaning is preserved, not deleted: ... LICENSE provenance was migrated from <legacy-audit-name>, <legacy-audit-name>, <legacy-audit-name> and <legacy-audit-name>. ...",
.oh/tasks/apache-relicense/prd.md:227:skill's `note` field — ends `"... and <legacy-audit-name> remains MIT in repository LICENSE."` That is a
.oh/tasks/apache-relicense/progress.txt:211:Line 213's trailing clause `... and <legacy-audit-name> remains MIT in repository LICENSE` became
```

**Evidence this is caused by this branch, not pre-existing:** ran the identical probe against a clean `upstream/development` worktree:
```
$ git worktree add --detach <scratch>/base-check upstream/development
HEAD is now at 94bfc2a9 fix: make pi-langfuse remediation reproducible (#665)
$ bash <scratch>/base-check/.oh/evals/probes/audit-stale-references.sh
PASS: no active legacy audit references across tracked active surfaces
(exit 0)
```
It passes cleanly on the base commit — these `.oh/tasks/apache-relicense/*` files don't exist there. **This is a genuine regression introduced by this branch**, specifically by US-001/US-011's task documentation (`prd.json`, `prd.md`, `progress.txt`) quoting the historical stale `<legacy-audit-name> ... MIT` phrase verbatim as part of describing the fix — a legitimate documentation pattern the probe's whitelist (scoped only to `.oh/tasks/audit-consolidation/*`) doesn't know about. It is **not** a functional relicense defect: the actual `.oh/skills.lock:213` line is correctly fixed. Reported per constraints — `prd.json` and `progress.txt` are orchestrator-owned and out of scope for me to edit, and `prd.md` belongs to other stories.

### Failure 2 — `next-dev-prod`: REGRESSION, attributed to the ENVIRONMENT, unrelated to this branch

```
$ bash .oh/evals/probes/next-dev-prod.sh
REGRESSION: 'next dev' process detected: 1431150 sh -c dotenv $(sh scripts/oh-env.sh --dotenv) -- pnpm --filter @openharness-cloud/web exec next dev --hostname 127.0.0.1 --port 3005
```

This probe is a pure live-host-state check (`pgrep`/`/proc`/`tmux`) — it never reads a repo file. The flagged process:
```
$ ps -o pid,lstart,cmd -p 1431150
    PID                  STARTED CMD
1431150 Fri Jul 24 15:33:36 2026 sh -c dotenv ... -- pnpm --filter @openharness-cloud/web exec next dev ...
```
is a `next dev` server for a completely unrelated repo (`mifunedev/openharness-cloud`, running out of `.oh/worktrees/project/mifunedev/openharness-cloud/`), started concurrently in this sandbox during this session — nothing in this branch's diff (license/doc/metadata files only) touches Next.js, `openharness-cloud`, or process/tmux state.

**Evidence:** ran the identical probe against the same clean `upstream/development` worktree used above:
```
$ bash <scratch>/base-check/.oh/evals/probes/next-dev-prod.sh
REGRESSION: 'next dev' process detected: 1431150 sh -c dotenv ... next dev --hostname 127.0.0.1 --port 3005
(exit 1)
```
Identical failure on the base commit — proves the flip is caused by concurrent host state (another agent's session in this shared sandbox), not by this branch's changes. **Environmental false-positive, not a code regression, and not caused by US-010 or any story in this PR.**

### Non-failures worth noting (not counted above)

- `cc-safety-net-wiring` — **SKIPPED** (exit 2, excluded from pass-rate): `"cc-safety-net binary not reachable ... expected outside the built sandbox image; static wiring PASSED"`. Environmental (binary absent in this worktree-only environment), unrelated to relicensing.
- `first-mate-charter` — **PASS**, first-time row (no prior baseline to diff against, hence "new-pass" in the delta column); not a failure.

**Verdict on §7 AC ("no probe flips green→red as a result of this change"):** one probe (`next-dev-prod`) flips but is proven environmental, not caused by this change. One probe (`audit-stale-references`) does flip **as a result of this branch's own task-documentation files** — a real, attributable regression that is not silently dismissed here. See FINDINGS.

---

## Summary

| # | Check | Result |
|---|---|---|
| 1 | No MIT leakage in own surfaces | MET |
| 2 | False-positive whitelist intact | MET |
| 3 | Repo-wide MIT sweep, every hit accounted | MET |
| 4 | Shipped-tarball proof | MET |
| 5 | Typecheck | MET |
| 6 | Named probes | MET |
| 7 | Full probe suite, RESULTS.md regenerated | 87 PASS / 3 SKIPPED / 2 REGRESSION — both attributed (see above) |
