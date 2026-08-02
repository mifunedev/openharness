# Grounding — verified facts. The council rules on THIS, not on recollection.

Parent task `timezone-default-theme` is merged:
`openharness-cloud` #108 `dca1af6` (main) · `website` #53 `2b66e7a` (development) · `openharness-web` #22 `22f5aec` (main).
Local defaults match `origin`; no branches or worktrees outstanding.

Every number below was recomputed or re-measured. Where the original recommendation was **wrong**,
it is marked. Three of the seven items changed status under grounding.

---

## G-1 · Production deploy state — **one surface never shipped**

| Surface | URL | Feature live? |
|---|---|---|
| docs (`openharness-web`) | `https://oh.mifune.dev` | **Yes** |
| marketing (`website`) | `https://mifune.dev` | **Yes** |
| console (`openharness-cloud`) | `https://console.mifune.dev` | **NO — serving the pre-feature build** |

`console.mifune.dev/signin` returns 200, 23129 bytes, **no auth required**, and its `<head>` bootstrap
is byte-identical to `dca1af6^` (the parent of the merge):

```js
try { value = localStorage.getItem(key) === "light" ? "light" : "dark"; } catch {}
```

`grep -c getHours` = **0**. Checked by the grounding agent at 21:53/21:54/21:55 UTC and independently
re-checked by the orchestrator at 21:56 UTC. The merge landed ~21:38 UTC, so an in-flight Netlify
build is not yet excluded — GitHub Deployments returns `[]` and `homepageUrl` is `""`, so build state
is not observable from here. **A monitor is polling that URL for `getHours` as the go/no-go signal.**

Deploy topology: `netlify.toml` (`base = "apps/web"`, `@netlify/plugin-nextjs`), host named at
`README.md:18`. No deploy job in `.github/workflows/`. `us.mifune.dev` and `docs.mifune.dev` → 421,
not hosts. `promptengineers.ai` is a legacy 19 KB page, unrelated to these repos.

GitHub Actions on `main` for `dca1af6`: **completed/success** (21:38:30 UTC). So CI is not the
blocker — Netlify builds independently of Actions here, and its state is what is unobservable.

**Escalation — at 22:22 UTC, 44 minutes after the merge, the console was still serving the
pre-feature build** (23129 bytes, `getHours=0`, unchanged across every check from 21:53 onward).
The repo's own CI for this commit finished in ~4 minutes. 44 minutes with a byte-identical response
is well past a plausible build window, so the working hypothesis shifts from *"the build is in
flight"* to **"the build failed or never triggered"**. That is a materially different item: not
"wait", but "go look at the Netlify deploy log". A monitor remains armed and will report the moment
`getHours` appears.

**Auto-deploy demonstrably works — this is a build in flight or failed, not a missing pipeline.**
The bootstrap now live is byte-identical to `dca1af6^` = `de81006`, which landed 19:56 UTC and *is*
serving. The theme merge `dca1af6` landed 21:38 UTC; at 22:01 UTC (23 min later) the old build is
still being served. So the pipeline exists and fires on `main` — the specific build for `dca1af6`
either has not finished or has failed. That narrows the diagnosis considerably: the question is not
"is deployment configured" but "did this build succeed".

**This reframes recommendation #1.** It is not "spot-check the console" — loading it today validates
the *old* bootstrap. It is "confirm the console deployed at all", which is more urgent and cheaper.
Relevant prior lesson: this repo's web auto-deploys but its migrations do not; deploy lag here has
bitten before.

## G-2 · Live-production verification of the two shipped surfaces — **PASS**

Expectation re-derived in-browser each run (never a hardcoded per-zone table); `TZ` drives the
browser's own clock.

| Surface | Zone | Hour | Result |
|---|---|---|---|
| docs (OS light emulated) | `America/Denver` | 15 | `data-theme=light`, `choice=system`, `localStorage.theme=null` — PASS |
| docs (OS light emulated) | `UTC` | 21 | `data-theme=dark`, `choice=system`, `localStorage.theme=null` — PASS |
| website | `America/Denver` | 15 | `class=light`, `theme=light`, `auto=light`, meta `#ffffff`, body `rgb(255,255,255)` — PASS |
| website | `UTC` | 21 | `class=dark`, `theme=dark`, `auto=dark`, meta `#09090b`, body `rgb(9,9,11)` — PASS |

Upgrades the earlier deploy-preview evidence to **production**. The docs runs also re-confirm the
no-seed design end-to-end: `data-theme-choice` stays `"system"` and storage stays `null`, so the
value keeps re-deriving.

## G-3 · Sub-frame flash — **settled structurally** (was only *argued*)

Byte order in shipped production HTML:

- **docs**: `<body>`=3896 → docusaurus script=4534 → plugin script=5082 → `<div id="__docusaurus">`=5165.
  The only non-script markup before the plugin script is `<svg style="display: none;">` — **paints
  nothing**. The shipped tag also carries `data-time-of-day-theme="1"` as a **tag attribute**
  (a comment marker would have been stripped by terser).
- **website**: theme script at 4252, `<body>` at 4965 → script is **entirely in `<head>`**; zero markup
  precedes it; 11 of the 12 preceding `<script>` tags are `defer`/`async`/`module`.

**There is no paint opportunity before the theme is settled on either shipped surface.** This is now
proof against the bytes that ship — not a captured frame. Frame-level proof is a separate, far more
expensive instrument.

## G-4 · Nothing is tracked

No open issue in any repo covers any of the seven items (`openharness-cloud` #107/#104/#102/#12,
`website` #38/#35/#28/#27/#26, `openharness-web` none). "Already tracked" is not an available
disposition — each item is worth a ticket or worth dropping.

---

## G-5 · Contrast — **the reported items are the wrong ones**

### Docs light link — VERIFIED, but it *passes* AA

True ratio **4.5260:1** (`#15803d` on `#f6f3ec`), margin **+0.026**, not +0.03. Tokens are at
`custom.css:17` and `:48` — the reported lines 22/47 were **wrong**. Dark mode is fine (12.05:1).

Measured live in production on blog articles: prose links render `rgb(21,128,61)` on `rgb(246,243,236)`
= **4.53:1**, and are **underlined** (9 and 4 prose links on two articles; `hash-link`s excluded).
So blast radius is real — body prose on the highest-volume reading surface — but **WCAG 1.4.1 is
already satisfied by the underline, and 1.4.3 passes.** Navbar, sidebar, footer, TOC, admonitions and
DocCards all override the token away from green, so the exposure is narrower than "all links".

Note `/docs/intro` and `/` carry **no** green prose links at all — lowest visible there is a 4.81:1
grey. This is a *marginal* item, not a defect.

### Cloud `ThemeControl` — PARTIALLY VERIFIED, and **understated**

`1.04:1` is correct to the digit (light). Lines `:15/:23/:35` were **exact**. But the original
recommendation was wrong in two directions:

- **Dark mode also fails** (1.23:1) — the claim implied light-only.
- Selection is *not* conveyed by background alone: unselected text also shifts `#17211a → #5a685e`,
  a **2.82:1** step. Visible, but still under the 3:1 bar. So the control is **weak, not broken**.
- `aria-pressed` is present (`:19`, `:31`), so **WCAG 4.1.2 passes** and screen-reader users are
  unaffected. The failure is **sighted-user-only**: 1.4.11 (non-text contrast) on every colour channel.

Blast radius: `/signin`, `/invite`, `/r/[login]` — i.e. **100% of first-touch traffic**, and only
first-touch. The authenticated console uses a *different* control (`user-menu.tsx:110-118`) with an
explicit "On"/"Off" text label, and a test pins that the nav must not contain `ThemeControl`.

Fix that works: `ring-1 ring-ring` on the selected branch → **4.92:1** light / **9.67:1** dark.
(`bg-card` is a dead end: 1.13:1 / 1.15:1.)

### The item nobody reported — **an actual AA failure, live in production**

`website/src/sections/CTASection.tsx:114` — `text-oh-accent` (`#15803d`) on a `bg-oh-raised`
(`#eae6db`) parent = **4.02:1** at 12 px semibold. Not large text, so the 4.5 threshold applies.
**This fails WCAG AA.**

Confirmed by the orchestrator on live `https://mifune.dev` in light mode: element
`<p class="font-mono text-xs font-semibold uppercase tracking-[0.18em] …">` text "What happens next",
`rgb(21,128,61)` on `rgb(234,230,219)`, **ratio 4.02, FAIL**. The same scan re-confirmed the
4.53:1 pass for `#15803d` on `#f6f3ec` in the same page, which validates the measurement method.

So: of the two items the original recommendation named, **one passes AA and the other is an ARIA-covered
1.4.11 issue** — while the one genuine AA violation went unmentioned. Same shared token pair, same
light-mode traffic increase.

**Both named items are PRE-EXISTING** and untouched by the merges: docs tokens from `b4d40fe`
(2026-06-27, ~5 weeks prior); `theme-control.tsx` + `.light` tokens from `506bbabe` (2026-07-17,
~2 weeks prior). `git show --stat` confirms neither merge touched either file.

### Escape-hatch discoverability, measured live at 1280 px (orchestrator)

Because the theme now changes by itself during the day, the "I didn't choose this" escape hatch
matters more than before. Both shipped surfaces pass:

| Surface | Control | Accessible name | Size | Position |
|---|---|---|---|---|
| `mifune.dev` | `<button>` | "Toggle theme" | 44 × 44 | top-right, above the fold |
| `oh.mifune.dev` | `<button>` | "Switch between dark and light mode (current…)" | 32 × 32 | top-right, above the fold |

Both are visible without scrolling and both clear WCAG 2.5.8 target size (24 px min); the website's
44 px also clears 2.5.5 AAA. The docs control additionally announces the *current* mode in its label.
So there is **no discoverability gap on the two live surfaces** — which weakens any argument that the
automatic default needs an in-page banner or explanation.

## G-6 · OS-preference divergence — CONFIRMED, with the harm correctly located

First-time visitor, no stored choice:

| OS signal | Hour | docs | website | cloud |
|---|---|---|---|---|
| dark | 14 | **dark** | light | light |
| dark | 21 | dark | dark | dark |
| light *or* silent | 14 | light | light | light |
| light *or* silent | 21 | dark | dark | dark |

The divergence is **exactly one cell**: OS-dark during daytime.

Mechanism: with `respectPrefersColorScheme: true`, Docusaurus 3.10.1 emits **no `defaultMode` branch**,
so `defaultMode: "dark"` is dead code on the no-choice path. The plugin bails on non-`system` choice,
missing `matchMedia`, and OS-dark; it only ever upgrades light→dark and never writes storage.
`website` has one `matchMedia` call but it sits in the *explicit-choice* branch and only feeds
`<meta name="theme-color">`. `openharness-cloud` has **zero** `matchMedia`/`prefers-color-scheme` hits.

**The nuance the original recommendation missed.** Ignoring the OS is *pre-existing* in both. But
before this change a no-choice visitor got **dark at every hour**, so an OS-dark user coincidentally
got what they wanted. Now that user gets a **light page 07:00–17:59**. The property is old; **the
regression for OS-dark users is new** — and this is the accessibility cohort named in the docs PR
rationale (photophobia, migraine, light sensitivity).

**Cost to converge:**
- `website` — **unblocked, small**: one extra ternary in the no-choice branch of
  `time-of-day-theme.ts:105-113`; seeding must stay. No provider/layout change. **No test file exists
  in the repo** — nothing to update, and no regression net either.
- `openharness-cloud` — **doc-blocked**. `docs/design/console-mvp.md:69` (a self-declared *design
  authority*) states the console *"never consults `prefers-color-scheme`: no OS signal resolves the
  theme… the two are unrelated inputs."* §3 must be amended first. §11's non-negotiable contract does
  **not** mention theme, so amending §3 breaches nothing. Code: a pure
  `resolveDefaultTheme(hour, prefersDark)`, no provider change, plus a stubbed `matchMedia` in the
  `new Function(...)` harness at `theme-preference.test.ts:41`.

## G-7 · Dead code in cloud — VERIFIED, and **larger than reported**

`readThemePreference` (`theme-preference.ts:49`) has **zero** production consumers; all references are
in `theme-preference.test.ts`. Two things the recommendation missed:

- **`resolveTimeOfDayTheme` (`:25`) is transitively dead** — its only caller is `readThemePreference:50`.
  So the *typed, tested, pure* implementation is unreachable, and the rule that ships to users exists
  **only as a template string** at `:106`. A test (`:264-274`) pins the emitted script to the shared
  constants, so it is *managed* duplication, not a live bug — but deleting the function leaves the
  sole executable copy of the logic as a string. Decide that before approving a delete.
- **`THEMES` (`:3`) is unused by everything, including tests** — `theme-provider.tsx:65` hardcodes
  `themes={["dark","light"]}`. A genuine drift risk, covered by no guard.

The hydration-race guard (`:193-201`) asserts strings are *absent* from a **different** file, so
removal leaves it trivially green. Removal cost: one test file (import `:9`, blocks `:66-72`,
`:146-152`, `:154-160`).

## G-8 · `next-pwa` service-worker staleness — **REFUTED**

Document navigations are **NetworkFirst**, not CacheFirst: `/` → `NetworkFirst` (`start-url`),
everything else same-origin non-`/api/` → `NetworkFirst` (`pages`). **No `networkTimeoutSeconds`** on
either, so no path silently prefers cache. Precache holds exactly **one** document (`/offline`); all
other entries are content-hashed `_next/static`. `skipWaiting()` + `clientsClaim()` +
`cleanupOutdatedCaches()` all unconditional; registration automatic.

**Returning visitors get the new head script on their very next navigation. Zero loads of staleness.**
This item is dead — remove it from the list.

(Side note, not actionable: `public/sw.js` is tracked and was last regenerated in `05247af`, two
commits before the theme merge; the deployed SW comes from `next build`, so the committed copy lags.)

## G-9 · Artifact durability — **PARTIALLY VERIFIED; the diagnosis was wrong**

`.gitignore:12` (`.oh/tasks/*`, `!.oh/tasks/README.md`) does match — confirmed by `git check-ignore -v`.
The four artifacts (~35 KB) are untracked.

But **the ignore is soft and routinely overridden**: 35 `.oh/tasks` files are already tracked
(`apache-relicense/`, `archive/2026-07-27/audit-consolidation/`, `markitdown-wiki-pilot/`,
`cc-safety-net/critique.md`). Same for the wiki corpus — gitignored at `.gitignore:80`, yet 15 corpus
files are tracked. `git add -f` and wiki promotion are **established, working** paths.

**The real miss is process.** `pr.yml:17-19` says task artifacts belong in the *scoped worktree
project* so they ship with the diff. None of the three merge commits carries any (4/3/4 files, all
source). They were written to the **harness** repo's `.oh/tasks/`, where the ignore applies. That is
an orchestrator placement mistake, not an inescapable rule.
