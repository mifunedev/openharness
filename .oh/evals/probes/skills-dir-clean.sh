#!/usr/bin/env bash
# tier: A
# source: conversation 2026-06-29 — Pi parses every top-level `.md` in the skills
#         scan dir (`./skills`, a symlink into `.oh/skills`) as a single-file skill;
#         a loose README.md/LICENSE carried in from the .mifune absorption had no
#         `description:` frontmatter, so Pi failed skill loading with
#         "[Skill conflicts] ... description is required".
# desc: the skills scan dir holds ONLY skill subdirectories (+ any valid single-file
#       skill that has a `description:` frontmatter); no loose non-skill files
#       (README.md, LICENSE, …) at its top level that a provider would mis-load
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILLS="$ROOT/.oh/skills"

fail() {
  echo "REGRESSION: $*" >&2
  exit 1
}

[ -d "$SKILLS" ] || fail ".oh/skills is missing"

# Inspect every TOP-LEVEL entry. Directories are skills; the only files allowed are
# single-file skills, which Pi requires to carry a `description:` in frontmatter.
while IFS= read -r -d '' entry; do
  base="$(basename "$entry")"
  if [[ "$base" == *.md ]]; then
    # A top-level .md is a single-file skill — it MUST have a description.
    # Read the leading YAML frontmatter (between the first pair of `---` fences).
    fm="$(awk 'NR==1 && $0!="---"{exit} NR==1{next} /^---[[:space:]]*$/{exit} {print}' "$entry")"
    if ! grep -qE '^description:[[:space:]]*\S' <<<"$fm"; then
      fail "top-level skills file $base has no \`description:\` frontmatter — Pi loads it as a malformed single-file skill (\"description is required\"). Move non-skill docs out of .oh/skills/."
    fi
  else
    fail "non-skill file at the skills scan-dir root: .oh/skills/$base — providers (Pi) mis-load loose files here. Keep .oh/skills/ to skill subdirs only."
  fi
done < <(find "$SKILLS" -maxdepth 1 -mindepth 1 -type f -print0)

echo "PASS: .oh/skills/ top level is clean — only skill subdirs (no loose README/LICENSE/desc-less .md a provider would mis-load)" >&2
exit 0
