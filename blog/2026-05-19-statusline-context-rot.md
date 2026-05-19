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

## The 30-second fix

Drop this at `~/.claude/bin/statusline.sh`:

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

`chmod +x` it, then in Claude Code: `/statusline` → point it at the script. Or set it directly in `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/bin/statusline.sh"
  }
}
```

You now see, in real time:

```
Claude Opus 4.7 | ~/repo @feat/foo | ctx 67% | 5h 23%
```

The `ctx` number is the one that matters. When it goes red, you `/compact` or hand off — **before** the next response degrades, not after.

## Why this punches above its weight

**Loss-avoidance compounds.** Every loop you abandon before context rot saves a `/clear` + re-prime cycle. Over a week that's hours, not minutes.

**Rate-limit visibility kills surprise.** "5h 23%" means rip another loop. "5h 91%" means stop starting work you can't finish. Decisions you used to make blind, you now make on a number.

The whole thing is one shell script. It took me longer to pick the colors than to write it.

If you've been running Ralph loops or any multi-session agent work without a statusline, you're driving with the speedometer covered up. Uncover it.
