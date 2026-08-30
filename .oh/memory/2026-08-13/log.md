
## prompt-miner -- 11:06 UTC
- **Result**: NO-CORPUS
- **Sessions scanned**: 15
- **Markers found**: 0
- **Top marker**: none — max stratum other:5/cron:5 < floor 10; root cause isolated (see findings below)
- **Observation**: prompt-miner run completed with result NO-CORPUS.

### prompt-miner findings 2026-08-13 — why the cron has never reached a minable corpus

Measured, not inferred. Three independent defects compound; only the third is novel.

**Counterfactual (all `--hours 336`, `--dry-run`, scratch copies in /tmp, engine unmodified in repo):**

| engine variant | scanned | ranked | strata |
|---|---:|---:|---|
| HEAD (as shipped) | 15 | 12 | other:5, cron:5, impl:1, audit:1 |
| + enumeration widened (L829) | 32 | 12 | unchanged |
| + enumeration + `notSdk` relaxed (L241) | 32 | 32 | other:5, **cron:19**, impl:1, audit:7 |

1. **`notSdk` filter is the binding constraint** — `mine-traces.mjs:241`
   `const notSdk = !("promptSource" in line) || line.promptSource !== "sdk"`.
   The cron runtime delivers the cron body as a user turn stamped `promptSource:"sdk"`.
   Verified on `b5eb0ab4` (2026-08-12): `userType:"external"`, `isMeta:undefined`,
   `role:"user"`, `startsWith("<"):false` — four of five conditions PASS; `promptSource:"sdk"`
   is the sole disqualifier. Consequence: every cron/autopilot/agent-initiated session gets
   `humanPromptCount:0` → `noHumanPrompt:true` → `features:null`, `sessionType:null`, dropped
   to `unranked[]`. The engine still computes a valid score for them (83.6–100.0); it just
   never mines them. This is precisely the population the daily cron exists to mine.

2. **Enumeration hides half the corpus** — `mine-traces.mjs:829` hardcodes the single project
   dir `~/.claude/projects/-home-sandbox-harness`. Claude slugifies *cwd* into the project dir,
   and this cron declares `worktree: true`, so every run lands in a sibling dir
   (`-home-sandbox-harness--oh-worktrees-cron-...`). 34 of 38 trace files on disk are invisible.
   Necessary but NOT sufficient: widening it alone adds **0** ranked sessions (row 2 above).

3. **NOVEL — the `sessions_supporting >= 10` floor counts sessions, not distinct prompts.**
   The 19-session `cron` stratum unlocked by fix (1) contains only **5 distinct feature vectors**;
   one group is **13 identical** sessions (the same cron body re-run daily, `lenChars=4796`,
   scores 83.6–100). Feature variance within a group is exactly zero, so any correlation is
   driven purely by day-to-day score noise on a byte-identical prompt.
   **Therefore fixing (1)+(2) without (3) is worse than the status quo**: it converts an honest
   `NO-CORPUS` into a confident pseudo-replicated marker that clears the bar at n=19 when the
   effective independent n is 5.

**Cross-reference — this is a root-cause mechanism for open issue #730**
("marker gate promotes non-reproducible markers — `hasFilePath` cleared the bar negative
5 days running, then positive"). #730 documents the symptom (markers flip sign across
overlapping windows); (3) supplies a mechanism: repeated identical prompts inflate
`sessions_supporting` while contributing zero feature variance, so the sign is set by score
noise. Recommend the floor count distinct prompt signatures (and/or aggregate repeated
bodies to one observation) before any of (1)/(2) land.

**Not filed / not shipped.** Today is `NO-CORPUS`, and the cron contract restricts the
issue+`/ship-spec` path to a marker that clears the bar. No issue, branch, PR, or
MEMORY/IDENTITY write was made. Findings are staged here for operator review; the natural
home is a comment on #730 plus a fix issue for (1)+(2)+(3) as one unit.

**Correction to the 2026-08-12 `NO-CORPUS-CAUSE` retraction.** That entry retracted the
`mine-traces:829` diagnosis entirely and attributed the failure solely to a stale cron body.
The stale body is real and still present (root checkout `91bc0b3f` is **41 behind**
`origin/development`; root serves `--hours 24`, worktree HEAD `72a8e7e2` serves `--hours 336`
— today's run was handed the stale 24h body and initially scanned 0). But it is not sufficient:
re-run at the intended `--hours 336`, HEAD still yields max stratum 5 < 10. L829 should be
un-retracted as a real-but-secondary defect.
