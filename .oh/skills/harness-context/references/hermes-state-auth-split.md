# Hermes runtime and auth in Open Harness

Hermes keeps configuration, sessions, skills, memory, and `auth.json` in one home.

- `.devcontainer/Dockerfile` sets `HERMES_HOME=/home/sandbox/harness/.hermes`.
- `.oh/cli/src/commands/harness.ts` sets the same target-local home before installation.
- `.oh/scripts/link-providers.sh` owns the additive `skills/openharness` link to `.oh/skills`. Installation reconciles it immediately; boot reuses that implementation.
- Native and user skills remain beside the shared link. Foreign links, occupied slots, linked parents, and conflicting managed homes produce errors without replacement.
- `.hermes/` runtime contents are gitignored. No separate auth volume or cross-device auth symlink is supported.
- `.devcontainer/entrypoint.sh` retains legacy auth-link repair. The correction does not broadly migrate existing homes.
- `.oh/install/banner.sh` reads project-local `auth.json` for authentication status.

Image-only state resides in the home volume. Checkout-backed state resides in the
checkout bind. Restart preserves either storage location. Volume deletion removes
image-only state. Volume deletion does not delete a separately bound checkout.

## Auth atomicity

Hermes writes a temporary file beside `auth.json`, then atomically replaces the
destination. A cross-device auth symlink redirects the destination to a different
filesystem and can cause `EXDEV`. Keep the destination and temporary file on one
filesystem. Never use real credentials as a write-test fixture.

## Verification

Inside a disposable `oh-hermes-*` sandbox with Hermes installed:

```bash
OH_HERMES_SMOKE=1 bash .oh/scripts/hermes-install-smoke.sh
```

The opt-in smoke scenario checks the upstream home resolver, real skill listing and
reading, native skill creation, canonical content hashes, and atomic replacement of
a synthetic file. The smoke scenario does not touch `auth.json` or invoke a model. Shared-link reads
can produce an upstream trust warning; the warning does not imply failed discovery.

For an existing container, updating the CLI alone does not update image environment.
Recreate from the corrected image with storage retained. Choose between populated
legacy and project homes explicitly; do not merge them automatically.
