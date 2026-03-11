# Japanese Kanji Anki Builder

A Node.js service for generating structured JLPT kanji TSV exports for Anki using `kanjiapi.dev`, KRADFILE radicals, deterministic export formatting, cache-backed upstream retrieval, and a provider-ready stroke-order media pipeline.

## Why This Project Exists

This project exists to generate clean, reusable, and customizable kanji study decks that can be imported directly into Anki and improved over time without rebuilding the entire pipeline from scratch.

The engineering direction for this repository is deliberate: treat even a personal project with production-style standards. That means clear structure, deterministic output, explicit configuration, operational endpoints, bounded concurrency, safe filesystem behavior, validation at system boundaries, and tests around the behavior that matters.

## Current Capabilities

- Builds JLPT kanji decks for N5-N1
- Generates deterministic TSV output for Anki import
- Extracts radicals/components from KRADFILE
- Adds example vocabulary with furigana-style readings
- Caches kanji and word API responses separately
- Validates upstream API payloads before they are cached or consumed
- Tracks cache and fetch metrics for readiness checks and benchmarks
- Deduplicates concurrent in-flight API requests
- Stores cache entries in sharded subdirectories to avoid a single oversized cache folder
- Supports local stroke-order image and animation ingestion through a provider-based service
- Writes per-kanji media manifests that can later expand to audio without changing storage contracts
- Populates the `StrokeOrder` TSV field with the best available media asset path when one exists
- Recovers from corrupted cache files automatically
- Exposes health, readiness, media lookup, and media sync endpoints for operational visibility
- Runs CI on every push to `main`, every pull request, and on manual dispatch
- Includes automated tests for caching, concurrency, validation, export formatting, HTTP behavior, stroke-order sync, and media manifests

## Architecture

```text
src/
  app.js                 Express app factory and route wiring
  config.js              Environment parsing and path resolution
  exportService.js       TSV row generation, ranking, concurrency control
  kanjiApiClient.js      Upstream API client, caching, atomic file writes, metrics
  kradfile.js            KRADFILE parsing and component selection
  logger.js              Structured logging
  mediaStore.js          Media filesystem layout and manifest persistence
  strokeOrderService.js  Stroke-order source discovery and local ingestion
  server.js              Bootstrap and process startup

scripts/
  benchmarkExport.js     Export throughput and cache-efficiency benchmark

test/
  app.test.js
  exportService.test.js
  kanjiApiClient.test.js
  mediaStore.test.js
  strokeOrderService.test.js
```

### Runtime Flow

1. `src/server.js` loads config and validates required datasets at startup.
2. KRADFILE and JLPT JSON are loaded into memory once.
3. `src/app.js` builds the Express application from injected dependencies.
4. Export requests call `buildTsvForJlptLevel()` with bounded concurrency.
5. Each kanji fetches kanji metadata, word candidates, and best known stroke-order path concurrently.
6. Upstream responses are validated, cached atomically on disk, and counted in client metrics.
7. Stroke-order sync scans local source directories, imports matching assets into the managed media tree, and updates the kanji manifest.
8. Audio can be added later to the same media manifest contract without redesigning the filesystem layout.

## Output Fields

The exported TSV includes these columns:

- `Kanji`
- `MeaningJP`
- `Reading`
- `StrokeOrder`
- `Radical`
- `Notes`

`StrokeOrder` now contains the best available managed media path for the kanji when a synced stroke-order asset exists. The current preference order is animation first, then static image.

## Configuration

All paths are resolved from the repository root so local development and deployment are consistent.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3719` | HTTP server port |
| `CACHE_DIR` | `cache` | Root directory for local API cache |
| `JLPT_JSON_PATH` | `data/kanji_jlpt_only.json` | JLPT dataset |
| `KRADFILE_PATH` | `data/KRADFILE` | Radical/component dataset |
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

Recommended GitHub branch settings:

- require pull requests before merging to `main`
- require the `CI / Verify Node 20` and `CI / Verify Node 22` checks to pass
- disable force pushes to `main`
- disable branch deletion for `main`

## HTTP Endpoints

### Service endpoints

- `GET /` basic liveness response
- `GET /healthz` lightweight health check
- `GET /readyz` readiness details including dataset counts, active config, and cache metrics

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

This matters because media generation adds more files, more formats, and more lifecycle decisions. The repository needs a stable contract before that growth starts.

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
- word-ranking behavior
- cache creation and reuse
- in-flight request deduplication
- retry safety after failures
- corrupted cache recovery
- upstream payload validation
- health/readiness endpoint behavior
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
