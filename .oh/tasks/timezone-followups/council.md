# Council verdicts — which follow-ups are worth proceeding with

Grounding: `grounding.md` (the sole source of truth all three members were pointed at).
Members: **architect** (solution shape), **pm** (sequencing/scope), **designer** (user harm).

Item key:
1 console never deployed · 2a website CTA 4.02:1 AA failure · 2b cloud ThemeControl 1.04/1.23:1 ·
2c docs link 4.53:1 · 3a website OS-dark · 3b cloud OS-dark (doc-blocked) · 4 artifact placement ·
5 sub-frame flash · 6 next-pwa (refuted) · 7 cloud dead code

---

## PM verdict (received)

| # | Verdict | Reason |
|---|---|---|
| 1 | **PROCEED NOW** | Feature is dark in production on the console; blocks browser verification of 2b/3b/7 |
| 2a | **PROCEED NOW** | Genuine AA failure, live, one line, unrelated to the merge |
| 2b | **PROCEED NOW** | Real 1.4.11 failure on 100% of first-touch traffic; small isolated fix |
| 2c | **DROP** | Passes AA; underline satisfies 1.4.1. Not a defect |
| 3a | **PROCEED NOW** | Real regression for the photophobia/migraine cohort; one ternary; no test to break |
| 3b | **PROCEED LATER** | Blocked on a design-authority doc amendment — a decision, not an engineering task |
| 4 | **PROCEED LATER** | Real process gap, zero user impact |
| 5 | **DROP** | Closed structurally; frame capture is optional and expensive — don't fund it |
| 6 | **DROP** | Refuted; remove from the list entirely |
| 7 | **PROCEED LATER** | Real drift risk (`THEMES`), zero user impact |

**If only one:** #1 — cheapest item on the list (XS, no code), and half the remaining work (the whole
cloud track) is unverifiable without it.

**Sequencing.** Wave 0: #1 (blocking gate for the cloud track only). Wave 1 (parallel, independent):
#2a, #3a — both `website`, both shippable immediately. Wave 2 (cloud, after #1): #2b first (fastest,
zero deps), then #7, then #3b *only* once `console-mvp.md` §3 is amended. Wave 3: #4, no urgency.

**Batching ruling — three PRs, not one, in `openharness-cloud`.** 2b is a visual a11y fix, 3b is a
behaviour change gated on a doc amendment, 7 is a deletion. Mixing them forces a reviewer to weigh
three unrelated risk profiles in one diff, and 3b's doc dependency would stall 2b and 7.

**Scope boundaries PM insisted on:**
- **2a**: fix *only* the one usage at `CTASection.tsx:114`. Do **not** touch the shared
  `text-oh-accent` / `#15803d` token — ~40 usages, and grounding confirms the same pair passes at
  4.53:1 elsewhere. A token-wide change would re-break something currently fine.
- **2b**: cover **both** modes — dark also fails at 1.23:1; don't ship a light-only fix. Leave
  `user-menu.tsx` and `aria-pressed` alone (4.1.2 already passes).
- **3a**: seeding behaviour must not change; don't touch the explicit-choice branch.
- **7**: decide the template-string question *in the PR description* before deleting; leave the
  hydration-race guard alone.
- **4**: do **not** retroactively move the already-merged artifacts — churn with no value.
- **#1 OUT**: don't build a deploy-verification CI job as part of it; that's separate hardening.

**Sizes:** 1 = XS (a check, not code) · 2a = S · 2b = S · 3a = S · 3b = M (doc gate + `matchMedia`
test-harness stubbing) · 4 = XS · 7 = S. **Tickets:** only 3b needs one, because a doc-approval
dependency can stall silently. The rest are small enough to just do in a PR.

**PM's over-confidence flags on the grounding doc:**
- G-6 leads with a ready-made function signature for the cloud fix, which undersells that the real
  blocker is the **doc amendment**. Sequence doc-gate first, code second.
- G-7's "trivially green" framing for the hydration-race guard risks waving through the
  string-only-copy decision, which the same section admits is a real regression surface.
- G-9 calling `git add -f` / wiki promotion "established, working" is true but is a workaround for a
  process bug — not a reason to deprioritise fixing the placement mistake.

---

## Architect verdict (received)

| # | Verdict | Reason |
|---|---|---|
| 1 | **PROCEED NOW** | Live incident, not a code fix — confirm the monitor, escalate to Netlify config if still stale past the build window |
| 2a | **PROCEED NOW** | The only genuine unreported AA failure in the batch; one class, one file, no blast radius |
| 2b | **PROCEED NOW** | Real 1.4.11 failure on 100% of first-touch; ARIA covers screen readers, not sighted users |
| 2c | **DROP** | Passes AA with margin, already underlined. "Do not open a ticket for a passing check" |
| 3a | **PROCEED NOW** | Unblocked, small; the seeding mechanism already anti-freezes |
| 3b | **PROCEED LATER** | Correctly blocked behind the `console-mvp.md` §3 amendment — sequence the doc first |
| 4 | **PROCEED NOW** (process, not code) | Fix by convention going forward, per-repo |
| 5 | **DROP** | Proven against shipped bytes; frame capture is disproportionate for a closed question |
| 6 | **DROP** | Refuted with hard evidence — remove from tracking entirely |
| 7 | **SPLIT: partial PROCEED / partial DROP** | Delete `readThemePreference`, wire `THEMES` — but **keep** `resolveTimeOfDayTheme` |

### Item 7 — the architect overrules the premise, with evidence

The council brief offered three options (delete / keep / invert so the shipped string derives from
the tested function). The architect **rejects the invert**, and rejects deleting
`resolveTimeOfDayTheme`, on a fact nobody had checked:

> `openharness-web`'s own `resolveTimeOfDayTheme` (`src/plugins/time-of-day-theme/index.ts:60`) has
> **zero executable callers either — not even in a test.** That repo has no test for the plugin at
> all; the only reference is a JSDoc `{@link}` at `:20`. Its `INLINE_SCRIPT` independently
> re-encodes the same comparison as a literal string, exactly like cloud's.

So the reference implementation this pattern was going to be "fixed" against does the *same thing*,
less rigorously. What makes it trustworthy is not that the function runs — it's the post-build
guard. And **cloud already has a tighter equivalent**: `theme-preference.test.ts:263-275` pins the
source-text/constant relationship pre-build, `:115-125` unit-tests the function's full boundary
table, and `:205-245` behaviourally executes the real template via `new Function(...)` — *two*
independent pins where docs has one.

**Ruling:** cloud is at parity with, arguably ahead of, the repo it was being compared against. The
function is the *tested spec the string is checked against*, not orphaned code. Keep it; strengthen
its doc comment to say it is intentionally unreachable at runtime, so a future cleanup pass doesn't
delete it. The `toString()` inversion is technically buildable (the Node build process has full
access; the no-import constraint applies only to the browser) but is a bigger, more fragile change
than the reference implementation itself uses.

**What item 7 *should* be:** delete `readThemePreference` (`:49-51`) + its tests, and fix
`theme-provider.tsx:65` to pass the exported `THEMES` constant instead of the hardcoded
`["dark","light"]`. That literal is the one genuinely unguarded drift risk in the item — the only
place where "unused" is a bug rather than a design necessity.

### The structural finding — one pattern, three unequal safety nets

> All three repos independently invented the same "pre-paint inline script duplicates the tested rule
> as an unreachable string" shape, with three different and unequally rigorous pinning strategies,
> and no shared awareness that it is one recurring pattern.

Docs pins post-build via HTML content signature. Cloud pins pre-build via source-text **plus** two
behavioural tests. **Website pins via nothing.** Items 3a and 7 are opposite ends of that same
spectrum. A fourth surface would invent it a fourth time.

### The under-scoped fact in the grounding doc

G-6 noted "no test file exists" only as a *cost note for item 3a*. The architect verified it is true
of the **entire `website` repo** — no test file, no test script in `package.json`, anywhere. So
**item 2a also ships with zero regression coverage**, which the grounding doc never says. Both
website items land in a repo with no safety net; keep both diffs minimal for that reason.

Architect found nothing in the grounding doc actually incorrect, and explicitly **retracted** an
initial suspicion about G-7 after reading the tests more closely.

**Orchestrator independently verified all three load-bearing claims**, because this ruling overturns
a recommendation:

- `openharness-web/src/plugins/time-of-day-theme/index.ts` — `resolveTimeOfDayTheme` appears exactly
  twice: the JSDoc `{@link}` at `:20` and its own definition at `:60`. **Zero executable callers**,
  and a repo-wide find turns up **no test or spec file anywhere**. Confirmed.
- `website` — **no test/spec file anywhere and no `"test"` script** in `package.json`. Confirmed, so
  both 2a and 3a land with no regression net.
- `openharness-cloud/apps/web/components/theme-provider.tsx:65` — literally
  `themes={["dark", "light"]}`, not the exported constant. Confirmed as a real drift risk.

### Architect's note for item 4 — no uniform rule exists

Only `openharness-cloud` has an established `.oh/tasks/<slug>/` convention (already used, and
referenced from `netlify.toml`). `openharness-web` and `website` have **no `.oh/` directory at all**.
So: cloud follow-ups put artifacts in cloud's own `.oh/tasks/` and `git add -f` them per precedent;
website/docs follow-ups ride in the PR body, because inventing scaffolding for a single ticket is
scope creep. A cross-repo document like `grounding.md` legitimately lives in the harness — but
should be `git add -f`'d rather than left to the soft ignore.

## Designer verdict (received)

| # | Verdict | Reason |
|---|---|---|
| 1 | **PROCEED NOW** | Gates 2b and the cloud half of 3 — and it is the *closing free window* to fix 3 before any user sees the regression |
| 2a | **PROCEED NOW** | Live AA failure in the mode the feature just routed 11 h/day into — and it is a **token-pair defect with a second instance**, not a one-liner |
| 2b | **PROCEED NOW** (bundle with 1 + 3) | Real 1.4.11 failure, one class, but **zero live harm today** — ship it in the PR you're opening anyway |
| 2c | **DROP as a fix / LATER as a CI guard** | Passes 1.4.3, underlined. "Do not spend credibility ticketing a passing check" |
| 3 | **PROCEED NOW — both website *and* cloud** | Accessibility regression the project already argued against in its own words |
| 4 | **PROCEED LATER** | Zero user impact; abstains on priority |
| 5 | **DROP** | Settled structurally |
| 6 | **DROP** | Refuted |
| 7 | **PROCEED LATER** | No user impact; fold `THEMES` into the item-3 cloud change |
| **A** *(new)* | **PROCEED NOW** | Website flips theme in an already-open tab, no reload, no user action |
| **B** *(new)* | **PROCEED NOW** (fold into 2a) | `CTASection.tsx:158` hover — same failing pair on the error-recovery link |
| **C** *(new)* | **PROCEED NOW** | Website toggle never reports which theme is active, to anyone |
| **D/E** *(new)* | **PROCEED LATER** | The auto default is a one-way door and is never explained |

### Harm ranking: **2a > 2b > 2c** — deliberately inverting the ratio order

2b's 1.04:1 is the scariest number and the *least* harmful of the three. Designer's reasoning:
the unselected label measures **5.20:1** against its own background (passes 1.4.3 comfortably);
`aria-pressed` covers 4.1.2; and decisively — **the state that control fails to convey is
redundantly conveyed by the entire viewport.** A user who can't tell which button is pressed can
see whether the page is dark. The buttons are labelled with the *destination* ("Dark"/"Light"),
not the state, so clicking the one you want is correct either way. Plus it has **zero live harm
today** because the console never deployed.

### Finding A — website flips theme in an already-open tab · **VERIFIED BY ORCHESTRATOR**

The most consequential thing the council found, and it is feature-caused and new.

> Tab A open since 06:40, no stored choice (`theme=dark`, `theme-auto=dark`). At 07:05 the user opens
> mifune.dev in Tab B. Tab B's head script re-resolves to `light` and writes both keys.
> **Tab A goes light instantly, mid-read, with no reload and no interaction.**

I verified both halves in source rather than take it on report:

- `website/src/lib/time-of-day-theme.ts:108` — the no-choice path writes **both** keys:
  `s.setItem(A,t);s.setItem(K,t);`
- `website/node_modules/next-themes/dist/index.mjs` — registers
  `window.addEventListener("storage", o)` with
  `o = r => r.key===m && (r.newValue ? n(r.newValue) : f(l))`.

Storage events fire in *other* documents of the same origin, so the listener adopts the new value
immediately. **The flip is real.** The harmful direction — dark→light at 07:00 — hits precisely the
photophobia/migraine cohort item 3 is about, and `disableTransitionOnChange` makes it instantaneous
rather than eased, which is right for vestibular safety but makes it more startling.

This is **new**: pre-merge the no-choice path never wrote `theme`, so no default ever emitted a
storage event. G-3 does not cover it — G-3 reasons only about pre-*paint* flash. **Cloud is immune**
(never seeds) and **docs is immune** (writes nothing, by design).

Requirement: *an already-open tab must never change theme without user action.*

### Finding B — the contrast sweep found a floor, not a total · **VERIFIED BY ORCHESTRATOR**

`CTASection.tsx:158` puts `hover:text-oh-accent` on the support-email link inside the
`status === "error"` banner, which sits on the `bg-oh-raised` aside at `:113`. Confirmed in source.
So **hovering the only recovery path from a failed form submission** drops it to the same 4.02:1.
That is task-critical, unlike `:114`'s eyebrow (whose meaning is carried by the paragraph beneath it).

Method finding that matters more than the instance: my scan ran against *rendered default state*, so
it structurally cannot see `hover:` colours or conditionally-rendered branches. **"The one genuine AA
violation" is a floor, not a total.** Any sweep informing these tickets must enumerate state-dependent
colours from source.

Consequence: 2a is a **token-level** fix, not a line fix. `--oh-accent: #15803d` is fine on white
(5.01:1) and fails on `--oh-raised: #eae6db` (4.02:1). Designer proposes the in-family
`--oh-focus: #166534` — **5.72:1 on `#eae6db`, 7.13:1 on white** — with the open question of whether
collapsing accent/focus into one light-mode green is acceptable.

### Ruling on OS-dark: **fix it, on both — and cloud FIRST**

Designer rules it an accessibility regression, not a preference call, on four grounds:

1. **The project already ruled on this in writing, in its own code.**
   `openharness-web/src/plugins/time-of-day-theme/index.ts:15-19` states it as a design constraint:
   *"Forcing light at 14:00 on someone who set OS dark removes an accommodation they configured… the
   time rule may only ever upgrade light → dark, never dark → light."* One surface implemented that;
   two did not. This is internal inconsistency against an adopted position, not an imported opinion.
2. **The two inputs are not symmetric.** OS is a *declared* preference; the hour is an *inferred*
   one. `prefers-color-scheme: dark` is the only channel a platform gives a user to say "light
   surfaces hurt me". Overriding it with a timezone guess is the one case where the rule reasons
   about a user who already answered.
3. **Converging costs no user anything** — an OS-dark user who wants light can still choose it, and
   that choice is permanent. There is no user on the other side of this trade.
4. **Journey-level incoherence**: `TopNavBar.tsx:117` links mifune.dev → console; an OS-dark user at
   14:00 flips light→dark mid-flow across subdomains that share no storage.

**Cloud first**, for two reasons: dwell time inverts the priority (the console is where a
light-sensitive user spends *hours*; marketing is read once), and **the console hasn't deployed** —
the cheapest fix window that will ever exist, and it closes the moment Netlify catches up. Ship it
inside the first deploy and no OS-dark console user ever experiences the regression at all.

**The design doc does not forbid this fix.** `console-mvp.md:69`'s user-facing contract — two explicit
choices, no System option, only explicit choices persisted — stays fully intact when OS-dark is
respected in the *never-chose default resolution*. The only sentence that breaks is the rationale
"the two are unrelated inputs". **Explicitly do NOT add a System option to cloud.**

### Boundary ruling — the boundary is fine; don't touch it

| Case | Behaviour | Ruling |
|---|---|---|
| Same tab, single load | No flip; all three read the clock once per load | Correct |
| User reloads across the boundary | Theme changes | **Acceptable** — user initiated the load; that's the feature |
| Open tab, no reload, no action | **Website only** flips live | **Actively bad — fix** (finding A) |

Explicitly: **no grace windows, no hysteresis, no smoothing.** Those add hidden state to a rule whose
only virtue is that it is trivially explainable.

### Finding C — the state-communication gap is on the surface nobody flagged

`website/src/components/mode-toggle.tsx:47-66` uses plain `DropdownMenuItem`s — no `aria-checked`,
no radio group, no checkmark — and the trigger's accessible name is just "Toggle theme". **There is
nowhere in the website UI that reports the active theme to a non-sighted user.** Ironic against 2b:
cloud *does* expose `aria-pressed` and a literal "On"/"Off" in the authenticated menu. Fix is pure
reuse — `DropdownMenuRadioGroup`/`RadioItem` already exist at `ui/dropdown-menu.tsx:120,191`.

**On discoverability** (which the council asked about): **no gap on any surface.** This matches my own
live measurement (44×44 on website, 32×32 on docs, both above the fold). *The gap is current-state
and mental model, not findability.*

### Designer's challenges to the grounding doc

1. **The 2.82:1 figure is not a WCAG measurement.** It compares two *foregrounds*; no SC does that.
   The relevant number is unselected label vs. its own background = **5.20:1**, a comfortable pass.
   The "weak, not broken" verdict survives; the evidence cited for it does not. **Accepted.**
2. **"The item nobody reported" over-claims.** It is a floor (see finding B). **Accepted.**
3. **G-6's matrix is a weaker evidence grade than G-2's but is labelled with equal weight.** G-2 was
   re-derived in-browser on production; G-6's OS-signal table was derived from code reading, with no
   production run under emulated OS-dark for *any* surface. **Accepted — this is a fair hit.**
4. **"No test file exists… no regression net either" was offered as evidence the fix is cheap.** The
   absence of a net is a **cost, not a saving**, on an accessibility default. **Accepted.**
5. **G-3's "settled structurally" is correctly scoped to the two shipped surfaces** — the console is
   unverified for flash and takes a genuinely different provider path. Check it on the deploy.
