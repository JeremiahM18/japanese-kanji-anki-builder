# Release QA Checklist

Run this checklist after automated gates pass and before marking a deck milestone release-ready.

## Build verification

- `npm test`
- `npm run lint`
- `npm run deck:review:accessibility -- --deck-kind=kanji`
- `npm run deck:review:accessibility -- --deck-kind=word`
- `npm run product:readiness:n5` when N5 ships
- `npm run ci:smoke`
- `npm run release:gate`

`release:gate` is smoke-fixture validation. It does not replace level-specific product checks.

## Product readiness checks

- Run the golden review command for each shipped kanji level, such as `npm run deck:review:n5`.
- Run the golden review command for each shipped word level when one exists, such as `npm run deck:words:review:n5`.
- Run `npm run product:readiness:n5` for an N5 release. It combines the current automated N5 audits and golden reviews, but it does not replace fresh artifact generation or manual QA.
- Run the deck readiness command for each shipped kanji or word surface.
- Confirm tracked-source coverage, provenance, and known limitations match the intended release.

## Kanji deck manual spot review

- Import the current N5 kanji deck into Anki.
- Import the current N4 kanji deck into Anki.
- Review beginner anchors.
- Review compound-backed anchors.
- Review audio-bearing cards.
- Review cards with stroke-order media.
- Confirm there are no weak fronts, clipped fields, or broken media.

## Word deck manual spot review

- Import the current N5 word deck into Anki.
- Review beginner core words.
- Review support words.
- Review cross-level constituent-kanji words.
- Review audio-bearing word cards.
- Confirm cross-level badges are visible and understandable.
- Confirm example sentences, notes, and breakdown panels remain readable.

## Accessibility pass

- Check zoomed text / resized text behavior.
- Check keyboard-only usage in Anki where possible.
- Check that meaning, reading, and example text are still understandable without relying on color.
- Check that audio is a reinforcement channel, not the only teaching channel.

## Platform sanity checks

- Windows Anki desktop import.
- macOS Anki desktop import when available.
- One mobile sanity check on AnkiDroid or AnkiMobile when the release changes card layout or media behavior.

## Audio release checks

- Run the relevant audio review command.
- Listen to a representative sample.
- Confirm no wrong readings, clipping, or unusable generated audio.

## Exit rule

Do not ship on automation alone. A release is ready only when automated gates pass and manual QA has no unresolved blocker.
