# Japanese Kanji Anki Builder

A Node.js project for building JLPT kanji and word study decks for Anki with deterministic exports, curated study data, managed media, offline-friendly previewing, readiness gates, optional `.apkg` packaging, release-style CI smoke verification, and a stricter Ubuntu release gate.

## What this repo does

The project can:

- build kanji decks for JLPT N5 through N1
- build parallel word decks grouped by JLPT level
- infer learner-facing meanings, notes, readings, and example sentences
- override inference with curated kanji and word study data
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
npm run words:init
npm run media:init
npm run deck:readiness
npm run deck:preview -- --level=5 --limit=5
npm run deck:ready -- --levels=5
npm run deck:apkg -- --levels=5
npm run deck:words:ready -- --levels=5
npm run deck:words:apkg -- --levels=5
```

Audio is advisory by default in readiness scoring: a deck can be `ready` without audio, and audio coverage is reported separately in readiness output.

## Core workflows

### Check setup and readiness

```bash
npm run doctor
npm run deck:readiness
npm run deck:readiness:global
```

- `doctor` checks required datasets, optional local study data, media folders, managed media coverage, local toolchain readiness, and next steps.
- `deck:readiness` shows the global per-level readiness report across N5 through N1.
- `deck:readiness:global` is an explicit alias for the same all-level readiness report when you want the command name to say exactly what it does.

### Bootstrap starter data

```bash
npm run corpus:init
npm run curated:init
npm run words:init
npm run media:init
```

Useful variants:

```bash
npm run corpus:init -- --merge
npm run curated:init -- --merge
npm run words:init -- --merge
```

These commands create or extend local ignored datasets so the decks are usable before you build out full coverage. The tracked starter packs now carry complete N5 and N4 kanji curation, the first six N3 kanji starter batches, the first tracked N1 starter batch of 8 kanji, and a 269-card curated N5 starter word pack for the word deck. Editor-local workspace files such as `.vscode/`, `.code-workspace`, and `.history/` are also ignored so local tooling does not dirty the repo.

### Preview and review cards

```bash
npm run deck:preview -- --level=5 --limit=5
npm run deck:preview -- --kanji=日,本,学
npm run deck:review:n2
npm run deck:review:n3
npm run deck:review:n4
npm run deck:review:n5
```

- `deck:preview` shows the learner-facing study word, meaning, primary reading, on-yomi, kun-yomi, notes, example sentence, radical, and media presence.
- Preview and golden review consume the split reading fields directly instead of depending on an internal combined-reading string.
- `deck:review:n2`, `deck:review:n3`, `deck:review:n4`, and `deck:review:n5` run the tracked golden benchmark sets against hand-picked kanji cards.
- `deck:words:review:n5` runs the tracked golden benchmark set against hand-picked N5 word cards.
- Build and report CLIs reject unsupported flags instead of silently ignoring them.
- The tracked N5 word benchmark now covers a broader representative slice of the deck, including older core cards and newer compound cards such as `映画`, `食べ物`, `飲み物`, `切手`, `本屋`, `日本語`, `起きる`, `公園`, `電気`, `三時`, `一時半`, `一万円`, `雨の日`, `上手`, `半分`, `辞書`, `読書`, `小学校`, `駅前`, `家の中`, `夜空`, `来ます`, `外国`, `生まれる`, `東京`, and `会話`.
- Shared CLI parsing helpers live in `src/utils/cliArgs.js` so the main scripts handle flags consistently.
- Script entrypoints consistently use `require.main === module` guards and export `main` and `parseArgs` where applicable.
- `deck:ready` coverage snapshots are scoped to the levels you requested, so a single-level build reports single-level media coverage instead of repo-wide totals.
- If the upstream kanji API is unavailable, preview falls back to local sentence corpus, curated study data, radicals, and managed media.
- Kanji deck exports never serialize raw upstream `ERROR:` text into card fields; export-time fallbacks are recorded in `reports/export-issues.json` and summarized in `build-summary.json`.
- Fully curated kanji rows use local JLPT metadata for readings and meanings before any remote kanji lookup, so finished decks can still pass strict builds even when the kanji API is flaky.

### Build and package the kanji deck

```bash
npm run deck:ready -- --levels=5
npm run deck:apkg -- --levels=5
```

`deck:ready` runs the main kanji build path:

- validates setup
- syncs media
- builds exports
- packages the deck in `out/build/package`
- rebuilds packaged exports and media from a clean slate so stale files do not leak between runs
- prints a summary including quality and media status
- fails with a non-zero exit code if any kanji export row required fallback data, unless you pass `--allow-export-fallbacks`
- writes `reports/export-issues.json` when any kanji row had to fall back to local data during export instead of using live API enrichment

`deck:apkg` converts the packaged exports and copied managed media into an Anki-importable `.apkg` file.

If you intentionally want a usable-but-degraded deck when the live kanji API is flaky, run `npm run deck:ready -- --levels=5 --allow-export-fallbacks`. The default `deck:ready` contract is now strict so fallback-built cards are surfaced as a failed build instead of silently shipping.

### Build and package the word deck

```bash
npm run deck:words:ready -- --levels=5
npm run deck:words:apkg -- --levels=5
```

The word deck is a separate Anki note type focused on real study words such as `今`, `今日`, `今年`, `話す`, and `日本語`. By default it is curated-only so the exported deck stays high precision while the word dataset grows.

Important word-deck rules:

- word identity is `written + reading`, and curated words tagged for a JLPT level are included even when their constituent kanji are outside that level's kanji slice
- curated word entries suppress uncurated alternate readings for the same written form
- kanji breakdown panels on the back prefer curated kanji display words and meanings, and can use dedicated breakdown-only overrides for compound contexts so cards like `銀行`, `会社`, `会社員`, `昼ご飯`, `晩ご飯`, `午前`, `午後`, `時間`, `月曜日`, `学校`, `病院`, `郵便局`, `去年`, `来月`, `来週`, `夕方`, `元気`, and `仕事` stay learner-friendly without changing primary study forms such as `行く`
- use `--include-inferred` when you explicitly want to expand beyond curated words during exploration

### Lower-level build

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
- GitHub `jcsirot/kanji.gif` is the default remote animation source during sync, so managed stroke-order animations stay fast and stylistically consistent.
- `media:plan:stroke-order` builds a Wikimedia Commons checklist for supplemental stroke-order assets, mainly static images and any manual fallback work you still want to do.
- `media:discover:stroke-order` combines Commons title search with file-prefix listing to find real Commons asset names when you are filling local gaps.
- `media:fetch:stroke-order` downloads confirmed Commons assets, and `--probe-guessed` also tries direct Commons redirect URLs for guessed filenames when discovery cannot confirm them.
- `REMOTE_STROKE_ORDER_ANIMATION_BASE_URL` is now populated in `.env.example`; override it only if you intentionally want a different remote animation source.
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

## CI verification

GitHub Actions now runs three verification lanes:

- an Ubuntu verification matrix on Node 20 and Node 22 for lint and the full automated test suite
- a cross-platform smoke matrix on Ubuntu, Windows, and macOS that seeds a deterministic fixture workspace with `npm run ci:smoke` and verifies kanji and word deck packaging paths from a clean checkout
- a dedicated Ubuntu release gate that provisions Python, runs `npm run release:gate -- --require-apkg-tools`, and asserts artifact contracts plus native `.apkg` generation

The smoke and release-gate jobs keep their generated `out/` trees as workflow artifacts so packaging regressions are easier to inspect after a failure.

## Repository governance

`main` should be protected in GitHub with required pull requests, code-owner review, stale-review dismissal, conversation resolution, and the exact required checks listed in [docs/branch-protection.md](docs/branch-protection.md).

The checked-in policy files in [.github/CODEOWNERS](.github/CODEOWNERS) and [docs/branch-protection.md](docs/branch-protection.md) are treated as part of the repo contract and are covered by automated tests.

## Release process

Tagged releases should follow [docs/release-process.md](docs/release-process.md), keep [CHANGELOG.md](CHANGELOG.md) current, and use `v<package.json version>` tags so version metadata, docs, and workflow triggers stay aligned.

The tagged workflow in [.github/workflows/release.yml](.github/workflows/release.yml) reruns release verification, publishes deterministic smoke and release-gate artifacts, and emits `release-artifacts.sha256` for traceability.

## Important commands

| Command | Purpose |
| --- | --- |
| `npm test` | Run the full test suite |
| `npm run lint` | Run ESLint |
| `npm run ci:smoke` | Seed a deterministic fixture workspace and smoke-test kanji plus word deck artifact generation |
| `npm run release:gate` | Assert smoke artifacts, TSV schemas, package summaries, and optionally require native `.apkg` tooling |
| `npm run doctor` | Check setup, coverage, readiness, and next steps |
| `npm run deck:readiness` | Show the global per-level deck quality gates across all JLPT levels |
| `npm run deck:readiness:global` | Explicit alias for the all-level readiness report |
| `npm run deck:preview` | Preview kanji cards before import |
| `npm run deck:review:n2` | Run the tracked golden N2 benchmark |
| `npm run deck:review:n3` | Run the tracked golden N3 benchmark |
| `npm run deck:review:n4` | Run the tracked golden N4 benchmark |
| `npm run deck:review:n5` | Run the tracked golden N5 kanji benchmark |
| `npm run deck:words:review:n5` | Run the tracked golden N5 word benchmark |
| `npm run deck:words:reading-audit:n5` | Audit curated N5 reading coverage against the current word deck; matching word cards count even when they use a fuller form like `後ろ` for `後` |
| `npm run deck:ready` | Run the full kanji build and package path (fails if export fallbacks occur unless `--allow-export-fallbacks` is set) |
| `npm run bench:build` | Benchmark the full kanji build path and capture phase timings |
| `npm run bench:build:gate` | Run the N3-N5 no-warmup build benchmark against the default regression budget |
| `npm run bench:export` | Benchmark kanji TSV export; defaults to a deterministic offline fixture mode and accepts `--live` for real API timing |
| `npm run deck:apkg` | Build an importable `.apkg` from packaged kanji exports |
| `npm run deck:words:ready` | Run the full word-deck build and package path |
| `npm run deck:words:apkg` | Build an importable `.apkg` from packaged word exports |
| `npm run build:artifacts` | Run the deterministic kanji build pipeline (`--fail-on-export-issues` available for strict scripting) |
| `npm run corpus:init` | Create or merge starter sentence corpus data |
| `npm run curated:init` | Create or merge starter curated kanji study data |
| `npm run curated:report -- --level=1 --limit=8` | Show the next high-value missing curated kanji for a level, ranked by cached word candidates |
| `npm run words:init` | Create or merge starter curated word study data |
| `npm run media:init` | Create media source folders and bootstrap `.env` |
| `npm run media:plan` | Show missing media by kanji with accepted filenames |
| `npm run media:plan:stroke-order` | Show Wikimedia Commons checklist URLs for supplemental stroke-order assets |
| `npm run media:discover:stroke-order` | Discover real Wikimedia Commons titles for missing supplemental stroke-order assets |
| `npm run media:fetch:stroke-order` | Download confirmed Wikimedia stroke-order assets, or probe guessed filenames with `--probe-guessed` |
| `npm run media:import:stroke-order` | Import free local stroke-order assets |
| `npm run media:import:kanjivg` | Import KanjiVG SVG stroke-order files into the source tree |
| `npm run media:import:audio` | Import local kanji audio files into the source folder |
| `npm run media:voicevox` | Generate kanji audio from a local VOICEVOX engine |
| `npm run media:sources` | Report local source-folder coverage before media sync |
| `npm run media:sync` | Sync stroke-order and audio assets into managed storage for one level at a time |

Build benchmark budget: `bench:build` accepts `--budget=default` plus optional overrides like `--budget-total-ms=4500`, `--budget-export-ms=2200`, `--budget-media-sync-ms=1300`, and `--budget-packaging-ms=550`. The default gate is tuned for the current N3-N5 no-audio path with modest headroom.

## Local data and config

The project expects local ignored datasets under `data/`:

- `data/kanji_jlpt_only.json`
- `data/KRADFILE`
- `data/sentence_corpus.json`
- `data/curated_study_data.json`
- `data/word_study_data.json`

Curated kanji study entries can pin a learner-facing display form with `displayWord`, for example `{ "written": "上", "pron": "うえ" }`, so exports and offline previews stay aligned even when the highest-ranked dictionary word uses a different surface form.

Runtime curated kanji loading uses the tracked base starter pack plus any tracked `starter_curated_study_data_*.json` batch files as the baseline, then layers local ignored overrides on top, so starter improvements keep flowing into builds without clobbering local edits.

Curated word study entries are keyed by `written|reading`, for example `今日|きょう`, so the word deck can intentionally keep `今日 / きょう` while excluding `今日 / こんにち` unless you curate both.

Managed media is stored under:

- `data/media/`

Local source folders for acquisition:

- `data/media_sources/stroke-order/images/`
- `data/media_sources/stroke-order/animations/`
- `data/media_sources/audio/`

Optional `.env` settings:

- `WORD_STUDY_DATA_PATH`
- `VOICEVOX_ENGINE_URL`
- `VOICEVOX_SPEAKER_ID`
- `REMOTE_STROKE_ORDER_IMAGE_BASE_URL`
- `REMOTE_STROKE_ORDER_ANIMATION_BASE_URL`
- `REMOTE_AUDIO_BASE_URL`

By default, `REMOTE_STROKE_ORDER_ANIMATION_BASE_URL` points at the GitHub `jcsirot/kanji.gif` set so animation sync prefers the same fast remote source across machines unless you intentionally override it.

More detailed local data guidance lives in [data/README.md](data/README.md).

## Deck model

### Kanji deck

The kanji deck exports fields such as:

- `DisplayWord`
- `MeaningJP`
- `PrimaryReading`
- `OnReading`
- `KunReading`
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

### Word deck

The word deck exports fields such as:

- `Word`
- `Reading`
- `Meaning`
- `JLPTLevel`
- `KanjiBreakdown`
- `ExampleSentence`
- `Notes`

Behavior:

- the front shows the written study word with no furigana
- the back shows the reading, English meaning, JLPT label, example sentence, and a compact kanji breakdown
- kanji breakdown panels prefer curated kanji display words and meanings, then fall back to bare-kanji meanings and reading lists; stroke-order study stays in the kanji deck so the word deck remains compact
- the shared Anki note schemas live in `src/config/ankiNoteSchema.json` and `src/config/ankiWordNoteSchema.json`, which are the single sources of truth for exported field order, note type metadata, and card template layout

## Media model

Supported media sourcing:

- deterministic local filesystem lookup
- optional remote HTTP fallback providers
- managed per-kanji manifests for imported assets
- atomic manifest writes with per-kanji serialization

Media behavior:

- `StrokeOrder` prefers animation when available, then static image.
- `StrokeOrderImage` exposes the static asset directly.
- `StrokeOrderAnimation` exposes the managed animation asset directly when one exists.
- The default managed animation path comes from the GitHub `jcsirot/kanji.gif` remote provider unless you override `REMOTE_STROKE_ORDER_ANIMATION_BASE_URL` or import a local animation file first.
- Managed animation assets come only from real animation files such as `.gif`, `.webp`, and `.apng`.
- Static stroke-order image coverage and animation coverage are reported separately so card quality stays honest.
- `Audio` exports Anki sound markup when a managed audio asset exists.

## Quality model

Deck quality is treated as a first-class contract.

Readiness checks evaluate:

- sentence coverage
- curated study coverage
- stroke-order coverage
- animation coverage as a separate diagnostic
- audio coverage as a separate advisory diagnostic when audio is enabled
- offline card quality for readings, meanings, examples, and contextual notes

Current default readiness thresholds are:

- sentence coverage: `90%`
- curated coverage: `60%`
- stroke-order coverage: `90%`

Audio coverage and full-media coverage are still reported, but they do not block the main `ready` state by default.

Use these commands to inspect quality:

```bash
npm run doctor
npm run deck:readiness
npm run deck:review:n2
npm run deck:review:n5
```

## Output layout

Kanji build artifacts are written to `out/build`:

- `exports/jlpt-n5.tsv`
- `reports/sentence-corpus-coverage.json`
- `reports/curated-study-coverage.json`
- `reports/media-coverage.json`
- `reports/media-sync.json`
- `reports/export-issues.json`
- `build-summary.json`

Word build artifacts are written to `out/word-build`:

- `exports/jlpt-n5-words.tsv`
- `reports/word-deck-summary.json`
- `build-summary.json`

Import-ready packaging is written to:

- `out/build/package`
- `out/word-build/package`


