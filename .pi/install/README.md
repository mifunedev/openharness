# Pi installation assets

Repository-owned assets for optional Pi integrations live here. They are not
auto-loaded as Pi extensions.

| File | Purpose |
| --- | --- |
| `install-langfuse.sh` | Install the reviewed pi-langfuse fork commit in user scope, preserve the patched OpenTelemetry override, register the package with Pi, and require a clean npm audit. |
| `slack-manifest.json` | Slack application manifest used by the Pi messenger bridge setup, including Socket Mode event subscriptions and admin slash command declarations. |

## Interim pi-langfuse source

The installer pins `ryaneggz/pi-langfuse` to the full commit that contains the
upstream fix PR ([#14](https://github.com/gooyoung/pi-langfuse/pull/14)). It
installs that Git source through the user-scoped npm root, then registers the
installed path with Pi. The package lock is checked against the exact commit
before Pi is allowed to load it.

This fork pin is intentional while the upstream PR is reviewed and released.
When upstream merges and publishes the fix, update the installer pin in one
migration change and remove this interim source note; do not silently switch a
user's telemetry package to a moving branch.
