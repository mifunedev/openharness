
## prompt-miner -- 11:02 UTC
- **Result**: NO-CORPUS
- **Sessions scanned**: 1
- **Markers found**: 0
- **Top marker**: none — corpus truncated 89% by mine-traces.mjs:829 hardcoding a single ~/.claude/projects dir (issue #692 criterion 2, closed COMPLETED but never implemented); 33 of 37 Claude traces unreachable, incl. all 30 prior prompt-miner cron runs
- **Observation**: prompt-miner run completed with result NO-CORPUS.

### prompt-miner -- 11:02 UTC — CORRECTION to the "Top marker" line above

The `mine-traces.mjs:829` diagnosis in the entry above is **retracted**. That
single hardcoded `~/.claude/projects/-home-sandbox-harness` enumeration is a
**deliberate, documented non-change**, not a dropped acceptance criterion:
PR #698 ("The deliberate non-change — `enumerateFiles`") declined it on evidence
— the ~30 unreachable dirs are this cron's own per-run worktree sessions, whose
first prompts have one distinct length and two distinct SHA-256 prefixes, i.e.
zero feature variance. Including them would make the corpus floor easier to
clear with nothing to say. #692 was closed correctly.

**Actual cause of today's NO-CORPUS — a stale-body/fresh-code split:**

- The cron runtime reads bodies from the **shared root** checkout
  (`.oh/scripts/cron-runtime.ts:35` resolves `CRONS_DIR` against the root cwd;
  re-read per fire at `:285`, logged `BODY_RELOADED`).
- The shared root `/home/sandbox/harness` is on local `development` @ `91bc0b3f`
  — **0 ahead, 27 behind `origin/development`**.
- `7a195a50` (PR #698, merged 2026-08-03) is an ancestor of `origin/development`
  and of the spawned worktree HEAD `72a8e7e2`, but **not** of the root HEAD.
- So this run executed the **pre-#698 body (`--hours 24`)** against
  **post-#698 engine code**. Root body line 46 = `--hours 24`; worktree body
  line 49 = `--hours 336`.

PR #698 widened the window to 336h precisely because 24h cannot reach the
marker floor. Its own measurement, largest stratum by window: 24h → 4,
168h → 6, 336h → 16 (floor = 10). Observed: today (24h) scanned **1**;
2026-08-11 (24h) scanned **3**; 2026-08-10 (336h, per #730 provenance) scanned
**75** / ranked 52.

**NO-CORPUS was therefore structurally guaranteed, not a quiet corpus.** Stale
bodies are limited to `.oh/crons/prompt-miner.md` and `.oh/crons/README.md`;
autopilot's body is current.

**Remedy (operator action, not taken by this cron):** fast-forward the shared
root checkout — `git -C /home/sandbox/harness pull --ff-only` — then SIGHUP the
runtime. No PR opened: the repo-side code is already correct; the defect is
local checkout drift.
