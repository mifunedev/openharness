---
title: "The Overnight Drift (NY Fed Staff Report 917)"
slug: overnight-drift
tags: [finance, market-microstructure, equity-returns, overnight-returns, inventory-risk, trading, liquidity]
created: 2026-06-10
updated: 2026-06-10
sources:
  - raw/2026-06-10-overnight-drift.md
related: []
confidence: confirmed
---

# The Overnight Drift (NY Fed Staff Report 917)

## Summary
Federal Reserve Bank of New York Staff Report no. 917, "The Overnight Drift" (Boyarchenko, Larsen & Whelan; Feb 2020, rev. Aug 2022), documents that U.S. equity-index futures returns do **not** accrue linearly around the clock. The largest positive returns concentrate in the 2:00–3:00 AM ET window — the opening of European markets — averaging ~3.7% annualized (1.48 bps/day). The authors attribute this "overnight drift" to dealer **inventory risk**: market makers absorb end-of-day order imbalances and earn compensation as positions reverse overnight — a risk premium for liquidity provision, not an arbitrage.

## Detail
**Instrument & window.** S&P 500 e-mini index futures, trading ~24h since the late 1990s. The drift is a clock-time pattern peaking 2:00–3:00 AM ET, not continuous accrual.

**Robustness.** The 2:00–3:00 return is the higher mode of a bimodal distribution of hourly returns — its lower 2.5% interval sits above the pooled 97.5% interval for both point estimates and t-stats. It survives Bonferroni and Benjamini–Yekutieli corrections (the only hour that does), is positive in 20 of 23 years (significant in 17), and holds on every weekday and 9 of 12 months. The 9:00–10:00 ET (U.S. open) hour is large/negative only in recessions, flat otherwise.

**Mechanism — inventory risk, not information.** Macro, monetary-policy, and earnings releases do **not** explain the drift (information would require systematically *positive* news between the U.S. close and European open). The pattern matches Grossman–Miller (1988) demand-for-immediacy: daytime selling pressure (negative end-of-day order imbalance) forces risk-averse dealers to become net buyers; they bear inventory risk overnight and demand positive expected returns to unwind. Reversals lag because volume jumps discontinuously down only at the 16:15 close — Asian-hours volume is 50–100× lower, so clearing the imbalance takes ~60,000 contracts (reached ~3:00 AM).

**Asymmetry (the fingerprint).** Large *negative* end-of-day imbalances (selloffs) produce robust positive overnight reversals; reversals after *rallies* are muted. This asymmetry generates the unconditionally positive return and is the signature of a *risk price*, not information — the authors tie it to dealer risk-bearing capacity that contracts during selloffs.

**First-principles reframe — editorial synthesis, extends the paper (not asserted by it).** Total return over the cycle is pinned by fundamentals + the aggregate risk premium; *how* it distributes across the clock is a microstructure question of who is marginal each hour. Intraday the marginal investor is the broad, diversified market (low marginal utility → flat risk price → the intraday "dead zone"). Overnight it is a *constrained dealer* holding unwanted inventory into the thinnest-liquidity window — high, volatile marginal utility → high required return → the drift. So the drift is the dealer's **wage**, not a found bill: capturing "buy close / sell European-open" means standing in the dealer's seat, paid a thin conditional premium for providing immediacy and holding the gap through hours you *cannot exit*. The average looks attractive *because* the left tail (an overnight shock while illiquid and constrained) is fat — you are effectively selling overnight insurance. The mechanism implies its own decay: as 24h/Asian liquidity deepens, dealer inventory risk falls and the premium should **compress secularly** — an anomaly grounded in a friction erodes as the friction erodes.

**Trade caveats.** (1) Optimal exit is the *European* open (~2–3 AM ET), not the U.S. morning, where the open hour is flat/negative. (2) Futures vs. cash is decisive: in cash equities/ETFs you are locked 16:00→09:30 and eat the entire gap with no escape hatch. (3) The edge is conditional (strongest after selloffs) — exactly when the overnight tail is fattest. (4) Descriptive study: the authors stop at *explaining* the premium, not claiming it is net-of-cost harvestable.

JEL: G13, G14, G15.

## See Also
