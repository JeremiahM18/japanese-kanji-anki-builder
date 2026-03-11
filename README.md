# Japanese Kanji Anki Builder

A Node.js service for generating structured JLPT kanji TSV exports for Anki using `kanjiapi.dev`, KRADFILE radicals, deterministic inference, cache-backed upstream retrieval, and managed media pipelines for stroke order and audio.

## Why This Project Exists

This repository is intentionally built with production-style standards even though it is a personal project. The goal is a kanji deck pipeline that stays correct, inspectable, and extensible as media, inference quality, and dataset coverage improve over time.

## Current Capabilities

- Builds JLPT kanji decks for N5-N1
- Generates deterministic TSV output for Anki import
- Infers learner-friendly `MeaningJP`, `Notes`, and `ExampleSentence` output
- Exports Anki-ready `StrokeOrder` and `Audio` fields
- Uses curated study overrides for meanings, notes, preferred words, blocked words, blocked sentence phrases, and top example sentences
- Uses sentence-corpus metadata to improve both word ranking and sentence selection
- Exposes score breakdowns so ranking decisions are inspectable and tunable
- Caches kanji and word API responses separately with validation, atomic writes, and in-flight deduplication
- Supports provider-based media acquisition for both stroke order and audio
- Supports configurable remote HTTP fallback providers for stroke-order images, stroke-order animations, and audio
- Persists per-kanji media manifests that can grow into richer provider and synthesis flows later
- Exposes health, readiness, inference, media lookup, stroke-order sync, and audio sync endpoints
- Runs CI on pushes, pull requests, and manual dispatch

## File Tree

```text
C:\japanese_kanji_builder
├─ .github/
│  └─ workflows/
│     └─ ci.yml
├─ data/
│  └─ README.md
├─ scripts/
│  ├─ benchmarkExport.js
│  ├─ normalizeCuratedStudyData.js
│  ├─ normalizeSentenceCorpus.js
│  ├─ reportCuratedStudyCoverage.js
│  └─ reportSentenceCorpusCoverage.js
├─ src/
│  ├─ app.js
│  ├─ config.js
│  ├─ logger.js
│  ├─ server.js
│  ├─ clients/
│  │  └─ kanjiApiClient.js
│  ├─ datasets/
│  │  ├─ curatedStudyCoverage.js
│  │  ├─ curatedStudyData.js
│  │  ├─ kradfile.js
│  │  ├─ sentenceCorpus.js
│  │  └─ sentenceCorpusCoverage.js
│  ├─ inference/
│  │  ├─ candidateExtractor.js
│  │  ├─ inferenceEngine.js
│  │  ├─ meaningInference.js
│  │  ├─ notesInference.js
│  │  ├─ ranking.js
│  │  └─ sentenceInference.js
│  ├─ services/
│  │  ├─ audioService.js
│  │  ├─ exportService.js
│  │  ├─ mediaProviders.js
│  │  ├─ mediaStore.js
│  │  └─ strokeOrderService.js
│  └─ utils/
│     └─ text.js
├─ test/
│  ├─ app.test.js
│  ├─ audioService.test.js
│  ├─ curatedStudyCoverage.test.js
│  ├─ curatedStudyData.test.js
│  ├─ exportService.test.js
│  ├─ kanjiApiClient.test.js
│  ├─ mediaProviders.test.js
│  ├─ mediaStore.test.js
│  ├─ run-tests.js
│  ├─ sentenceCorpus.test.js
│  ├─ sentenceCorpusCoverage.test.js
│  ├─ strokeOrderService.test.js
│  └─ inference/
│     └─ inferenceEngine.test.js
├─ README.md
├─ package.json
└─ package-lock.json
```

## Architecture

### Module responsibilities

- `src/clients/kanjiApiClient.js`
  Fetches and validates raw upstream kanji and word payloads.
- `src/datasets/kradfile.js`
  Loads KRADFILE radicals/components.
- `src/datasets/sentenceCorpus.js`
  Loads, normalizes, deduplicates, and sorts an optional local sentence corpus.
- `src/datasets/sentenceCorpusCoverage.js`
  Computes sentence corpus coverage summaries against JLPT kanji data.
- `src/datasets/curatedStudyData.js`
  Loads and normalizes curated overrides for kanji-specific teaching decisions.
- `src/datasets/curatedStudyCoverage.js`
  Computes curated override coverage and override-type summaries against JLPT kanji data.
- `src/inference/`
  Extracts candidates, ranks them, and derives learner-facing meaning, notes, and sentence output.
- `src/services/mediaProviders.js`
  Provides reusable local and remote media provider adapters.
- `src/services/strokeOrderService.js`
  Resolves stroke-order assets through providers and imports them into managed storage.
- `src/services/audioService.js`
  Resolves audio assets through providers and imports them into managed storage.
- `src/services/exportService.js`
  Orchestrates kanji fetches, inference, media lookup, and Anki-ready TSV generation.
- `src/services/mediaStore.js`
  Owns the managed media tree and manifest persistence.
- `src/app.js`
  Exposes HTTP routes and operational endpoints.
- `src/server.js`
  Performs process startup and dependency wiring.

### Runtime flow

1. `src/server.js` loads config and validates required datasets at startup.
2. JLPT JSON, KRADFILE, the optional sentence corpus, and optional curated study data are loaded once.
3. `src/app.js` builds the Express app from injected dependencies.
4. Export requests call `buildTsvForJlptLevel()` with bounded concurrency.
5. Each kanji fetches kanji metadata, word candidates, and best known stroke-order and audio paths concurrently.
6. The inference engine returns ranked candidates, `bestWord`, meaning output, notes, sentence candidates, and score breakdowns.
7. Media services query their configured local providers first, then remote HTTP providers when configured, import matching assets into managed storage, and update the per-kanji manifest.
8. The export service formats stroke order as `<img ...>` and audio as `[sound:...]` so the TSV is Anki-ready.

## Output Fields

The exported TSV includes these columns:

- `Kanji`
- `MeaningJP`
- `Reading`
- `StrokeOrder`
- `Audio`
- `Radical`
- `Notes`
- `ExampleSentence`

`StrokeOrder` is exported as Anki-ready image markup using the managed asset filename, for example `<img src="65E5_日-stroke-order.gif" />`.

`Audio` is exported as Anki-ready sound markup using the managed asset filename, for example `[sound:65E5_日-kanji-reading-日.mp3]`.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3719` | HTTP server port |
| `CACHE_DIR` | `cache` | Root directory for local API cache |
| `JLPT_JSON_PATH` | `data/kanji_jlpt_only.json` | JLPT dataset |
| `KRADFILE_PATH` | `data/KRADFILE` | Radical/component dataset |
| `SENTENCE_CORPUS_PATH` | `data/sentence_corpus.json` | Optional local sentence corpus |
| `CURATED_STUDY_DATA_PATH` | `data/curated_study_data.json` | Optional curated overrides |
| `KANJI_API_BASE_URL` | `https://kanjiapi.dev` | Upstream kanji API base URL |
| `MEDIA_ROOT_DIR` | `data/media` | Root directory for managed media assets |
| `STROKE_ORDER_IMAGE_SOURCE_DIR` | `data/media_sources/stroke-order/images` | Local stroke-order image source directory |
| `STROKE_ORDER_ANIMATION_SOURCE_DIR` | `data/media_sources/stroke-order/animations` | Local stroke-order animation source directory |
| `AUDIO_SOURCE_DIR` | `data/media_sources/audio` | Local kanji-audio source directory |
| `REMOTE_STROKE_ORDER_IMAGE_BASE_URL` | unset | Optional remote HTTP base URL for stroke-order images |
| `REMOTE_STROKE_ORDER_ANIMATION_BASE_URL` | unset | Optional remote HTTP base URL for stroke-order animations |
| `REMOTE_AUDIO_BASE_URL` | unset | Optional remote HTTP base URL for audio assets |
| `EXPORT_CONCURRENCY` | `8` | Max kanji rows processed concurrently |
| `API_REQUEST_TIMEOUT` | `10000` | Upstream request timeout in milliseconds |
| `LOG_LEVEL` | `info` | Pino log level |

## Provider Model

Both stroke order and audio use the same provider pattern.

Current provider support:

- local-directory provider for deterministic local ingestion
- remote HTTP directory provider for base-URL-driven fallback acquisition

Designed next steps:

- source ranking beyond simple local-then-remote fallback
- checksum-verified background acquisition jobs
- provider-specific retry policies and observability
- richer provenance and coverage reporting

## Audio Workflow

1. Place source assets into `data/media_sources/audio/`.
2. Name them by kanji, codepoint, or kanji-plus-reading, for example `日.mp3`, `日_にち.mp3`, or `65E5.m4a`.
3. Optionally configure `REMOTE_AUDIO_BASE_URL` for remote fallback.
4. Sync a kanji with `POST /media/日/audio/sync`.
5. Optionally send JSON metadata such as `category`, `text`, `reading`, `voice`, and `locale`.
6. Export a JLPT level and the `Audio` field will reference the managed Anki filename.

## Stroke-Order Workflow

1. Place source assets into the configured local source directories.
2. Name them by kanji or codepoint, for example `日.svg`, `65E5.svg`, or `U+65E5.gif`.
3. Optionally configure `REMOTE_STROKE_ORDER_IMAGE_BASE_URL` and `REMOTE_STROKE_ORDER_ANIMATION_BASE_URL` for remote fallback.
4. Sync a kanji with `POST /media/日/sync`.
5. Export a JLPT level and the `StrokeOrder` field will reference the managed Anki filename.

## HTTP Endpoints

### Service endpoints

- `GET /`
- `GET /healthz`
- `GET /readyz`

### Inference endpoints

- `GET /inference/:kanji`

### Media endpoints

- `GET /media/:kanji` returns the managed media manifest plus best stroke-order and audio paths
- `POST /media/:kanji/sync` imports local or remote stroke-order assets
- `POST /media/:kanji/audio/sync` imports local or remote audio assets

### Export endpoints

- `GET /export/N5`
- `GET /export/5`
- `GET /export/N5?limit=10`
- `GET /export/N5/download`
- `GET /export/N5/download?limit=10`

## Filesystem Strategy

- Cache writes are atomic via temp-file rename.
- Cache files are stored in sharded subdirectories instead of a single flat folder.
- Corrupted cache entries are discarded and refetched automatically.
- Media assets have a dedicated root directory independent of export output.
- Each kanji gets a manifest with reserved slots for a stroke-order image, stroke-order animation, and audio assets.
- Managed asset filenames are unique per kanji so they can be referenced safely from Anki media fields.
- Source files are copied into managed storage instead of being referenced in place.

## Media Manifest Contract

Each kanji is assigned a directory under `data/media/kanji/<shard>/<codepoint>_<kanji>/`.

The manifest currently tracks:

- `strokeOrderImage`
- `strokeOrderAnimation`
- `audio[]` with category, text, reading, voice, and locale metadata

## Testing Strategy

The current test suite covers:

- export formatting and row construction
- deterministic inference output
- curated study data loading, normalization, reporting, and overrides
- sentence corpus normalization, reporting, and loading
- ranking explainability breakdowns
- cache creation and reuse
- in-flight request deduplication
- corrupted cache recovery
- upstream payload validation
- local and remote provider behavior
- stroke-order source discovery and sync behavior
- audio source discovery, import, and selection behavior
- media layout and manifest persistence
- health/readiness endpoint behavior
- inference endpoint behavior

## Engineering Standard For This Repo

- no silent shortcuts when correctness can be made explicit
- prefer deterministic behavior over convenience
- keep structure clear enough for future growth
- validate inputs at integration boundaries
- update the README whenever behavior, architecture, or operations change
- preserve professional commit hygiene with focused, descriptive commits
- add tests when changing behavior or infrastructure
- keep CI green before merging
