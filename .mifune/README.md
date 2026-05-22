# .mifune/

Tracks skills installed from external registries (github.com/mifunedev/skills).

| File | Purpose |
|------|---------|
| `skills.lock` | Pins commit SHA, checksum, and registry version for each managed skill |

## Managed skills

13 skills in `.claude/skills/` are sourced from `github.com/mifunedev/skills`. Two skills
(`interview`, `render-html`) remain local-only and are not tracked here.

## Update workflow

To sync skills to a newer commit of `mifunedev/skills`:

```bash
# 1. Clone the remote at the new commit
git clone --depth 1 https://github.com/mifunedev/skills.git /tmp/mifunedev-skills
REMOTE_COMMIT=$(git -C /tmp/mifunedev-skills rev-parse HEAD)
REGISTRY_VERSION=$(jq -r '.version' /tmp/mifunedev-skills/registry.json)

# 2. For each managed skill, replace and recompute checksum
SKILLS="agent-browser ci-status delegate harness-audit harness-context post-bridge prd ralph release ship-spec skill-lint strategic-proposal worktrees"
for skill in $SKILLS; do
  rm -rf .claude/skills/$skill
  cp -r /tmp/mifunedev-skills/skills/$skill .claude/skills/$skill
done

# 3. Update .mifune/skills.lock with new commit and checksums, then commit
```

See `context/rules/git.md` for branch and commit conventions.
