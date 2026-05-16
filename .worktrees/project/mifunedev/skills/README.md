# mifunedev/skills

A portable, cross-agent skill library. Each skill is a plain folder containing a `SKILL.md` file that conforms to the [Agent Skills specification](https://agentskills.io/specification). The installer copies the folder to your project — no daemon, no runtime, no build step.

---

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/mifunedev/skills/main/scripts/install.sh | bash -s -- install <skill-name> --scope project
```

The `| bash -s --` pattern sends the downloaded script to bash. Everything after `--` is passed as arguments to the script itself, not to bash.

> **NOTE:** The GitHub raw URL above becomes live only after the one-time manual push of this repository to `mifunedev/skills` on GitHub. That push is out of V0 scope. Until then, run `scripts/install.sh` directly from a local clone.

**Options:**

| Flag | Default | Purpose |
|------|---------|---------|
| `--scope project` | project | Install into the current git repo (`.claude/skills/` and `.agents/skills/`) |
| `--client agents\|claude\|harness` | agents | Target client destination |

---

## Skill catalog

| Skill | Category | Trigger phrases | Requires |
|-------|----------|-----------------|----------|
| `open-harness-review` | open-harness | "audit the harness", "review harness health", "what should we fix" | `gh`, `git` |
| `docker-sandbox-debug` | dev-workflow | "container won't start", "port already in use", "bind mount empty" | `docker` |
| `github-prd` | dev-workflow | "create a prd", "plan this feature", "requirements for", "spec out" | `gh` |

---

## Add a skill

Adding a new skill should take <10 minutes.

1. Create the skill folder: `mkdir skills/<name>` (lowercase, hyphens, ≤ 64 chars).
2. Copy the template: `cp template/SKILL.md skills/<name>/SKILL.md`.
3. Fill in the `SKILL.md` frontmatter: set `name`, `description`, `license`, and `metadata.mifune.version`.
4. Write the skill body below the frontmatter — imperative instructions the agent follows step by step.
5. Compute the checksum from the repo root: `find skills/<name> -type f -not -path '*/.*' | LC_ALL=C sort | xargs sha256sum | sha256sum | cut -d' ' -f1`.
6. Add an entry to `registry.json` under `skills[]` with `name`, `path`, `version`, `checksum` (prefix with `sha256:`), and `description`.
7. Verify the checksum matches: see `docs/checksum.md` for the full algorithm and a worked example.
8. Commit both the new `skills/<name>/` folder and the updated `registry.json` in the same commit.

---

## Layout

```
registry.json          skill index (name, version, checksum per entry)
skills/                one subfolder per published skill
  <name>/
    SKILL.md           required — frontmatter + instructions
    README.md          recommended — human description
    scripts/           optional — executables the skill invokes
    references/        optional — docs loaded on demand
    assets/            optional — templates, schemas, sample data
    tests/             optional — smoke tests for scripts
scripts/               installer and supporting tooling
  install.sh           curl-pipeable installer
docs/
  checksum.md          checksum algorithm + verification steps
template/              boilerplate copied when scaffolding a new skill
```

---

## License

Apache-2.0. See [LICENSE](LICENSE).
