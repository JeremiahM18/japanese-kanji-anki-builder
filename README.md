# Japanese Kanji Anki Builder

## About

Japanese Kanji Anki Builder is a local Node.js build system for producing Anki-ready JLPT kanji and word decks from governed source data.

It has two separate product surfaces:

- Kanji decks teach individual kanji. The card front is the single target kanji, the back starts from the exported primary reading and learner-facing meaning, and compounds are limited to examples and support notes.
- Word decks teach vocabulary by `written|reading`. They can include cross-level or outside-JLPT constituent kanji when the word is useful at the deck level, but those constituents must be labeled on the card.

The repository treats deck output as a versioned build artifact rather than ad hoc generated content. Tracked JSON contracts define JLPT inventory, word eligibility, note schemas, media policy, and review expectations. Build scripts generate deterministic TSV exports and optional `.apkg` packages for Anki. Audit, review, readiness, and release-gate commands block schema drift, missing media, export fallbacks, unreviewed learner-facing content, and local-only data from being treated as release-ready.

Ignored local files under `data/` are workspace inputs. They are not product truth unless a tracked contract or template promotes the data into the repository.

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
npm run corpus:init
npm run curated:init
npm run words:init
npm run media:init
npm run deck:ready -- --levels=5
npm run deck:words:ready -- --levels=5
```

Kanji deck readiness requires governed audio and complete exported media fields. A level with missing exact primary-reading audio must not be treated as ready even if the managed manifest inventory reports audio coverage.

Use the workflow sections below for preview, `.apkg`, media, audio, and release commands. Native `.apkg` commands require the Python packaging toolchain. If packaging is blocked on a workstation, use the readiness output and package directory for review, and run `.apkg` packaging in a supported environment before release.

## Source Of Truth

Tracked contracts define release behavior:

- JLPT kanji taxonomy: [templates/jlpt_level_contract.json](templates/jlpt_level_contract.json)
- JLPT word taxonomy: [templates/jlpt_word_level_contract.json](templates/jlpt_word_level_contract.json)
- Audio source policy: [templates/audio_source_policy.json](templates/audio_source_policy.json)
- Kanji note schema: [src/config/ankiNoteSchema.json](src/config/ankiNoteSchema.json)
- Word note schema: [src/config/ankiWordNoteSchema.json](src/config/ankiWordNoteSchema.json)
- Golden kanji review sets: [templates/golden_n5_review_set.json](templates/golden_n5_review_set.json), [templates/golden_n4_review_set.json](templates/golden_n4_review_set.json), [templates/golden_n3_review_set.json](templates/golden_n3_review_set.json), [templates/golden_n2_review_set.json](templates/golden_n2_review_set.json), [templates/golden_n1_review_set.json](templates/golden_n1_review_set.json)
- Golden word review sets: [templates/golden_n5_word_review_set.json](templates/golden_n5_word_review_set.json)

## Product Rules

Kanji decks:

- Each shipped kanji belongs to the tracked JLPT kanji contract.
- N5, N4, N3, and N2 kanji are fully protected by golden review coverage.
- N1 kanji golden review coverage is partial: `448/1231` reviewed as of the current baseline. N1 must not be treated as ready until golden coverage, exact primary-reading audio, and level readiness all pass.
- The kanji deck learning target is the individual kanji. `DisplayWord` is the target kanji itself, and `PrimaryReading` is the learner-facing reading for that kanji.
- Compound words belong in notes, examples, and word decks; they must not replace the kanji-card anchor.
- `deck:ready` fails on export fallbacks unless `--allow-export-fallbacks` is explicit.
- Static stroke-order images and looping animations are separate managed-media readiness surfaces.
- Audio is governed by policy and required for kanji deck readiness. Exported kanji cards must use exact audio for the target kanji and exported primary reading.

Word decks:

- Word identity is `written|reading`.
- The canonical word contract means default-deck eligible.
- Source-only phrase exclusions stay tracked but do not ship as default word cards.
- Standalone single-kanji words stay in their own JLPT level.
- Lower-level decks may include multi-kanji support words containing higher-level or outside-JLPT constituent kanji.
- Cross-level and outside-JLPT constituent kanji must be visibly labeled on the card.
- Reading coverage is scoped to the selected word-product levels. A higher-level word card can cover a lower-level reading target when those levels are built together.
- Track reading-coverage intent with `coverage.role`, `coverage.focusKanji`, and `coverage.coversReadings` when the card exists for coverage.
- Sentence orthography review is advisory. It flags likely kana-only regressions without banning natural kana usage.

## Current Baseline

| Surface | Status |
| --- | --- |
| N5 kanji | Golden-reviewed; current local deck readiness passes with complete exported media and exact primary-reading audio |
| N4 kanji | Golden-reviewed; current local deck readiness passes with complete exported media and exact primary-reading audio |
| N3 kanji | Golden-reviewed; current local deck readiness passes with complete exported media and exact primary-reading audio |
| N2 kanji | Golden-reviewed; current local deck readiness passes with complete exported media and exact primary-reading audio |
| N1 kanji | Golden review partial at `448/1231`; not ready because exact primary-reading audio is missing from exported cards |
| N5 word | Golden-reviewed; `ready_with_deferred_variants` in curated-only mode; audio, pitch accent, card-back fields, example reading alignment, and looping animations are complete for shipped rows |
| N4 word | `ready_with_deferred_variants` when built with N5 as the selected word-product scope; audio, pitch accent, card-back fields, example reading alignment, and looping animations are complete for shipped rows |

Current tracked word inventory:

- N5 canonical word rows: `348`
- N5 source-only phrase exclusions: `13`
- N4 canonical word rows: `474`
- Current N5+N4 word rows: `822`
- N5 word reading coverage: `83.7% (288/344)` when built alone
- N4 word reading coverage: `78.6% (512/651)` when built with N5 as the selected word-product scope
- N5+N4 word readiness: run `npm run deck:words:ready -- --levels=5,4 --require-no-active-triage` for the live value

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
npm run product:artifacts:n5
npm run product:artifacts:kanji:n5:preflight
npm run product:readiness:n5
npm run release:gate
```

`product:artifacts:n5` builds a fresh N5 word TSV from tracked templates only, with network inference disabled and ignored local `data/` word, sentence, JLPT, cache, and media inputs excluded. It validates schema, canonical row count, canonical-only governance, and deterministic repeated output. It does not yet certify tracked-source kanji TSVs, `.apkg` files, or managed media packages.

`product:artifacts:kanji:n5:preflight` inspects tracked templates and reports whether N5 kanji TSV certification is possible without ignored local `data/` inputs. It currently reports `certifiable: no` because explicit on-yomi, kun-yomi, and rich-source provenance are not yet tracked as product contracts. Component/radical source data is tracked in `templates/kanji_component_contract.json`. Use `-- --require-certifiable` only when the remaining contracts exist and the command is expected to fail closed.

`product:readiness:n5` runs the current automated N5 product checkpoint: JLPT kanji and word audits, governed audio provenance, tracked-source N5 word TSV generation, and N5 kanji and word golden reviews. It still does not validate tracked-source kanji TSVs, `.apkg` artifacts, manual Anki import review, mobile behavior, screen-reader behavior, or listening QA.

`release:gate` validates deterministic smoke-fixture artifacts and packaging contracts. It does not certify public product deck readiness. Add level-specific readiness, golden review, accessibility, provenance, and manual QA commands for the surface being changed.

## Core Workflows

### Setup

```bash
npm run doctor
npm run doctor:voicevox
npm run deck:readiness
```

- `doctor` checks datasets, local files, media folders, managed media, tooling, and next steps.
- `doctor:voicevox` verifies the local VOICEVOX Nemo engine and pinned release speaker.
- `deck:readiness` reports per-level deck readiness.

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
npm run deck:review:n3
npm run deck:review:n2
npm run deck:review:n1
npm run deck:review:coverage
npm run deck:review:coverage -- --level=1
npm run deck:words:review:n5
```

Review commands protect learner-facing card output rather than raw field presence.

### Build Kanji Decks

```bash
npm run deck:ready -- --levels=5
npm run deck:apkg -- --levels=5
```

`deck:ready` validates setup, syncs media, builds exports, packages files under `out/build/package`, rebuilds from a clean package directory, reports managed manifest coverage and exported card media completeness, and fails on export fallbacks by default. Exported card media completeness is the release-critical signal for kanji deck media readiness.

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
- selected-level reading coverage
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

True animation coverage requires real looping animation assets. Static images and SVG fallbacks do not satisfy that rule. Use the configured GitHub animation mirrors or reviewed local source files.
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
- Ubuntu release smoke gate on Node 22 with native `.apkg` packaging validation for fixture artifacts.

Release process:

- Follow [docs/release-process.md](docs/release-process.md).
- Keep [CHANGELOG.md](CHANGELOG.md) current.
- Use `v<package.json version>` tags.
- Keep [NOTICE.md](NOTICE.md) current for shipped attribution.

Repository governance:

- [docs/branch-protection.md](docs/branch-protection.md)
- [.github/CODEOWNERS](.github/CODEOWNERS)
- [CLAUDE.md](CLAUDE.md)

## Command Reference

| Command | Purpose |
| --- | --- |
| `npm test` | Run the full test suite |
| `npm run lint` | Run ESLint |
| `npm run ci:smoke` | Build deterministic smoke artifacts |
| `npm run release:gate` | Validate smoke-fixture release artifact contracts |
| `npm run product:artifacts:n5` | Build and validate the tracked-source N5 word TSV artifact |
| `npm run product:artifacts:kanji:n5:preflight` | Report whether tracked-source N5 kanji TSV certification is possible |
| `npm run product:readiness:n5` | Run the automated N5 product readiness checkpoint |
| `npm run doctor` | Check setup, coverage, readiness, and next steps |
| `npm run doctor:voicevox` | Verify local governed VOICEVOX setup |
| `npm run deck:readiness` | Report per-level quality gates |
| `npm run deck:preview` | Preview kanji cards |
| `npm run deck:ready` | Build and package kanji TSV artifacts |
| `npm run deck:apkg` | Build kanji `.apkg` artifacts |
| `npm run deck:review:n5` | Run the N5 kanji golden benchmark |
| `npm run deck:review:n4` | Run the N4 kanji golden benchmark |
| `npm run deck:review:n3` | Run the N3 kanji golden benchmark |
| `npm run deck:review:n2` | Run the N2 kanji golden benchmark |
| `npm run deck:review:n1` | Run the N1 kanji golden benchmark |
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
- `data/KRADFILE` as a local fallback only; governed deck builds prefer `templates/kanji_component_contract.json`
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
- `KanjiMeanings`
- `StudyWordKanji`
- `OnReading`
- `KunReading`
- `StrokeOrder`
- `Audio`

The front of a kanji card shows only the target kanji. The back starts with `PrimaryReading` plus the learner-facing meaning associated with that reading from `MeaningJP`. Broader kanji meanings live separately in `KanjiMeanings`; they must not be collapsed into the primary-reading line. Curated starter entries may use `blockedMeanings` to suppress low-value dictionary glosses from `KanjiMeanings` without hiding the governed learner-facing meaning. `StrokeOrder` is the single learner-facing looping stroke-order animation field; static stroke-order images remain managed media/provenance inputs but are not exported as Anki note fields. `DisplayWord` remains an exported contract field and must equal the target kanji, but it is not repeated as a visible card-back study word. `StudyWordKanji` is blank for kanji cards because the learning target is the individual kanji; compounds and study words belong in ruby-formatted notes, examples, and word decks. The build pipeline rejects kanji exports that replace the target-kanji anchor with a compound or omit the primary reading. Audio is selected only when managed media has an exact `kanji-reading` asset for the target kanji and exported primary reading.

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
