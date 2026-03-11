# Japanese Kanji Anki Builder

A Node.js service for generating structured JLPT kanji TSV exports for Anki using `kanjiapi.dev`, KRADFILE radicals, deterministic export formatting, and cache-backed upstream retrieval.

## Why This Project Exists

This project exists to generate clean, reusable, and customizable kanji study decks that can be imported directly into Anki and improved over time without rebuilding the entire pipeline from scratch.

The engineering direction for this repository is deliberate: treat even a personal project with production-style standards. That means clear structure, deterministic output, explicit configuration, operational endpoints, bounded concurrency, safe filesystem behavior, and tests around the behavior that matters.

## Current Capabilities

- Builds JLPT kanji decks for N5-N1
- Generates deterministic TSV output for Anki import
- Extracts radicals/components from KRADFILE
- Adds example vocabulary with furigana-style readings
- Caches kanji and word API responses separately
- Deduplicates concurrent in-flight API requests
- Stores cache entries in sharded subdirectories to avoid a single oversized cache folder
- Recovers from corrupted cache files automatically
- Exposes health and readiness endpoints for operational visibility
- Runs CI on every push to `main`, every pull request, and on manual dispatch
- Includes automated tests for caching, concurrency, retries, export formatting, and HTTP behavior

## Architecture

```text
src/
  app.js             Express app factory and route wiring
  config.js          Environment parsing and path resolution
  exportService.js   TSV row generation, ranking, concurrency control
  kanjiApiClient.js  Upstream API client, caching, atomic file writes
  kradfile.js        KRADFILE parsing and component selection
  logger.js          Structured logging
  server.js          Bootstrap and process startup

test/
  app.test.js
  exportService.test.js
  kanjiApiClient.test.js
```

### Runtime Flow

1. `src/server.js` loads config and validates required datasets at startup.
2. KRADFILE and JLPT JSON are loaded into memory once.
3. `src/app.js` builds the Express application from injected dependencies.
4. Export requests call `buildTsvForJlptLevel()` with bounded concurrency.
5. Each kanji fetches kanji metadata and word candidates concurrently.
6. Upstream responses are cached atomically on disk for deterministic reruns and faster rebuilds.

## Output Fields

The exported TSV includes these columns:

- `Kanji`
- `MeaningJP`
- `Reading`
- `StrokeOrder`
- `Radical`
- `Notes`

`StrokeOrder` is intentionally blank right now because stroke-order assets are expected to be managed separately in Anki media.

## Configuration

All paths are resolved from the repository root so local development and deployment are consistent.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3719` | HTTP server port |
| `CACHE_DIR` | `cache` | Root directory for local API cache |
| `JLPT_JSON_PATH` | `data/kanji_jlpt_only.json` | JLPT dataset |
| `KRADFILE_PATH` | `data/KRADFILE` | Radical/component dataset |
| `KANJI_API_BASE_URL` | `https://kanjiapi.dev` | Upstream kanji API base URL |
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

## CI Policy

The repository now includes [ci.yml](/C:/japanese_kanji_builder/.github/workflows/ci.yml), which enforces the baseline verification path in GitHub Actions.

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
- `GET /readyz` readiness details including dataset counts and active config

### Export endpoints

- `GET /export/N5`
- `GET /export/5`
- `GET /export/N5?limit=10`
- `GET /export/N5/download`
- `GET /export/N5/download?limit=10`

## Filesystem Strategy

The cache layer now follows a more production-friendly model:

- Cache writes are atomic via temp-file rename.
- Kanji and word responses remain isolated by cache key.
- Cache files are stored in sharded subdirectories instead of a single flat folder.
- Corrupted cache entries are discarded and refetched automatically.

This matters because even a small personal tool can degrade over time if one directory grows without bounds or if reruns depend on brittle filesystem assumptions.

## Testing Strategy

The current test suite covers:

- export formatting and row construction
- word-ranking behavior
- cache creation and reuse
- in-flight request deduplication
- retry safety after failures
- corrupted cache recovery
- health/readiness endpoint behavior
- export download headers and request validation

## Engineering Standard For This Repo

The working expectation for future changes is:

- no silent shortcuts when correctness can be made explicit
- prefer deterministic behavior over convenience
- keep structure clear enough for future growth
- update the README whenever behavior, architecture, or operations change
- preserve professional commit hygiene with focused, descriptive commits
- add tests when changing behavior or infrastructure
- keep CI green before merging

## Near-Term Improvement Ideas

- add schema validation for upstream API payloads
- add request IDs and structured access logging
- support resumable offline export workflows
- add benchmark scripts for export throughput at different concurrency levels
- introduce typed contracts via JSDoc or TypeScript when the surface area grows further
