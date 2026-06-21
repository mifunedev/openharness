# Compose Wrapper Source Snapshot — 2026-06-20

Source files captured for `wiki/compose-wrapper.md` after implementing issue #470.

- `scripts/docker-compose.sh` lines 49-54 define `harness.yaml`, persistent `.devcontainer/.harness.yaml.env`, and temp-state variables.
- `scripts/docker-compose.sh` lines 89-110 classify read-like invocations (`--print-argv` or `config`) and choose temporary vs persistent harness env files.
- `scripts/docker-compose.sh` lines 137-147 print diagnostic argv, run temp-env compose without `exec` so cleanup traps run, and keep lifecycle `exec docker compose` behavior.
- `scripts/__tests__/compose-args.test.ts` lines 62-84 prove `--print-argv` uses a temporary env file and does not create the persistent file.
- `scripts/__tests__/compose-args.test.ts` lines 128-156 prove lifecycle commands persist `.harness.yaml.env` while `config --quiet` preserves existing persistent state.
