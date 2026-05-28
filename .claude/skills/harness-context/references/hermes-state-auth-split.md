# Hermes runtime/auth split in Open Harness

When wiring Hermes into the sandbox, keep the default runtime home project-local while auth remains home-scoped:

- Set `HERMES_HOME=/home/sandbox/harness/.hermes` in `.devcontainer/docker-compose.yml`.
- Keep the `hermes-auth` named volume mounted at `/home/sandbox/.hermes`.
- In `.devcontainer/entrypoint.sh`, create both directories and link `~/harness/.hermes/auth.json` to `~/.hermes/auth.json` so Hermes can use `HERMES_HOME` without storing credentials in the bind-mounted checkout.
- Seed `~/harness/.hermes/config.yaml` with `skills.external_dirs: ["/home/sandbox/harness/.claude/skills"]` so Hermes loads the harness' in-repo skills by default; preserve existing user config and only add the path when absent.
- If a real project-local `auth.json` already exists, migrate it to `~/.hermes/auth.json` when the auth volume has none; otherwise back it up before creating the symlink.
- `install/banner.sh` should report authentication from `~/.hermes/auth.json`, not from generated config files under `HERMES_HOME`.
- `.gitignore` should ignore `.hermes/*` and only allow `.hermes/README.md`.
- Docs/changelog/wiki should consistently say: runtime state defaults to `~/harness/.hermes`; auth lives at `~/.hermes`.

Useful verification:

```bash
bash -n .devcontainer/entrypoint.sh install/banner.sh
git diff --check
docker compose -f .devcontainer/docker-compose.yml config >/tmp/openharness-compose-config.yml
grep -A20 -B5 'HERMES_HOME' /tmp/openharness-compose-config.yml
grep -n 'hermes-auth' /tmp/openharness-compose-config.yml
```
