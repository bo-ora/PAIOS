# Phase 1 Storage and Transcription Research

Status: Completed  
Date: 2026-06-22

## Objective

Compare practical local foundations for Phase 1 durable metadata, lexical
search, audio normalization, and transcription. Optimize for offline operation,
recoverability, portability, and a small TypeScript CLI architecture.

## Environment

The current development machine is an Intel Core i7-8850H MacBook Pro with
16 GiB RAM and Node.js 24.17.0. FFmpeg and `whisper-cli` are not currently
installed.

Node.js 20 reached end of life on 2026-03-24. Node.js 22 and 24 are LTS
releases; the project machine already runs Node.js 24. Node.js added
`node:sqlite` in 22.5.0 and exposes file-backed databases, prepared statements,
foreign-key enforcement, and backup support.

## Storage and Search Comparison

### Node.js `node:sqlite` with SQLite FTS5

Advantages:

- embedded, serverless, transactional single-file metadata store;
- no runtime npm dependency or native Node add-on;
- FTS5 provides phrase queries, snippets, BM25 ranking, and rebuild support;
- SQLite database files are cross-platform and suitable as application files;
- source files can remain independently inspectable and authoritative;
- Node's backup API can produce a consistent database copy.

Costs and risks:

- requires raising the repository minimum from unsupported Node.js 20;
- `node:sqlite` is still classified as a release candidate in current Node
  documentation, so the adapter boundary must isolate API changes;
- FTS external-content tables can become inconsistent if application writes do
  not update the index atomically.

Mitigation:

- require Node.js 24 LTS;
- keep SQL and Node APIs behind a storage adapter;
- update metadata and FTS rows in one transaction;
- verify FTS integrity and support full index rebuild from durable records.

The local prototype on Node.js 24.17.0 used bundled SQLite 3.53.0 and
successfully created an FTS5 table, produced a highlighted snippet and BM25
rank, and exposed the Node backup function.

### `better-sqlite3`

Advantages:

- mature synchronous API;
- supports SQLite, transactions, and FTS5;
- prebuilt binaries are available for supported Node LTS releases.

Costs:

- adds a runtime npm package and native binary lifecycle;
- installation may fall back to local compilation;
- duplicates capability now available in the selected Node LTS runtime.

Use it only as a fallback if `node:sqlite` produces a verified blocking defect.
The storage interface keeps this migration local.

### Files and JSON only

Advantages:

- fully inspectable and no database dependency;
- simple for initial note persistence.

Costs:

- atomic multi-record updates, duplicate detection, query ordering, schema
  migration, and concurrent interruption recovery require custom machinery;
- lexical indexing would need another component or an in-memory full scan;
- backup consistency becomes application-specific.

This option is smaller only for a demonstration, not for the approved recovery
and search requirements.

## Transcription Comparison

### `whisper.cpp` CLI plus FFmpeg

Advantages:

- local C/C++ implementation with a stable command-line boundary;
- works without Python or a service process;
- supports CPU execution and multiple model sizes;
- models are ordinary local files and can be replaced independently;
- Homebrew provides current `whisper-cpp` and FFmpeg packages.

The standard `whisper-cli` path expects 16-bit WAV input. Normalize WAV, MP3,
and M4A through FFmpeg to 16 kHz mono PCM WAV before transcription. Keep the
normalized file temporary and retain the original managed audio as the durable
source.

Published approximate model requirements are:

| Model | Disk | Memory |
| --- | ---: | ---: |
| tiny | 75 MiB | 273 MB |
| base | 142 MiB | 388 MB |
| small | 466 MiB | 852 MB |
| medium | 1.5 GiB | 2.1 GB |
| large | 2.9 GiB | 3.9 GB |

Use a configurable model path. Document the multilingual `base` model as the
initial low-cost default for this Intel 16 GiB machine, but do not download a
model implicitly or encode the model choice into durable record identity.
Store engine version, model filename/checksum, language option, and command
metadata with each transcription attempt.

### `faster-whisper`

Advantages:

- optimized Whisper inference;
- Python package decodes audio through bundled PyAV.

Costs:

- introduces a Python application runtime and CTranslate2 dependency beside the
  TypeScript CLI;
- GPU configuration is irrelevant on the current Intel Mac;
- creates more packaging and environment work than a subprocess adapter.

Reconsider if measured CPU transcription throughput is unacceptable.

### OpenAI Whisper Python package

Advantages:

- reference implementation and multilingual model support.

Costs:

- Python, PyTorch, and FFmpeg dependencies are heavier than `whisper.cpp`;
- no Phase 1 requirement needs its Python API.

## Recommendation

1. Raise the runtime baseline to Node.js 24 LTS.
2. Use `node:sqlite` with STRICT metadata tables and an FTS5 external-content
   index maintained transactionally.
3. Keep imported source files and note source documents outside SQLite under
   managed storage; treat SQLite metadata and FTS state as rebuildable.
4. Use `whisper.cpp` through a subprocess adapter.
5. Normalize supported audio with FFmpeg to temporary 16 kHz mono PCM WAV.
6. Require explicit local installation and model selection; never download
   binaries or models during normal capture.
7. Keep storage, search, audio normalization, and transcription behind separate
   interfaces.

## Sources

- [Node.js release schedule](https://nodejs.org/en/about/previous-releases)
- [Node.js SQLite API](https://nodejs.org/api/sqlite.html)
- [SQLite overview](https://sqlite.org/about.html)
- [SQLite FTS5](https://sqlite.org/fts5.html)
- [SQLite appropriate uses](https://sqlite.org/whentouse.html)
- [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3)
- [`whisper.cpp`](https://github.com/ggml-org/whisper.cpp)
- [Homebrew `whisper-cpp`](https://formulae.brew.sh/formula/whisper-cpp)
- [Homebrew FFmpeg](https://formulae.brew.sh/formula/ffmpeg)
- [`faster-whisper`](https://github.com/SYSTRAN/faster-whisper)
- [OpenAI Whisper](https://github.com/openai/whisper)
