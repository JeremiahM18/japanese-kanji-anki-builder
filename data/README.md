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

Recommended curated study data format:

```json
{
  "日": {
    "englishMeaning": "sun / day marker",
    "preferredWords": ["日本"],
    "blockedWords": ["日中"],
    "notes": "日本 （にほん） - Japan ／ curated-note",
    "exampleSentence": {
      "japanese": "日本は島国です。",
      "reading": "にほんはしまぐにです。",
      "english": "Japan is an island nation."
    }
  }
}
```

Curated study field notes:

- `englishMeaning` overrides the inferred English meaning for that kanji
- `preferredWords` lifts specific words to the front of ranking in the listed order
- `blockedWords` removes known-bad words from learner-facing output
- `notes` overrides the inferred `Notes` field directly
- `exampleSentence` becomes the top `ExampleSentence` and first sentence candidate in inference output

These datasets are ignored by git and must be downloaded or curated locally.
