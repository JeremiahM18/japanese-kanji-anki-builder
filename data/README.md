# Local datasets (not committed)

Place these files in this folder:

- `kanji_jlpt_only.json` - JLPT kanji list by level
- `KRADFILE` - kanji -> component/radical list
- `sentence_corpus.json` - optional sentence corpus for deterministic sentence selection
- `curated_study_data.json` - optional curated overrides for meaning, notes, preferred words, blocked words, and top example sentences

Optional local media source folders:

- `media_sources/stroke-order/images/`
- `media_sources/stroke-order/animations/`

Recommended stroke-order source naming conventions:

- `<kanji>.svg`
- `<KANJI_CODEPOINT>.svg`
- `U+<KANJI_CODEPOINT>.gif`

Example for `日`:

- `日.svg`
- `65E5.svg`
- `U+65E5.gif`

Recommended sentence corpus format:

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

Sentence corpus field notes:

- `source` helps the inference engine prefer curated material
- `tags` can include `core`, `common`, `beginner`, `rare`, or `archaic`
- `frequencyRank` is optional and rewards more common examples
- `register` should be `neutral`, `spoken`, `formal`, or `literary`
- `jlpt` is optional metadata for future learner-level filtering

Sentence corpus normalization tooling:

```bash
npm run corpus:normalize
npm run corpus:normalize -- --check
npm run corpus:normalize -- --input=data/imports/sentences.json --output=data/sentence_corpus.json
```

Tooling behavior:

- treats a missing optional corpus file as clean in `--check` mode
- trims and validates every entry
- lowercases and deduplicates tags
- normalizes register values
- removes duplicate entries by `kanji + written + japanese`
- keeps the richer duplicate when two entries collide
- writes deterministically sorted JSON for cleaner diffs

Sentence corpus coverage reporting:

```bash
npm run corpus:report
npm run corpus:report -- --limit=50
```

Report behavior:

- measures coverage against the JLPT kanji dataset
- counts coverage from both sentence corpus entries and curated study overrides
- reports per-level totals, covered kanji, and missing kanji counts
- shows a prioritized sample of missing kanji to guide corpus growth

Recommended curated study data format:

```json
{
  "日": {
    "englishMeaning": "sun / day marker",
    "source": "manual-curated",
    "tags": ["core", "curated"],
    "jlpt": 5,
    "preferredWords": ["日本"],
    "blockedWords": ["日中"],
    "blockedSentencePhrases": ["daytime"],
    "notes": "日本 （にほん） - Japan ／ curated-note",
    "alternativeNotes": ["alt-note-a", "alt-note-b"],
    "exampleSentence": {
      "japanese": "日本は島国です。",
      "reading": "にほんはしまぐにです。",
      "english": "Japan is an island nation.",
      "tags": ["curated", "example"]
    }
  }
}
```

Curated study field notes:

- `englishMeaning` overrides the inferred English meaning for that kanji
- `source`, `tags`, and `jlpt` provide provenance and learner-level metadata for the override
- `preferredWords` lifts specific words to the front of ranking in the listed order
- `blockedWords` removes known-bad words from learner-facing output
- `blockedSentencePhrases` filters sentence candidates that contain known-bad phrasing
- `notes` overrides the inferred `Notes` field directly
- `alternativeNotes` stores additional approved notes for future tooling or manual selection
- `exampleSentence` becomes the top `ExampleSentence` and first sentence candidate in inference output

Curated study normalization tooling:

```bash
npm run curated:normalize
npm run curated:normalize -- --check
npm run curated:normalize -- --input=data/imports/curated.json --output=data/curated_study_data.json
```

Curated study coverage reporting:

```bash
npm run curated:report
npm run curated:report -- --limit=50
```

Curated reporting behavior:

- measures override coverage against the JLPT kanji dataset
- reports counts for custom meanings, notes, example sentences, blocked-word entries, and preferred-word entries
- shows prioritized missing kanji so you can decide where manual curation is most valuable

These datasets are ignored by git and must be downloaded or curated locally.
