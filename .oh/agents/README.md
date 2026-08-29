# Agents

Provider-portable agent definitions live here as `<name>.md` files. This is the
canonical source; `.claude/agents` and `.codex/agents` are compatibility
symlinks that resolve into this directory.

No agent is defined at present. Add one by writing `<name>.md` here — never in a
provider mirror, which `.oh/scripts/link-providers.sh` can rewrite.
