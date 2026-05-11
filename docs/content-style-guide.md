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
- `PrimaryReading` is the most learner-useful, level-appropriate reading for that individual kanji.
- `MeaningJP` is the meaning tied to `PrimaryReading`; broader meanings belong in `KanjiMeanings`.
- Do not choose a kanji `PrimaryReading` only because it appears first in a dictionary source or because matching audio already exists. If the best learner-facing reading changes, exact audio must be regenerated for that reading.
- Keep notes and examples aligned with the target kanji, but do not let a compound word become the learner anchor.
- Leave `StudyWordKanji` blank for kanji cards.
- Avoid exposing internal notation or raw fallback text to learners.

## Word card style

- A word is anchored by kanji from its own deck level; other constituent kanji are support kanji and must be labeled.
- All-easier-kanji words may ship at a harder/lower-numbered learner-fit level only when that later placement is explicit and reviewed.
- Useful common words can appear at the right learning moment, but hard words do not go into beginner decks just because their kanji are easy.
- A word with no current-level anchor must not ship in an easier/higher-numbered deck when it depends only on harder support kanji.
- Outside-JLPT support kanji do not choose the JLPT deck level, but they must be visibly labeled.
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
