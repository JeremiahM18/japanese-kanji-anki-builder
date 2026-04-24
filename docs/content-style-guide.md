# Content Style Guide

This guide defines how learner-facing cards should be curated across kanji and word decks.

## Primary principle

Optimize for learner trust, not raw coverage.

That means:

- prefer clear teaching anchors over dictionary exhaustiveness
- allow common, recognizable support words when they expand coverage cleanly
- avoid junky, archaic, or forced entries just to move a metric

## Kanji card style

- Use the strongest learner-facing display form, not the most literal dictionary headword.
- Prefer real, memorable anchors when a bare kanji is a weak teaching surface.
- Keep readings, notes, and examples aligned with the actual card front.
- Avoid exposing internal notation or raw fallback text to learners.

## Word card style

- Standalone single-kanji words stay in their own JLPT level.
- Lower-level decks may include multi-kanji support words that reference higher-level constituent kanji.
- Any higher-level or outside-contract constituent kanji must be visibly labeled on the card.
- Reading coverage is cumulative across easier decks. Do not duplicate support words at harder levels if the reading is already taught well in an easier deck.

## Support-word selection

Use this priority order:

1. strong teaching value
2. commonness or recognizability
3. clean reading-coverage gain
4. low confusion and low duplication

A support word does not need to be the perfect introductory anchor for the kanji. It does need to be common, defensible, and worth a learner seeing on a card.

## Sentence orthography

- Prefer the strongest learner-facing written form in the full Japanese example sentence.
- Do not force kanji everywhere. Natural kana-preferred Japanese is still allowed.
- Suspicious kana-only examples should be flagged for editorial review, not hard-failed automatically.

## Meaning and notes

- Keep English glosses concise and stable.
- Prefer meaning text that helps a learner recognize the word quickly.
- Use notes to explain why the word is present when the purpose is not obvious.
- If a card would confuse a beginner, it is not good enough.

## Audio

- Audio must match the learner-facing reading the card teaches.
- Ship one canonical release voice per release line.
- Preserve provenance for source, voice, locale, and category.
- Review generated audio before widening coverage.
