# Japanese Kanji Anki Builder

A Node.js service for generating structured JLPT kanji TSV exports for Anki using `kanjiapi.dev`, KRADFILE radicals, deterministic export formatting, cache-backed upstream retrieval, a provider-ready stroke-order media pipeline, and a deterministic inference engine.

## Why This Project Exists

This project exists to generate clean, reusable, and customizable kanji study decks that can be imported directly into Anki and improved over time without rebuilding the entire pipeline from scratch.

The engineering direction for this repository is deliberate: treat even a personal project with production-style standards. That means clear structure, deterministic output, explicit configuration, operational endpoints, bounded concurrency, safe filesystem behavior, validation at system boundaries, and tests around the behavior that matters.

## Current Capabilities

- Builds JLPT kanji decks for N5-N1
- Generates deterministic TSV output for Anki import
- Extracts radicals/components from KRADFILE
- Adds example vocabulary with furigana-style readings
- Separates raw data fetching, inference, export orchestration, and media management into distinct modules
- Uses a deterministic inference engine to rank example words and derive learner-friendly `MeaningJP` and `Notes` output
- Prefers corpus-backed sentence candidates when a local sentence corpus is available, with deterministic template fallback otherwise
- Weights corpus sentence selection by source quality, learner-friendly tags, register, and optional frequency metadata
- Caches kanji and word API responses separately
- Validates upstream API payloads before they are cached or consumed
- Tracks cache and fetch metrics for readiness checks and benchmarks
- Deduplicates concurrent in-flight API requests
- Stores cache entries in sharded subdirectories to avoid a single oversized cache folder
- Supports local stroke-order image and animation ingestion through a provider-based service
- Writes per-kanji media manifests that can later expand to audio without changing storage contracts
- Populates the `StrokeOrder` TSV field with the best available media asset path when one exists
- Recovers from corrupted cache files automatically
- Exposes health, readiness, inference, media lookup, and media sync endpoints for operational visibility
- Runs CI on every push to `main`, every pull request, and on manual dispatch
- Includes automated tests for caching, concurrency, validation, inference, export formatting, HTTP behavior, stroke-order sync, and media manifests

## File Tree

This is the meaningful project tree after the corpus-backed sentence inference pass:

```text
C:\japanese_kanji_builder
├─ .github/
│  └─ workflows/
│     └─ ci.yml
├─ data/
│  └─ README.md
├─ scripts/
│  └─ benchmarkExport.js
├─ src/
│  ├─ app.js
│  ├─ config.js
│  ├─ logger.js
│  ├─ server.js
│  ├─ clients/
│  │  └─ kanjiApiClient.js
│  ├─ datasets/
│  │  ├─ kradfile.js
│  │  └─ sentenceCorpus.js
│  ├─ inference/
│  │  ├─ candidateExtractor.js
│  │  ├─ inferenceEngine.js
│  │  ├─ meaningInference.js
│  │  ├─ notesInference.js
│  │  ├─ ranking.js
│  │  └─ sentenceInference.js
│  ├─ services/
│  │  ├─ exportService.js
│  │  ├─ mediaStore.js
│  │  └─ strokeOrderService.js
│  └─ utils/
│     └─ text.js
├─ test/
│  ├─ app.test.js
│  ├─ exportService.test.js
│  ├─ kanjiApiClient.test.js
│  ├─ mediaStore.test.js
│  ├─ run-tests.js
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
  Loads an optional local sentence corpus for deterministic sentence selection.
- `src/inference/`
  Extracts word candidates, ranks them, and infers learner-facing meaning, notes, and sentence output.
- `src/services/exportService.js`
  Orchestrates kanji fetches, inference, stroke-order lookup, and TSV row generation.
- `src/services/mediaStore.js`
  Owns the managed media tree and manifest persistence.
- `src/services/strokeOrderService.js`
  Discovers local stroke-order assets and imports them into managed storage.
- `src/app.js`
  Exposes HTTP routes and operational endpoints.
- `src/server.js`
  Performs process startup and dependency wiring.

### Runtime Flow

1. `src/server.js` loads config and validates required datasets at startup.
2. KRADFILE, JLPT JSON, and the optional sentence corpus are loaded into memory once.
3. `src/app.js` builds the Express application from injected dependencies.
4. Export requests call `buildTsvForJlptLevel()` with bounded concurrency.
5. Each kanji fetches kanji metadata, word candidates, and best known stroke-order path concurrently.
6. The inference engine extracts candidates, ranks them deterministically, and returns learner-facing meaning, notes, and sentence candidates.
7. Sentence inference prefers corpus-backed matches and only falls back to templates when the corpus has no suitable example.
8. Upstream responses are validated, cached atomically on disk, and counted in client metrics.
9. Stroke-order sync scans local source directories, imports matching assets into the managed media tree, and updates the kanji manifest.
10. Audio can be added later to the same media manifest contract without redesigning the filesystem layout.

## Deterministic Inference Engine

The inference engine is intentionally deterministic rather than model-based.

Current inference layers:

- `candidateExtractor.js`
  normalizes word entries into comparable candidates
- `ranking.js`
  scores candidates using explicit heuristics
- `meaningInference.js`
  derives `bestWord`, `englishMeaning`, and `MeaningJP`
- `notesInference.js`
  derives the `Notes` field from top-ranked examples
- `sentenceInference.js`
  selects sentence candidates, preferring the local corpus before template fallback
- `inferenceEngine.js`
  composes the full learner-facing inference result

This keeps the system inspectable and testable while improving quality incrementally. The corpus-backed layer is the first major step away from generic sentence templates without giving up deterministic behavior.

Corpus sentence ranking currently favors:

- manually curated or trusted local sources over generic imports
- `core`, `common`, and `beginner` tags over `rare` or `archaic`
- neutral and spoken register over literary phrasing
- better optional frequency metadata when available

## Output Fields

The exported TSV includes these columns:

- `Kanji`
- `MeaningJP`
- `Reading`
- `StrokeOrder`
- `Radical`
- `Notes`

`StrokeOrder` contains the best available managed media path for the kanji when a synced stroke-order asset exists. The current preference order is animation first, then static image.

## Configuration

All paths are resolved from the repository root so local development and deployment are consistent.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3719` | HTTP server port |
| `CACHE_DIR` | `cache` | Root directory for local API cache |
| `JLPT_JSON_PATH` | `data/kanji_jlpt_only.json` | JLPT dataset |
| `KRADFILE_PATH` | `data/KRADFILE` | Radical/component dataset |
| `SENTENCE_CORPUS_PATH` | `data/sentence_corpus.json` | Optional local sentence corpus used to improve sentence inference |
| `KANJI_API_BASE_URL` | `https://kanjiapi.dev` | Upstream kanji API base URL |
| `MEDIA_ROOT_DIR` | `data/media` | Root directory for managed stroke-order and audio media assets |
| `STROKE_ORDER_IMAGE_SOURCE_DIR` | `data/media_sources/stroke-order/images` | Local source directory for stroke-order images |
| `STROKE_ORDER_ANIMATION_SOURCE_DIR` | `data/media_sources/stroke-order/animations` | Local source directory for stroke-order animations |
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
```

### Benchmark export throughput

```bash
npm run bench:export -- --level=5 --limit=25
```

Optional flags:

- `--concurrency=12`
- `--no-warmup`

The benchmark reports duration, rows per second, cache hit ratio, network fetches, and validation failures so you can measure changes before and after optimization work.

## Inference Workflow

1. Add sentence examples to `data/sentence_corpus.json` when you have better corpus material.
2. Call `GET /inference/:kanji` to inspect the current deterministic inference output.
3. Review the ranked candidates, inferred meaning, notes, and sentence candidates.
4. Tune scoring and selection rules in `src/inference/` rather than changing export formatting directly.
5. Re-run tests and the export benchmark after meaningful inference changes.

This route is the safest place to iterate on quality because it shows the intermediate reasoning results before the final deck export is generated.

### Sentence Corpus Shape

The optional local corpus accepts entries like:

```json
[
  {
    "kanji": "日",
    "written": "日本",
    "japanese": "日本へ行きます。",
    "reading": "にほんへいきます。",
    "english": "I will go to Japan.",
    "source": "manual-curated",
    "tags": ["core", "common", "beginner"],
    "frequencyRank": 120,
    "register": "neutral",
    "jlpt": 5
  }
]
```

Field notes:

- `source` helps prefer manually curated material over weaker imports
- `tags` can include signals like `core`, `common`, `beginner`, `rare`, or `archaic`
- `frequencyRank` is optional and rewards more common examples when present
- `register` should be one of `neutral`, `spoken`, `formal`, or `literary`
- `jlpt` is optional metadata for future learner-level filtering

## Stroke-Order Workflow

1. Place source assets into the configured local source directories.
2. Name them by kanji or codepoint, for example `日.svg`, `65E5.svg`, or `U+65E5.gif`.
3. Sync a kanji with `POST /media/日/sync`.
4. Inspect the managed manifest with `GET /media/日`.
5. Export a JLPT level and the `StrokeOrder` field will reference the best available synced asset.

Current provider behavior:

- scans only local source directories
- accepts common image formats such as `svg`, `png`, and `webp`
- accepts common animation formats such as `gif`, `webp`, `apng`, and `svg`
- copies assets into the managed media tree with deterministic filenames
- records checksum and source metadata in the manifest
- prefers animation over image when exporting the `StrokeOrder` field

## CI Policy

The repository includes [ci.yml](/C:/japanese_kanji_builder/.github/workflows/ci.yml), which enforces the baseline verification path in GitHub Actions.

Current CI guarantees:

- runs on pushes to `main`
- runs on every pull request
- supports manual `workflow_dispatch`
- verifies against Node.js 20 and 22
- uses `npm ci` for reproducible installs
- fails fast on lint or test regressions inside each job
- cancels outdated in-progress runs for the same ref

## HTTP Endpoints

### Service endpoints

- `GET /` basic liveness response
- `GET /healthz` lightweight health check
- `GET /readyz` readiness details including dataset counts, active config, and cache metrics

### Inference endpoints

- `GET /inference/:kanji` returns deterministic inference output for one kanji, including sentence candidates

### Media endpoints

- `GET /media/:kanji` returns the managed media manifest if one exists
- `POST /media/:kanji/sync` imports available local stroke-order assets for the kanji into managed storage

### Export endpoints

- `GET /export/N5`
- `GET /export/5`
- `GET /export/N5?limit=10`
- `GET /export/N5/download`
- `GET /export/N5/download?limit=10`

## Filesystem Strategy

The cache and media layers follow a more production-friendly model:

- Cache writes are atomic via temp-file rename.
- Kanji and word responses remain isolated by cache key.
- Cache files are stored in sharded subdirectories instead of a single flat folder.
- Corrupted cache entries are discarded and refetched automatically.
- Media assets have a dedicated root directory independent of export output.
- Each kanji gets a manifest with reserved slots for a stroke-order image, stroke-order animation, and audio assets.
- Stroke-order source files are copied into managed storage instead of being referenced in place.

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
- `audio[]`

This means the next phase can improve stroke-order providers or add audio synthesis/acquisition without changing how assets are organized on disk.

## Testing Strategy

The current test suite covers:

- export formatting and row construction
- deterministic inference output
- sentence candidate generation
- corpus-backed sentence preference and weighting
- word-ranking behavior
- cache creation and reuse
- in-flight request deduplication
- retry safety after failures
- corrupted cache recovery
- upstream payload validation
- health/readiness endpoint behavior
- inference endpoint behavior
- export download headers and request validation
- media layout and manifest persistence
- stroke-order source discovery and sync behavior

## Engineering Standard For This Repo

The working expectation for future changes is:

- no silent shortcuts when correctness can be made explicit
- prefer deterministic behavior over convenience
- keep structure clear enough for future growth
- validate inputs at integration boundaries
- update the README whenever behavior, architecture, or operations change
- preserve professional commit hygiene with focused, descriptive commits
- add tests when changing behavior or infrastructure
- keep CI green before merging
- benchmark meaningful performance changes instead of guessing

## Near-Term Improvement Ideas

- add request IDs and structured access logging
- support resumable offline export workflows
- add remote/provider adapters for stroke-order image and animation sources
- add media acquisition jobs with checksum verification
- add audio source adapters or synthesis jobs on top of the existing media manifest
- introduce typed contracts via JSDoc or TypeScript when the surface area grows further
