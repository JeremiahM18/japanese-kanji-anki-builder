# Japanese Kanji Anki Builder

Build governed JLPT kanji and word decks for Anki.

The repository produces deterministic TSV exports and optional `.apkg` packages, backed by tracked contracts, curated starter data, managed media, review benchmarks, and release gates.

## Scope

- Kanji decks for JLPT N5 through N1.
- Word decks grouped by JLPT level.
- Curated learner-facing readings, meanings, examples, notes, and media.
- Managed stroke-order images, looping stroke-order animations, and governed audio.
- Offline-safe preview, review, build, and package commands.
- CI smoke verification and release-gate validation.

## Quick Start

```bash
npm install
npm run doctor
npm run doctor:voicevox
npm run deck:readiness:global
npm run corpus:init
npm run curated:init
npm run words:init
npm run media:init
npm run deck:preview -- --level=5 --limit=5
npm run deck:ready -- --levels=5
npm run deck:apkg -- --levels=5
npm run deck:words:ready -- --levels=5
npm run deck:words:apkg -- --levels=5
```

Audio does not block the default kanji deck `ready` state. Audio coverage is reported separately and must pass the audio policy before it ships.

## Source Of Truth

Tracked contracts define release behavior:

- JLPT kanji taxonomy: [templates/jlpt_level_contract.json](templates/jlpt_level_contract.json)
- JLPT word taxonomy: [templates/jlpt_word_level_contract.json](templates/jlpt_word_level_contract.json)
- Audio source policy: [templates/audio_source_policy.json](templates/audio_source_policy.json)
- Kanji note schema: [src/config/ankiNoteSchema.json](src/config/ankiNoteSchema.json)
- Word note schema: [src/config/ankiWordNoteSchema.json](src/config/ankiWordNoteSchema.json)
- Golden kanji review sets: [templates/golden_n5_review_set.json](templates/golden_n5_review_set.json), [templates/golden_n4_review_set.json](templates/golden_n4_review_set.json)
- Golden word review sets: [templates/golden_n5_word_review_set.json](templates/golden_n5_word_review_set.json)

Local ignored files under `data/` are workspace inputs, not product truth. Use audits to verify them against tracked contracts.

## Product Rules

Kanji decks:

- Each shipped kanji belongs to the tracked JLPT kanji contract.
- N5 and N4 kanji are fully protected by golden review coverage.
- `deck:ready` fails on export fallbacks unless `--allow-export-fallbacks` is explicit.
- Stroke-order images and animations are separate readiness surfaces.
- Audio is governed by policy before it is treated as releasable.

Word decks:

- Word identity is `written|reading`.
- The canonical word contract means default-deck eligible.
- Source-only phrase exclusions stay tracked but do not ship as default word cards.
- Standalone single-kanji words stay in their own JLPT level.
- Lower-level decks may include multi-kanji support words containing higher-level or outside-JLPT constituent kanji.
- Cross-level and outside-JLPT constituent kanji must be visibly labeled on the card.
- Reading coverage is cumulative across easier decks. N4 does not duplicate readings already taught by N5 unless there is an explicit editorial reason.
- Track reading-coverage intent with `coverage.role`, `coverage.focusKanji`, and `coverage.coversReadings` when the card exists for coverage.
- Sentence orthography review is advisory. It flags likely kana-only regressions without banning natural kana usage.

## Current Baseline

| Surface | Status |
| --- | --- |
| N5 kanji | Ready, golden-reviewed |
| N4 kanji | Ready, golden-reviewed |
| N5 word | `ready_with_deferred_variants` |
| N4 word | Active completion work |
| N5 word audio | Governed and reviewable |
| N4 word media | Audio, pitch accent, card-back fields, and looping animations are ready; reading coverage is still incomplete |

Current tracked word inventory:

- N5 canonical word rows: `339`
- N5 source-only phrase exclusions: `13`
- N4 canonical word rows: `364`
- N4 cumulative reading coverage: run `npm run deck:words:ready -- --levels=4 --require-no-active-triage` for the live value

Run live commands for current coverage. Do not rely on README numbers for release decisions.

## Standard Verification

Run before merging changes that affect decks, contracts, media, or release behavior:

```bash
npm test
npm run lint
npm run data:audit:jlpt
npm run data:audit:jlpt:words
npm run data:audit:audio -- --json
npm run deck:review:accessibility -- --deck-kind=kanji
npm run deck:review:accessibility -- --deck-kind=word
npm run release:gate
```

Add level-specific review commands for the surface being changed.

## Core Workflows

### Setup

```bash
npm run doctor
npm run doctor:voicevox
npm run deck:readiness
npm run deck:readiness:global
```

- `doctor` checks datasets, local files, media folders, managed media, tooling, and next steps.
- `doctor:voicevox` verifies the local VOICEVOX Nemo engine and pinned release speaker.
- `deck:readiness` and `deck:readiness:global` report per-level deck readiness.

### Bootstrap Local Data

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
npm run curated:init -- --refresh-starter
npm run words:init -- --merge
npm run words:init -- --refresh-starter
```

Tracked starter files are the baseline. Local ignored files may add workspace overrides. Runtime loaders refresh stale starter-derived local rows in memory before builds and audits.

### Preview And Review

```bash
npm run deck:preview -- --level=5 --limit=5
npm run deck:preview -- --kanji=日,本,学
npm run deck:review:n5
npm run deck:review:n4
npm run deck:review:coverage
npm run deck:words:review:n5
```

Review commands protect learner-facing card output rather than raw field presence.

### Build Kanji Decks

```bash
npm run deck:ready -- --levels=5
npm run deck:apkg -- --levels=5
```

`deck:ready` validates setup, syncs media, builds exports, packages files under `out/build/package`, rebuilds from a clean package directory, reports media and quality status, and fails on export fallbacks by default.

Use `--allow-export-fallbacks` only for an explicitly degraded local artifact.

### Build Word Decks

```bash
npm run deck:words:ready -- --levels=5
npm run deck:words:apkg -- --levels=5
```

Word readiness reports:

- shipped row governance
- canonical inventory counts
- source-only exclusions
- explicit reading-coverage contract counts
- cumulative reading coverage
- active triage backlog
- deck-policy violations
- sentence orthography review
- reading-breakdown review
- card-back field readiness
- pitch-accent review
- true looping animation coverage
- word-audio review where enabled

Use the N5 guard when changing stabilized N5 word content:

```bash
npm run deck:words:ready -- --levels=5 --require-no-active-triage
```

### Plan Word Reading Coverage

```bash
npm run deck:words:gap-plan:n4 -- --limit=50
npm run deck:words:gap-plan:n4 -- --only=contract-extensions --quality=strong --limit=15 --suggestions=3
```

The gap planner ranks open reading coverage work and suggests candidate support words from:

- tracked word entries
- sentence corpus rows
- local kanjiapi word cache evidence

Planner output is advisory. A suggested card still needs canonical contract coverage, explicit reading intent, cross-level labels, media, sentence review, and deck-policy validation before shipping.

## Media Workflows

### Stroke Order

```bash
npm run media:plan -- --level=5 --limit=25
npm run media:plan:stroke-order -- --level=5 --limit=25
npm run media:plan:stroke-order -- --animation-only --discover --level=5 --limit=25
npm run media:discover:stroke-order -- --level=5 --limit=10
npm run media:fetch:stroke-order -- --animation-only --level=5 --limit=20 --file-limit=4
npm run media:import:stroke-order -- --input-dir=/path/to/files
npm run media:import:kanjivg -- --input-dir=/path/to/extracted-kanjivg/kanji --level=4
npm run media:sync -- --level=5 --limit=25
npm run media:report:animations -- --level=5 --limit=25
npm run data:audit:stroke-order -- --json
```

Managed animation priority:

1. `REMOTE_STROKE_ORDER_ANIMATION_BASE_URL`
2. `REMOTE_STROKE_ORDER_ANIMCJK_BASE_URL`
3. local source files

True animation coverage requires real looping animation assets. Static images and SVG fallbacks do not satisfy that rule.
Stroke-order release provenance is governed by `templates/stroke_order_source_policy.json`; run the audit before treating new media as release-ready.

### Audio

```bash
npm run media:voicevox -- --list-speakers
npm run media:voicevox -- --level=5 --speaker-id=10005 --concurrency=4
npm run media:voicevox:words -- --level=5 --speaker-id=10005 --concurrency=4
npm run media:sync -- --level=5 --limit=100
npm run media:sync:words -- --level=5
npm run media:review:audio -- --level=5 --limit=25
npm run media:review:word-audio -- --level=5 --limit=25
npm run data:audit:audio -- --json
```

The release audio policy requires:

- VOICEVOX Nemo
- pinned release speaker `女声1`, style id `10005`
- explicit source, voice, locale, and category provenance
- one release audio source
- no remote-audio release provider

Generated audio must pass review before release.

## CI And Release

GitHub Actions verification:

- Ubuntu lint and full test matrix on Node 18, 20, and 22.
- Cross-platform smoke matrix on Ubuntu, Windows, and macOS for Node 18 and 22.
- Ubuntu release gate on Node 22 with native `.apkg` packaging validation.

Release process:

- Follow [docs/release-process.md](docs/release-process.md).
- Keep [CHANGELOG.md](CHANGELOG.md) current.
- Use `v<package.json version>` tags.
- Keep [NOTICE.md](NOTICE.md) current for shipped attribution.

Repository governance:

- [docs/branch-protection.md](docs/branch-protection.md)
- [.github/CODEOWNERS](.github/CODEOWNERS)
- [CLAUDE.md](CLAUDE.md)

## Common Commands

| Command | Purpose |
| --- | --- |
| `npm test` | Run the full test suite |
| `npm run lint` | Run ESLint |
| `npm run ci:smoke` | Build deterministic smoke artifacts |
| `npm run release:gate` | Validate release artifact contracts |
| `npm run doctor` | Check setup, coverage, readiness, and next steps |
| `npm run doctor:voicevox` | Verify local governed VOICEVOX setup |
| `npm run deck:readiness` | Report per-level quality gates |
| `npm run deck:preview` | Preview kanji cards |
| `npm run deck:ready` | Build and package kanji TSV artifacts |
| `npm run deck:apkg` | Build kanji `.apkg` artifacts |
| `npm run deck:review:n5` | Run the N5 kanji golden benchmark |
| `npm run deck:review:n4` | Run the N4 kanji golden benchmark |
| `npm run deck:review:coverage` | Audit golden-review coverage |
| `npm run deck:words:ready` | Build and package word TSV artifacts |
| `npm run deck:words:apkg` | Build word `.apkg` artifacts |
| `npm run deck:words:review:n5` | Run the N5 word golden benchmark |
| `npm run deck:words:completion:n5` | Audit N5 word inventory and reading coverage |
| `npm run deck:words:completion:n4` | Audit N4 word inventory and reading coverage |
| `npm run deck:words:reading-audit:n4` | Audit N4 word reading coverage |
| `npm run deck:words:triage:n4` | Classify N4 word reading gaps |
| `npm run deck:words:gap-plan:n4 -- --limit=50` | Rank the next N4 word coverage batch |
| `npm run data:audit:jlpt` | Audit kanji taxonomy and starter alignment |
| `npm run data:audit:jlpt:words` | Audit word taxonomy and starter alignment |
| `npm run data:audit:audio` | Audit managed audio provenance |
| `npm run data:sync:jlpt` | Sync local ignored JLPT data to the tracked contract |
| `npm run corpus:init` | Create or merge sentence corpus data |
| `npm run curated:init` | Create or merge curated kanji data |
| `npm run words:init` | Create or merge curated word data |
| `npm run media:init` | Create media source folders and `.env` |
| `npm run media:plan` | Report missing media and accepted filenames |
| `npm run media:sync` | Sync media into managed storage |

## Local Data

Expected ignored workspace data:

- `data/kanji_jlpt_only.json`
- `data/KRADFILE`
- `data/sentence_corpus.json`
- `data/curated_study_data.json`
- `data/word_study_data.json`

Managed media:

- `data/media/`

Media source folders:

- `data/media_sources/stroke-order/images/`
- `data/media_sources/stroke-order/animations/`
- `data/media_sources/audio/`

Optional `.env` settings:

- `NODE_ENV`
- `WORD_STUDY_DATA_PATH`
- `VOICEVOX_ENGINE_URL`
- `VOICEVOX_SPEAKER_ID`
- `REMOTE_STROKE_ORDER_IMAGE_BASE_URL`
- `REMOTE_STROKE_ORDER_ANIMATION_BASE_URL`
- `REMOTE_STROKE_ORDER_ANIMCJK_BASE_URL`
- `REMOTE_AUDIO_BASE_URL`
- `MEDIA_MANIFEST_CACHE_TTL_MS`

## Pitch Accent Provenance

Word-card pitch accent data is source-governed separately from the starter vocabulary contract:

- `templates/word_pitch_accent_data.json` stores pitch patterns and source IDs.
- `npm run data:import:pitch:kanjium -- --levels=5` imports dictionary-backed matches from `downloads/kanjium/accents.txt`; use `--levels=4` for N4.
- `npm run data:import:pitch:voicevox -- --levels=5 --allow-reading-fallback` fills remaining generated pronunciation guidance from the local VOICEVOX Nemo engine; use `--levels=4` for N4.

Kanjium-derived entries are dictionary data under CC BY-SA 4.0 and must keep attribution in release notes. VOICEVOX-derived entries are generated accent-query results and are tracked with a different source ID; they are not described as dictionary-verified.

## Deck Model

Kanji card fields include:

- `DisplayWord`
- `MeaningJP`
- `PrimaryReading`
- `OnReading`
- `KunReading`
- `StrokeOrder`
- `StrokeOrderImage`
- `StrokeOrderAnimation`
- `Audio`

Word card fields include:

- `Word`
- `Reading`
- `ReadingBreakdown`
- `Audio`
- `PitchAccent`
- `Meaning`
- `JLPTLevel`
- `CoverageRole`
- `FocusKanji`
- `CoversReading`
- `KanjiBreakdown`
- `ExampleSentence`
- `Notes`

The front of a word card shows the written study word without furigana. The back uses `ReadingBreakdown` as the primary reading surface, then shows audio, verified pitch accent when available, meaning, JLPT label, coverage role, example sentence, notes, and a constituent kanji breakdown.

`ReadingBreakdown` is required for every shipped word card. Kanji words render learner-facing ruby furigana, kana-only words render the kana reading in the same position, and whole-word ruby fallback is used when safe segmentation is not available. Irregular compounds use curated overrides instead of unsafe automatic segmentation.

`PitchAccent` is a dedicated pronunciation field. In exported word cards it renders a learner-facing Tokyo pitch contour graph with mora labels and no redundant source-pattern caption. Leave it blank unless the accent pattern comes from a product-approved source in `templates/word_pitch_accent_data.json` or an explicitly curated override.

`KanjiBreakdown` includes constituent meanings, readings, stroke-order animation, and cross-level badges such as `JLPT N4 kanji`.

## Output Layout

Kanji build artifacts:

- `out/build/exports/`
- `out/build/reports/`
- `out/build/build-summary.json`
- `out/build/package/`

Word build artifacts:

- `out/word-build/exports/`
- `out/word-build/reports/`
- `out/word-build/build-summary.json`
- `out/word-build/package/`
