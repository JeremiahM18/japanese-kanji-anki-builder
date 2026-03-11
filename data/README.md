# Local datasets (not commited)

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
    "source": "local-corpus",
    "tags": ["core"]
  }
]
```

These datasets are ignored by git and must be downloaded or curated locally.
