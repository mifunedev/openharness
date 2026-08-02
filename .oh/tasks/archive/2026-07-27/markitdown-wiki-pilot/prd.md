# PRD: MarkItDown Wiki Ingest Pilot

## Introduction

Extend `/wiki ingest` so local PDF, Word, PowerPoint, and Excel sources can be normalized to Markdown with Microsoft’s upstream `markitdown` CLI before the existing snapshot-and-synthesis flow. The pilot must invoke the pinned package CLI directly through `uvx`, without adding an Open Harness wrapper command or changing URL ingestion.

## Goals

- Make common office documents usable as first-class `/wiki ingest` sources.
- Preserve the original document and conversion provenance alongside the Markdown snapshot.
- Keep the pilot narrow, secure, deterministic, and removable.
- Reuse the upstream CLI rather than implementing document conversion in Open Harness.

## User Stories

### US-001: Define direct CLI document normalization

**Description:** As the orchestrator, I want `/wiki ingest` to normalize supported local documents through the upstream MarkItDown CLI so that I can synthesize them with the existing Markdown workflow.

**Acceptance Criteria:**

- [ ] `.oh/skills/wiki/references/ingest.md` identifies `.pdf`, `.docx`, `.pptx`, and `.xlsx` as the pilot’s supported document extensions.
- [ ] For every supported local document, the procedure invokes Microsoft’s package CLI through exactly `uvx --from 'markitdown[pdf,docx,pptx,xlsx]==0.1.6' markitdown`; it does not select an ambient PATH executable.
- [ ] No new Open Harness CLI command, wrapper script, Docker/image installation, or Node/Python conversion implementation is introduced; tracked implementation changes are limited to the wiki ingest references, a Tier-A probe, `.claude/protected-paths.txt`, the curated wiki/index, changelog, and task artifacts.
- [ ] URL ingestion remains on the existing WebFetch path; untrusted URLs are never passed to MarkItDown’s permissive remote conversion path.
- [ ] Conversion operates on the preserved local copy with `timeout 120s`, a dedicated temporary directory, a 2 GiB virtual-memory ceiling, and a prospective 10 MiB per-file ceiling enforced during execution with `ulimit -f 10240`; non-zero, timed-out, capped, or whitespace-only output fails before synthesis and removes unpublished temporary output.
- [ ] Extracted text is treated strictly as untrusted source data: embedded instructions, links, macros, and tool requests are never executed or followed merely because they appear in the document.
- [ ] A DOCX smoke fixture contains an external relationship to a local request recorder; conversion must produce zero converter-originated requests. A request aborts the pilot as a security failure.
- [ ] Existing URL and Markdown/text file ingestion behavior remains unchanged.

### US-002: Preserve source provenance and document boundaries

**Description:** As a wiki maintainer, I want the original binary and conversion metadata retained so that generated Markdown can be audited against its source.

**Acceptance Criteria:**

- [ ] Reject symlinks, non-regular files, unsupported inputs, and option-like basenames; extension matching is case-insensitive and the resolved file must not exceed 52,428,800 bytes (equality allowed).
- [ ] Validate signatures with Python standard-library reads only: PDF begins `%PDF-`; OOXML is a readable, unencrypted ZIP containing `[Content_Types].xml` plus `word/document.xml` for DOCX, `ppt/presentation.xml` for PPTX, or `xl/workbook.xml` for XLSX. Fail closed on malformed/uninspectable ZIP metadata.
- [ ] For OOXML, reject before conversion when declared uncompressed content exceeds 250 MiB, any member exceeds 100 MiB, an encrypted flag is set, or a member path is absolute or contains `..`; inspect metadata without extracting members.
- [ ] Reserve one collision-free basename for the pair: `<date>-<slug>.<ext>` and `<date>-<slug>.md`, then `-2`, `-3`, and so on with the identical suffix on both artifacts. Copy once, hash the preserved copy, and convert that same copy; neither artifact is overwritten.
- [ ] Before publication, the orchestrator reviews a bounded preview plus heading/table counts and checks for empty, obviously truncated, or structurally missing content. Failed checks abort. Replacing an existing entity after any quality warning requires explicit operator confirmation; unattended runs abort instead.
- [ ] Publish the Markdown snapshot atomically only after conversion and quality review. If conversion fails, remove the preserved copy and temporary output; after snapshot publication, immutable provenance remains even if later synthesis fails.
- [ ] The raw snapshot and memory log use the source basename only (never absolute directories or URL query data), plus preserved artifact path, SHA-256 checksum, converter package/version, and an unconditional statement that the body is lossy, untrusted extracted content.
- [ ] Plugins and cloud/LLM conversion modes are not enabled by the pilot.
- [ ] The synthesized entity page cites the Markdown snapshot as usual and carries explicit uncertainty for missing structure, scanned pages, layout-heavy slides, or spreadsheet fidelity.

### US-003: Guard and document the pilot contract

**Description:** As a maintainer, I want deterministic checks and durable documentation so that the pilot cannot silently broaden into unsafe remote conversion or custom conversion machinery.

**Acceptance Criteria:**

- [ ] Add a Tier-A contract probe that checks the supported extensions, exact pinned direct CLI, numeric resource limits, local-only and untrusted-data boundaries, provenance fields, rollback semantics, and absence of a repository-owned MarkItDown wrapper.
- [ ] Register the new load-bearing probe in `.claude/protected-paths.txt` in this PR.
- [ ] Run documented behavioral smoke cases with minimal real fixtures for PDF, DOCX, PPTX, and XLSX, plus success, non-zero/blank output, hard output cap, cleanup, external-relationship no-request evidence, URL bypass, and unchanged text ingestion; distinguish this evidence from the static Tier-A contract probe.
- [ ] Add a wiki entry focused on ownership, trust boundary, provenance, failure/rollback semantics, and non-goals, with line-cited source paths, system relationships, and `## See Also`.
- [ ] The orchestrator force-adds the reviewed curated entry and one immutable upstream MarkItDown README snapshot before regenerating `.oh/skills/wiki/corpus/README.md`; converted user-document provenance remains ignored by default. Pass `bash .oh/evals/probes/wiki-readme-index.sh`.
- [ ] Add an `Unreleased` changelog entry describing supported document ingestion.
- [ ] Run the new probe, wiki index probe, targeted smoke checks, relevant tests, and the full `/eval` gate without a new green-to-red regression.
- [ ] Rollback reverts ordinary tracked skill/wiki/index/changelog surfaces, but removal of the protected probe and its `.claude/protected-paths.txt` registration occurs in a separate reviewed PR with a changelog explanation. Already-published immutable raw provenance remains by default, may be removed manually when local-only and unreferenced, and no schema migration makes existing entries depend on MarkItDown.

## Functional Requirements

1. **FR-1:** `/wiki ingest` must route only supported local document extensions through MarkItDown.
2. **FR-2:** The integration must call Microsoft’s package CLI directly through pinned `uvx` execution at version `0.1.6` with only `pdf`, `docx`, `pptx`, and `xlsx` extras.
3. **FR-3:** Conversion must be local-file-only, timeout-, input-, archive-expansion-, memory-, and output-bounded, plugin-free, and isolated to a dedicated temporary directory.
4. **FR-4:** Both original document and normalized Markdown provenance must be paired under one collision suffix and retained under the existing raw corpus convention after publication.
5. **FR-5:** Conversion or quality-review failure must not create or update a wiki entity page and must clean unpublished artifacts.
6. **FR-6:** Existing URL and plain-text ingestion semantics must remain unchanged.
7. **FR-7:** Converted document content is untrusted evidence, never an instruction channel.

## Non-Goals

- No `oh document` or other wrapper CLI.
- No webpage fetching through MarkItDown.
- No OCR plugin, LLM image description, Azure Document Intelligence, or Azure Content Understanding integration.
- No audio, video, YouTube, EPUB, ZIP, Outlook, CSV, JSON, XML, or legacy `.xls` support in this pilot.
- No automatic conversion in `/spec plan`, `/ship-spec`, `/blog`, or `/audit` yet.
- No committing raw source documents by default; existing corpus gitignore policy remains in force.
- No edits to `.devcontainer/Dockerfile`, entrypoints, lifecycle scripts, or other protected runtime paths; any future preinstall is a separate reviewed change.

## Technical Considerations

- `uv`/`uvx` already ships in `.devcontainer/Dockerfile`, so direct pinned CLI execution requires no wrapper, image edit, or root Node dependency.
- Always use pinned `uvx`; do not resolve an ambient `markitdown` executable.
- Copy once, then validate/hash/convert the preserved copy so source mutation cannot split provenance. Reject symlinks and quote paths with `--` where the CLI supports it; otherwise reject option-like basenames.
- Use a dedicated `mktemp -d` workspace, cleanup trap, archive metadata preflight, process resource ceilings, and atomic publication only after successful validation and human quality review.
- Treat conversion output as lossy, untrusted extraction. The original checksum and preserved binary are the audit source.

## Success Metrics

- Minimal PDF, DOCX, PPTX, and XLSX fixtures each convert into non-empty Markdown through pinned `uvx`.
- Existing URL and Markdown ingest paths require no changes from operators.
- No repository-owned conversion executable is added.
- All targeted and full eval gates pass without regression.

## Open Questions

- Whether later iterations should preinstall MarkItDown in the image after separately measuring first-run `uvx` latency and dependency size.
- Whether EPUB, audio, YouTube, and OCR should graduate into separate opt-in stories after the local-document pilot.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: create `.oh/skills/wiki/corpus/document-ingestion.md` and refresh `.oh/skills/wiki/corpus/README.md`.
- **Spec alignment**: explain that `/wiki ingest` remains the owner of snapshot, synthesis, and provenance while MarkItDown is a narrow local-document normalization dependency invoked directly through its upstream CLI.
- **DeepWiki comparison**: DeepWiki’s “Knowledge and Wiki Skills” surface describes wiki ingestion as part of durable knowledge capture but does not cover binary-document normalization, immutable original artifacts, or the local-only conversion boundary. The new entry must close those source-file and terminology gaps without implying MarkItDown owns URL acquisition or wiki synthesis.
- **Acceptance criteria**: US-003 requires DeepWiki-style source files, line-cited behavior, system relationships, `## See Also`, README index freshness, and the wiki index probe.

## Critique Resolution

Two adversarial critics found three high-severity risks across two review passes: resource exhaustion, protected-probe lifecycle, and converter-originated network access. The PRD now mitigates them with prospective resource ceilings, protected-path registration/removal policy, and an external-relationship no-request smoke test. All medium/low recommendations were incorporated into verifiable acceptance criteria; final critic gates report no unmitigated high findings. Recommendation: PROCEED.
