# Product Exit Criteria

This repo now treats each deck milestone as a product checkpoint, not just a successful script run.

## Quality pillars

Each release checkpoint should be evaluated across these areas:

- Core value
- User experience
- Accessibility
- Internationalization and localizability
- Technical quality
- Reliability and stability
- Privacy, security, and licensing

## Kanji deck exit criteria

A kanji level is ready to ship only when all of the following are true:

- Canonical JLPT taxonomy is governed by tracked contracts.
- Golden review coverage for that shipped level is complete.
- `npm run deck:ready -- --levels=<level>` passes with `0` export fallback issues.
- Stroke-order animation coverage is `100%`.
- Any shipped audio is governed, audited, and review-clean.
- Accessibility review is clean enough to support a manual Anki review pass.

## Word deck exit criteria

A word level is ready to ship only when all of the following are true:

- Canonical word contract rows are fully built for the level.
- No standalone wrong-level cards ship in the deck.
- Cross-level or outside-contract constituent kanji are visibly labeled.
- Reading coverage is reported honestly against the cumulative lower-level scope.
- Active triage is either resolved or intentionally deferred.
- Sentence orthography review is clean enough to support manual editorial review.
- Any shipped audio is governed, audited, and review-clean.
- Accessibility review is clean enough to support a manual Anki review pass.

## Current product posture

- N5 kanji: stabilized
- N4 kanji: stabilized
- N5 word: stabilized and `ready_with_deferred_variants`
- N4 word: active completion work, not yet ready

## Required gates before shipping

Use these commands as the minimum exit bar:

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

Add the relevant level-specific review commands for the deck you are shipping.

## What still requires manual review

These areas cannot be trusted from automation alone:

- listening review in Anki
- keyboard-only card navigation
- screen-reader behavior
- zoom / resized text behavior
- mobile readability
- “does this feel like a good learner card?” editorial judgment
