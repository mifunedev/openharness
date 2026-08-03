# Adversarial critique of the council's rulings

Two critics, run in parallel per `pr.yml`, each pointed at `grounding.md` + `council.md` and told to
refute. Critic A = implementer lens (will the changes work?). Critic B = decision-quality lens
(are the priorities right?).

---

## Critic B — decision quality (received)

### Survives unattacked
Items **1, 2b, 3a, 4, 7** (including the architect's split verdict on 7), the DROPs on **5** and **6**,
and the underlying decision to fix OS-dark on both surfaces. Four of designer's five grounding
challenges survive as stated.

### 1 · "DROP 2c + add a CI guard later" is incoherent — **HIGH, REFINES**

Independently confirmed: `openharness-web` has **zero** contrast/a11y tooling — no axe-core, pa11y or
lighthouse in `package.json`, no workflow beyond `pages.yml`, no test mentioning "contrast". With a
+0.026 margin, one half-shade token nudge crosses AA silently and nothing catches it.

Two members said flat DROP; designer said "DROP as a fix / LATER as a guard" — and the council's own
ticket rule ("only 3b needs a ticket") files nothing for the guard. So the "later" **evaporates with
no record**. Critic B's sharpest point: this is the exact failure mode grounding G-4 identified
("already tracked is not an available disposition") happening to *the council's own output*.

**Required:** either write the one-line guard ticket, or state explicitly "no guard, margin accepted".
Right now it is silently neither.

### 2 · DROPs on 5 and 6 hold — **LOW**

Item 6 independently re-derivable from the SW config. Item 5's byte-order proof is solid for
first-paint FOUC. One residual nobody mentioned: **bfcache** restores a previous paint before script
re-execution on some browsers, so "settled structurally" slightly overclaims. Not enough to reopen.

### 3 · "Cloud first, race the deploy" — **HIGH, REFUTES the sequencing** (not the fix)

PM and architect both placed 3b in Wave 2 behind the doc amendment. Designer was the lone voice for
"cloud FIRST" to beat Netlify. Critic B rejects it:

- The "free window" is **not confirmed to outlive the review it requires** — a design-doc amendment
  plus code review versus a build pipeline is a race you cannot schedule.
- It makes an accessibility fix's *quality* depend on beating a build, not on getting the amendment
  right.
- `console-mvp.md:13` explicitly frames itself as requiring deliberate authority — "exactly the kind
  of doc that shouldn't be amended under self-imposed time pressure."

**The underlying fix is correctly PROCEED by all three; only the sequencing is wrong.**

Critic B leaves one door open, and it turns out to matter: *"If the window is later shown to be
structurally longer — e.g. the stale build requires manual Netlify intervention rather than being
in-flight — that would legitimately restore urgency."*

> **Orchestrator note:** that condition has since been met. At **22:22 UTC, 44 minutes post-merge**,
> the console was still byte-identically pre-feature (23129 bytes, `getHours=0`, unchanged since
> 21:53) while the repo's own CI for that commit finished in ~4 minutes. See the synthesis — this
> does not vindicate racing; it **removes the race entirely**, which satisfies both positions.

### 4 · Item 2a scope — **both PM and designer are partly wrong; resolvable by counting** — MEDIUM

Critic B counted rather than argued:

- **55** raw `text-oh-accent` usages in `website` (38 non-hover).
- `bg-oh-raised` appears **exactly 3 times** repo-wide; only **2** wrap accent-styled elements:
  `CTASection.tsx:114` and `:158`.
- The `:80` "CLOUD · DEPLOYMENT" eyebrow sits on `bg-oh-paper` and independently measures 4.53:1 —
  passing — **in the same page**.

**Ruling: fix the two raised-background instances only; leave the shared token alone.** PM's
magnitude was right but "only line 114" misses the functionally worse `:158`. Designer's second
instance was right but "fix at token level" would needlessly touch ~53 currently-passing usages.

Also flagged: PM's "the same pair passes at 4.53:1 elsewhere" is ambiguous between the docs figure
and website's own. The claim holds either way (re-verified), but the citation should point at the
website-specific measurement to avoid a genuine cross-repo conflation trap.

### 5 · The four new items — discipline mostly holds, **one mischaracterisation** — MEDIUM

- **A** (cross-tab flip): verified in source, genuinely feature-caused. **PROCEED NOW survives.**
- **B**: not really a separate item — same fix as finding 4. Fold it.
- **C** (website toggle has no `aria-checked`): `git show 2b66e7a -- mode-toggle.tsx` shows the merge
  **only** wrapped `onClick` in `chooseTheme()`. The plain-`DropdownMenuItem` structure is
  **pre-existing and untouched**. The council is **annexing unrelated a11y debt** onto this list under
  the urgency of items it did cause. Real, but it ships as its own ticket — not as PROCEED NOW
  alongside A.
- **D/E**: correctly deferred; the clearest "finding work to justify itself" candidate. Leave at LATER.

### 6 · Designer's grounding challenges — accepted correctly, one under-diagnosed — MEDIUM

"2.82:1 is not a WCAG measurement" is **right**: SCs compare a foreground to its background at one
point in time, not a before/after delta. The legitimate 1.4.11 figures are the 1.04:1 / 1.23:1
background pairs. Survives cleanly.

"G-6 is a weaker evidence grade" was accepted for the wrong reason. It is *not* that code-reading is
generically weaker for a deterministic function. It is that **G-1 already proved code-vs-deployed
reality diverges in this exact environment** — the console has been serving stale bytes — so a
source-derived claim about cloud's `matchMedia` behaviour cannot be checked against anything live at
all right now. Sharper, and it feeds finding 3.

### Critic B's single change

> Reject "cloud first, race the deploy". Sequence 3b exactly as PM and architect ruled — doc
> amendment first, deliberately, no artificial deadline. Treat the free window as a nice-to-have
> outcome if it lands in time, never as the reason to move the item earlier or compress review.

---

## Critic A — implementer lens (received)

### Survives
Item 3a's core mechanism, item 3b's "no new hydration race" claim, item 7 in full, and the designer's
raw contrast arithmetic.

### 1 · The website OS-dark ternary works — but on an unnamed invariant — LOW/informational

Traced both cases at `time-of-day-theme.ts:100-113`. The no-choice branch always writes
`s.setItem(A,t);s.setItem(K,t)` — **both keys get the same computed `t`**, however complex the formula.
The marker check `raw!==null && raw!==auto` is agnostic to *how* `t` was derived, so adding a
`matchMedia` term cannot break the auto-marker.

- OS dark 14:00 first visit → `{theme:dark, auto:dark}`; OS→light, revisit 14:00 → `raw===auto` →
  still the no-choice branch → `light`. Correct.
- OS dark 21:00 → `dark` (night window, OS irrelevant); revisit 14:00 OS light → `light`. Correct.

**But the safety is non-obvious and must become an explicit acceptance criterion:** if an implementer
hoists the `matchMedia` read out of the no-choice branch, or writes A and K with different values,
the invariant breaks silently.

### 2 · **Shipping 3a before finding A makes A worse — HIGH, and nobody caught it**

The single highest-severity gap in the whole council output, and it fell in the **seam between two
members' rulings that nobody read together** (PM ruled 3a; designer raised A; neither cross-read).

> Tab A open at 14:00, OS light, no choice → `light`. User flips OS to dark **without closing Tab A**
> and opens Tab B at the same hour. **Pre-3a** Tab B also resolves `light` — no divergence, no flip.
> **Post-3a** Tab B resolves `dark`, writes storage, and Tab A flips live, mid-read.

So 3a introduces a **brand-new trigger axis** for finding A — OS toggling, on top of clock-boundary
crossing. PM's Wave 1 ships 2a + 3a "in parallel, independent" with no gate on A, because A postdates
the PM and architect tables entirely. **3a and A must land in the same diff.**

### 3 · **Neither proposed fix for finding A actually works — HIGH, REFUTES both**

Critic A first notes the council recorded only a *requirement*, not a mechanism. Evaluating the two
obvious implementations anyway:

- **"Only write when the value differs" — a no-op.** Per the WHATWG Storage spec, `setItem` with an
  unchanged value **already fires no `storage` event** in other tabs; browsers do this natively. The
  harmful case is precisely when the value *does* differ. This suppresses only writes that were
  already harmless.
- **"Port cloud's `forcedTheme` + adopt-DOM pattern" — silently strands "System".** Cloud runs
  `forcedTheme={theme}` with `enableSystem={false}` (`theme-provider.tsx:59-66`); website runs
  `enableSystem` with no `forcedTheme` and offers a System item (`mode-toggle.tsx:60-65`).
  `forcedTheme` overrides all internal resolution *including* the system watcher, so clicking
  "System" would do nothing observable. Preserving it means hand-rolling a `matchMedia` change
  listener — **which reintroduces a second live-update channel that can flip an open tab without user
  action, i.e. a variant of the very bug being fixed.**

**Verdict:** finding A is real and PROCEED stands; both shortcut implementations are refuted. This is
genuine design work, not a one-liner.

### 4 · The cloud `matchMedia` fix breaks two currently-green tests — MEDIUM-HIGH · **VERIFIED**

`openharness-cloud/apps/web/vitest.config.ts:5` is `environment: "node"` — **no jsdom, no `window`
global at all** (orchestrator confirmed). `runBootstrapScript` at `theme-preference.test.ts:31-47`
binds only two identifiers via `new Function("localStorage","document", …)`. Adding
`window.matchMedia(...)` to the bootstrap makes the no-choice tests at `:205-217` throw
`ReferenceError: window is not defined` — **two green assertions go red the moment the feature lands.**

Not a refutation (PM sized 3b at M citing exactly this), but "update both existing no-choice bootstrap
tests to pass a `matchMedia` stub" belongs in the PR as a gating criterion, not as incidental scope.

**No new hydration race**, though: `resolveMountedTheme` (`:60-65`) calls only
`readStoredThemePreference` — never `matchMedia` or the clock — so the read stays confined to the one
pre-paint execution *provided the provider is left untouched*. That claim survives.

### 5 · PM's stated reason for keeping 2a local is factually wrong — MEDIUM

Designer's arithmetic independently reproduced: `#166534` on `#eae6db` = **5.7179:1**, on white =
**7.1303:1**. And PM's mechanism ("a token change would re-break something currently fine") **does not
hold**: `#166534` is strictly darker than `#15803d`, so against any lighter background the ratio can
only increase.

But there is a **real, different** risk both members missed: `--oh-accent` is used as a **non-text**
value at `TopNavBar.tsx:99` (`shadow-[inset_0_-2px_0_0_var(--oh-accent)]`) and is visually paired with
**hardcoded, non-token** `green-500` utilities in ~6 places (`RegisterButton.tsx:21`,
`PricingSection.tsx:101,111,151`, `pricing/page.tsx:144,206,253`, `services/page.tsx:184,408`). A
token-wide swap darkens the text while those adjacent borders stay `#22c55e` — a **brand-consistency**
regression, not an accessibility one. So the conclusion (stay local) is right for a reason neither
member gave.

### 6 · **The council's own new finding has the wrong number — the failure is worse** · **VERIFIED**

`CTASection.tsx:148-158`: the `<a>` sits inside a `bg-red-500/10` alert div, which itself sits on the
`bg-oh-raised` card — **not** directly on `bg-oh-raised` like `:114`'s eyebrow. Orchestrator recomputed
the composite:

| | background | `#15803d` (current) | `#166534` (proposed) |
|---|---|---|---|
| `:114` eyebrow | flat `#eae6db` | **4.02:1** FAIL | 5.72:1 pass |
| `:158` hover | `bg-red-500/10` over `#eae6db` = **`#ead6cc`** | **3.58:1** FAIL (worse) | 5.09:1 pass |

The remediation still works, but **QA must measure the composited colour, not the flat token pair**, or
it signs off on the wrong number. This also confirms PM's "fix only `:114`" is stale.

### 7 · `readThemePreference` is safe to delete — architect vindicated

`theme-preference.test.ts:109-144` calls `resolveTimeOfDayTheme(hour)` **directly** — the `it.each`
boundary table at `:115-125` (hours 0, 6, 7, 12, 17, 18, 23) and the "resolves without reading the
clock" guard at `:127-144` never touch `readThemePreference`. Its own tests are a **disjoint** set
(`:66-77`, `:146-152`, `:154-160`). Deleting it leaves the boundary coverage fully intact, and the
hydration guard at `:193-201` is unaffected either way.

### 8 · Procedural: findings A–E had one rapporteur and were never cross-examined — MEDIUM

PM's and architect's tables cover items 1–7 only; A–E appear solely in the designer's section. Treating
"PROCEED NOW" on A–C with the same confidence as the fully-adjudicated items overstates consensus —
and finding 2 above is the proof, since it required reading PM's 3a ruling against designer's finding A
and nobody did.
