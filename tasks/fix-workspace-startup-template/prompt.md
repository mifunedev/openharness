# Ralph / Delegate Prompt

Implement issue #120 on the existing PR #122: remove the stale `workspace/startup.sh` auto-start hook instead of hardening it. Delete the script and obsolete test, remove the entrypoint invocation, update workspace/harness-audit guidance, adjust the boot-lint CI/eval guard so it no longer expects a workspace shell script, update changelog/task artifacts, and validate with local tests plus `/eval`.
