# Japanese Kanji Anki Builder

A Node.js service for generating structured JLPT kanji TSV exports for Anki using `kanjiapi.dev`, KRADFILE radicals, deterministic inference, cache-backed upstream retrieval, and managed media pipelines for stroke order and audio.

## Why This Project Exists

This repository is intentionally built with production-style standards even though it is a personal project. The goal is a kanji deck pipeline that stays correct, inspectable, and extensible as media, inference quality, and dataset coverage improve over time.

## Current Capabilities

- Builds JLPT kanji decks for N5-N1
- Generates deterministic TSV output for Anki import
- Infers learner-friendly `MeaningJP`, `Notes`, and `ExampleSentence` output
- Exports Anki-ready `StrokeOrder`, `StrokeOrderImage`, `StrokeOrderAnimation`, and `Audio` fields
- Uses curated study overrides for meanings, notes, preferred words, blocked words, blocked sentence phrases, and top example sentences
- Uses sentence-corpus metadata to improve both word ranking and sentence selection
- Exposes score breakdowns so ranking decisions are inspectable and tunable
- Documents core media, inference, and build-artifact contracts with shared JSDoc typedefs
- Caches kanji and word API responses separately with validation, atomic writes, and in-flight deduplication
- Supports provider-based media acquisition for both stroke order and audio
- Supports configurable remote HTTP fallback providers for stroke-order images, stroke-order animations, and audio
- Tracks provider hits, misses, errors, and last-success state for operational visibility
- Returns per-sync acquisition reports that show which providers were tried and which one won
- Persists per-kanji media manifests that can grow into richer provider and synthesis flows later
- Serializes per-kanji media-manifest writes so concurrent stroke-order, animation, and audio syncs do not clobber each other
- Uses unique manifest temp files for atomic persistence under concurrent activity
- Indexes local media source directories by basename and refreshes the index only when the directory fingerprint changes
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
│  ├─ types/
│  │  └─ contracts.js
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
  Resolves stroke-order image and animation assets through providers, tracks provider outcomes, and imports winning assets into managed storage.
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
- `src/types/contracts.js`
  Defines shared JSDoc contracts for media, inference, provider, and build-artifact payloads.
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

## Contract Strategy

This repo now uses shared JSDoc contracts for the most important cross-module payloads instead of a full TypeScript migration.

Why this choice:

- it strengthens the highest-value boundaries immediately
- it keeps runtime and build tooling stable while the architecture is still evolving
- it improves editor help and onboarding without forcing a repo-wide rename/refactor pass
- it gives us a clear stepping stone to TypeScript later if the codebase stabilizes further

The current contract layer focuses on:

- media assets and manifests
- provider assets, attempts, and metrics
- ranked inference output and sentence candidates
- build normalization and artifact summaries

## Stroke Order Media

Stroke-order media is now surfaced in three ways:

- `StrokeOrder` uses the best available asset and prefers animation over static image
- `StrokeOrderImage` exposes the static asset directly when present
- `StrokeOrderAnimation` exposes the animation asset directly when present

That means a deck can keep a compatibility field while also using a dedicated animation field for kanji drawing playback.

`GET /media/:kanji` now returns:

- `bestStrokeOrderPath`
- `strokeOrderImagePath`
- `strokeOrderAnimationPath`

`GET /inference/:kanji` now returns:

- `strokeOrderPath`
- `strokeOrderImagePath`
- `strokeOrderAnimationPath`
- matching Anki-ready HTML fields for each

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

Local filesystem providers maintain a cached basename index per source directory. The index is refreshed only when the directory fingerprint changes, which keeps repeated image, animation, and audio lookups fast without sacrificing correctness when files are added or replaced.

Per-kanji manifest updates are also serialized across media services. That means concurrent stroke-order, animation, and audio syncs for the same kanji share one write lane and preserve each other's manifest changes instead of racing on a shared `manifest.json`.

## HTTP Endpoints

### Service endpoints

- `GET /`
- `GET /healthz`
- `GET /readyz` including cache metrics and media-provider metrics

### Inference endpoints

- `GET /inference/:kanji`

### Media endpoints

- `GET /media/:kanji` returns the managed media manifest plus best stroke-order, explicit image/animation paths, and best audio path
- `POST /media/:kanji/sync` imports local or remote stroke-order assets and returns acquisition details plus explicit image/animation paths
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
- stroke-order source discovery, explicit image/animation selection, and sync behavior
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

## Recent Concurrency Improvements

- Shared bounded-concurrency execution now lives in `src/utils/concurrency.js` and is reused by both export generation and bulk media sync.
- Bulk media sync now runs stroke-order and audio work in parallel for each kanji while preserving the top-level kanji concurrency cap.
- Per-kanji manifest serialization still protects correctness underneath, so the added parallelism improves throughput without reintroducing manifest races.

## Recent API Validation Improvements

- Route parameters and audio-sync request bodies are now validated with `zod` at the HTTP boundary before service execution.
- Invalid export parameters now return structured `400` JSON errors instead of ad hoc text responses.
- Missing media manifests return structured `404` JSON errors, and invalid audio-sync bodies return `422` `validation_error` responses with issue details.
- Malformed JSON request bodies now fail fast with a structured `400` `bad_request` response.

## Recent Lifecycle Improvements

- Server startup now runs through explicit runtime and listen helpers instead of a bare top-level `app.listen()` call.
- `SIGINT` and `SIGTERM` now trigger graceful shutdown, listener cleanup, and clean server close behavior.
- Shutdown is serialized so overlapping termination signals share one close path instead of racing.
- Graceful shutdown now has a timeout guard so hung closes are surfaced and treated as failures instead of stalling indefinitely.

## Recent User Workflow Improvements

- Run `npm run doctor` to get a human-readable setup report before trying to build decks.
- The doctor report checks required datasets, optional study datasets, local media source folders, and current coverage.
- The report also recommends the next highest-value step so setup and content work are easier to prioritize.
- Run `npm run doctor -- --json` if you want the same information in machine-readable form.

## Recent Deck Package Improvements

- `npm run build:artifacts` now creates an import-ready package in `out/build/package` alongside the raw reports and TSV exports.
- The package includes exported TSV files plus the exact referenced stroke-order image, stroke-order animation, and audio files that are currently available in managed media storage.
- `out/build/package/IMPORT.txt` explains how to import the TSV and copy the packaged media into Anki.
- You can also run `npm run deck:package` as a user-facing alias for the same packaging flow.
- Build summaries and package summaries now break media output down by stroke-order references, stroke-order images, stroke-order animations, and audio so coverage is visible at a glance.
## Recent Deck Ready Improvements

- Run `npm run deck:ready` to execute the user-facing happy path: validate setup, sync media, build exports, and package the ready-to-import deck in one command.
- The deck-ready summary reports packaged stroke-order references, stroke-order images, stroke-order animations, and audio fields so you can see which media areas are actually landing in the final package.
- The doctor report now shows media acquisition readiness for each channel, including whether local files exist and whether the matching remote fallback environment variable is configured.
- When a media channel is not ready, the doctor output now points directly at the local directory and remote environment variable you need to set.
## Recent Provider Setup Improvements

- The app now loads configuration from `.env` automatically, with normal environment variables still taking precedence.
- `.env.example` now includes the full local-media and remote-fallback configuration surface for stroke-order images, stroke-order animations, and audio.
- Run `npm run media:init` to create the expected media source directories and bootstrap a local `.env` from `.env.example` when one does not exist yet.
- This makes provider setup reproducible across machines and removes the need to hand-export environment variables before using `doctor`, `media:sync`, or `deck:ready`.
## Recent Free Media Improvements

- Local stroke-order import now recognizes Wikimedia-style free filenames such as `<kanji>-bw.png`, `<kanji>-red.png`, and `<kanji>-order.gif` in addition to the existing plain kanji and codepoint forms.
- That means you can build a zero-cost local stroke-order source library without renaming every file into a custom project format first.
- The local data guide in `data/README.md` now documents the recommended free naming scheme and reminds you to retain upstream attribution and license information when collecting those assets.
## Recent Free Import Improvements

- Run `npm run media:import:stroke-order -- --input-dir=/path/to/files` to scan a folder of downloaded free stroke-order assets and copy recognized files into the project media source layout.
- The importer classifies supported Wikimedia-style image and animation names, preserves unchanged files, and reports skipped files that do not match known patterns.
- This gives the free local-media path a practical ingestion workflow instead of requiring manual sorting and copying.
## Recent Preview Improvements

- Run `npm run deck:preview -- --level=5 --limit=5` to inspect sample cards before import.
- The preview report shows the chosen meaning, reading, radical, notes, example sentence, and whether stroke-order, animation, and audio are currently present for each card.
- You can also target specific kanji with `npm run deck:preview -- --kanji=日,本,学` to spot-check user-facing output for high-priority cards.
## Recent Sentence Quality Improvements

- Corpus sentence ranking now prefers shorter, more natural examples with reading metadata over long, literary, or definition-like lines.
- Sentence scoring now rewards learner-friendly signals such as brevity, neutral register, common tags, strong frequency metadata, and explicit readings.
- It also penalizes weak user-facing examples such as archaic phrasing, overly long lines, and sentence shapes that read like definitions instead of actual usage.
## Recent Sentence Corpus Improvements

- Run `npm run corpus:init` to create a small beginner-friendly starter sentence corpus in `data/sentence_corpus.json`.
- Re-run with `npm run corpus:init -- --merge` to blend the starter entries into an existing corpus without replacing your file.
- This gives the project a practical first step beyond template-only examples, so preview and export quality can improve immediately from the user perspective.

