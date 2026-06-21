# .mifune/

Holds the tracked in-repo **skill source of truth** (`skills/`) plus the
lockfile that pins which of those skills are installed from the external
registry (github.com/mifunedev/skills).

| File / dir | Purpose |
|------|---------|
| `skills/` | Tracked source of truth for every agent skill (the shared primitive). Claude, Codex, and Pi expose it through the `.claude/skills`, `.codex/skills`, `.pi/skills` symlinks; Hermes through its runtime `.hermes/skills/openharness` link. |
| `skills.lock` | Pins commit SHA, checksum, and registry version for each registry-managed skill |

## Managed skills

The 15 registry-managed skills tracked in `skills.lock` are sourced from
`github.com/mifunedev/skills` at commit `c559c100` and live under
`.mifune/skills/` alongside the harness-native skills.

## Update workflow

To sync the registry-managed skills to a newer commit of `mifunedev/skills`:

```bash
# 1. Clone the remote at the new commit
git clone --depth 1 https://github.com/mifunedev/skills.git /tmp/mifunedev-skills
REMOTE_COMMIT=$(git -C /tmp/mifunedev-skills rev-parse HEAD)
REGISTRY_VERSION=$(jq -r '.version' /tmp/mifunedev-skills/registry.json)

# 2. For each managed skill, replace and recompute checksum
SKILLS="agent-browser ci-status delegate harness-audit harness-context interview post-bridge prd ralph release render-html ship-spec skill-lint strategic-proposal worktrees"
for skill in $SKILLS; do
  rm -rf .mifune/skills/$skill
  cp -r /tmp/mifunedev-skills/skills/$skill .mifune/skills/$skill
done

# 3. Restore argument-hint fields (harness-specific, not in upstream SKILL.md)
# 4. Update .mifune/skills.lock with new commit and checksums, then commit
```

See `context/rules/git.md` for branch and commit conventions.
