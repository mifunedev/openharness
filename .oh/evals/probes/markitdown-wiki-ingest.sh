#!/usr/bin/env bash
# tier: A
# source: issue #649 — pinned local-document normalization contract for /wiki ingest
# desc: /wiki ingest declares a local-only, direct/pinned, resource-bounded, provenance-preserving, untrusted, rollback-safe, wrapper-free MarkItDown contract
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
INGEST="$ROOT/.oh/skills/wiki/references/ingest.md"
PROTECTED="$ROOT/.claude/protected-paths.txt"
SELF_REL=".oh/evals/probes/markitdown-wiki-ingest.sh"

failures=()

if [[ ! -f "$INGEST" ]]; then
  echo "REGRESSION: wiki ingest reference missing: $INGEST" >&2
  exit 1
fi
if [[ ! -f "$PROTECTED" ]]; then
  echo "REGRESSION: protected-path registry missing: $PROTECTED" >&2
  exit 1
fi

need_literal() {
  local label=$1 literal=$2
  grep -Fq -- "$literal" "$INGEST" || failures+=("$label")
}

need_regex() {
  local label=$1 regex=$2
  grep -Eqi -- "$regex" "$INGEST" || failures+=("$label")
}

# Pilot routing and exact upstream CLI identity.
for ext in .pdf .docx .pptx .xlsx; do
  need_literal "supported extension absent: $ext" "$ext"
done
need_literal "case-insensitive extension routing absent" 'case-insensitive'
need_literal "exact pinned direct CLI absent" "uvx --from 'markitdown[pdf,docx,pptx,xlsx]==0.1.6' markitdown"
need_literal "exact package version gate absent" '[[ "$MARKITDOWN_VERSION" == "markitdown 0.1.6" ]]'
need_literal "offline source conversion absent" 'export UV_OFFLINE=1'
need_literal "ambient markitdown executable prohibition absent" 'Do not select an ambient `markitdown` executable'
need_regex "URL path does not remain on WebFetch" 'URL ingest remains on the .*WebFetch path'
need_regex "URLs are not explicitly prohibited from MarkItDown" 'URL must never be passed to MarkItDown'
need_literal "existing text route is not excluded from MarkItDown" 'Do not send them to MarkItDown.'
need_literal "plugin prohibition absent" 'do not pass `-p`/`--use-plugins`'
need_literal "cloud/LLM prohibition absent" '`--use-cu`'

# Prospective conversion and archive/input ceilings.
need_literal "conversion timeout absent" 'timeout 120s'
need_literal "dedicated temporary directory absent" 'mktemp -d'
need_literal "native thread-pool bounding absent" 'OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1'
need_literal "2 GiB virtual-memory ceiling absent" 'ulimit -v 2097152 || exit 70'
need_literal "10 MiB prospective output ceiling absent" 'ulimit -f 10240 || exit 71'
need_literal "50 MiB input ceiling absent" '52428800'
need_literal "10 MiB post-conversion check absent" '10485760'
need_literal "100 MiB OOXML member ceiling absent" '104857600'
need_literal "250 MiB OOXML total ceiling absent" '262144000'
need_literal "whitespace-only output check absent" "grep -q '[^[:space:]]'"
need_regex "non-zero/timeout/cap failure semantics absent" 'non-zero .*including timeout or file-limit termination'
need_literal "set-e-safe conversion status capture absent" ') || CONVERT_STATUS=$?'

# Input identity/signature and archive traversal boundaries.
need_literal "symlink rejection absent" 'symlinks are not accepted'
need_literal "regular-file rejection absent" 'source is not a regular file'
need_literal "option-like basename rejection absent" 'option-like basenames are not accepted'
need_literal "PDF signature check absent" 'source.read(5) != b"%PDF-"'
need_literal "OOXML content-types signature absent" '"[Content_Types].xml"'
for root_part in word/document.xml ppt/presentation.xml xl/workbook.xml; do
  need_literal "OOXML root signature absent: $root_part" "$root_part"
done
need_literal "encrypted OOXML member rejection absent" 'member.flag_bits & 0x1'
need_literal "OOXML traversal component rejection absent" '".." in parts'
need_literal "metadata-only no-extraction boundary absent" 'Do not extract members.'
need_regex "malformed ZIP fail-closed semantics absent" 'malformed or uninspectable ZIP metadata fails closed'

# Trust, review, provenance, atomic publication, and rollback.
need_regex "untrusted extraction boundary absent" 'lossy, untrusted (source data|extracted content)'
need_regex "embedded instructions are not prohibited" 'embedded instructions.*must never be executed'
need_regex "document relationships/links are not prohibited" 'OOXML external relationship.*zero converter-originated requests'
need_literal "basename sentinel derivation absent" 'SOURCE_BASENAME_SENTINEL=$(basename -- "$SOURCE_INPUT"; printf '\''.'\'')'
need_literal "basename control-character rejection absent" 'control characters in basenames are not accepted'
need_literal "preview control-character escaping absent" 'controls escaped'
need_literal "preview incorrectly preserves tab controls" 'if char == "\n" or not unicodedata.category(char).startswith("C"):'
need_literal "bounded preview byte limit absent" 'first 12 KiB and 120 lines'
need_literal "heading count absent" "grep -cE '^#{1,6}[[:space:]]+'"
need_literal "table count absent" "grep -cE '^\\|.*\\|[[:space:]]*$'"
need_regex "unattended warning abort absent" 'unattended run must abort'
need_literal "source basename privacy boundary absent" 'SOURCE_BASENAME'
need_literal "preserved artifact provenance absent" 'Preserved artifact:'
need_literal "SHA-256 provenance absent" 'SHA-256:'
need_literal "SHA-256 command status is not captured before parsing" 'SHA256_LINE=$(sha256sum -- "$PRESERVED")'
need_literal "SHA-256 digest validation absent" '[[ "$SHA256" =~ ^[0-9a-fA-F]{64}$ ]]'
need_literal "converter provenance absent" 'Converter:'
need_literal "same-suffix collision sequence absent" 'then `-2` on both, then `-3`'
need_regex "copy-once boundary absent" 'single source-to-preserved copy'
need_regex "atomic no-overwrite publication absent" 'publishes the fully-written snapshot atomically and fails rather than overwriting'
need_literal "cleanup helper absent" 'cleanup_document_attempt()'
need_literal "abort helper absent" 'abort_document_attempt()'
need_literal "EXIT cleanup trap absent" "trap 'cleanup_document_attempt' EXIT"
need_literal "interrupt cleanup trap absent" "trap 'abort_document_attempt; exit 130' INT TERM"
need_literal "successful trap removal absent" 'trap - EXIT INT TERM'
need_literal "conversion failure does not execute abort cleanup" 'abort_document_attempt'
need_regex "quality-review failure cleanup absent" 'failed quality check must run `abort_document_attempt`'
need_regex "pre-publication cleanup contract absent" 'every failure removes `SNAPSHOT_TMP`, `CONVERT_DIR`, `PRESERVED`, and `PAIR_LOCK`'
need_regex "post-publication immutable provenance absent" 'immutable provenance and remain even if .* synthesis'
need_regex "post-publication failure log hides snapshot" 'when synthesis/log/index work fails after publication, record the retained snapshot path'
need_regex "separate-PR protected-probe removal absent" 'protected Tier-A contract probe.*removed only in a separate reviewed PR'
need_regex "rollback changelog explanation absent" 'separate reviewed PR with a changelog explanation'
need_regex "raw provenance rollback default absent" 'immutable raw original/Markdown provenance remains by default'
need_regex "no-schema-dependency rollback absent" 'No schema migration.*depend on MarkItDown'

# This load-bearing probe must protect itself in the same change.
grep -Fxq "$SELF_REL" "$PROTECTED" || failures+=("$SELF_REL not registered in .claude/protected-paths.txt")

# No repository-owned executable/code wrapper and no image/package installation.
while IFS= read -r -d '' path; do
  [[ "$path" == "$SELF_REL" ]] && continue
  if grep -qi 'markitdown' "$ROOT/$path"; then
    failures+=("repository-owned MarkItDown code/wrapper detected: $path")
  fi
done < <(git -C "$ROOT" ls-files -z -- '*.sh' '*.bash' '*.py' '*.js' '*.cjs' '*.mjs' '*.ts' '*.tsx')

while IFS=$'\t' read -r metadata path; do
  mode=${metadata%% *}
  [[ "$mode" == "100755" ]] || continue
  [[ "$path" == "$SELF_REL" ]] && continue
  if [[ -f "$ROOT/$path" ]] && grep -qi 'markitdown' "$ROOT/$path"; then
    failures+=("executable MarkItDown wrapper detected: $path")
  fi
done < <(git -C "$ROOT" ls-files --stage)

if git -C "$ROOT" grep -qi 'markitdown' -- .devcontainer package.json pnpm-lock.yaml .oh/cli/package.json 2>/dev/null; then
  failures+=("MarkItDown must not be installed in Docker/runtime/package manifests")
fi

if (( ${#failures[@]} > 0 )); then
  printf 'REGRESSION: MarkItDown wiki ingest contract broken:\n' >&2
  printf '  - %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "PASS: /wiki ingest declares the protected MarkItDown contract (direct/pinned, local-only, bounded, signature-checked, provenance-preserving, untrusted, atomic/rollback-safe, and wrapper-free); behavioral evidence is separate" >&2
exit 0
