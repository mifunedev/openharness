#!/usr/bin/env bash
# tier: A
# source: vet-run/vet integration — public curl|bash examples need review-first alternatives
# desc: Public user-facing curl|bash examples must include a nearby review-first or optional-vet alternative.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

python3 - <<'PY' "$ROOT"
from pathlib import Path
import re
import sys

root = Path(sys.argv[1])
files = [root / "README.md", root / ".oh/scripts/install.sh"]
files += sorted((root / "docs").rglob("*.md"))
files += sorted((root / ".oh/docs/src/pages").rglob("*.tsx"))
files = [p for p in files if p.exists()]

curl_bash = re.compile(r"curl\b.*\|\s*(?:sudo\s+)?(?:bash|sh)\b", re.I)
vet_alt = re.compile(r"\bvet\s+https?://", re.I)
review_words = re.compile(r"\b(review|inspect|read|audit|open it in|editor|pager|less -U|download,? then review|review-first|safer install)\b", re.I)
download_to_file = re.compile(r"curl\b.*(?:-o|--output)\b", re.I)
bash_file = re.compile(r"\bbash\s+[-./A-Za-z0-9_]+\.sh\b", re.I)

violations = []
for path in files:
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    logical = []
    i = 0
    while i < len(lines):
        start = i
        text = lines[i]
        # Join shell continuations and split-pipe examples so multi-line curl pipes are detected.
        while i + 1 < len(lines):
            stripped = text.rstrip()
            if stripped.endswith("\\"):
                text = stripped[:-1] + " " + lines[i + 1].strip()
                i += 1
                continue
            if (not stripped.lstrip().startswith("|")
                and re.search(r"\bcurl\b", text, re.I)
                and re.search(r"\|\s*$", stripped)):
                text = stripped + " " + lines[i + 1].strip()
                i += 1
                continue
            break
        logical.append((start, i, text))
        i += 1

    for start, end, text in logical:
        if not curl_bash.search(text):
            continue
        lo = max(0, start - 8)
        hi = min(len(lines), end + 12)
        window = "\n".join(lines[lo:hi])
        has_vet = bool(vet_alt.search(window))
        has_review_flow = bool(download_to_file.search(window) and bash_file.search(window) and review_words.search(window))
        has_plain_review = bool(review_words.search(window) and re.search(r"download", window, re.I) and re.search(r"bash\s+", window, re.I))
        if not (has_vet or has_review_flow or has_plain_review):
            rel = path.relative_to(root)
            violations.append(f"{rel}:{start + 1}: curl|bash lacks nearby review-first or vet alternative: {text.strip()}")

if violations:
    print("REGRESSION: public curl|bash examples without nearby safer alternative", file=sys.stderr)
    for item in violations:
        print(f"- {item}", file=sys.stderr)
    sys.exit(1)

print(f"PASS: public curl|bash examples have nearby review-first/vet alternatives ({len(files)} files scanned)", file=sys.stderr)
PY
