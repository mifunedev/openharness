# Final determination — which follow-ups are worth proceeding with

Produced by: grounding (3 agents + orchestrator live verification) → council (architect, pm, designer
in parallel, per `plan.yml`) → 2 adversarial critics (per `pr.yml`). Every number below was
recomputed or measured; where the council itself was wrong, the correction is recorded.

Sources: `grounding.md` · `council.md` · `critique.md` · `progress.txt`

---

## Verdict

| # | Item | Verdict | Confidence |
|---|---|---|---|
| 1 | Console never deployed | **PROCEED — first** | Unanimous + escalated by new evidence |
| A | Website cross-tab live theme flip | **PROCEED — with 3a, same diff** | Verified in source; both proposed fixes refuted |
| 3a | Website OS-dark convergence | **PROCEED — with A, same diff** | Unanimous; mechanism validated |
| 2a | Website contrast (`:114` **and** `:158`) | **PROCEED — locally, not token-wide** | Scope settled by count |
| 2b | Cloud `ThemeControl` 1.4.11 | **PROCEED — with the deploy fix** | Unanimous; zero live harm today |
| 3b | Cloud OS-dark | **PROCEED — doc amendment first** | Unanimous on fix; sequencing corrected |
| 7 | Cloud dead code | **PROCEED LATER — partial only** | Architect's split, critic-verified |
| C | Website toggle has no `aria-checked` | **PROCEED LATER — own ticket** | Proven pre-existing |
| 4 | Task-artifact placement | **PROCEED LATER — convention** | Low stakes |
| D/E | "Auto" is a one-way door, never explained | **LATER** | Real, unmeasured |
| 2c | Docs link 4.53:1 | **DROP — needs an explicit call** | Passes AA; see open question |
| 5 | Sub-frame flash | **DROP** | Settled structurally |
| 6 | `next-pwa` staleness | **DROP** | Refuted outright |

---

## The four things that actually matter

### 1 · The console deploy is the only thing that is *broken right now* — go look at the Netlify log

Not "spot-check the console". `console.mifune.dev/signin` has served a **byte-identical pre-feature
build** (23129 bytes, `getHours=0`) at every check from 21:53 through 22:22 UTC — **44 minutes** after
a merge whose own CI finished in ~4 minutes, on a pipeline demonstrably working (the merge's *parent*
`de81006` is live). Working hypothesis is now **failed or never-triggered build**, not slow build.

Nothing else on this list is a live defect. This one is.

### 2 · `3a` and finding `A` must ship in the same diff — the council's own seam

Critic A's best catch, and the highest-severity gap in the entire council output. It fell between two
members' rulings that nobody read together.

Shipping the OS-dark fix alone **widens** the cross-tab bug: today an open tab can flip at the
07:00/18:00 boundary; after 3a it can *also* flip when the user toggles their OS theme at any hour.
PM's plan shipped them independently because finding A postdates the PM and architect tables.

And **neither obvious fix for A works**:
- *"Only write when the value differs"* is a **no-op** — per the WHATWG Storage spec browsers already
  suppress same-value `storage` events; the harm happens precisely when the value differs.
- *"Port cloud's `forcedTheme` pattern"* **silently strands the "System" option**, and hand-rolling a
  `matchMedia` listener to keep it reintroduces a live-update channel — a variant of the same bug.

This is real design work. Do not let it be estimated as a one-liner.

### 3 · The contrast fix is two lines in one file — and one of them is worse than reported

Scope was disputed (PM: only `:114`, don't touch the token / designer: it's a token defect). **Settled
by counting**: `bg-oh-raised` appears exactly **3 times repo-wide**, only **2** wrap accent-styled
text. So fix both, leave the token alone — a token swap would touch ~53 currently-passing usages and,
per critic A, would darken text while ~6 hardcoded `green-500` neighbours stay `#22c55e` (a brand
regression, which is the *right* reason to stay local — PM's stated reason was factually wrong, since
`#166534` is strictly darker and can only *raise* ratios).

| Target | Background | Now | With `#166534` |
|---|---|---|---|
| `CTASection.tsx:114` eyebrow | flat `#eae6db` | **4.02:1** FAIL | 5.72:1 |
| `CTASection.tsx:158` hover | `bg-red-500/10` over `#eae6db` = `#ead6cc` | **3.58:1** FAIL | 5.09:1 |

`:158` is the **hover state of the only recovery path from a failed form submission** — task-critical,
unlike `:114`'s eyebrow whose meaning is carried by the paragraph beneath it. Its true ratio is
**3.58:1**, not the 4.02:1 the council reported, because the alert div composites a 10% red overlay.
**QA must measure the composited colour**, or it will sign off on the wrong number.

### 4 · Cloud OS-dark: do the doc amendment properly — the deploy being stuck *removes* the race

Designer argued "cloud first, race Netlify" — the un-deployed console is a free window to fix the
regression before any user sees it. Critic B refuted the *sequencing*: it makes an accessibility fix's
quality depend on beating a build, and `console-mvp.md:13` explicitly demands deliberate authority for
its own amendment.

**Both are satisfied by the new evidence.** Because the deploy is *stuck*, not merely slow, there is no
closing window to race — so amend `console-mvp.md` §3 deliberately **and** still land ahead of users.
Critic B named this exact condition as the one that would legitimately change its ruling.

The amendment is one sentence. The user-facing contract survives intact: **no System option, no third
control state, nothing new persisted.** Only the rationale sentence "the two are unrelated inputs"
changes.

**Gating criterion the PR must state:** `vitest.config.ts:5` is `environment: "node"` — no `window`
global. Adding `window.matchMedia` to the bootstrap makes two currently-green tests at
`theme-preference.test.ts:205-217` throw `ReferenceError`. Stubbing them is on the critical path, not
incidental scope.

---

## Corrections to the original seven recommendations

Three of seven were wrong or misdirected, and the grounding pass is what caught it:

| Original | Reality |
|---|---|
| "next-pwa may delay rollout" | **Refuted.** Documents are NetworkFirst; zero loads of staleness |
| "fix these two contrast spots" | **Both were the wrong targets.** The docs link *passes* AA; the cloud control is ARIA-covered with zero live harm. The one genuine AA failure went unmentioned |
| "artifacts are gitignored, so lost" | **Diagnosis wrong.** The ignore is soft — 35 `.oh/tasks` + 15 wiki files are already tracked. The real miss is `pr.yml:17-19` placement |
| "spot-check the console" | **Reframed and more urgent** — the feature never deployed there |
| "OS-dark divergence" | Right, but missed that the *property* is old while the **harm is new** |
| "dead code" | Understated — `resolveTimeOfDayTheme` is transitively dead and `THEMES` is unused entirely |
| "flash never observed" | Now settled structurally against shipped bytes |

## Corrections to the council, by the critics

- **PM**: "fix only `:114`" is stale; the stated risk mechanism for staying token-local is wrong
  (right answer, wrong reason).
- **Designer**: finding B's ratio is wrong — 3.58:1, not 4.02:1; "cloud first, race the deploy" is
  rejected as sequencing; finding C is **pre-existing** (`git show 2b66e7a` shows the merge only
  wrapped `onClick`), so it is annexed debt, not feature fallout.
- **Architect**: vindicated on item 7 — `resolveTimeOfDayTheme` has independent direct coverage at
  `theme-preference.test.ts:109-144`, disjoint from `readThemePreference`'s tests.
- **Process**: findings A–E had a single rapporteur and were never cross-examined by the other two
  members. That is exactly how the 3a↔A interaction was missed.

## Item 7, as corrected

Delete `readThemePreference` (`:49-51`) + its three disjoint test blocks. **Keep
`resolveTimeOfDayTheme`** — it is the tested spec the shipped string is pinned against, and
`openharness-web`'s equivalent is *also* unreachable with **no test at all**, so cloud is already ahead
of the repo it would have been "fixed" toward. Wire `THEMES` into `theme-provider.tsx:65`, which today
hardcodes `themes={["dark", "light"]}` — the one genuinely unguarded drift risk in the item.

## Outcome

Everything on this list was executed. Six PRs, three tickets, one item descoped by the
operator.

| # | Item | Where it landed |
|---|---|---|
| A + 3a | automatic theme out of storage; OS dark outranks the hour | website **#54** |
| 2a + B | CTA accent to AA on raised surfaces | website **#55** |
| C | toggle reports the active theme | website **#56** (stacked on #54) |
| 2b | `ThemeControl` state indicator meets 1.4.11 | cloud **#110** |
| 7 | delete `readThemePreference`, keep `resolveTimeOfDayTheme`, wire `THEMES` | cloud **#111** |
| 3b | OS dark outranks the clock + `console-mvp.md` §3 amendment | cloud **#112** |
| 2c | contrast guard — filed *stating the link passes*, not as a fix request | openharness-web **#23** |
| D/E | the automatic default is a one-way door, never explained | website **#57** |
| — | the architect's structural finding: this script is pinned by nothing | website **#58** |
| 1 | console deploy | **descoped by the operator mid-run** |
| 4 | artifact placement | closed by acting: this folder is `git add -f`'d into the harness |
| 5, 6 | sub-frame flash, `next-pwa` | dropped, as ruled |

**Both open questions below are now closed.** 2c has a record either way — the ticket says
plainly that the link passes at 4.526:1 and that changing the colour is *not* being asked
for. Holding the deploy turned out moot: 3b landed while the console was still serving the
pre-feature build, so no OS-dark user ever meets the regression, and the amendment was
written on its own terms rather than against a build deadline.

### What execution found that the council and both critics missed

- **The fix for A needed a third move neither critic considered.** They correctly refuted
  the differs-check and the `forcedTheme` port. But removing the seed is *also* not enough
  on its own: next-themes' own inline script applies the **server-serialised** default, so
  the correction had to move from `<head>` to run *after* it. Verified against built bytes.
- **2b could not be tidied.** Hoisting the shared class string into a constant fails
  `final-design-remediation-presentation.test.ts:34-35`, which counts `min-h-11 min-w-11`
  twice as a 44px target-size contract. The duplication stays, deliberately.
- **2a's third instance has a reason, not just an exclusion.** `--oh-accent` on a 20px
  `aria-hidden` icon measures 4.02:1, which *passes* the 3:1 non-text threshold.

## Open questions for the operator (both now closed — see Outcome)

1. **Item 2c** — the docs link passes AA by +0.026 with **no contrast tooling anywhere in that repo**.
   Two members said DROP, one said "drop the fix, add a CI guard later", and no ticket was filed for
   the guard. Decide explicitly: **write the guard ticket, or accept the margin on the record.** Right
   now it is silently neither — the same failure mode grounding flagged as G-4.
2. **Hold the console deploy for 3b?** Recommended: yes, if the deploy turns out to need manual
   intervention anyway. It costs nothing extra and no OS-dark console user ever sees the regression.
