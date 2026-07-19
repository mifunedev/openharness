# Upstream provenance

- Source: https://github.com/ogulcancelik/herdr/blob/v0.7.4/SKILL.md
- Repository commit: `50aaa2ec046ee26ff407c20f49de496f522512a8`
- Vendored SHA-256: `04b5f99c3c3178d8a7d194be2fbe99796852a8fbd7739346213d15242723ebb9`
- License: AGPL-3.0-or-later or a commercial license — see the vendored `LICENSE.upstream` and https://github.com/ogulcancelik/herdr/blob/v0.7.4/LICENSE

`SKILL.md` is an unmodified upstream work redistributed with its complete license text and source provenance. `SKILL.md` is vendored verbatim from the Herdr version installed by the sandbox image. Update the binary, skill, checksum, integration fixtures, and documentation together in one reviewed dependency-bump PR. Do not replace this with a runtime `npx skills` install; Open Harness exposes the shared `.oh/skills` pack through its provider surfaces and must remain reproducible offline.
