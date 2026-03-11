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
- Tracks provider hits, misses, errors, and last-success state for operational visibility
- Returns per-sync acquisition reports that show which providers were tried and which one won
- Persists per-kanji media manifests that can grow into richer provider and synthesis flows later
- Runs a deterministic build pipeline that normalizes datasets, syncs media, exports decks, and writes machine-readable reports into `out/build`
- Exposes health, readiness, inference, media lookup, stroke-order sync, and audio sync endpoints
- Runs CI on pushes, pull requests, and manual dispatch

## File Tree

```text
C:\japanese_kanji_builder
├─ .github/
│  ├─ ISSUE_TEMPLATE/
│  │  ├─ bug_report.yml
│  │  ├─ config.yml
│  │  └─ feature_request.yml
│  ├─ PULL_REQUEST_TEMPLATE/
│  │  └─ pull_request_template.md
│  ├─ workflows/
│  │  └─ ci.yml
│  └─ CODEOWNERS
├─ data/
│  └─ README.md
├─ scripts/
│  ├─ benchmarkExport.js
│  ├─ buildArtifacts.js
│  ├─ normalizeCuratedStudyData.js
│  ├─ normalizeSentenceCorpus.js
│  ├─ reportCuratedStudyCoverage.js
│  ├─ reportMediaCoverage.js
│  ├─ reportSentenceCorpusCoverage.js
│  └─ syncMedia.js
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
│  │  ├─ mediaCoverage.js
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
│  │  ├─ buildPipeline.js
│  │  ├─ exportService.js
│  │  ├─ mediaProviders.js
│  │  ├─ mediaServiceFactory.js
│  │  ├─ mediaStore.js
│  │  ├─ mediaSync.js
│  │  └─ strokeOrderService.js
│  └─ utils/
│     └─ text.js
├─ test/
│  ├─ app.test.js
│  ├─ audioService.test.js
│  ├─ buildPipeline.test.js
│  ├─ curatedStudyCoverage.test.js
│  ├─ curatedStudyData.test.js
│  ├─ exportService.test.js
│  ├─ kanjiApiClient.test.js
│  ├─ mediaCoverage.test.js
│  ├─ mediaProviders.test.js
│  ├─ mediaStore.test.js
│  ├─ mediaSync.test.js
│  ├─ run-tests.js
│  ├─ sentenceCorpus.test.js
│  ├─ sentenceCorpusCoverage.test.js
│  ├─ strokeOrderService.test.js
│  └─ inference/
│     └─ inferenceEngine.test.js
├─ CONTRIBUTING.md
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
- `src/datasets/mediaCoverage.js`
  Computes media coverage summaries from managed manifests.
- `src/inference/`
  Extracts candidates, ranks them, and derives learner-facing meaning, notes, and sentence output.
- `src/services/mediaProviders.js`
  Provides reusable local and remote media provider adapters plus provider metrics tracking.
- `src/services/mediaServiceFactory.js`
  Centralizes media-provider construction so the server, bulk sync job, and build pipeline all use the same wiring.
- `src/services/strokeOrderService.js`
  Resolves stroke-order assets through providers, tracks provider outcomes, and imports winning assets into managed storage.
- `src/services/audioService.js`
  Resolves audio assets through providers, tracks provider outcomes, and imports winning assets into managed storage.
- `src/services/mediaSync.js`
  Coordinates bounded-concurrency bulk media synchronization.
- `src/services/exportService.js`
  Orchestrates kanji fetches, inference, media lookup, and Anki-ready TSV generation.
- `src/services/buildPipeline.js`
  Runs the deterministic artifact pipeline for normalization, reporting, media sync, and export generation.
- `src/services/mediaStore.js`
  Owns the managed media tree and manifest persistence.
- `src/app.js`
  Exposes HTTP routes and operational endpoints.
- `src/server.js`
  Performs process startup and dependency wiring.

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
| `BUILD_OUT_DIR` | `out/build` | Root directory for deterministic build artifacts |
| `EXPORT_CONCURRENCY` | `8` | Max kanji rows processed concurrently |
| `API_REQUEST_TIMEOUT` | `10000` | Upstream request timeout in milliseconds |
| `LOG_LEVEL` | `info` | Pino log level |

## Build Pipeline

Run the full deterministic artifact pipeline with:

```bash
npm run build:artifacts
```

Useful options:

- `--levels=5,4,3`
- `--limit=25`
- `--concurrency=8`
- `--out-dir=out/build`
- `--skip-media-sync`
- `--audio-reading=にち`
- `--audio-voice=ja-JP-Neural2`
- `--audio-locale=ja-JP`

The pipeline:

- normalizes `sentence_corpus.json` when present
- normalizes `curated_study_data.json` when present
- optionally syncs stroke-order and audio media for the selected kanji set
- exports JLPT TSV artifacts into `out/build/exports`
- writes JSON reports into `out/build/reports`
- writes an overall `out/build/build-summary.json`

## Repository Governance

Community health files now define the expected contribution and review flow:

- `CONTRIBUTING.md` documents contribution standards and validation expectations
- `.github/CODEOWNERS` defines default review ownership
- `.github/PULL_REQUEST_TEMPLATE/pull_request_template.md` standardizes change summaries, risks, and verification
- `.github/ISSUE_TEMPLATE/` provides structured bug and feature intake

Recommended GitHub branch protection for `main`:

- require pull requests before merging
- require at least one approval
- require status checks to pass before merging
- require branches to be up to date before merging
- block force pushes
- block branch deletion

## Provider Observability

Provider metrics now track:

- total requests per provider
- hits per provider
- misses per provider
- errors per provider
- `lastSuccessAt`
- `lastErrorAt`
- `lastErrorMessage`

These metrics are exposed through `GET /readyz` under `mediaProviders`.

Media sync responses now also include an `acquisition` object that shows the ordered provider attempts for the current sync call, for example:

```json
{
  "image": [
    { "provider": "local-filesystem", "status": "miss" },
    { "provider": "remote-stroke-order-image", "status": "hit" }
  ]
}
```

## HTTP Endpoints

### Service endpoints

- `GET /`
- `GET /healthz`
- `GET /readyz` including cache metrics and media-provider metrics

### Inference endpoints

- `GET /inference/:kanji`

### Media endpoints

- `GET /media/:kanji` returns the managed media manifest plus best stroke-order and audio paths
- `POST /media/:kanji/sync` imports local or remote stroke-order assets and returns acquisition details
- `POST /media/:kanji/audio/sync` imports local or remote audio assets and returns acquisition details

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
- provider metrics and acquisition reporting
- stroke-order source discovery and sync behavior
- audio source discovery, import, and selection behavior
- build-pipeline artifact generation
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
