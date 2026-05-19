# Release QA Checklist

Run this checklist after automated gates pass and before marking a deck milestone release-ready.

## Build verification

- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run deck:review:accessibility -- --deck-kind=kanji`
- `npm run deck:review:accessibility -- --deck-kind=word`
- `npm run deck:kanji:review-status`
- `npm run product:artifacts:n5` when N5 word ships
- `npm run product:artifacts:kanji:n5:preflight` when N5 kanji ships
- `npm run product:readiness:n5` when N5 ships
- `npm run ci:smoke`
- `npm run release:gate`

`release:gate` is smoke-fixture validation. It does not replace level-specific product checks.

## Product readiness checks

- Run the Gold regression command for each shipped kanji level, such as `npm run deck:review:n5`.
- For additional unverified kanji decks, run `npm run deck:kanji:additional:ready`, every applicable `npm run deck:kanji:additional:review:n*` command, every applicable `npm run deck:kanji:additional:platinum:n*` command, and `npm run deck:kanji:review-status`. Duplicate additional source claims and source claims for already-core kanji must be suppressed or resolved.
- Run the read-only JLPT kanji source-evidence audit before relying on level placement, such as `npm run data:audit:jlpt:sources -- --governance-strict --limit=25`. Read the missing/disagreement work queue; missing Japanese-published evidence is an evidence-depth blocker, not a deck-movement instruction.
- Run `npm run data:audit:jlpt:source-inputs -- --source=<source-id> --strict` before activating or importing any ignored local JLPT kanji source file.
- For Tanos direct legacy updates, regenerate the ignored source TSV with `npm run data:normalize:tanos-jlpt-kanji`, pin its SHA-256, byte size, and row count, then dry-run `npm run data:import:jlpt:source-input -- --source=tanos_legacy_direct` before using `--write`. Keep Tanos N2/N3 in the separate `tanos_estimated_split` lane as active lower-weight estimated evidence, require its own strict preflight and dry-run import before writes, and keep `tanos_frequency_method_notes` non-voting as method explanation only.
- For KANJIDIC2 updates, regenerate the ignored source TSV with `npm run data:normalize:kanjidic2-jlpt`, pin its SHA-256, byte size, and row count, then dry-run `npm run data:import:jlpt:source-input -- --source=kanjidic2_legacy` before using `--write`. Old level 2 must remain N2/N3 range evidence until stronger governed sources settle exact placement.
- For JLPT Sensei evidence, use `npm run data:template:jlpt:source-input -- --source=jlptsensei` to create an ignored manual worksheet. Do not scrape, copy, or republish JLPT Sensei list content. Fill only minimal reviewed level judgments with permitted citations and evidence references, pin integrity, then dry-run import before any `--write`.
- For Japanese-published textbook evidence, create one worksheet per individual source lane with `npm run data:template:jlpt:textbook-source -- --source=<source-id>`, fill only permitted manually reviewed citations and level judgments, pin the reviewed TSV integrity, then dry-run import before any `--write`. Do not manually import `japanese_textbook_consensus`; it is derived from the individual lanes.
- Run the Gold regression command for each shipped word level when one exists, such as `npm run deck:words:review:n5`.
- Run the word-level placement audit for each shipped word level, such as `npm run deck:words:level-anchor-audit -- --level=5`.
- Run the Platinum command for each version 1 locked kanji level after its manifest is populated and current-standard revalidated, such as `npm run deck:platinum:n5`.
- Run the Platinum command for each version 1 locked word level after its manifest is populated and current-standard revalidated, such as `npm run deck:words:platinum:n5`.
- Confirm Platinum evidence is field-bound and source-role governed: the evidence must name the card, exported reading, learner-facing values, exact audio identity, and source/provenance claim it supports; `japanese-source` entries must resolve to `templates/platinum_card_source_manifest.json`, kanji and word `sourceEvidence` must contain only governed external Japanese-source truth evidence, and kanji card-field verification must not be circular with the source-governance origin family for that kanji-level claim.
- Confirm kanji Platinum current-standard coverage: `deck:kanji:review-status` must show the shipped level's `Current Std` count equal to its generated count, and no shipped kanji card may remain in `needs_revalidation`. Under `kanji-platinum-v3-evidence-lanes`, external Japanese-source truth evidence, internal generated/Gold/media/audio/stroke-order checks, and reviewer judgment must stay in separate manifest lanes. `--allow-legacy-standard` is for historical inspection only, not release evidence.
- Run `npm run deck:platinum:rereview-status -- --levels=<levels>` before claiming Obsidian. A Platinum pass is not enough by itself; entries without explicit non-mechanical substantive rereview provenance are reported as `missing_substantive_current_standard_rereview_proof` and need actual rereview or provenance capture before that claim is made.
- Run `npm run deck:kanji:platinum:certify-status -- --levels=<levels>` as the fail-closed kanji Obsidian gate. It fails on any `blocked_or_failing` or `needs_substantive_rereview` row and reports each failed card with the field, expected value, actual state, evidence lane, and reviewer action. Obsidian proof must include structured rereview provenance plus actual example-sentence review evidence for naturalness, learner usefulness, level fit, support-only usage, reading, and translation.
- Confirm word Platinum current-standard coverage: the shipped level's default `deck:words:platinum:n*` command must show current-standard Platinum count equal to the generated active card count, and no shipped active word Platinum entry may remain only legacy/unversioned. Under `word-platinum-v3-evidence-lanes`, external Japanese-source truth evidence, internal generated/Gold/media/audio/pitch/label checks, and reviewer judgment must stay in separate manifest lanes. `--allow-legacy-standard` is for historical inspection only, not release evidence.
- Run `npm run deck:words:platinum:rereview-status -- --levels=<levels>` before claiming Obsidian word certification. A Platinum pass is not enough by itself; entries without explicit non-mechanical substantive rereview provenance are reported as `missing_substantive_current_standard_word_rereview_proof`, while generated rows with no active current-standard structural entry are `blocked_or_failing`.
- Treat generated deck rows as the certification denominator. For example, N4 word currently has `700` generated rows, `667` Platinum structural entries, and `33` newly routed Silver rows, so `0` Obsidian certifications still means `0/700` proven.
- Run `npm run deck:words:platinum:source-posture -- --levels=<levels>` before claiming independent word-source corroboration. Single-source-family entries are structurally governed but are reported as `word_source_independence_not_proven`; word source-claim origin independence is reported as `word_source_claim_origin_independence_not_evaluated` until a word source-origin manifest exists.
- Run `npm run deck:platinum:governance-gate` in a local-data workspace before release claims that depend on current real generated N5/N4 rows. In clean CI without ignored `data/*` inputs, use its absence as a scope limitation rather than as proof that level platinum was validated.
- Run `npm run product:artifacts:n5` for an N5 word release. It proves the N5 word TSV can be regenerated from tracked templates only, but it does not validate kanji TSVs, `.apkg` files, or media packages.
- Run `npm run product:artifacts:kanji:n5:preflight` for an N5 kanji release. It currently reports tracked-source kanji TSV certification as blocked until rich kanji readings and provenance are tracked release contracts. Component/radical source data is tracked in `templates/kanji_component_contract.json`.
- Run `npm run product:readiness:n5` for an N5 release. It combines the current automated N5 audits and Gold regression checks, but it does not replace fresh artifact generation or manual QA.
- Run the deck readiness command for each shipped kanji or word surface.
- Confirm tracked-source coverage, provenance, and known limitations match the intended release.

## Kanji deck manual spot review

- Import each kanji level being shipped into Anki. Current ready local kanji levels are N5, N4, N3, N2, and N1. Current-standard Platinum coverage is still required before any level is version-1 locked.
- Import additional unverified kanji decks separately from core decks only when `deck:kanji:additional:ready` reports selected physical additional cards. The current governed build selects `0` additional cards; in that state, confirm the empty generated surface and suppression report instead of looking for learner cards to review.
- Confirm Platinum-reviewed cards preserve the individual-kanji anchor and do not ship weak, noisy, or compound-led teaching surfaces.
- Confirm any kanji `verificationLimitations` are non-core, visibly labeled on the affected card surface, and reflected in `deck:kanji:review-status` counts.
- Confirm each card front is the individual target kanji.
- Confirm each card back starts with the learner-facing `PrimaryReading` plus only the meaning associated with that reading.
- Confirm broader kanji meanings are shown separately and are not collapsed into the primary-reading line.
- Confirm there is only one learner-facing stroke-order animation field and it loops correctly.
- Confirm static stroke-order images are not exported as separate kanji note fields.
- Confirm example words in notes use ruby/furigana rather than parenthetical reading splits.
- Confirm `DisplayWord` remains the target kanji in the TSV contract but is not repeated as a visible card-back study word.
- Confirm compounds appear only in notes, examples, or word decks.
- Review audio-bearing cards.
- Review cards with stroke-order media. Automated gates audit approved source provenance, but stroke-sequence correctness requires human visual review.
- Confirm there are no weak fronts, clipped fields, or broken media.

## Word deck manual spot review

- Import each word level being shipped into Anki only after the current word-level placement audit, readiness audit, Gold regression, applicable Platinum gate, and Obsidian status pass. N5 word currently passes placement, readiness, Gold, tracked-source artifact, and Platinum checks at `287/287` under `word-platinum-v3-evidence-lanes`, but Obsidian remains partial at `64/287`; N4 word placement passes and the generated surface builds at `700/700`, but Gold and Platinum cover only `667/700`, and `0/700` N4 word rows are Obsidian certified, so N4 remains blocked before manual QA/release.
- Confirm Platinum-reviewed cards are useful, common enough, learner-friendly, and not present only for reading coverage.
- Review beginner core words.
- Review support words.
- Confirm every shipped word has a current-level kanji anchor, or has an explicit learner-fit rationale for later all-easier-kanji placement; support kanji from other levels must be visibly labeled.
- Review constituent-kanji labels, including cross-level and outside-JLPT kanji.
- Review audio-bearing word cards.
- Confirm constituent badges are visible and understandable without repeating same-level kanji in kanji decks.
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
