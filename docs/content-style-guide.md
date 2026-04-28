# Content Style Guide

This guide defines card curation rules for kanji and word decks.

## Primary principle

Prioritize accurate learner value over coverage metrics.

That means:

- Prefer clear teaching anchors over dictionary exhaustiveness.
- Use common or recognizable support words when they expand coverage.
- Reject archaic, forced, or low-value entries added only to move a metric.

## Kanji card style

- The front is the single target kanji only.
- `DisplayWord` is the target kanji.
- `PrimaryReading` is the learner-facing reading for that individual kanji.
- `MeaningJP` is the meaning tied to `PrimaryReading`; broader meanings belong in `KanjiMeanings`.
- Keep notes and examples aligned with the target kanji, but do not let a compound word become the learner anchor.
- Leave `StudyWordKanji` blank for kanji cards.
- Avoid exposing internal notation or raw fallback text to learners.

## Word card style

- Standalone single-kanji words stay in their own JLPT level.
- Lower-level decks may include multi-kanji support words that reference higher-level constituent kanji.
- Constituent kanji must be visibly labeled on the card, including same-level, higher-level, and outside-JLPT kanji.
- Reading coverage is scoped to the selected word-product levels. Do not duplicate support words if the reading is already taught well in another selected deck unless there is a clear editorial reason.
- Every shipped word card must expose a learner-facing reading breakdown on the answer side.
- Kanji words use ruby furigana; kana-only words render kana in the same reading-breakdown position.
- Irregular compounds require curated reading-breakdown overrides or whole-word ruby fallback instead of false per-kanji slices.

## Support-word selection

Use this priority order:

1. Teaching value
2. Commonness or recognizability
3. Reading-coverage gain
4. Low confusion risk
5. Low duplication

A support word does not need to be the primary kanji anchor. It must be common, defensible, and useful on a study card.

## Sentence orthography

- Prefer the clearest learner-facing written form in the full Japanese example sentence.
- Do not force kanji everywhere. Natural kana-preferred Japanese is still allowed.
- Flag suspicious kana-only examples for editorial review. Do not hard-fail natural kana usage automatically.

## Meaning and notes

- Keep English glosses concise and stable.
- Use meaning text that identifies the word quickly.
- Use notes to explain why the word is present when the purpose is not obvious.
- Reject cards that introduce avoidable beginner confusion.

## Audio

- Audio must match the learner-facing reading the card teaches.
- Ship one canonical release voice per release line.
- Preserve provenance for source, voice, locale, and category.
- Review generated audio before widening coverage.
