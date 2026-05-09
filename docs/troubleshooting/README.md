# Troubleshooting

Reactive recipes — diagnose-and-workaround guides for failures whose cause isn't obvious from the surface symptom. Reach for these when something is broken; for routine procedures see `docs/operations/`.

## Recipes

- [`npx-silent-install-failure.md`](./npx-silent-install-failure.md) — `npx <pkg>` exits non-zero with empty stdout/stderr; usually a native-dep install hook that npm/npx swallowed.

## Conventions

- One recipe per failure mode, named `<kebab-case-symptom>.md`.
- Each recipe follows the canonical six-section structure: **Symptoms / Diagnose / Confirm / Causes / Workarounds / Example**. Symptoms first so a user can confirm they're in the right doc within seconds.
- Recipes are generic; cite specific instances under **Example** with a link to the topic memory note (`memory/<topic>.md`) or upstream issue, not by inlining incident detail.

See `context/rules/directory-readme.md` for the directory-README convention this file follows.
