---
title: "Claude Code hides your context window. /statusline is the fix."
description: "If you've heard of Ralph loops you already know context rot. Claude Code hides the gauge by default — /statusline is the 30-second fix."
date: 2026-05-19
authors: [ryan]
tags: [claude-code, productivity, agents]
---

# Claude Code hides your context window. /statusline is the fix.

If you know what a Ralph loop is, you already know the punchline: **context rot is the silent productivity killer**. Doesn't matter how good the model is — once the working window fills past ~70%, output quality drops off a cliff. You've already lost half the session by the time you notice the regression.

So here's the part nobody mentions: **Claude Code does not show context usage by default.**

You can be 90% through your window in the middle of a hot loop and the terminal will not flinch. Your next response is mush, you blame the model, you `/clear`, and you've lost the thread. Meanwhile every byte of context awareness you needed was sitting on stdin, waiting for a script to render it.

That script is `/statusline`.

<!-- truncate -->

## What `/statusline` actually does

`/statusline` wires a shell command into the bottom of the Claude Code TUI. Claude pipes a JSON blob to your script every refresh; your script prints one line; that line is the status bar.

The JSON is generous. The fields that matter:

```jsonc
{
  "model": { "display_name": "Claude Opus 4.7" },
  "workspace": {
    "current_dir": "/home/me/repo",
    "git_worktree": "feat/foo"
  },
  "context_window": {
    "used_percentage": 67,        // pre-calculated for you
    "remaining_percentage": 33,
    "context_window_size": 200000
  },
  "rate_limits": {
    "five_hour": { "used_percentage": 23, "resets_at": 1736900000 },
    "seven_day": { "used_percentage": 41, "resets_at": 1737340000 }
  }
}
```

`context_window.used_percentage` is the one Claude Code hides from you. It is the gauge you've been driving without.

## Three sizes — pick the smallest that works

### Tiny: one line, just the gauge

Paste this into `~/.claude/settings.json`. No script file, no PATH, nothing to chmod:

```json
{
  "statusLine": {
    "type": "command",
    "command": "printf 'ctx %s%%' $(jq -r '.context_window.used_percentage // 0')"
  }
}
```

Reload Claude Code. You now see `ctx 67%` at the bottom of the TUI. Ten seconds.

Want the 5-hour gauge too? Same shape:

```json
"command": "jq -r '\"ctx \\(.context_window.used_percentage // 0)% | 5h \\(.rate_limits.five_hour.used_percentage // 0)%\"'"
```

(The `\\(` is JSON escaping the backslash; jq sees `\(...)`.)

### Lazy: describe it, let Claude write it

`/statusline` is itself a slash command that **accepts a natural-language prompt**:

```
/statusline show ctx in red above 70%, plus 5h rate-limit and current worktree
```

Claude Code spawns a `statusline-setup` sub-agent. It writes the script, drops it on your PATH, and edits `settings.json`. You describe the bar; it generates the bash. No jq manual.

This is the one to share with teammates who don't want to read this post.

### Full: the colour-coded script

When you outgrow the one-liner, drop this at `~/.claude/bin/statusline.sh`:

```bash
#!/usr/bin/env bash
JSON=$(cat)

MODEL=$(jq -r '.model.display_name'                              <<<"$JSON")
DIR=$(jq -r   '.workspace.current_dir | sub("^"+env.HOME; "~")'  <<<"$JSON")
WT=$(jq -r    '.workspace.git_worktree // ""'                    <<<"$JSON")
CTX=$(jq -r   '.context_window.used_percentage // 0'             <<<"$JSON")
RL5=$(jq -r   '.rate_limits.five_hour.used_percentage // empty'  <<<"$JSON")

# Green < 50, yellow < 75, red beyond.
C=$'\e[32m'; (( CTX > 50 )) && C=$'\e[33m'; (( CTX > 75 )) && C=$'\e[31m'
R=$'\e[0m'

printf "%s | %s%s | ctx %s%d%%%s" \
  "$MODEL" "$DIR" "${WT:+ @${WT}}" "$C" "$CTX" "$R"
[ -n "$RL5" ] && printf " | 5h %s%%" "$RL5"
```

`chmod +x`, then point `/statusline` at it (or set the `command` directly in `settings.json`). You now see, in real time:

```
Claude Opus 4.7 | ~/repo @feat/foo | ctx 67% | 5h 23%
```

The `ctx` number is the one that matters. When it goes red, you `/compact` or hand off — **before** the next response degrades, not after.

## Beyond `ctx`: fields worth a slot

The statusline JSON ships more than the context gauge. Pick what matches the mistakes you keep making — then prompt `/statusline` to add it.

| Field | The mistake it prevents |
|-------|------------------------|
| `model.display_name` | You `/model` mid-session and forget you swapped down to Haiku |
| `workspace.git_worktree` | You edit on the wrong branch because every worktree looks the same |
| `output_style.name` | You left "Explanatory" on after one experiment; every response is bloated |
| `rate_limits.seven_day.used_percentage` | You start a Friday-night marathon at 88% weekly burn |
| `context_window.current_usage.cache_read_input_tokens` | Cache hit rate cratered after `/clear` — you're paying full price for context you already had |
| `workspace.added_dirs` | `/add-dir` left scope attached you forgot about |
| `version` | You're on an old Claude Code; the field you want shipped two releases ago |

Rule of thumb: anything you've ever guessed wrong about — *which model is this? which worktree? am I still in Learning mode?* — deserves a slot. The cost is one more `jq` line; the saving is one more session you don't burn finding out the hard way.

## Why this punches above its weight

**Loss-avoidance compounds.** Every loop you abandon before context rot saves a `/clear` + re-prime cycle. Over a week that's hours, not minutes.

**Rate-limit visibility kills surprise.** "5h 23%" means rip another loop. "5h 91%" means stop starting work you can't finish. Decisions you used to make blind, you now make on a number.

The whole thing is one shell script. It took me longer to pick the colors than to write it.

If you've been running Ralph loops or any multi-session agent work without a statusline, you're driving with the speedometer covered up. Uncover it.
