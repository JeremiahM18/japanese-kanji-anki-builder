# Japanese Kanji Anki Builder

A Node.js project for building JLPT kanji decks for Anki with deterministic exports, curated study data, sentence-corpus support, managed media, offline-friendly previewing, and explicit deck-quality gates.

## Overview

This repo is designed as a serious personal project: correctness first, clear structure, reproducible builds, and user-facing workflows that make it obvious what is ready and what still needs work.

The system can:

- build TSV decks for JLPT N5 through N1
- infer learner-facing meanings, notes, and example sentences
- override inference with curated study data
- package import-ready deck artifacts
- manage stroke-order image, stroke-order animation, and audio assets
- preview cards even when upstream kanji enrichment is unavailable
- report setup health, media readiness, and per-level quality gates

## Current User Workflows

### 1. Check setup and quality

```bash
npm run doctor
npm run deck:readiness
```

Use these first.

- `doctor` checks required datasets, optional study data, media source folders, coverage, and next steps.
- `deck:readiness` shows N5-N1 quality gates for sentence coverage, curated coverage, stroke-order coverage, audio coverage, and full media coverage.

### 2. Bootstrap starter content

```bash
npm run corpus:init
npm run curated:init
npm run media:init
```

Useful variants:

```bash
npm run corpus:init -- --merge
npm run curated:init -- --merge
```

These commands create or extend local ignored datasets so the deck becomes useful faster instead of starting from empty content.

### 3. Preview cards

```bash
npm run deck:preview -- --level=5 --limit=5
npm run deck:preview -- --kanji=日,本,学
```

Preview shows meaning, notes, example sentence, radical, and media presence.

If the upstream kanji API is unavailable, preview falls back to local sentence corpus, curated study data, radicals, and managed media instead of failing outright.

### 4. Build and package a deck

```bash
npm run deck:ready -- --levels=5 --limit=25
```

This runs the user-facing happy path:

- validates setup
- syncs media
- builds exports
- packages the deck in `out/build/package`
- prints a summary including quality and media status

You can also run the lower-level artifact build directly:

```bash
npm run build:artifacts -- --levels=5,4 --limit=25
```

### 5. Work on media

```bash
npm run media:init
npm run media:import:stroke-order -- --input-dir=/path/to/files
npm run media:sync -- --level=5 --limit=25
npm run media:report -- --limit=25
```

The project supports both local media folders and optional remote fallback providers.

## Important Commands

| Command | Purpose |
| --- | --- |
| `npm test` | Run the full test suite |
| `npm run lint` | Run ESLint |
| `npm run doctor` | Check setup, coverage, readiness, and next steps |
| `npm run deck:readiness` | Show per-level deck quality gates |
| `npm run deck:preview` | Preview cards before import |
| `npm run deck:ready` | Run the full build/package happy path |
| `npm run build:artifacts` | Run the deterministic build pipeline |
| `npm run corpus:init` | Create or merge starter sentence corpus data |
| `npm run curated:init` | Create or merge starter curated study data |
| `npm run media:init` | Create media source folders and bootstrap `.env` |
| `npm run media:import:stroke-order` | Import free local stroke-order assets |
| `npm run media:sync` | Sync stroke-order and audio assets into managed storage |

## Local Data Model

The project expects local ignored datasets under `data/`:

- `data/kanji_jlpt_only.json`
- `data/KRADFILE`
- `data/sentence_corpus.json`
- `data/curated_study_data.json`

Managed media is stored under:

- `data/media/`

Local source folders for acquisition:

- `data/media_sources/stroke-order/images/`
- `data/media_sources/stroke-order/animations/`
- `data/media_sources/audio/`

More detailed local-data guidance lives in [data/README.md](/C:/japanese_kanji_builder/data/README.md).

## Media Model

The exported deck includes these fields:

- `StrokeOrder`
- `StrokeOrderImage`
- `StrokeOrderAnimation`
- `Audio`

Behavior:

- `StrokeOrder` prefers animation when available, then static image
- `StrokeOrderImage` exposes the static asset directly
- `StrokeOrderAnimation` exposes the animation asset directly
- `Audio` exports Anki sound markup when a managed audio asset exists

Supported media sourcing:

- deterministic local filesystem lookup
- optional remote HTTP fallback providers
- managed per-kanji manifests for imported assets
- atomic manifest writes with per-kanji serialization

## Quality Model

The repo now treats deck quality as a first-class contract, not a vague goal.

`npm run deck:readiness` and `npm run doctor` evaluate each JLPT level against these gates:

- sentence coverage: `90%`
- curated coverage: `60%`
- stroke-order coverage: `90%`
- audio coverage: `75%`
- full media coverage: `75%`

A deck level is not considered truly ready until it clears those gates.

## Build Output

Build artifacts are written under `out/build/`.

Key outputs:

- `out/build/exports/`
- `out/build/reports/`
- `out/build/build-summary.json`
- `out/build/package/`
- `out/build/package/IMPORT.txt`

The package directory contains the exported TSVs plus any referenced managed media files that are currently available.

## Configuration

Configuration is read from environment variables and `.env`, with environment variables taking precedence.

| Variable | Default |
| --- | --- |
| `PORT` | `3719` |
| `CACHE_DIR` | `cache` |
| `JLPT_JSON_PATH` | `data/kanji_jlpt_only.json` |
| `KRADFILE_PATH` | `data/KRADFILE` |
| `SENTENCE_CORPUS_PATH` | `data/sentence_corpus.json` |
| `CURATED_STUDY_DATA_PATH` | `data/curated_study_data.json` |
| `KANJI_API_BASE_URL` | `https://kanjiapi.dev` |
| `MEDIA_ROOT_DIR` | `data/media` |
| `STROKE_ORDER_IMAGE_SOURCE_DIR` | `data/media_sources/stroke-order/images` |
| `STROKE_ORDER_ANIMATION_SOURCE_DIR` | `data/media_sources/stroke-order/animations` |
| `AUDIO_SOURCE_DIR` | `data/media_sources/audio` |
| `REMOTE_STROKE_ORDER_IMAGE_BASE_URL` | unset |
| `REMOTE_STROKE_ORDER_ANIMATION_BASE_URL` | unset |
| `REMOTE_AUDIO_BASE_URL` | unset |
| `BUILD_OUT_DIR` | `out/build` |
| `EXPORT_CONCURRENCY` | `8` |
| `API_REQUEST_TIMEOUT` | `10000` |

## API Surface

The app exposes HTTP routes for service health, inference, and media operations.

Main routes:

- `GET /`
- `GET /healthz`
- `GET /readyz`
- `GET /inference/:kanji`
- `GET /media/:kanji`
- `POST /media/:kanji/sync`
- `POST /media/:kanji/audio/sync`

## Engineering Notes

Key internal characteristics:

- cache-backed upstream retrieval with validation
- deterministic dataset normalization
- provider metrics and acquisition reporting
- shared JSDoc contracts for important runtime boundaries
- bounded concurrency for export and media sync
- explicit graceful shutdown behavior
- structured API validation and error responses

## Development Standard

- avoid shortcuts when correctness can be explicit
- prefer deterministic behavior over convenience
- keep user workflows honest about what is and is not ready
- update docs when behavior changes
- add tests for behavior changes
- keep commits focused and professional

## Validation

Before merging meaningful changes, the standard validation set is:

```bash
npm run lint
npm test
```

For user-facing build or content work, also validate with one or more of:

```bash
npm run doctor
npm run deck:readiness
npm run deck:preview -- --level=5 --limit=5
npm run deck:ready -- --levels=5 --limit=25
```
