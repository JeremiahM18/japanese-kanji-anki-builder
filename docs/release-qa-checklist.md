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
- `npm run product:artifacts:kanji:n5` when N5 kanji ships
- `npm run product:artifacts:kanji:n4:preflight` when N4 kanji ships
- `npm run product:artifacts:kanji:n4` when N4 kanji ships
- `npm run product:artifacts:kanji:n3:preflight` when N3 kanji ships
- `npm run product:artifacts:kanji:n3` when N3 kanji ships
- `npm run product:artifacts:kanji:all` before cross-level kanji release claims
- `npm run product:artifacts:kanji:release-qa` before any kanji release-ready claim
- `npm run product:release-qa:evidence` after the release-specific evidence packet is complete
- `npm run product:readiness:n5` when N5 ships
- `npm run nlp:governance-gate` when assistive NLP manifests, runtimes, artifact contracts, or governance docs changed
- `npm run ci:smoke`
- `npm run release:gate`

`release:gate` is smoke-fixture validation. It does not replace level-specific product checks.

## Release QA evidence packet

Copy [../templates/release_qa_evidence_packet.template.json](../templates/release_qa_evidence_packet.template.json) to `out/release-qa/release-qa-evidence.json` for the release candidate being reviewed.

Replace every `pending` entry with release-specific evidence, then run:

```bash
npm run product:release-qa:evidence
```

The packet must name the release candidate, deck kind, JLPT levels, automated release commands, APKG import result, managed-media provenance, manual Anki import result, mobile QA, screen-reader or no-color/zoom accessibility findings, listening QA, source-governance commands, accepted source-governance risk posture when applicable, and known blockers. `knownBlockers` must be an explicit empty array before release-ready claims. Source-access-gap and manual-citation-only lanes must remain non-voting unless exact permitted assignment/source evidence exists. While source evidence depth remains incomplete, the packet must record `sourceEvidenceDepthComplete: false`, `freePublicSourceExpansionPaused: true`, `acceptedRiskRecord: GOV-SRC-001`, `npm run data:audit:jlpt:source-access`, and `npm run data:audit:jlpt:sources -- --governance-strict --limit=25`.

## Product readiness checks

- Run the Gold regression command for each shipped kanji level, such as `npm run deck:review:n5`.
- For additional unverified kanji decks, run `npm run deck:kanji:additional:ready`, every applicable `npm run deck:kanji:additional:review:n*` command, every applicable `npm run deck:kanji:additional:platinum:n*` command, and `npm run deck:kanji:review-status`. Duplicate additional source claims and source claims for already-core kanji must be suppressed or resolved.
- Run the read-only JLPT kanji source-evidence audit before relying on level placement, such as `npm run data:audit:jlpt:sources -- --governance-strict --limit=25`. Read the missing/disagreement work queue; missing Japanese-published evidence is an evidence-depth blocker, not a deck-movement instruction.
- Run `npm run data:audit:jlpt:source-inputs -- --source=<source-id> --strict` before activating or importing any ignored local JLPT kanji source file.
- For Tanos direct legacy updates, regenerate the ignored source TSV with `npm run data:normalize:tanos-jlpt-kanji`, pin its SHA-256, byte size, and row count, then dry-run `npm run data:import:jlpt:source-input -- --source=tanos_legacy_direct` before using `--write`. Keep Tanos N2/N3 in the separate `tanos_estimated_split` lane as active lower-weight estimated evidence, require its own strict preflight and dry-run import before writes, and keep `tanos_frequency_method_notes` non-voting as method explanation only.
- For KANJIDIC2 JLPT-placement updates, regenerate the ignored source TSV with `npm run data:normalize:kanjidic2-jlpt`, pin its SHA-256, byte size, and row count, then dry-run `npm run data:import:jlpt:source-input -- --source=kanjidic2_legacy` before using `--write`. Old level 2 must remain N2/N3 range evidence until stronger governed sources settle exact placement.
- For KANJIDIC2 reading-reference updates, regenerate [../templates/kanji_reading_reference_contract.json](../templates/kanji_reading_reference_contract.json) with `npm run data:build:kanji-reading-reference`, review the embedded raw source SHA-256 and coverage counts, and keep the lane limited to `kanji-reading-reference`. It must not become full kanji-card field verification, JLPT placement truth, or release certification.
- For kanji card-field source-provenance updates, regenerate the selected level with `npm run data:build:kanji-field-source-contract -- --level=<level>`, review the level coverage audit, and keep Kanjipedia/Bunka material to manual field-bound citation notes only. The command defaults to the scoped Obsidian proof provider for rereview-binding fields, so migrated levels read canonical JSONL proof while unmigrated levels fall back through the provider path until migrated. N5 uses [../templates/kanji_card_field_source_contract.json](../templates/kanji_card_field_source_contract.json); other levels use [../templates/kanji_card_field_source_contracts](../templates/kanji_card_field_source_contracts). This lane is `kanji-field-verification`; it must not become JLPT placement truth, generated TSV evidence, Obsidian proof, or release certification.
- For JLPT Sensei evidence, use `npm run data:template:jlpt:source-input -- --source=jlptsensei` to create an ignored manual worksheet. Do not scrape, copy, or republish JLPT Sensei list content. Fill only minimal reviewed level judgments with permitted citations and evidence references, pin integrity, then dry-run import before any `--write`.
- For Japanese-published textbook evidence, create one worksheet per individual source lane with `npm run data:template:jlpt:textbook-source -- --source=<source-id>`, fill only permitted manually reviewed citations and level judgments, pin the reviewed TSV integrity, then dry-run import before any `--write`. Do not manually import `japanese_textbook_consensus`; it is derived from the individual lanes.
- Run the Gold regression command for each shipped word level when one exists, such as `npm run deck:words:review:n5`.
- Run the word-level placement audit for each shipped word level, such as `npm run deck:words:level-anchor-audit -- --level=5`.
- Run the native Sapphire command for each version 1 structurally locked core-kanji level after its manifest is populated and current-standard revalidated, such as `npm run deck:sapphire:n5`.
- Run the Sapphire/Platinum-compatibility command for each version 1 structurally locked word level after its manifest is populated and current-standard revalidated, such as `npm run deck:words:platinum:n5`.
- Confirm Sapphire evidence is field-bound and source-role governed: the evidence must name the card, exported reading, learner-facing values, exact audio identity, and source/provenance claim it supports; `japanese-source` entries must resolve to `templates/platinum_card_source_manifest.json`, kanji and word `sourceEvidence` must contain only governed external Japanese-source truth evidence, and kanji card-field verification must not be circular with the source-governance origin family for that kanji-level claim.
- Confirm kanji Sapphire current-standard coverage: `deck:kanji:review-status` must show the shipped level's `Current Std` count equal to its generated count, and no shipped kanji card may remain in `needs_revalidation`. Under `kanji-sapphire-v1-evidence-lanes`, external Japanese-source truth evidence, internal generated/Gold/media/audio/stroke-order checks, and reviewer judgment must stay in separate manifest lanes. `--allow-legacy-standard` is for historical inspection only, not release evidence.
- Run `npm run deck:kanji:obsidian:rereview-status -- --levels=<levels>` before claiming Obsidian. A Sapphire pass is not enough by itself; entries without explicit non-mechanical substantive rereview provenance are reported as `missing_substantive_current_standard_rereview_proof` and need actual rereview or provenance capture before that claim is made.
- Run `npm run deck:kanji:obsidian:certify-status -- --levels=<levels>` as the fail-closed kanji Obsidian gate. It fails on any `blocked_or_failing` or `needs_substantive_rereview` row and reports each failed card with the field, expected value, actual state, evidence lane, and reviewer action. Obsidian proof must include structured rereview provenance plus actual example-sentence review evidence for naturalness, learner usefulness, level fit, support-only usage, reading, and translation.
- Confirm word Platinum current-standard coverage: the shipped level's default `deck:words:platinum:n*` command must show current-standard Platinum count equal to the generated active card count, and no shipped active word Platinum entry may remain only legacy/unversioned. Under `word-platinum-v3-evidence-lanes`, external Japanese-source truth evidence, internal generated/Gold/media/audio/pitch/label checks, and reviewer judgment must stay in separate manifest lanes. `--allow-legacy-standard` is for historical inspection only, not release evidence.
- Run `npm run deck:words:obsidian:rereview-status -- --levels=<levels>` before claiming Obsidian word certification. A Sapphire/Platinum-compatibility pass is not enough by itself; entries without structured, exact word-reading-card-bound, non-mechanical substantive rereview provenance are reported as `missing_substantive_current_standard_word_rereview_proof`, while generated rows with no active current-standard card-quality entry are `blocked_or_failing`.
- Run `npm run deck:words:obsidian:certify-status -- --levels=<levels>` as the fail-closed word Obsidian gate. It fails on any `blocked_or_failing` or `needs_substantive_rereview` row and reports each failed card with the field, expected value, actual state, evidence lane, and reviewer action.
- Treat generated deck rows as the certification denominator. For example, N4 word currently has `700` generated rows, `700` Platinum card-quality entries, and `700` strict Obsidian certifications, so `deck:words:obsidian:certify-status -- --levels=5,4` passes with `0` rows still needing Obsidian proof.
- Run `npm run deck:words:platinum:source-posture -- --levels=<levels>` before claiming independent word-source corroboration. Single-source-family entries are structurally governed but are reported as `word_source_independence_not_proven`; word source-claim origin independence is reported as `word_source_claim_origin_independence_not_evaluated` until a word source-origin manifest exists.
- Run `npm run deck:platinum:governance-gate` in a local-data workspace before release claims that depend on current real generated N5/N4 rows. In clean CI without ignored `data/*` inputs, use its absence as a scope limitation rather than as proof that level platinum was validated.
- Run `npm run product:artifacts:n5` for an N5 word release. It proves the N5 word TSV can be regenerated from tracked templates only, but it does not validate kanji TSVs, `.apkg` files, or media packages.
- Run the level-specific tracked-source kanji preflight for each shipped kanji level: `npm run product:artifacts:kanji:n5:preflight` for N5, `npm run product:artifacts:kanji:n4:preflight` for N4, and `npm run product:artifacts:kanji:n3:preflight` for N3. These commands report whether tracked source contracts are sufficient without ignored local `data/` inputs. Component/radical source data is tracked in `templates/kanji_component_contract.json`, on/kun reading reference data is tracked in `templates/kanji_reading_reference_contract.json`, N5 card-field source provenance is tracked in `templates/kanji_card_field_source_contract.json`, and N4/N3 card-field source provenance is tracked in `templates/kanji_card_field_source_contracts/`.
- Run the matching level-specific tracked-source kanji TSV gate for each shipped kanji level: `npm run product:artifacts:kanji:n5` for N5, `npm run product:artifacts:kanji:n4` for N4, and `npm run product:artifacts:kanji:n3` for N3. These gates build fresh source-derived TSVs from tracked contracts only and validate schema, row count, source-derived required fields, primary-reading reference membership, and deterministic repeated output. They still do not package `.apkg`, review media/listening quality, or replace manual QA.
- Run `npm run product:artifacts:kanji:all` before any cross-level kanji claim. Current expected posture is N5/N4/N3 passing and N2/N1 blocked on missing governed card-field source contracts, not silently skipped.
- Run `npm run product:artifacts:kanji:release-qa` before any kanji release-ready claim. It must stay blocked until APKG approval, managed stroke-order/audio QA, manual Anki import review, mobile QA, screen-reader QA, and listening QA are recorded.
- Run `npm run product:readiness:n5` for an N5 release. It combines the current automated N5 audits, tracked-source N5 word and kanji TSV gates, and Gold regression checks, but it does not replace the all-level kanji gate, APKG approval, or manual QA.
- Run the deck readiness command for each shipped kanji or word surface.
- Confirm tracked-source coverage, provenance, and known limitations match the intended release.

## Kanji deck manual spot review

- Import each kanji level being shipped into Anki. Current ready local kanji levels are N5, N4, N3, N2, and N1. Current-standard native Sapphire coverage is complete for N5/N4/N3/N2; N1 is only partially trusted at `320/1230`, with `910` rows still requiring fresh actual card-data review before any version-1 structural lock. N1 deck readiness is mechanical/media readiness only until Sapphire and proof gates catch up.
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

- Import each word level being shipped into Anki only after the current word-level placement audit, readiness audit, Gold regression, applicable Sapphire/Platinum-compatibility gate, and fail-closed Obsidian certification gate pass. N5 word currently passes placement, readiness, Gold, tracked-source artifact, Sapphire/Platinum-compatibility, and strict Obsidian proof at `287/287`; N4 word placement passes and the generated surface builds at `700/700`, with Gold, Sapphire/Platinum-compatibility, and strict Obsidian proof also complete at `700/700`. N4 still requires manual import QA, accessibility, and listening checks before release-ready product claims.
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
