# Skill Checksum Algorithm

Every entry in `registry.json` carries a `checksum` field that uniquely
identifies the contents of a skill folder at the time of registration.
This document specifies the algorithm verbatim so that any tool — CI,
the CLI, or a manual audit — can reproduce and verify the value.

## Algorithm

Run the following command from the **repository root** (the directory
containing `registry.json`):

```bash
find skills/<name> -type f -not -path '*/.*' | LC_ALL=C sort | xargs sha256sum | sha256sum | cut -d' ' -f1
```

Replace `<name>` with the skill folder name (e.g. `open-harness-review`).

### Step-by-step breakdown

| Step | Command fragment | Purpose |
|------|-----------------|---------|
| 1 | `find skills/<name> -type f -not -path '*/.*'` | List every non-hidden file in the skill folder recursively |
| 2 | `LC_ALL=C sort` | Sort paths in byte order — locale-independent, reproducible across machines |
| 3 | `xargs sha256sum` | Hash each file individually; output is `<hash>  <path>` per line |
| 4 | `sha256sum` | Hash the concatenated list of `<hash>  <path>` lines — a hash-of-hashes |
| 5 | `cut -d' ' -f1` | Extract only the hex digest, discard the `-` filename |

The value stored in `registry.json` is prefixed with `sha256:`:

```
"checksum": "sha256:<64-char-hex-digest>"
```

## Worked Example

Computing the checksum for `skills/github-prd` (V0 seed, 2026-05-16):

```bash
cd /path/to/mifunedev/skills
find skills/github-prd -type f -not -path '*/.*' | LC_ALL=C sort | xargs sha256sum | sha256sum | cut -d' ' -f1
# Output: c449e9fcd084a7d68b4fdddec0d624efe5863f8ee52c4e2041400813ce8f45ec
```

The stored checksum is:

```
sha256:c449e9fcd084a7d68b4fdddec0d624efe5863f8ee52c4e2041400813ce8f45ec
```

## Verification

To verify a locally installed skill has not drifted from the registry:

```bash
SKILL=open-harness-review
EXPECTED=$(jq -r '.skills[] | select(.name == "'$SKILL'") | .checksum' registry.json | sed 's/sha256://')
ACTUAL=$(find skills/$SKILL -type f -not -path '*/.*' | LC_ALL=C sort | xargs sha256sum | sha256sum | cut -d' ' -f1)
[ "$ACTUAL" = "$EXPECTED" ] && echo "OK" || echo "DRIFT DETECTED"
```

## V1 Notes

In V1, `scripts/publish-registry.sh` will run this algorithm automatically
for every skill folder and write the result into `registry.json`. The CI
workflow `registry.yml` will then verify that the committed file matches
the regenerated output, failing the build on drift. For V0, checksums are
computed manually and hand-written.
