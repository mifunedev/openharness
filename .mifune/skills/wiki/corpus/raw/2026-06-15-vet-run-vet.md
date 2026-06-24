# Source: https://github.com/vet-run/vet

Repository metadata fetched 2026-06-15 UTC via `gh repo view vet-run/vet`:

```json
{"createdAt":"2025-06-25T06:57:54Z","defaultBranchRef":{"name":"main"},"description":"vet is a command-line tool that acts as a safety net for the risky curl | bash pattern. It lets you inspect, diff against previous versions, and lint remote scripts before asking for your explicit approval to execute. Promoting a safer, more transparent way to handle remote code execution.","forkCount":21,"homepageUrl":"https://getvet.sh","licenseInfo":{"key":"mit","name":"MIT License"},"nameWithOwner":"vet-run/vet","pushedAt":"2025-08-20T15:46:48Z","repositoryTopics":["bash","cli","command-line","curl","developer-tools","devops-tools","security","security-hardening","shell","shell-script","shellcheck","sysadmin-tools","vet","wget","pipe-security"],"stargazerCount":1045,"updatedAt":"2026-06-15T08:20:14Z","url":"https://github.com/vet-run/vet"}
```

Latest release fetched via GitHub API:

```json
{"tag":"v1.0.2","name":"Release v1.0.2","published":"2025-07-25T18:51:03Z","assets":["install.sh","vet"]}
```

Repository tree excerpt:

```text
.github/workflows/ci.yml
README.md
scripts/install.sh
src/index.js
tests/vet.bats
vet
```

README summary:

`vet` is a command-line tool for the common but risky `curl | bash` pattern. It downloads a remote script, diffs it against the previous cached version, optionally runs ShellCheck, displays the script for review, and asks for explicit approval before executing it. It supports `vet <URL> [SCRIPT_ARGUMENTS...]` and `vet --force <URL>` for trusted automation. Installation options include Homebrew (`brew tap vet-run/vet && brew install vet-run`), AUR packages, and a manual "Download, then Review" install path.

Implementation excerpt from `vet` v1.0.2:

```bash
set -euo pipefail
readonly CACHE_DIR="${HOME}/.cache/${APP_NAME}"
# downloader: curl -fsSL -o or wget -qO
CACHE_FILE_ID=$(echo -n "$URL" | sha256sum | awk '{print $1}')
CACHE_FILE_PATH="${CACHE_DIR}/${CACHE_FILE_ID}.sh"
# If cache exists, diff previous vs downloaded script.
# If shellcheck exists, run shellcheck "$TMPFILE".
# Interactive mode can preview with bat/batcat or less -U.
# Execute only after approval: bash "$TMPFILE" "${SCRIPT_ARGS[@]}"
# Cache only on successful execution.
```

Test coverage excerpt:

```text
- help output
- first-time run and cache
- changed script diff path
- shellcheck warning path
- --force prompt bypass
- argument passthrough
- failing script exit-code propagation
- empty download failure
```

OpenHarness local `curl | bash` occurrence scan, 2026-06-15:

```text
README.md: curl -fsSL https://oh.mifune.dev/install.sh | bash
docs/installation.md: curl -fsSL https://oh.mifune.dev/install.sh | bash
docs/quickstart.md: curl -fsSL https://oh.mifune.dev/install.sh | bash
docs/harnesses/grok-build.md: curl -fsSL https://x.ai/cli/install.sh | bash -s 0.2.39
packages/docs/src/pages/index.tsx: curl -fsSL https://oh.mifune.dev/install.sh | bash
scripts/install.sh usage/examples: curl -fsSL https://oh.mifune.dev/install.sh | bash [-s -- <flags>]
memory/MEMORY.md already records: fetch and read third-party curl|bash installers before re-implementing or running them.
```

Judgment for OpenHarness integration:

- Do not make `vet` a hard host dependency; OpenHarness currently advertises Docker as the only host dependency.
- Good integration: document a safer optional install path next to one-liners, e.g. `vet https://oh.mifune.dev/install.sh` or `curl -fsSL -o install.sh ... && less -U install.sh && bash install.sh`.
- Good integration: in agent skills and PR review guardrails, treat third-party `curl | bash` as requiring fetch-review-run or vet-style inspection.
- Good integration: add an eval/probe that quantifies unpaired `curl | bash` examples and requires each public one-liner to have a nearby safe-review alternative.
- Main limitation: `vet --force` collapses back toward blind execution; ShellCheck and bat are optional; it only helps shell scripts and interactive human workflows.
