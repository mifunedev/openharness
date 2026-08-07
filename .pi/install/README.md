# Pi installation assets

Repository-owned assets for optional Pi integrations live here. They are not
auto-loaded as Pi extensions.

| File | Purpose |
| --- | --- |
| `install-langfuse.sh` | Install the reviewed optional `pi-langfuse` release in user scope, apply the shutdown patch and patched OpenTelemetry override, and require a clean npm audit. |
| `patch-langfuse-shutdown.mjs` | Apply the version- and reviewed-shutdown-branch-gated local patch that classifies the package's own bounded shutdown `AbortError`. |
| `slack-manifest.json` | Slack application manifest used by the Pi messenger bridge setup, including Socket Mode event subscriptions and admin slash command declarations. |
