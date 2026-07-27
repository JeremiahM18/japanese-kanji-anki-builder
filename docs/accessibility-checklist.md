# Accessibility Checklist

Accessibility review covers generated Anki decks.

## Automated review

Run these commands against the current built artifacts:

```bash
npm run deck:review:accessibility -- --deck-kind=kanji
npm run deck:review:accessibility -- --deck-kind=word
```

For release-candidate or parallel builds, select the exact isolated output scope instead of the shared default roots:

```bash
npm run deck:review:accessibility -- --deck-kind=kanji --levels=<levels> --run-id=<release-candidate-id>
npm run deck:review:accessibility -- --deck-kind=word --levels=<levels> --run-id=<release-candidate-id>
```

`--levels` accepts unique comma-separated N1-N5 values and is valid only with `--run-id`. `--out-dir-base=<generated-root>` may also be supplied with `--run-id` when the matching build used a non-default governed output base. The command resolves the package summary under the selected `out/run-outputs/<run-id>/<deck-kind>-n*/package/` scope and rejects a summary whose `rootDir` or `exportsDir` points anywhere else, including symbolic-link escapes. Omitting `--run-id` intentionally preserves the legacy shared `out/build` or `out/word-build` selection.

The automated review currently checks:

- Japanese-capable font stack on card CSS
- textual study content on the front side
- audio field visibility when packaged audio exists
- textual redundancy through example content
- stroke-order or kanji-breakdown surface visibility
- non-empty alt text on exported image tags
- contrast ratios for key text classes against the card background

## Manual review

Automation is required but incomplete. Review the built decks in Anki and check:

- Keyboard-only navigation works for card reveal, audio replay, and deck browsing.
- Screen-reader users can understand the card without relying on color or image-only cues.
- Zoomed text or enlarged UI does not clip important readings, meanings, badges, or notes.
- Cross-level badges remain readable and understandable at smaller widths.
- Stroke-order media does not become the only way to understand a card.
- Audio is never the only teaching channel for pronunciation.
- Example sentences remain readable on desktop and mobile Anki clients.
- Support words remain understandable for the intended learner level.

## Red flags

Treat these as blockers or near-blockers:

- low-contrast secondary text
- Latin-only font stacks on Japanese cards
- a front side that relies on media instead of text
- unlabeled cross-level kanji on word cards
- badges or notes that only communicate state by color
- clipped or unreadable text at larger zoom levels

## Scope

This checklist does not replace:

- a full screen-reader audit
- full AnkiDroid / AnkiMobile compatibility testing
- a formal WCAG conformance review

Add those gates when the release scope requires them.
