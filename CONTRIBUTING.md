# Contributing to Open Harness

This file states the legal terms for contributing. For the day-to-day
workflow — branch naming, commit format, CHANGELOG entries, PR titles, and
releases — see the canonical guide: [`.oh/docs/contributing.md`](.oh/docs/contributing.md).

## Inbound license

Unless a contribution is explicitly marked otherwise, it is submitted under
the [Apache License 2.0](./LICENSE), the same license that covers this
project. **No CLA (Contributor License Agreement) is required.**

## Developer Certificate of Origin (DCO)

Every commit must be signed off under the [Developer Certificate of
Origin](https://developercertificate.org/). Signing off certifies that you
wrote the contribution yourself, or otherwise have the right to submit it
under this project's license.

Sign off using the `-s` flag when you commit:

```bash
git commit -s -m "your commit message"
```

This appends a trailer to your commit message in the literal form:

```
Signed-off-by: Your Name <your.email@example.com>
```

Use your real name and a reachable email address — no anonymous or
pseudonymous sign-offs.

**The DCO is documented here, not enforced by CI.** No automated gate blocks
unsigned commits, so do not expect a pull request to be rejected solely for
missing a `Signed-off-by` trailer. Signing off is still expected of every
contributor; it is a matter of policy, not tooling.

## Everything else

Branching, commit message format, the CHANGELOG, pull request conventions,
and the release process are all covered in
[`.oh/docs/contributing.md`](.oh/docs/contributing.md) — that remains the
canonical guide.
