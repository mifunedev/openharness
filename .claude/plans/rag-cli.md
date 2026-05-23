# Plan — Local-First RAG CLI (`@ryaneggz/rag`)

> Authored by `pm` sub-agent, 2026-05-23. Input to `/delegate`.
> Target directory: `.worktrees/project/ryaneggz/rag` (independent project
> clone — has its own `.git`, not a harness branch). Inspect for existing
> content before writing; the directory does not yet exist as of 2026-05-23.

## Brief

Build a standalone TypeScript CLI/library for local-first RAG. Reusable npm
package with a `rag` binary that initializes, ingests, searches, and answers
questions over a local repo/docs knowledgebase. TypeScript + Node.js 20+,
pnpm, tsup builds, vitest tests, commander CLI, LangChain JS with
`@langchain/community/vectorstores/libsql` + `@libsql/client`, default
OpenAI `text-embedding-3-small` embeddings, adapter-based providers for
future Ollama/local. Every command supports `--json`.

## Pre-analysis: Target Directory

Implement at `.worktrees/project/ryaneggz/rag` — Ryan's GitHub namespace,
new project. Package name `@ryaneggz/rag`. Wave 0 must create the
directory and `git init` it (or clone a blank repo) before writing files,
and must inspect for existing content first.

## Decisions Required Before Delegation

| ID | Question | Recommendation |
|----|----------|----------------|
| D1 | What does `stale` mean? | Both — print `dangling` (in db, not on disk) and `modified` (on disk, hash changed) separately. |
| D2 | What does `doctor` check? | `OPENAI_API_KEY` present, `.rag/kb.db` readable, libSQL connect, optional `--probe` for embedding round-trip. |
| D3 | Package name | `@ryaneggz/rag`; repo dir `rag`. |
| D4 | `ask` chat model | `gpt-4o-mini` default; configurable at `chat.model` in `.rag/config.json`. |
| D5 | `--json` + logging | JSON-only stdout; human/progress/warnings to stderr. Cross-cutting; owned by output module. |
| D6 | Chunking defaults | `chunkSize: 1000`, `chunkOverlap: 200`. |

## Cross-Cutting Contracts (all tasks must honor)

**JSON output contract**: Every command detects `--json` via the output
module. JSON mode: `console.log(JSON.stringify(result))` only on stdout;
everything else goes to `console.error`. Output module exports
`printResult(data, humanFn)` — human path calls `humanFn()`, JSON path
serializes `data`.

**Error shape**: All thrown errors instance of `RagError` (base in
`src/errors/`) with `{ code: string, message: string, detail?: unknown }`.
CLI catch handler prints `{ error: { code, message } }` in JSON mode,
formatted message in human mode, then `process.exit(1)`.

**Adapter interface**:

```ts
interface EmbeddingAdapter {
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}
interface ChatAdapter {
  invoke(messages: BaseMessage[], context: string[]): Promise<string>;
}
```

Both instantiated by factory functions in `src/embeddings/` that read
config. Wave 2+ tasks depend on this interface being stable from Wave 1.

**Config shape** (canonical, owned by T2):

```ts
{
  version: 1,
  db: { url: string },
  embeddings: { provider: "openai", model: string },
  chat: { provider: "openai", model: string },
  ingest: {
    chunkSize: number,
    chunkOverlap: number,
    include: string[],
    exclude: string[]
  }
}
```

## Task Breakdown

| # | Task | Wave | Model | Depends On | Acceptance |
|---|------|------|-------|-----------|-----------|
| T1 | Scaffold repo + toolchain | 0 | haiku | — | `pnpm install` + `pnpm build` succeed on empty src |
| T2 | Config module + types | 1 | haiku | T1 | `loadConfig()` exported, tested, `.rag/config.json` written by `init` |
| T3 | Output module + error types | 1 | haiku | T1 | `printResult` + `RagError` exported, tested for JSON/human modes |
| T4 | DB module + libSQL | 1 | sonnet | T1 | `initKnowledgebase()` creates `.rag/kb.db`, vector + metadata tables |
| T5 | Embedding adapter | 1 | sonnet | T1 | `EmbeddingAdapter` interface + OpenAI impl exported, unit-tested w/ mock |
| T6 | CLI skeleton + `rag init` | 2 | sonnet | T2, T3, T4 | `pnpm dev -- init` writes config+db; `--json` returns `{initialized,path}` |
| T7 | Loaders + chunking | 2 | sonnet | T2, T3 | All exts load+chunk, SHA-256 computed, metadata struct populated |
| T8 | Ingest command | 3 | sonnet | T4, T5, T6, T7 | `ingest ./src README.md` indexes; rerun skips unchanged; `--json` returns `{indexed,skipped,errors}` |
| T9 | Search command | 3 | sonnet | T4, T5, T6 | `search "q" -k 5` returns ranked results; `--json` returns `{results}` |
| T10 | Ask command + chat adapter | 4 | sonnet | T8, T9 | `ask "q"` answers with cited paths; no-context fallback message; `--json` returns `{answer,sources}` |
| T11 | Stats command | 4 | haiku | T4, T6 | `stats` prints chunk/file count + db size; `--json` returns `{chunks,files,dbBytes}` |
| T12 | Doctor + stale commands | 4 | sonnet | T4, T5, T6 | doctor checks env+db+connectivity; stale reports dangling+modified |
| T13 | Reset + library exports | 5 | haiku | T10, T11, T12 | `reset --yes` clears db; `src/index.ts` exports all 7 library fns |
| T14 | Integration tests + README | 5 | sonnet | T13 | 5 acceptance commands exit 0; README has install + usage + library API |

## Implementation Contracts

### T1: Scaffold repo + toolchain

- **Input**: Empty or near-empty `.worktrees/project/ryaneggz/rag` dir (check first — may not exist)
- **Output**: `package.json` (`@ryaneggz/rag`, `"type":"module"`), `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `.gitignore`, `src/` and `test/` dirs with stub files
- **Files owned**: `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `.gitignore`, `src/cli.ts` stub, `src/index.ts` stub
- **Files read**: existing dir contents
- **Acceptance**: `pnpm install` exits 0; `pnpm build` exits 0 producing `dist/`; `pnpm test` exits 0 (no tests = pass); no existing files overwritten
- **Model**: haiku — pure boilerplate
- **Not in scope**: any business logic, LangChain deps (added in T4/T5)

`package.json` scripts:
```json
{ "build": "tsup", "dev": "tsx src/cli.ts", "test": "vitest run", "prepublishOnly": "pnpm build" }
```
Deps to install: `commander`, `@langchain/community`, `@langchain/openai`, `@libsql/client`, `langchain`, `tsx`, `tsup`, `vitest`, `typescript`.

### T2: Config module

- **Input**: T1 scaffold
- **Output**: `src/config/index.ts` exporting `loadConfig(cwd?)`, `writeDefaultConfig(cwd?)`, `ConfigSchema`, `DEFAULT_CONFIG`
- **Files owned**: `src/config/index.ts`, `src/config/types.ts`, `test/config.test.ts`
- **Files read**: T1 `package.json`
- **Acceptance**: `loadConfig()` returns typed config; missing file → defaults; existing file deep-merged; test passes
- **Model**: haiku
- **Not in scope**: DB init, CLI wiring

### T3: Output module + error types

- **Input**: T1 scaffold
- **Output**: `src/output/index.ts` exporting `printResult<T>(data, humanFn)`, `isJsonMode()`; `src/errors/index.ts` exporting `RagError`
- **Files owned**: `src/output/index.ts`, `src/errors/index.ts`, `test/output.test.ts`
- **Acceptance**: JSON mode prints `{"x":1}` to stdout only; `RagError` has code+message+optional detail; test passes
- **Model**: haiku
- **Not in scope**: any CLI wiring

### T4: DB module + libSQL

- **Input**: T1 scaffold + T2 config types
- **Output**: `src/db/index.ts` exporting `initKnowledgebase(config)`, `getDb(config)`, DDL for `chunks` + `file_meta` tables
- **Files owned**: `src/db/index.ts`, `src/db/schema.ts`, `test/db.test.ts`
- **Acceptance**: `initKnowledgebase()` creates `.rag/kb.db` with both tables; idempotent; test uses temp dir
- **Model**: sonnet
- **Not in scope**: ingestion, embedding writes

`chunks` columns: `id TEXT PK, source TEXT, rel_path TEXT, source_hash TEXT, mtime INTEGER, size INTEGER, loader TEXT, language TEXT, chunk_index INTEGER, chunk_count INTEGER, chunk_hash TEXT, tags TEXT, indexed_at INTEGER, content TEXT, embedding BLOB`.

### T5: Embedding adapter

- **Input**: T1 + T2 config types
- **Output**: `src/embeddings/index.ts` (interface + factory), `src/embeddings/openai.ts` (impl using `@langchain/openai`)
- **Files owned**: `src/embeddings/index.ts`, `src/embeddings/openai.ts`, `test/embeddings.test.ts`
- **Acceptance**: factory returns adapter when `OPENAI_API_KEY` set; unit test mocks OpenAI client; interface exported for future Ollama
- **Model**: sonnet
- **Not in scope**: chat adapter (T10), Ollama impl

### T6: CLI skeleton + `rag init`

- **Input**: T2, T3, T4
- **Output**: `src/cli.ts` (commander program + all 8 command stubs + init impl)
- **Files owned**: `src/cli.ts`, `test/cli-init.test.ts`
- **Acceptance**: `pnpm dev -- init` creates `.rag/config.json` + `.rag/kb.db` in cwd; idempotent on rerun; `--json` returns `{"initialized":true,"configPath":"...","dbPath":"..."}` only
- **Model**: sonnet
- **Not in scope**: ingest/search/ask/stats/doctor/stale/reset logic (stubs only)

### T7: Loaders + chunking

- **Input**: T2 config types, T3 errors
- **Output**: `src/loaders/index.ts` (walker + dispatch), `src/chunking/index.ts` (recursive char splitter), `src/loaders/types.ts` (LoadedChunk metadata)
- **Files owned**: `src/loaders/index.ts`, `src/loaders/types.ts`, `src/loaders/walker.ts`, `src/chunking/index.ts`, `test/loaders.test.ts`, `test/chunking.test.ts`
- **Acceptance**: walker respects include/exclude globs + hardcoded ignores (`node_modules`, `.git`, `dist`, `build`, `.next`, `.turbo`, `.rag`, `coverage`); SHA-256 per file; all 14 extensions handled (`.md`, `.mdx`, `.txt`, `.ts`, `.tsx`, `.js`, `.jsx`, `.json`, `.yaml`, `.yml`, `.py`, `.go`, `.rs`); unknown ext → `RagError`; chunks carry full metadata; tests pass with `test/fixtures/`
- **Model**: sonnet
- **Not in scope**: DB writes, embeddings

### T8: Ingest command

- **Input**: T4, T5, T6, T7
- **Output**: `src/ingest/index.ts` exporting `ingestPaths(paths, config)`; ingest CLI impl in `src/cli.ts`
- **Files owned**: `src/ingest/index.ts`, `test/ingest.test.ts`; **edit** `src/cli.ts` (ingest stub only)
- **Acceptance**: `ingest ./src README.md` indexes; 2nd run skips unchanged (verified by test); `--json` returns `{"indexed":N,"skipped":M,"errors":[]}` only; `ingestPaths` exported from `src/index.ts`
- **Model**: sonnet

### T9: Search command

- **Input**: T4, T5, T6
- **Output**: `src/search/index.ts` exporting `searchKnowledgebase(query, opts, config)`; search CLI impl
- **Files owned**: `src/search/index.ts`, `test/search.test.ts`; **edit** `src/cli.ts` (search stub only)
- **Acceptance**: `search "q" -k 3` returns ≤3 ranked results with path/score/snippet; `--path`, `--tag`, `--loader` filters reduce set; `--json` returns `{"results":[{"path","score","snippet"}]}` only; test uses in-memory db with seeded vectors (mock embeddings)
- **Model**: sonnet

### T10: Ask command + chat adapter

- **Input**: T8 (data), T9 (retrieval)
- **Output**: `src/ask/index.ts` exporting `askKnowledgebase(question, config)`; `src/embeddings/chat-openai.ts` implementing `ChatAdapter`; ask CLI impl
- **Files owned**: `src/ask/index.ts`, `src/embeddings/chat-openai.ts`, `test/ask.test.ts`; **edit** `src/cli.ts` (ask stub only)
- **Acceptance**: `ask "q"` answers + cites paths; if no relevant chunks → "I don't have enough context to answer"; `--json` returns `{"answer":"...","sources":["..."]}` only; test mocks chat client
- **Model**: sonnet
- **Not in scope**: multi-turn, streaming

### T11: Stats command

- **Input**: T4, T6
- **Output**: `src/inspect/stats.ts` exporting `getStats(config)`; stats CLI impl
- **Files owned**: `src/inspect/stats.ts`, `test/stats.test.ts`; **edit** `src/cli.ts` (stats stub only)
- **Acceptance**: prints chunk count, file count, db size; `--json` returns `{"chunks":N,"files":N,"dbBytes":N}` only
- **Model**: haiku

### T12: Doctor + stale commands

- **Input**: T4, T5, T6
- **Output**: `src/inspect/doctor.ts` exporting `runDoctor(config)`; `src/inspect/stale.ts` (stale check); doctor + stale CLI impls
- **Files owned**: `src/inspect/doctor.ts`, `src/inspect/stale.ts`, `test/doctor.test.ts`; **edit** `src/cli.ts` (doctor + stale stubs only)
- **Acceptance**:
  - `doctor`: checks `OPENAI_API_KEY`, db readable, libSQL connect; `--json` returns `{"ok":bool,"checks":[{"name","ok","detail"}]}`
  - `stale`: reads indexed paths, walks disk, reports dangling + modified; `--json` returns `{"dangling":["..."],"modified":["..."]}`
  - tests pass (mock fs/env)
- **Model**: sonnet
- **Not in scope**: auto-remediation (that's `reset`)

### T13: Reset + library exports

- **Input**: all prior tasks complete
- **Output**: reset CLI impl in `src/cli.ts`; `src/index.ts` with all 7 library exports wired
- **Files owned**: `src/index.ts`, `test/reset.test.ts`; **edit** `src/cli.ts` (reset stub only)
- **Acceptance**: `reset --yes` drops + recreates schema; without `--yes` prints "pass --yes to confirm" and exits non-zero; `src/index.ts` exports `loadConfig`, `initKnowledgebase`, `ingestPaths`, `searchKnowledgebase`, `askKnowledgebase`, `getStats`, `runDoctor`; `pnpm build` produces `dist/index.js` + `dist/cli.js`
- **Model**: haiku

### T14: Integration tests + README

- **Input**: T13 complete, `pnpm build` green
- **Output**: `test/integration/` suite covering 5 acceptance commands; `README.md`
- **Files owned**: `test/integration/`, `README.md`
- **Acceptance**: 5 brief acceptance commands (`init`, `ingest ./src README.md`, `search "how does ingestion work?"`, `stats`, `doctor`) exit 0 in temp dir with `OPENAI_API_KEY` set; README has `## Install`, `## Commands` (all 8), `## Library API`; `pnpm test` exits 0
- **Model**: sonnet
- **Not in scope**: npm publish, CI setup

## Wave Structure

```
Wave 0 (sequential prerequisite):
  T1 — scaffold

Wave 1 (parallel — all independent):
  T2 — config module
  T3 — output + errors
  T4 — db module
  T5 — embedding adapter

Wave 2 (parallel — both depend on Wave 1):
  T6 — CLI skeleton + init
  T7 — loaders + chunking

Wave 3 (parallel — T8 needs T6+T7, T9 needs T6):
  T8 — ingest command
  T9 — search command

Wave 4 (parallel — all depend on Wave 3):
  T10 — ask command
  T11 — stats command
  T12 — doctor + stale commands

Wave 5 (sequential — needs everything):
  T13 — reset + library exports
  T14 — integration tests + README
```

## Minimal Vertical Slice

Wave 0 + a minimal Wave 1 subset (T2 + T3 + T4) + a stripped Wave 2 (T6
only, with init impl) gives an end-to-end runnable `pnpm dev -- init` —
this is the smoke check before fanning out to ingest/search/ask.

## Scope Boundaries

**In scope**: All 8 CLI commands, TS library exports, OpenAI adapter,
libSQL vector store, SHA-256 change detection, `--json` mode on every
command, vitest per slice, README.

**Out of scope**: Ollama/local model adapter (interface scaffolded, impl
deferred), npm publish, CI pipeline, streaming responses, multi-turn
conversation, web UI, MCP server wrapper, Windows path handling beyond
`path.posix`.

## Risks / Unknowns

- **LangChain JS libSQL vector store API drift** — versions of
  `@langchain/community` rename `LibSQLVectorStore`. T4 must pin the
  package version it uses and document the import path.
- **Re-exporting library fns when CLI is the primary surface** — T13
  must wire `src/index.ts` early enough that T14's library-mode tests
  work; consider seeding empty stubs in T1 so later tasks only fill in.
- **`--json` discipline** — every command author may accidentally
  `console.log` a progress message. T3's `printResult` is the only safe
  path; gate this in PR review.
- **OpenAI API key in tests** — integration tests need a real key (T14);
  unit tests in T5/T8/T9/T10 must mock or fixture the embedding/chat
  client. Real network calls in unit tests will burn budget.

## Pointers

- `context/rules/advisor-model.md` — briefing structure handed to each sub-agent
- `context/rules/recursive-delegation.md` — Max depth / structured returns conventions
- `.claude/skills/delegate/SKILL.md` — wave execution mechanics
