# MarkItDown wiki pilot — behavioral smoke evidence

Run on 2026-07-18 UTC in the task worktree. This is behavioral evidence, not the static Tier-A contract probe. All fixtures and outputs lived under `/tmp/markitdown-wiki-smoke.Mq7mvs`; no wiki corpus files were written.

## Environment and invocation

- `uvx 0.11.28`
- `markitdown 0.1.6` confirmed with the pinned invocation's `--version` output, which populated uv's package cache without receiving a document path.
- Every final conversion used a fresh `mktemp -d` directory and this direct process shape; `UV_OFFLINE=1` prevented uv package-network access during source processing:

```bash
export UV_OFFLINE=1
export OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 VECLIB_MAXIMUM_THREADS=1
ulimit -v 2097152
ulimit -f 10240
timeout 120s uvx --from 'markitdown[pdf,docx,pptx,xlsx]==0.1.6' markitdown "$PRESERVED_ABS" -o "$NORMALIZED"
```

An initial bounded run without the five one-thread environment settings failed during Magika ONNX initialization with `std::bad_alloc` under the required 2 GiB virtual-memory ceiling. Re-running under the settings above kept the same ceiling and direct CLI invocation and passed. The tracked procedure includes those settings.

## Real format fixtures

Fixtures were generated with Python standard-library byte/ZIP writes, then converted by the upstream CLI. Each contained a unique expected marker.

| Fixture | Input bytes | Converter rc | Markdown bytes | Marker check |
|---|---:|---:|---:|---|
| minimal one-page PDF | 597 | 0 | 24 | PASS |
| minimal DOCX | 1,294 | 0 | 23 | PASS |
| minimal one-slide PPTX | 1,844 | 0 | 48 | PASS |
| minimal one-sheet XLSX | 1,606 | 0 | 55 | PASS |

The documented Python signature/OOXML metadata preflight passed all four. It also rejected a non-`%PDF-` PDF and a DOCX ZIP containing `../escape`. After the package cache was populated, all four fixtures were converted again successfully with `UV_OFFLINE=1` under the same resource ceilings.

## Network boundary

The DOCX contained `word/_rels/document.xml.rels` with:

```xml
<Relationship Id="rIdExternal"
  Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"
  Target="http://127.0.0.1:18765/converter-must-not-request"
  TargetMode="External"/>
```

A local Python HTTP request recorder was listening on `127.0.0.1:18765` for the bounded DOCX conversion. The recorder log remained exactly 0 bytes. Result: **PASS — zero converter-originated requests**.

## Failure and cleanup cases

| Case | Observed result |
|---|---|
| valid blank PDF | converter rc 0, output 0 bytes; whitespace guard rejected it |
| valid blank DOCX | converter rc 0, output 0 bytes; whitespace guard rejected it |
| malformed DOCX body after metadata preflight | converter rc 1; temporary output and unpublished preserved copy removed |
| compressed XLSX declaring 13,124,941 bytes of worksheet XML | converter rc 1 with `OSError: [Errno 27] File too large`; output stopped at exactly 10,485,760 bytes under `ulimit -f 10240` |

## Existing-route checks

- **URL bypass**: the unchanged `#### 4a. URL ingest` WebFetch section contains no MarkItDown route; structural assertion passed.
- **Text bypass**: the local-file classifier retains the existing Markdown/plain-text procedure and explicitly says `Do not send them to MarkItDown.`; structural assertion passed.
- **Static contract**: `.oh/evals/probes/markitdown-wiki-ingest.sh` passed separately and guards these routing boundaries without claiming to replace the behavioral fixtures above.
