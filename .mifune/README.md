# .mifune/

Tracks skills installed from external registries (github.com/mifunedev/skills).

| File | Purpose |
|------|---------|
| `skills.lock` | Pins commit SHA, checksum, and registry version for each managed skill |

## Managed skills

All 15 skills in `.claude/skills/` are sourced from `github.com/mifunedev/skills` and tracked
in `skills.lock` at commit `c559c100`.

## Update workflow

To sync skills to a newer commit of `mifunedev/skills`:

```bash
# 1. Clone the remote at the new commit
git clone --depth 1 https://github.com/mifunedev/skills.git /tmp/mifunedev-skills
REMOTE_COMMIT=$(git -C /tmp/mifunedev-skills rev-parse HEAD)
REGISTRY_VERSION=$(jq -r '.version' /tmp/mifunedev-skills/registry.json)

# 2. For each managed skill, replace and recompute checksum
SKILLS="agent-browser ci-status delegate harness-audit harness-context interview post-bridge prd ralph release render-html ship-spec skill-lint strategic-proposal worktrees"
for skill in $SKILLS; do
  rm -rf .claude/skills/$skill
  cp -r /tmp/mifunedev-skills/skills/$skill .claude/skills/$skill
done

# 3. Restore argument-hint fields (harness-specific, not in upstream SKILL.md)
# 4. Update .mifune/skills.lock with new commit and checksums, then commit
```

See `context/rules/git.md` for branch and commit conventions.
