# Local datasets (not committed)

Place these files in this folder:

- `kanji_jlpt_only.json` - JLPT kanji list by level
- `KRADFILE` - kanji -> component/radical list
- `sentence_corpus.json` - optional sentence corpus for deterministic sentence selection

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

These datasets are ignored by git and must be downloaded or curated locally.
