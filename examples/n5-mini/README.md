# N5 Mini Demo Fixture

## Purpose

This tracked fixture gives a first-time reviewer a small, reproducible view of the generated kanji and word TSV surfaces without requiring ignored local `data/`, media, or `out/` directories.

## Scope

This is a demo fixture only. It does not replace readiness, Gold, Sapphire, Platinum, Obsidian, audio listening QA, Anki import QA, or `.apkg` packaging.

## Source Of Truth

The rows were copied from current generated N5 exports after:

```bash
npm run deck:ready -- --levels=5
npm run deck:words:ready -- --levels=5 --require-no-active-triage
```

## Inputs And Outputs

- [sample-input.json](sample-input.json) records sample identities and generation commands.
- [sample-kanji-output.tsv](sample-kanji-output.tsv) contains one exact kanji row for `日`.
- [sample-word-output.tsv](sample-word-output.tsv) contains one exact word row for `春雨|はるさめ`.

## Verification

Regenerate the N5 surfaces with the commands above, then compare the tracked TSV rows and input manifest. The TSV files are the exact fixture surfaces; the README contains no screenshots or synthetic previews.

## Failure Semantics

A fixture mismatch indicates generated schema or export drift. It does not certify the full deck or authorize a release claim.

## Update Triggers

Refresh this fixture when the generated N5 note schema, sample identities, generation commands, or exact sample rows change.
