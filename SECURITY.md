# Security Policy

Open Harness is an AI-agent sandbox orchestrator. Its security posture spans
two surfaces: the **orchestrator/harness** code and tooling in this
repository, and the **sandboxed agent environment** it provisions.

## Supported Versions

Open Harness ships on a rolling [CalVer](https://calver.org/) line
(`YYYY.M.D`, with a `-N` suffix for additional same-day releases). Only the
**most recent release** receives security updates — there are no long-term
support branches.

| Version | Supported |
| ------- | --------- |
| Latest release (`main`) | :white_check_mark: |
| `development` (integration branch) | :white_check_mark: |
| Any older tagged release | :x: |

`development` is the integration branch where fixes land first; a release
promotes `development` into `main` and tags it. Run the latest release to
stay covered.

## Reporting a Vulnerability

**Please do not open a public issue for a security vulnerability.**

Report it privately through one of:

- The repository's **Security → Report a vulnerability** tab (GitHub private
  vulnerability reporting), when available.
- A private maintainer contact channel listed on the repository owner profile,
  with `SECURITY` in the subject line.

Please include where you can:

- the affected component (harness script, devcontainer, skill, dependency, …);
- the version or commit, reproduction steps, and impact;
- any suggested remediation.

**What to expect:**

- Acknowledgement within **3 business days**.
- A triage decision (accepted / needs-info / declined) with a severity
  assessment once the report is reproduced.
- For accepted reports: a fix on `development`, a coordinated disclosure
  timeline, and credit in the release notes unless you prefer to remain
  anonymous.

## Automated Hardening

Continuous tooling keeps routine issues from reaching a release:

- **Dependabot** — dependency vulnerability alerts and version-update PRs.
  Critical and high alerts are prioritized; transitive-dependency advisories
  that an upstream patch cannot yet reach through the dependency range are
  resolved with `pnpm.overrides` plus a lockfile regeneration.
- **GitGuardian** — secret scanning on every push and pull request.
- **boot-lint** — `shellcheck` and `hadolint` gates on the devcontainer boot
  path and `Dockerfile`, so a broken or unsafe boot path cannot merge green.

## Sandbox Trust Boundary

The sandbox container is the trust boundary. The orchestrator never reads
`.env*` files and never executes application code at the repository root —
all agent workloads run inside the provisioned sandbox. Secrets belong in
environment files or a vault, never in tracked files, memory, or commit
messages.
