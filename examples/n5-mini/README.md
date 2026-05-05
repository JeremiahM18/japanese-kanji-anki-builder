# N5 Mini Demo Fixture

This fixture gives a first-time reviewer a small, tracked look at the generated deck surfaces without requiring the full ignored local `data/`, media cache, or `out/` directories.

It is a demo fixture only. It does not replace readiness, golden review, platinum review, audio listening QA, Anki import QA, or `.apkg` packaging.

The sample rows were copied from current generated N5 exports after running:

```bash
npm run deck:ready -- --levels=5
npm run deck:words:ready -- --levels=5 --require-no-active-triage
```

Files:

- [sample-input.json](sample-input.json) records the sample identities and generation commands.
- [sample-kanji-output.tsv](sample-kanji-output.tsv) contains one exact kanji-deck TSV row for `日`.
- [sample-word-output.tsv](sample-word-output.tsv) contains one exact word-deck TSV row for `春雨|はるさめ`.
- [screenshots/kanji-card.svg](screenshots/kanji-card.svg) and [screenshots/word-card.svg](screenshots/word-card.svg) are lightweight card previews built from the same sample fields.
