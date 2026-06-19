# Ralph prompt — keep-slack-tokens-out-of

Implement tasks/keep-slack-tokens-out-of/prd.json on branch feat/461-keep-slack-tokens-out-of for issue #461.

Read:
- tasks/keep-slack-tokens-out-of/prd.md
- tasks/keep-slack-tokens-out-of/prd.json
- tasks/keep-slack-tokens-out-of/critique.md
- tasks/keep-slack-tokens-out-of/progress.txt

Rules:
- Harness-infra only.
- Preserve client-slack behavior while keeping Slack token values out of tmux argv.
- Run the entrypoint test and wiki index probe before completion.
