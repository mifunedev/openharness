# Demo shot list — "Agent wakes on a cron, opens a PR while you sleep"

> Companion to `memory/promotion-plan.md`. The launch centerpiece: a ~30–40s
> GIF/MP4 for the README top, the Show HN comment, and the X/Bluesky thread.
> Grounded in the real runtime (`scripts/cron-runtime.ts`): `fire()` runs
> `claude -p "<cron body>"`, schedule is Croner (6-field = seconds allowed),
> and `CRONS_DIR` / `CRON_AGENT_BIN` are env-overridable — so the demo is
> staged in an isolated dir and never touches the live `crons/`.

## What the viewer must believe (and it's all true)

The mechanism is **real**: a markdown cron file → the runtime fires
`claude -p <body>` → the agent does real work → a genuine PR appears. The
*only* compression is the schedule (seconds instead of overnight). Caption
that explicitly. The wow isn't the code diff — it's a PR that **wasn't
there 30 seconds ago**, authored autonomously.

## Honesty guardrails (non-negotiable — this audience checks)

- The agent step is **real Claude** (`claude -p`), not a scripted stand-in.
- Schedule is sped up for the clip — say so on screen ("sped up; normally hourly/nightly").
- Use a **throwaway repo** so nothing real is touched and the PR is genuine.
- Don't trim a take to hide a failed/ugly agent run — re-record until you get a clean **real** take.
- `--dangerously-skip-permissions` is used *because* it's the isolated sandbox — that's the "one project, one sandbox" value prop doing real work, not a shortcut.

## Prerequisites (inside the sandbox)

- `claude` authenticated; `gh auth login && gh auth setup-git` done.
- Node 22 (ships in the image — `--experimental-strip-types` runs the `.ts` runtime directly).
- A recorder: **VHS** (`charmbracelet/vhs`, recommended — reproducible) or **asciinema + agg**.

---

## One-time setup (run once, ~2 min)

```bash
# 0. Non-interactive wrapper so headless claude can act without prompts.
#    The runtime hardcodes `-p <body>`; a wrapper adds the autonomy flag.
mkdir -p "$HOME/bin"
cat > "$HOME/bin/claude-cron" <<'SH'
#!/usr/bin/env bash
exec claude --dangerously-skip-permissions "$@"   # safe: isolated sandbox
SH
chmod +x "$HOME/bin/claude-cron"

# 1. Throwaway demo repo with ONE failing zero-dependency test (legible, fast).
mkdir -p "$HOME/oh-cron-demo" && cd "$HOME/oh-cron-demo"
git init -q
cat > package.json <<'JSON'
{ "name": "oh-cron-demo", "type": "module", "scripts": { "test": "node --test" } }
JSON
cat > math.js <<'JS'
export function add(a, b) {
  return a - b;            // BUG: should be a + b
}
JS
cat > math.test.js <<'JS'
import { test } from 'node:test';
import assert from 'node:assert';
import { add } from './math.js';
test('add(2,3) === 5', () => assert.equal(add(2, 3), 5));
JS
git add -A && git commit -qm "init: demo repo with a failing test"
git branch -M main
gh repo create oh-cron-demo --private --source=. --remote=origin --push   # throwaway

# 2. The demo cron — ISOLATED dir, does NOT touch the live crons/.
mkdir -p "$HOME/demo-crons"
cat > "$HOME/demo-crons/demo.md" <<'MD'
---
id: demo
schedule: "*/30 * * * * *"
enabled: true
overlap: false
catchup: false
description: Demo — fix the failing test and open a PR
---

# Overnight maintenance

You are the overnight maintenance agent for this repo (cwd = repo root).
Run `npm test`. If a test fails, make the minimal code change to pass it.
Then create branch `cron/fix-failing-test`, commit with a Conventional
Commit `fix:` message, push, and open a PR to `main` with
`gh pr create --fill`. Keep the diff under 10 lines. If tests already
pass, exit without changes.
MD
```

**Why `overlap: false` matters here:** Croner runs with `protect: true`, so
if the next 30s boundary arrives while the agent's first run is still going,
that fire is **skipped** — you get exactly one PR, not three. Just `Ctrl+C`
once the PR appears.

**The money command** (the agent operates in the demo repo's cwd):

```bash
cd "$HOME/oh-cron-demo"
CRONS_DIR="$HOME/demo-crons" CRON_AGENT_BIN="$HOME/bin/claude-cron" \
  node --experimental-strip-types "$HOME/harness/.oh/scripts/cron-runtime.ts"
```

---

## Beat-by-beat shot list (single pane — cleanest for a GIF)

| # | On screen | Command / action | Caption (echo or post overlay) | ~secs |
|---|-----------|------------------|--------------------------------|-------|
| 1 | The whole job is one markdown file | `cat ~/demo-crons/demo.md` | "The cron body **is** the agent's prompt." | 3 |
| 2 | main is broken | `cd ~/oh-cron-demo && npm test` → 1 failing test (red) | "A test is failing on main." | 3 |
| 3 | Start it and walk away | run the money command → logs `BOOT 1 crons`, then `FIRE` | "Sped up to 30s — normally hourly/nightly." | 4 |
| 4 | (agent works headless) | `claude -p` runs; **hide** this stretch to keep the clip short | — | hidden |
| 5 | You wake up | `Ctrl+C` the runtime | — | 1 |
| 6 | The result | `gh pr list -R <you>/oh-cron-demo` → a new PR | "A PR — opened while you slept." | 3 |
| 7 | Proof it's real | `gh pr diff 1 -R <you>/oh-cron-demo \| head -20` (shows `-` → `+`) | "Minimal, correct fix." | 3 |
| 8 | Green | `git checkout cron/fix-failing-test -q && npm test` → passing | "Tests green." | 3 |

End card: `echo` the tagline + `github.com/mifunedev/openharness`.

---

## Ready-to-edit VHS tape (`demo.tape`)

Render with `vhs demo.tape` → produces `demo.gif` **and** `demo.mp4`.
Replace `YOU` with your GitHub username.

```tape
Output demo.gif
Output demo.mp4

Set Shell "bash"
Set FontSize 18
Set Width 1200
Set Height 720
Set Padding 24
Set Theme "Dracula"
Set TypingSpeed 55ms

# 1 — the whole job is one markdown file
Type "cat ~/demo-crons/demo.md"   Enter
Sleep 3s

# 2 — main is broken
Type "cd ~/oh-cron-demo && npm test"   Enter
Sleep 3s

# 3 — start the cron and walk away  (schedule sped up for this clip)
Type "cd ~/oh-cron-demo"   Enter
Type "CRONS_DIR=~/demo-crons CRON_AGENT_BIN=~/bin/claude-cron node --experimental-strip-types ~/harness/.oh/scripts/cron-runtime.ts"   Enter
Sleep 5s

# 4 — agent runs headless; hide the long real run to keep the GIF short
Hide
Sleep 75s
Show

# 5 — you wake up
Ctrl+C
Sleep 1s

# 6/7/8 — the PR, the diff, the green test
Type "gh pr list -R YOU/oh-cron-demo"   Enter
Sleep 3s
Type "gh pr diff 1 -R YOU/oh-cron-demo | head -20"   Enter
Sleep 3s
Type "git checkout cron/fix-failing-test -q && npm test"   Enter
Sleep 3s
Type "# A PR, opened while you slept.  github.com/mifunedev/openharness"   Enter
Sleep 2s
```

**Tuning `Sleep 75s` (beat 4):** size it to your machine's real agent
latency — time one `claude-cron -p "$(sed '1,/^---$/d;1,/^---$/d' ~/demo-crons/demo.md)"`
run first, then set the hidden Sleep a few seconds above that so `Show`
lands right as the PR is created.

---

## Alternative: asciinema + agg (authentic live capture)

```bash
asciinema rec demo.cast        # perform beats 1–8 live, then exit
agg --cols 100 --rows 28 --font-size 18 --theme dracula demo.cast demo.gif
# optional MP4 for X/Bluesky (native video > GIF link for reach):
#   ffmpeg -i demo.gif -movflags faststart -pix_fmt yuv420p demo.mp4
```

To compress the live agent wait without faking it: run the runtime in the
background to a log and tail only the interesting lines —
`... cron-runtime.ts >~/cron.log 2>&1 &` then `tail -f ~/cron.log` and
`watch -n1 'gh pr list -R YOU/oh-cron-demo'` in a split.

---

## Export targets & where each asset goes

| Surface | Format | Notes |
|---|---|---|
| **README** (top, above the fold) | animated **GIF** | GitHub inlines GIFs; keep < ~4 MB (drop FontSize/Width or trim beats if larger) |
| **Show HN** comment | **link** to the asciinema cast *or* a 30s hosted MP4/YouTube | HN can't embed; label it "30s demo: agent opens a PR on a cron" |
| **X / Bluesky** | **MP4** | native video autoplays and out-reaches a GIF link; understate AI in the post text (esp. Bluesky) |
| **dev.to / Hashnode** | GIF inline | drop it under the lede of the syndicated post |

## Optional richer take — two-pane "watch it happen live"

`tmux` session, top pane = the runtime log, bottom pane =
`watch -n1 'git -C ~/oh-cron-demo log --oneline -3; echo; gh pr list -R YOU/oh-cron-demo'`.
More convincing (PR pops in live) but busier — use the single-pane version
for the small README/social GIF, this one for a longer demo video.
