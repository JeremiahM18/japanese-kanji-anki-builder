# Local datasets (not committed)

Place these files in this folder:

- `kanji_jlpt_only.json` - JLPT kanji list by level
- `KRADFILE` - kanji to component/radical mapping
- `sentence_corpus.json` - optional sentence corpus for deterministic sentence selection
- `curated_study_data.json` - optional curated overrides for meaning, notes, preferred words, blocked words, and top example sentences

Optional local media source folders:

- `media_sources/stroke-order/images/`
- `media_sources/stroke-order/animations/`
- `media_sources/audio/`

## Local and remote media sources

The repository now supports both deterministic local-directory providers and optional remote HTTP fallback providers.

Remote configuration lives in environment variables:

- `REMOTE_STROKE_ORDER_IMAGE_BASE_URL`
- `REMOTE_STROKE_ORDER_ANIMATION_BASE_URL`
- `REMOTE_AUDIO_BASE_URL`

Remote providers look for the same candidate filenames you would use locally, appended to the configured base URL.

## Stroke-order source naming

Recommended free local names, including Wikimedia-style files:

- `<kanji>.svg`
- `<kanji>-bw.png`
- `<kanji>-red.png`
- `<kanji>-order.gif`
- `<KANJI_CODEPOINT>.svg`
- `<KANJI_CODEPOINT>-bw.png`
- `U+<KANJI_CODEPOINT>-order.gif`

Example for `日`:

- `日.svg`
- `日-bw.png`
- `日-red.png`
- `日-order.gif`
- `65E5.svg`
- `65E5-bw.png`
- `U+65E5-order.gif`

If you download stroke-order assets from Wikimedia Commons for personal use, keep the original attribution and license information with your source collection.

## Audio source naming

Recommended names:

- `<kanji>.mp3`
- `<kanji>_<reading>.mp3`
- `<kanji>-<reading>.wav`
- `<KANJI_CODEPOINT>.m4a`

Example for `日`:

- `日.mp3`
- `日_にち.mp3`
- `65E5.m4a`

## Audio sync endpoint

```bash
POST /media/日/audio/sync
```

Optional JSON body fields:

- `category` such as `kanji-reading`, `word-reading`, or `sentence`
- `text` to prefer a specific written form
- `reading` to prefer a specific spoken form
- `voice` to record voice provenance in the manifest
- `locale` to record locale metadata in the manifest

These datasets are ignored by git and must be downloaded or curated locally.

Managed media coverage report:

```bash
npm run media:report -- --limit=50
```

Bulk media sync:

```bash
npm run media:sync -- --level=5 --limit=25
npm run media:sync -- --kanji=日,本,学
```

Deterministic build pipeline:

```bash
npm run build:artifacts -- --levels=5,4 --limit=25
```

Artifacts are written to `out/build` by default:

- `exports/jlpt-n5.tsv`
- `reports/sentence-corpus-coverage.json`
- `reports/curated-study-coverage.json`
- `reports/media-coverage.json`
- `reports/media-sync.json`
- `build-summary.json`
## Free stroke-order import helper

If you have a folder of downloaded free stroke-order assets, import them into the project source layout with:

```bash
npm run media:import:stroke-order -- --input-dir=/path/to/downloaded/files
```

Optional flags:

- `--limit=250` to restrict matching to the first N kanji in the JLPT dataset
- `--json` for machine-readable output

The importer copies recognized image files into `media_sources/stroke-order/images/` and animation files into `media_sources/stroke-order/animations/`, while reporting skipped files that do not match supported naming patterns.
## Starter sentence corpus

Run this once to create a beginner-friendly starter sentence corpus in `data/sentence_corpus.json`:

```bash
npm run corpus:init
```

If you already have a sentence corpus and want to add the starter entries without overwriting your file:

```bash
npm run corpus:init -- --merge
```

The starter corpus is intentionally small and beginner-focused so preview and export quality improve immediately, and you can expand it over time with better or more specialized examples.

