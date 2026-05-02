# Product Exit Criteria

Deck milestones require product review. A passing script is not sufficient.

## Quality pillars

Evaluate each release checkpoint across:

- Core value
- User experience
- Accessibility
- Internationalization and localizability
- Technical quality
- Reliability and stability
- Privacy, security, and licensing

## Kanji deck exit criteria

A kanji level ships only when all criteria are true:

- Canonical JLPT taxonomy is governed by tracked contracts.
- Golden review coverage for that shipped level is complete.
- Platinum review is complete for the shipped kanji level. Golden review protects the export surface; platinum review decides whether each card deserves to ship.
- Exported cards preserve the individual-kanji learning contract: `DisplayWord` equals the target kanji, `PrimaryReading` is present, `MeaningJP` is the meaning associated with that primary reading, `KanjiMeanings` carries broader kanji meanings, curated `blockedMeanings` suppresses low-value dictionary glosses, and compound words do not replace the card anchor.
- `npm run deck:ready -- --levels=<level>` passes with `0` export fallback issues.
- Exported card media completeness is `100%` for the single learner-facing looping stroke-order field and audio field.
- Stroke-order animation coverage is `100%`.
- Audio is governed, audited, review-clean, and exact for the exported target kanji plus primary reading.
- Accessibility review has no unresolved blocker.

## Word deck exit criteria

A word level ships only when all criteria are true:

- Canonical word contract rows are fully built for the level.
- Platinum review is complete for the shipped word level. Golden review protects the export surface; platinum review decides whether each card deserves to ship.
- No standalone wrong-level cards ship in the deck.
- Constituent kanji are visibly labeled with JLPT level or outside-JLPT status.
- Reading coverage is reported honestly against the selected word-product level scope, including whether a target is covered by an earlier, same-level, or harder selected deck.
- Active triage is either resolved or intentionally deferred.
- Sentence orthography review has no unresolved blocker.
- Any shipped audio is governed, audited, and review-clean.
- Accessibility review has no unresolved blocker.

## Current product posture

- N5 kanji: golden-reviewed and current local deck readiness passes with complete exported media and exact primary-reading audio; platinum started at `12/80`
- N4 kanji: golden-reviewed and current local deck readiness passes with complete exported media and exact primary-reading audio; platinum not started
- N3 kanji: golden-reviewed and current local deck readiness passes with complete exported media and exact primary-reading audio; platinum not started
- N2 kanji: golden-reviewed and current local deck readiness passes with complete exported media and exact primary-reading audio; platinum not started
- N1 kanji: golden review partial at `640/1231`; not ready because exact primary-reading audio is missing from exported cards
- N5 word: golden-reviewed and `ready_with_deferred_variants`; platinum started at `12/348`
- N4 word: golden review partial at `348/468` and stabilized as `ready_with_deferred_variants` when built with N5 as the selected word-product scope; platinum not started

## Required gates before shipping

Minimum automated gate:

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

`product:artifacts:n5` validates fresh N5 word TSV generation from tracked templates only. It excludes ignored local word, sentence, JLPT, cache, and media inputs, disables network inference, checks the word schema header, verifies canonical N5 row counts, rejects curated-only and inferred-only shipped rows, and repeats the build to prove deterministic output. It does not yet certify tracked-source kanji TSVs, fresh `.apkg` artifacts, managed media packaging, or manual QA.

`product:artifacts:kanji:n5:preflight` reports whether tracked templates are sufficient to certify fresh N5 kanji TSV generation without ignored local `data/` inputs. It currently reports that certification is blocked because rich kanji readings and rich-source provenance are not tracked release contracts yet. Component/radical source data is tracked in `templates/kanji_component_contract.json`.

`product:readiness:n5` is the current automated N5 product checkpoint. It runs the JLPT kanji audit, JLPT word audit, governed audio provenance audit, tracked-source N5 word TSV artifact checkpoint, N5 kanji golden review, and N5 word golden review. It does not certify platinum review, tracked-source kanji TSVs, fresh `.apkg` product artifacts, manual Anki import review, mobile QA, screen-reader QA, or listening QA.

`release:gate` validates smoke-fixture artifacts and packaging contracts. It does not certify public product deck readiness. Add level-specific review commands for the deck being shipped, including `npm run deck:words:review:n5` for an N5 word release.

For a version 1 locked release, also run the applicable platinum gate after the platinum manifest is populated:

```bash
npm run deck:platinum:n5
npm run deck:words:platinum:n5
npm run deck:words:platinum:n4
```

## What still requires manual review

Manual review is required for:

- listening review in Anki
- keyboard-only card navigation
- screen-reader behavior
- zoom / resized text behavior
- mobile readability
- editorial judgment
