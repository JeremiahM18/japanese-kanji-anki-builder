# Local Data Guide

This folder holds the local datasets and media that make the repo usable on a real workstation. These files are ignored by git on purpose: they are machine-local inputs, cached media, and editorial working data rather than source-controlled product code.

## What belongs here

Required local datasets:

- `kanji_jlpt_only.json` - JLPT kanji list by level
- `KRADFILE` - kanji-to-component and radical mapping

Optional but high-value local datasets:

- `sentence_corpus.json` - sentence corpus used for deterministic learner-facing example selection
- `curated_study_data.json` - local kanji curation overrides for meanings, notes, preferred words, blocked words, and examples
- `word_study_data.json` - local word-deck curation overrides keyed by `written|reading`, for example `今日|きょう`

Managed media output:

- `media/`

Local media source folders for acquisition and imports:

- `media_sources/stroke-order/images/`
- `media_sources/stroke-order/animations/`
- `media_sources/audio/`

## Recommended setup

Use the repo bootstrap commands before hand-editing files:

```bash
npm run corpus:init
npm run curated:init
npm run words:init
npm run media:init
```

Use these variants when you already have local files:

```bash
npm run corpus:init -- --merge
npm run curated:init -- --merge
npm run curated:init -- --refresh-starter
npm run words:init -- --merge
```

Guidance:

- Use `--merge` when you want new tracked starter content without overwriting local editorial work.
- Use `--refresh-starter` when tracked starter kanji entries improved and you want stale starter-derived local copies refreshed while keeping true local custom entries intact.
- Run `npm run data:verify:jlpt` after replacing or editing `kanji_jlpt_only.json` so missing rows or broken JLPT counts fail fast before they skew deck audits.
- Run `npm run data:audit:jlpt` when you want the full contract audit across local JLPT data, tracked starter curation, and tracked golden review placement.
- Run `npm run data:audit:jlpt:words` when you want to confirm the tracked starter word dataset still matches the repo-owned JLPT word-level contract.
- Run `npm run data:sync:jlpt` when a workstation copy of `kanji_jlpt_only.json` has drifted and you want to rewrite its `jlpt` levels to match the tracked contract.

The canonical repo-side JLPT taxonomy contract lives in [../templates/jlpt_level_contract.json](../templates/jlpt_level_contract.json). The local `kanji_jlpt_only.json` file is still required at runtime, but it is now treated as a workstation copy that must align to that tracked contract.

The canonical repo-side JLPT word-level contract lives in [../templates/jlpt_word_level_contract.json](../templates/jlpt_word_level_contract.json). It governs the tracked starter N5 and N4 word surfaces, with higher levels still treated as uncatalogued until tracked curation expands there.

The canonical repo-side release audio policy now lives in [../templates/audio_source_policy.json](../templates/audio_source_policy.json). Treat that file as the governing truth for shipped audio provenance and source discipline. The current release contract expects `voicevox-nemo` as the canonical shipped source, pins the release speaker to `女声1` (style id `10005`), requires explicit voice and locale metadata in managed manifests, and forbids a remote audio provider for released decks.

Before generating governed audio on a new machine, run `npm run doctor:voicevox`. That preflight verifies that the local VOICEVOX Nemo engine is reachable and that the pinned release speaker is actually installed, which is a much safer check than discovering a generic `fetch failed` during generation.

The canonical repo-side stroke-order source policy now lives in [../templates/stroke_order_source_policy.json](../templates/stroke_order_source_policy.json). Treat it as the governing truth for static image and animation provenance. The current release contract allows local/KanjiVG-style static images, allows the configured GitHub-backed animation mirrors, forbids remote static-image providers, and preserves source ids in managed manifests. Run `npm run data:audit:stroke-order -- --json` after changing media providers or importing stroke-order assets.

## Curated kanji data

Curated kanji entries are where the product locks in learner-facing choices that should not be left to generic inference.

Use curation when you need to pin:

- a better learner-facing display form
- clearer meanings or notes
- preferred or blocked study words
- a better example sentence

Example:

```json
{
  "上": {
    "displayWord": {
      "written": "上",
      "pron": "うえ"
    },
    "englishMeaning": "above / up",
    "notes": "上 （うえ） - above ／ 上手 （じょうず） - skillful"
  }
}
```

Runtime loading uses the tracked starter pack plus tracked `starter_curated_study_data_*.json` batch files as the base layer, then applies local ignored overrides on top. That means starter improvements flow into builds without clobbering intentional local edits.

## Curated word data

Curated word study entries define exact study targets for the word deck.

Key rule:

- word identity is `written|reading`
- use the `phrase` tag for curated entries that are useful as examples or references but should stay out of the default JLPT word deck, such as compositional phrases built from easier words
- keep the `jlpt` field aligned with the tracked word-level contract for any entry that is part of the governed starter word surface

That lets the deck intentionally keep `今日|きょう` while excluding `今日|こんにち` unless you explicitly curate both.

Example:

```json
{
  "今日|きょう": {
    "written": "今日",
    "reading": "きょう",
    "meaning": "today",
    "jlpt": 5,
    "notes": "Irregular reading. Learn this as a whole word.",
    "exampleSentence": {
      "japanese": "今日は図書館へ行きます。",
      "reading": "きょうはとしょかんへいきます。",
      "english": "Today I am going to the library."
    }
  }
}
```

## Media sourcing

The repo supports both local media imports and optional remote fallback providers.

Remote environment variables:

- `REMOTE_STROKE_ORDER_IMAGE_BASE_URL`
- `REMOTE_STROKE_ORDER_ANIMATION_BASE_URL`
- `REMOTE_STROKE_ORDER_ANIMCJK_BASE_URL`
- `REMOTE_AUDIO_BASE_URL`

The intended stroke-order animation priority is:

1. `REMOTE_STROKE_ORDER_ANIMATION_BASE_URL`
2. `REMOTE_STROKE_ORDER_ANIMCJK_BASE_URL`
3. local imported files

Use official KanjiVG static SVG imports, configured GitHub animation mirrors, or reviewed local source files with provenance captured in managed manifests.

### Stroke-order naming

Recommended source names include:

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

### Audio naming

Recommended source names include:

- `<kanji>.mp3`
- `<kanji>_<reading>.mp3`
- `<kanji>-<reading>.wav`
- `<KANJI_CODEPOINT>.m4a`

Example for `日`:

- `日.mp3`
- `日_にち.mp3`
- `65E5.m4a`

## Useful local-data workflows

Inspect managed media coverage:

```bash
npm run media:report -- --limit=50
```

Sync media for a level or explicit kanji list:

```bash
npm run media:sync -- --level=5 --limit=25
npm run media:sync -- --kanji=日,本,学
```

Import reviewed local stroke-order assets:

```bash
npm run media:import:stroke-order -- --input-dir=/path/to/downloaded/files
```

Import official KanjiVG SVGs:

```bash
npm run media:import:kanjivg -- --input-dir=/path/to/extracted-kanjivg/kanji --level=4
```

Import local audio:

```bash
npm run media:import:audio -- --input-dir=/path/to/audio --level=5
```

Generate audio from a local VOICEVOX engine:

```bash
npm run media:voicevox -- --list-speakers
npm run media:voicevox -- --level=5 --speaker-id=10005 --concurrency=4
npm run media:voicevox:words -- --level=5 --speaker-id=10005
npm run media:sync:words -- --level=5
```

The VOICEVOX generator now writes a sidecar JSON file next to each generated audio file so later managed-media sync can preserve release provenance instead of flattening everything into a generic local-file import. For a normal release-oriented run, leave the default source id alone so it stays aligned with `audio_source_policy.json`.

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

## Notes

- Keep original attribution and license information with any external source assets you download for personal use.
- Use the top-level [README](../README.md) for build, review, packaging, and release workflows. This file is only for local data and media guidance.
