# Japanese Kanji Anki Builder

A Node.js project for building JLPT kanji decks for Anki with deterministic exports, curated study data, managed media, offline-friendly previewing, readiness gates, and optional `.apkg` packaging.

## What this repo does

The project can:

- build TSV decks for JLPT N5 through N1
- infer learner-facing meanings, notes, and example sentences
- override inference with curated study data
- package import-ready deck artifacts and `.apkg` bundles
- manage stroke-order images, stroke-order animations, and audio assets
- preview cards even when upstream kanji enrichment is unavailable
- report setup health, media readiness, and per-level quality gates

## Quick start

Use this path first:

```bash
npm install
npm run doctor
npm run deck:readiness:global
npm run corpus:init
npm run curated:init
npm run media:init
$env:ENABLE_AUDIO='false'; npm run deck:readiness
npm run deck:preview -- --level=5 --limit=5
npm run deck:ready -- --levels=5 --limit=25
npm run deck:apkg -- --levels=5
```

If you are intentionally deferring audio work, keep `ENABLE_AUDIO=false` for readiness and reporting commands.

## Core workflows

### Check setup and readiness

```bash
npm run doctor
npm run deck:readiness
npm run deck:readiness:global
```

- `doctor` checks required datasets, optional local study data, media folders, managed media coverage, and next steps.
- `deck:readiness` shows the global per-level readiness report across N5 through N1.
- `deck:readiness:global` is an explicit alias for the same all-level readiness report when you want the command name to say exactly what it does.

### Bootstrap starter data

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

These commands create or extend local ignored datasets so the deck is usable before you build out full coverage. The tracked starter packs now carry complete N5 and N4 curated coverage plus the first four N3 starter batches for learner-facing meanings, notes, and example sentences, which makes preview and export output more stable even before deeper manual curation.

### Preview cards

```bash
npm run deck:preview -- --level=5 --limit=5
npm run deck:preview -- --kanji=日,本,学
npm run deck:review:n4
npm run deck:review:n5
```

- `deck:preview` shows the learner-facing study word, meaning, primary reading, on-yomi, kun-yomi, notes, example sentence, radical, and media presence.
- Preview and golden review now consume the split reading fields directly instead of depending on an internal combined-reading string.
- `deck:review:n4` and `deck:review:n5` run the tracked golden benchmark sets against hand-picked cards.
- Build/report CLIs now reject unsupported flags instead of silently ignoring them, and `deck:apkg` expects a fresh `deck:ready` package as its input.
- Shared CLI parsing helpers now live in `src/utils/cliArgs.js` so the main scripts handle flags consistently.
- Script entrypoints now consistently use `require.main === module` guards and export their `main`/`parseArgs` functions where applicable, which keeps them testable and safer to reuse.
- `deck:ready` coverage snapshots are scoped to the levels you requested, so a single-level build reports single-level media coverage instead of repo-wide totals.
- `deck:ready` now keeps its media coverage scan and package asset collection level-scoped, which makes single-level builds noticeably faster.
- `deck:ready` next-step guidance is also level-scoped, while still calling out project-wide readiness separately when other levels remain incomplete.
- If the upstream kanji API is unavailable, preview falls back to local sentence corpus, curated study data, radicals, and managed media.

### Build and package a deck

```bash
npm run deck:ready -- --levels=5 --limit=25
npm run deck:apkg -- --levels=5
```

`deck:ready` runs the main user-facing build path:

- validates setup
- syncs media
- builds exports
- packages the deck in `out/build/package`
- rebuilds packaged exports and media from a clean slate so stale files do not leak between runs
- prints a summary including quality and media status

`deck:apkg` converts the packaged exports and copied managed media into an Anki-importable `.apkg` file.
It now expects the current shared export schema exactly, which keeps package generation strict and prevents stale compatibility logic from masking drift.

Lower-level build:

```bash
npm run build:artifacts -- --levels=5,4 --limit=25
```

## Media workflows

### Common commands

```bash
npm run media:init
npm run media:plan -- --level=5 --limit=25
npm run media:plan:stroke-order -- --level=5 --limit=25
npm run media:discover:stroke-order -- --level=5 --limit=10
npm run media:fetch:stroke-order -- --level=5 --limit=20 --file-limit=4
npm run media:fetch:stroke-order -- --level=5 --limit=20 --file-limit=20 --probe-guessed
npm run media:import:stroke-order -- --input-dir=/path/to/files
npm run media:import:kanjivg -- --input-dir=/path/to/extracted-kanjivg/kanji --level=4
npm run media:import:audio -- --input-dir=/path/to/audio --level=5
npm run media:voicevox -- --list-speakers
npm run media:voicevox -- --level=5 --speaker-id=1 --concurrency=4
npm run media:sources -- --level=5 --limit=25
npm run media:sync -- --level=5 --limit=25
npm run media:report -- --limit=25
```

### Stroke-order acquisition

- `media:plan` shows accepted filenames for missing image, animation, and audio assets.
- `media:plan:stroke-order` builds a Wikimedia Commons checklist for missing stroke-order assets.
- `media:discover:stroke-order` combines Commons title search with file-prefix listing to find real asset names.
- `media:fetch:stroke-order` downloads confirmed Commons assets, and `--probe-guessed` will also try direct Commons redirect URLs for guessed filenames when discovery cannot confirm them.
- If you want an additional remote GIF source during sync, set `REMOTE_STROKE_ORDER_ANIMATION_BASE_URL=https://raw.githubusercontent.com/jcsirot/kanji.gif/master/kanji/gif/150x150/` in `.env`.
- `media:import:kanjivg` imports official KanjiVG SVG files into the repo's canonical source layout.

If you are focused only on stroke order, run readiness and media reporting with `ENABLE_AUDIO=false`.

### Audio acquisition

- `media:import:audio` imports local audio files into the source folder using the same candidate names the sync layer already supports.
- `media:voicevox` generates deterministic `.wav` files from a local VOICEVOX engine.

Recommended VOICEVOX flow:

```bash
npm run media:voicevox -- --list-speakers
npm run media:voicevox -- --level=5 --speaker-id=1 --concurrency=4
npm run media:sources -- --level=5 --limit=100
npm run media:sync -- --level=5 --limit=100
npm run deck:readiness
```

This assumes a local VOICEVOX engine is already running at `VOICEVOX_ENGINE_URL` or the default `http://127.0.0.1:50021`.

## Important commands

| Command | Purpose |
| --- | --- |
| `npm test` | Run the full test suite |
| `npm run lint` | Run ESLint |
| `npm run doctor` | Check setup, coverage, readiness, and next steps |
| `npm run deck:readiness` | Show the global per-level deck quality gates across all JLPT levels |
| `npm run deck:readiness:global` | Explicit alias for the all-level readiness report |
| `npm run deck:preview` | Preview cards before import |
| `npm run deck:review:n4` | Run the tracked golden N4 benchmark |
| `npm run deck:review:n5` | Run the tracked golden N5 benchmark |
| `npm run deck:ready` | Run the full build and package path |
| `npm run deck:apkg` | Build an importable `.apkg` from packaged kanji exports |`r`n| `npm run deck:words:ready` | Build and package the parallel word deck |`r`n| `npm run deck:words:apkg` | Build an importable `.apkg` from packaged word exports |
| `npm run build:artifacts` | Run the deterministic build pipeline |
| `npm run corpus:init` | Create or merge starter sentence corpus data |
| `npm run curated:init` | Create or merge starter curated study data |
| `npm run media:init` | Create media source folders and bootstrap `.env` |
| `npm run media:plan` | Show missing media by kanji with accepted filenames |
| `npm run media:plan:stroke-order` | Show Wikimedia Commons stroke-order checklist URLs |
| `npm run media:discover:stroke-order` | Discover real Wikimedia Commons titles for missing stroke-order assets |
| `npm run media:fetch:stroke-order` | Download confirmed Wikimedia stroke-order assets, or probe guessed filenames with `--probe-guessed` |
| `npm run media:import:stroke-order` | Import free local stroke-order assets |
| `npm run media:import:kanjivg` | Import KanjiVG SVG stroke-order files into the source tree |
| `npm run media:import:audio` | Import local kanji audio files into the source folder |
| `npm run media:voicevox` | Generate kanji audio from a local VOICEVOX engine |
| `npm run media:sources` | Report local source-folder coverage before media sync |
| `npm run media:sync` | Sync stroke-order and audio assets into managed storage for one level at a time |

## Local data and config

The project expects local ignored datasets under `data/`:

- `data/kanji_jlpt_only.json`
- `data/KRADFILE`
- `data/sentence_corpus.json`
- `data/curated_study_data.json`

Curated study entries can pin a learner-facing display form with `displayWord`, for example `{ "written": "上", "pron": "うえ" }`, so exports and offline previews stay aligned even when the highest-ranked dictionary word uses a different surface form. That same pronunciation now feeds the exported `PrimaryReading` field, which lets the Anki template lead with the learner-relevant reading while still keeping the complete reading inventory split into `OnReading` and `KunReading`.

Managed media is stored under:

- `data/media/`

Local source folders for acquisition:

- `data/media_sources/stroke-order/images/`
- `data/media_sources/stroke-order/animations/`
- `data/media_sources/audio/`

Optional VOICEVOX configuration in `.env`:

- `VOICEVOX_ENGINE_URL`
- `VOICEVOX_SPEAKER_ID`

More detailed local data guidance lives in [data/README.md](/C:/japanese_kanji_builder/data/README.md).

## Media model

The exported deck includes these fields:

- `StrokeOrder`
- `StrokeOrderImage`
- `StrokeOrderAnimation`
- `Audio`

Behavior:

- `DisplayWord` carries the learner-facing study form shown on the front of the card, such as `話す`, `行く`, or `今`.
- `MeaningJP` carries that learner-facing display word plus the English gloss.
- `PrimaryReading` carries the pronunciation of that learner-facing display word when one is available.
- `OnReading` keeps the full on-yomi list for reference.
- `KunReading` keeps the full kun-yomi list for reference.
- The TSV and both `.apkg` builders share that split-reading schema, so package generation stays aligned with export.
- The shared Anki note schemas live in `src/config/ankiNoteSchema.json` and `src/config/ankiWordNoteSchema.json`, which are the single sources of truth for exported field order, note type metadata, and card template layout for the kanji and word decks.
- `StrokeOrder` prefers animation when available, then static image.
- `StrokeOrderImage` exposes the static asset directly.
- `StrokeOrderAnimation` exposes the managed animation asset directly when one exists.
- Managed animation assets come only from real animation files (`.gif`, `.webp`, `.apng`).
- Static stroke-order image coverage and animation coverage are reported separately so card quality stays honest.
- `Audio` exports Anki sound markup when a managed audio asset exists.

Supported media sourcing:

- deterministic local filesystem lookup
- optional remote HTTP fallback providers
- managed per-kanji manifests for imported assets
- atomic manifest writes with per-kanji serialization

## Quality model

Deck quality is treated as a first-class contract.

Readiness checks evaluate:

- sentence coverage
- curated study coverage
- stroke-order coverage
- animation coverage as a separate diagnostic
- audio coverage when audio is enabled
- offline card quality for readings, meanings, examples, and contextual notes

Current default readiness thresholds are:

- sentence coverage: `90%`
- curated coverage: `60%`
- stroke-order coverage: `90%`

Use these commands to inspect quality:

```bash
npm run doctor
npm run deck:readiness
npm run deck:review:n5
```

## Output layout

Build artifacts are written to `out/build`:

- `exports/jlpt-n5.tsv`
- `reports/sentence-corpus-coverage.json`
- `reports/curated-study-coverage.json`
- `reports/media-coverage.json`
- `reports/media-sync.json`
- `build-summary.json`

Import-ready packaging is written to `out/build/package`.



