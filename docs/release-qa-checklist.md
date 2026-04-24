# Release QA Checklist

Use this checklist after automated gates pass and before calling a deck milestone release-ready.

## Build verification

- `npm test`
- `npm run lint`
- `npm run deck:review:accessibility -- --deck-kind=kanji`
- `npm run deck:review:accessibility -- --deck-kind=word`
- `npm run ci:smoke`
- `npm run release:gate`

## Kanji deck manual spot review

- Import the current N5 kanji deck into Anki.
- Import the current N4 kanji deck into Anki.
- Review a representative sample of:
  - beginner anchors
  - compound-backed anchors
  - audio-bearing cards
  - cards with stroke-order media
- Confirm there are no obviously weak fronts, clipped fields, or broken media.

## Word deck manual spot review

- Import the current N5 word deck into Anki.
- Review a representative sample of:
  - beginner core words
  - support words
  - cross-level constituent-kanji words
  - audio-bearing word cards
- Confirm cross-level badges are visible and understandable.
- Confirm example sentences, notes, and breakdown panels remain readable.

## Accessibility pass

- Check zoomed text / resized text behavior.
- Check keyboard-only usage in Anki where possible.
- Check that meaning, reading, and example text are still understandable without relying on color.
- Check that audio is a reinforcement channel, not the only teaching channel.

## Platform sanity checks

- Windows Anki desktop import
- macOS Anki desktop import when available
- one mobile sanity check on AnkiDroid or AnkiMobile when the release meaningfully changes card layout or media behavior

## Audio release checks

- run the relevant audio review command
- listen to a representative sample
- confirm no wrong readings, clipping, or obviously awkward generated audio

## Exit rule

Do not call a milestone shipped just because scripts pass. A release is ready only when the automated gates and this manual checklist both come back clean enough for learner trust.
