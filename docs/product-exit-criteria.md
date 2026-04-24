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
- `npm run deck:ready -- --levels=<level>` passes with `0` export fallback issues.
- Stroke-order animation coverage is `100%`.
- Any shipped audio is governed, audited, and review-clean.
- Accessibility review has no unresolved blocker.

## Word deck exit criteria

A word level ships only when all criteria are true:

- Canonical word contract rows are fully built for the level.
- No standalone wrong-level cards ship in the deck.
- Cross-level or outside-contract constituent kanji are visibly labeled.
- Reading coverage is reported honestly against the cumulative lower-level scope.
- Active triage is either resolved or intentionally deferred.
- Sentence orthography review has no unresolved blocker.
- Any shipped audio is governed, audited, and review-clean.
- Accessibility review has no unresolved blocker.

## Current product posture

- N5 kanji: stabilized
- N4 kanji: stabilized
- N5 word: stabilized and `ready_with_deferred_variants`
- N4 word: active completion work, not yet ready

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
npm run release:gate
```

Add level-specific review commands for the deck being shipped.

## What still requires manual review

Manual review is required for:

- listening review in Anki
- keyboard-only card navigation
- screen-reader behavior
- zoom / resized text behavior
- mobile readability
- editorial judgment
