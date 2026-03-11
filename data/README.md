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

Recommended names:

- `<kanji>.svg`
- `<KANJI_CODEPOINT>.svg`
- `U+<KANJI_CODEPOINT>.gif`

Example for `日`:

- `日.svg`
- `65E5.svg`
- `U+65E5.gif`

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
