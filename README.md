# Japanese Kanji Anki Builder

A Node.js service for generating structured JLPT kanji TSV exports for Anki using `kanjiapi.dev`, KRADFILE radicals, deterministic inference, cache-backed upstream retrieval, and managed media pipelines for stroke order and audio.

## Why This Project Exists

This repository is intentionally built with production-style standards even though it is a personal project. The goal is a kanji deck pipeline that stays correct, inspectable, and extensible as media, inference quality, and dataset coverage improve over time.

## Current Capabilities

- Builds JLPT kanji decks for N5-N1
- Generates deterministic TSV output for Anki import
- Extracts radicals/components from KRADFILE
- Infers learner-friendly `MeaningJP`, `Notes`, and `ExampleSentence` output
- Exports the top inferred sentence directly into the TSV
- Exports the best managed kanji-audio asset directly into the TSV when one is available
- Uses curated study overrides for meanings, notes, preferred words, blocked words, blocked sentence phrases, and top example sentences
- Uses sentence-corpus metadata to improve both word ranking and sentence selection
- Exposes score breakdowns so ranking decisions are inspectable and tunable
- Caches kanji and word API responses separately with validation, atomic writes, and in-flight deduplication
- Stores cache entries in sharded subdirectories to avoid oversized flat folders
- Supports local stroke-order image and animation ingestion into managed media storage
- Supports local kanji-audio ingestion into the same managed media tree
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
- `src/services/exportService.js`
  Orchestrates kanji fetches, inference, stroke-order lookup, audio lookup, and TSV generation.
- `src/services/mediaStore.js`
  Owns the managed media tree and manifest persistence.
- `src/services/strokeOrderService.js`
  Discovers local stroke-order assets and imports them into managed storage.
- `src/services/audioService.js`
  Discovers local kanji-audio assets, imports them into managed storage, and selects the best audio path.
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
7. Curated data can remove blocked words, filter bad sentence phrasing, reorder preferred words, override meaning/notes, and inject a top example sentence.
8. Upstream responses are validated, cached atomically on disk, and counted in client metrics.
9. Stroke-order and audio sync import matching local media into the managed per-kanji manifest.
10. The export service writes `StrokeOrder`, `Audio`, and `ExampleSentence` directly into the TSV.

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

`StrokeOrder` contains the best available managed stroke-order asset path, preferring animation over image.

`Audio` contains the best available managed kanji-audio path.

`ExampleSentence` contains the highest-ranked sentence candidate in compact TSV form:

- `Japanese ／ Reading ／ English`

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
| `EXPORT_CONCURRENCY` | `8` | Max kanji rows processed concurrently |
| `API_REQUEST_TIMEOUT` | `10000` | Upstream request timeout in milliseconds |
| `LOG_LEVEL` | `info` | Pino log level |

## Local Development

### Install

```bash
npm install
```

### Run the service

```bash
npm run dev
```

or

```bash
npm start
```

### Quality checks

```bash
npm run lint
npm test
npm run curated:normalize -- --check
npm run curated:report -- --limit=10
```

### Benchmark export throughput

```bash
npm run bench:export -- --level=5 --limit=25
```

## Inference Workflow

1. Add sentence examples to `data/sentence_corpus.json` when you have better corpus material.
2. Add deterministic overrides to `data/curated_study_data.json` when you know the best teaching choice already.
3. Normalize imported sentence data before relying on it in inference.
4. Normalize curated overrides before relying on them in inference.
5. Run corpus and curated coverage reports to see which kanji still need support.
6. Call `GET /inference/:kanji` to inspect ranked candidates, notes, curated flags, sentence candidates, and score breakdowns.
7. Tune logic in `src/inference/` rather than patching export formatting directly.

## Stroke-Order Workflow

1. Place source assets into the configured local source directories.
2. Name them by kanji or codepoint, for example `日.svg`, `65E5.svg`, or `U+65E5.gif`.
3. Sync a kanji with `POST /media/日/sync`.
4. Inspect the managed manifest with `GET /media/日`.
5. Export a JLPT level and the `StrokeOrder` field will reference the best available synced asset.

## Audio Workflow

1. Place source assets into `data/media_sources/audio/`.
2. Name them by kanji, codepoint, or kanji-plus-reading, for example `日.mp3`, `日_にち.mp3`, or `65E5.m4a`.
3. Sync a kanji with `POST /media/日/audio/sync`.
4. Optionally send JSON metadata such as `category`, `text`, `reading`, `voice`, and `locale`.
5. Inspect the managed manifest with `GET /media/日`.
6. Export a JLPT level and the `Audio` field will reference the best available synced asset.

## HTTP Endpoints

### Service endpoints

- `GET /`
- `GET /healthz`
- `GET /readyz`

### Inference endpoints

- `GET /inference/:kanji`

### Media endpoints

- `GET /media/:kanji` returns the managed media manifest plus best stroke-order and audio paths
- `POST /media/:kanji/sync` imports local stroke-order assets
- `POST /media/:kanji/audio/sync` imports local audio assets

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
- Stroke-order and audio source files are copied into managed storage instead of being referenced in place.

## Media Manifest Contract

Each kanji is assigned a directory under `data/media/kanji/<shard>/<codepoint>_<kanji>/`.

That directory is designed to hold:

- `images/`
- `animations/`
- `audio/`
- `manifest.json`

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
- health/readiness endpoint behavior
- inference endpoint behavior
- stroke-order source discovery and sync behavior
- audio source discovery, import, and selection behavior
- media layout and manifest persistence

## Engineering Standard For This Repo

- no silent shortcuts when correctness can be made explicit
- prefer deterministic behavior over convenience
- keep structure clear enough for future growth
- validate inputs at integration boundaries
- update the README whenever behavior, architecture, or operations change
- preserve professional commit hygiene with focused, descriptive commits
- add tests when changing behavior or infrastructure
- keep CI green before merging
