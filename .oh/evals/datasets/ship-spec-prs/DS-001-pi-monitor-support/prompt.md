# Trajectory input

## feat: add default Pi monitor support

Add default Pi Monitor support through the upstream Pi package `@trevonistrevon/pi-loop`.

Source: https://pi.dev/packages/@trevonistrevon/pi-loop?name=monitor

Plan:
- Pin `npm:@trevonistrevon/pi-loop@0.5.5` in `.pi/settings.json` and the Pi settings regression test.
- Document `/loop`, `Loop*`, and `Monitor*` usage in `docs/harnesses/pi.md`, with Monitor as the primary reason for adding the package.
- Treat `.pi/loops/` runtime state as local, gitignored session/project state; keep `PI_LOOP_SCOPE=session` as the default.
- Add wiki provenance for the package and regenerate `wiki/README.md`.
- Update `CHANGELOG.md` and run the relevant tests/eval gate.
