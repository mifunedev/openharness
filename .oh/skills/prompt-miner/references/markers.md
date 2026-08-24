# prompt-miner — Marker Contract

The engine emits an objective **feature vector** per attributed prompt; the SKILL
step correlates those features against the session `scoreUncapped` to mine
**markers** — falsifiable claims about which prompt traits produce better
sessions. `effect_size` is computed against `scoreUncapped`, not `score`, because
the clamped scale is censored above 100 — every low-friction ground-truth session
piles onto the ceiling, so differences between good sessions vanish.

## Feature taxonomy

`markerFeatureKeys` (emitted in the dataset) is the authoritative list:

| Feature | Type | Meaning |
|---------|------|---------|
| `lenChars` | number | prompt length in characters |
| `lenWords` | number | whitespace-split word count |
| `startsImperative` | bool | first word is an action verb (add, build, fix, …) |
| `hasFilePath` | bool | contains a path or `*.ext` filename |
| `hasAcceptanceCriteria` | bool | "acceptance criteria", `AC-\d`, or `- [ ]` checkboxes |
| `hasCodeFence` | bool | contains a ``` fence |
| `hasInlineCode` | bool | contains `` `inline` `` code |
| `briefingStructure` | bool | ≥2 bold field labels or advisor-briefing headers |
| `referencesSkill` | bool | mentions a `/slash-command` |
| `mentionsIssuePr` | bool | `#\d+` or a GitHub issues/pull URL |
| `questionCount` | number | count of `?` |
| `urlCount` | number | count of `http(s)://` |
| `hedgingCount` | number | hedging words (maybe, perhaps, might, …) |

The **session type** (`impl` \| `retro` \| `query` \| `audit` \| `cron` \| `other`),
detected from the first human prompt, is recorded on each session. Sessions with
no human prompt are flagged `noHumanPrompt` and excluded from prompt ranking
(kept in the session table).

## Falsifiable marker schema

Each mined marker is a claim of this exact shape:

```json
{
  "feature": "hasAcceptanceCriteria",
  "direction": "positive",
  "threshold": true,
  "sessions_supporting": 14,
  "sessions_contradicting": 3,
  "effect_size": 0.41,
  "effect_size_capped": 0.36
}
```

- `direction` — `positive` (feature ⇒ higher score) or `negative`.
- `threshold` — the boolean value or numeric cut the claim is stated at.
- `sessions_supporting` / `sessions_contradicting` — counts within the stratum.
- `effect_size` — standardized mean difference (Cohen's-d style) in
  `scoreUncapped` between sessions that meet the threshold and those that don't.
  This is the **authoritative** scale.
- `effect_size_capped` — the same statistic computed against the clamped `score`.
  Carried for the stability guard below; never the promotion scale.

### Promotion thresholds

A marker is **reportable** only when, **within a single session-type stratum**:

- `sessions_supporting ≥ 10`, **and**
- `effect_size ≥ 0.3`.

### Stability guard: `UNSTABLE` markers

A marker is **`UNSTABLE`** when either branch holds:

- **(a) sign disagreement** — `sign(effect_size) != sign(effect_size_capped)`; or
- **(b) bar disagreement** — exactly one of `|effect_size| ≥ 0.3` and
  `|effect_size_capped| ≥ 0.3` holds.

An `UNSTABLE` marker is **reported** with both values and the reason, and is
**never promotable on either scale**. It is never translated into a memory
proposal and never auto-files an issue. When the two scales disagree, the clamp —
not the data — is deciding the verdict, so the claim is not falsifiable yet.

### Mandatory session-type stratification

Correlation MUST be computed **per session type**, never pooled across types — an
`impl` prompt and a `query` prompt have different optimal shapes, and pooling
manufactures Simpson's-paradox artifacts. A marker that holds only after pooling
is not reportable.

## Corpus-size reality: `NO-CORPUS` vs. `NO-CANDIDATE`

- **`NO-CORPUS`** — emit when **no** session type reaches the `sessions_supporting
  ≥ 10` floor. The corpus is too small to mine *anything* reliably; stop. This is
  distinct from `NO-CANDIDATE`.
- **`NO-CANDIDATE`** — the corpus is large enough, but no feature clears both
  thresholds this run. There is enough data; nothing crossed the bar.

Treating a small corpus as `NO-CANDIDATE` would invite premature, noise-driven
markers; the `NO-CORPUS` early-exit prevents that.

## See Also

- `scoring.md` — the outcome score these markers correlate against.
- `report-schema.md` — where `markerFeatureKeys` and `features` are emitted.
