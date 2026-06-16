---
title: "vet-run/vet"
slug: vet-run-vet
tags: [security, shell, installer, curl-bash, devtools, openharness]
created: 2026-06-15
updated: 2026-06-15
sources:
  - raw/2026-06-15-vet-run-vet.md
related: [hermes-agent, inspectable-agent-harness]
confidence: provisional
---

# vet-run/vet

## Summary
`vet` is a Bash CLI that makes remote shell-script execution inspectable: fetch, diff against the last successful run, optionally ShellCheck, preview, then require explicit approval before `bash` executes the temporary file. For OpenHarness, its best value is not as a mandatory dependency but as a pattern and optional documented safer path for every public `curl | bash` installer.

## Detail
`vet-run/vet` (MIT; v1.0.2 latest as of the 2026-06-15 snapshot; ~1,045 GitHub stars) targets the exact risk in one-line installers: the operator pipes unaudited network bytes directly into a shell. Its implementation is intentionally small: choose `curl`/`wget`, download to a temp file, hash the URL into `~/.cache/vet/<sha>.sh`, diff the new download against the cached prior successful run, run `shellcheck` if available, optionally preview with `bat`/`less`, and execute only after a yes prompt. It caches only successful executions and preserves the remote script's exit code. Tests cover help, first-run cache, changed-script diff, ShellCheck warning, `--force`, argument passthrough, nonzero exits, and empty downloads.

OpenHarness currently contains public `curl | bash` examples in `README.md`, docs quickstart/installation, the website landing page, and `scripts/install.sh` usage; it also documents a third-party Grok CLI installer using `curl | bash`. The integration should be measured with an eval/probe: count public `curl | bash` occurrences and require a nearby safe alternative. Suggested target: 0 unpaired public one-liners, while keeping the one-liner for conversion-friendly quickstart copy.

Best approach:
1. Keep Docker as the only required OpenHarness host dependency; do not require `vet`.
2. Add an optional "safer install" line beside quickstarts: `vet https://oh.mifune.dev/install.sh` or the dependency-free equivalent `curl -fsSL -o openharness-install.sh ... && less -U openharness-install.sh && bash openharness-install.sh`.
3. Update agent/PR-review guidance so third-party installers are fetched and reviewed, or run through `vet`, before use.
4. Quantify adoption with a probe that fails only when `curl | bash` lacks an adjacent review/vet alternative.

Judgment: high conceptual fit (9/10) for harness security posture, medium direct dependency fit (5/10), high documentation/probe fit (8/10). Limitation: `vet --force` restores blind execution, and ShellCheck/previews are optional.

## See Also
- [[hermes-agent]]
- [[inspectable-agent-harness]]
