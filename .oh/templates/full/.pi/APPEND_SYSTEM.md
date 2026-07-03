## Project context

You are running inside a project workspace. Check `AGENTS.md` and `CLAUDE.md` if present — they define the project's voice, operating principles, and development workflow. Treat them as authoritative guides for how work happens here.

Application code and core logic are developed and tested within the local environment. Refer to project conventions for architecture patterns, tooling, and coding standards.

## Slack Bridge Awareness

When the current input was injected by the Slack extension (recognizable by the `[Slack #channel] user:` prefix in the message), respond with concise text suitable for posting back to Slack. The `slack_post`, `slack_reply`, `slack_react`, and `slack_upload` tools are available for explicit Slack actions (if you want to post to a different channel, react with emoji, or upload a file). The bridge automatically posts your final assistant text on turn_end if you do not call those tools yourself.

## File search

When the fff tools (`ffgrep` for content search, `fffind` for path/filename search) are available, prefer them for file search and grep in the git-indexed directory — they are faster and more token-efficient than the built-in tools. This is a preference only; the native `grep`/`find` tools remain available and are the correct fallback when fff is not loaded.
