# Review Tier Governance

## Purpose

This document defines the program-wide trust ladder for kanji and word deck work. It exists so future review threads do not reconstruct tier meanings from chat, old summaries, or command names.

## Scope

The trust ladder applies to core kanji decks, word decks, optional additional-unverified kanji decks, source-derived artifacts, review manifests, batch reports, release docs, and AI-assisted review work.

It does not rename tracked files or npm commands by itself. Current `platinum` command and manifest names remain compatibility names until a deliberate schema and CLI migration is implemented.

## Authority Boundary

This document defines tier meaning. It does not certify any current card, level, generated artifact, or release. Live commands and tracked manifests still own counts and pass/fail posture.

## Trust Ladder

| Tier | Lane | Proves | Does not prove |
| --- | --- | --- | --- |
| Silver | Generated surface | A learner-facing card row exists and can be inspected. | Reviewed content, source truth, mechanical readiness, release quality, or learner usefulness. |
| Gold | Regression protection | Reviewed generated output is protected from silent drift against tracked expectations. | Source truth, structural certification, content certification, Obsidian proof, or release approval. |
| Sapphire | Structural/card-quality certification | The live generated card passed the governed card contract for its product: field identity, source-lane separation, required evidence shape, internal checks, media identity, NLP support where required, explicit limitations, and a keep/fix/defer/remove decision. | Expert content certification, Obsidian proof, native/fluent audit, source-governance confidence, release readiness, or permission to shrink another lane's denominator. |
| Platinum | Expert content certification | Sapphire is already satisfied and an explicit higher review has certified the card's learner value, reading and meaning choice, example usefulness, level fit, source interpretation, limitation decision, and final product judgment under a dedicated Platinum schema. | Obsidian proof, release readiness, manual APKG/mobile/accessibility/listening QA, or future audits not recorded in the schema. |
| Obsidian | Proof-ledger certification | Explicit non-mechanical current-version rereview proof exists in the canonical proof path and binds to the exact live card identity. | Release readiness, later fluent/native audit, or manual QA unless separately recorded. |

## Deck Ready Boundary

`Deck Ready`, `Word Deck Ready`, APKG readiness, and package staging are mechanical artifact states. They are not trust tiers.

Ready proves only that the selected build can produce the expected deck artifacts and required exported media fields for that command scope. Ready must not be used as a synonym for Gold, Sapphire, Platinum, Obsidian, source-governance confidence, release approval, APKG import QA, mobile QA, accessibility QA, or listening QA.

## Current Compatibility Transition

The current repository still uses `platinum` names for the structural/card-quality command family:

- `templates/platinum_*_review_set.json`
- `templates/platinum_*_word_review_set.json`
- `npm run deck:platinum:*`
- `npm run deck:words:platinum:*`
- `kanji-platinum-v3-evidence-lanes`
- `word-platinum-v3-evidence-lanes`

Under this transition, current-standard `platinum` and `fixed_then_platinum` entries remain valid compatibility coverage. Existing completed work is not invalidated by introducing Sapphire language.

For new documentation, prompts, and reviews, describe the current `platinum` command family as the Sapphire structural/card-quality compatibility gate unless the work is explicitly implementing the future Platinum content-certification schema. Do not claim vNext Platinum content certification from a compatibility-named structural/card-quality pass.

## Migration Rules

- Do not mass rename manifests, commands, statuses, or historical review entries without a dedicated migration plan, tests, and count-preserving proof.
- Do not demote existing current-standard compatibility coverage merely because the tier language was clarified.
- Do not promote existing compatibility coverage to vNext Platinum content certification unless a dedicated Platinum schema/gate exists and the card passes it.
- Future schema work should add Sapphire-native command aliases before removing any compatibility `platinum` names.
- Future Platinum schema work must inherit Sapphire and add stronger content-review evidence instead of reusing structure-only wording.
- Obsidian remains separate from both Sapphire and Platinum.

## Required Reporting

Reports that mention review tiers must say:

- the tier being claimed
- the command or tracked manifest that proves the claim
- whether the claim uses current compatibility `platinum` naming
- whether `Deck Ready` was run and what it did or did not prove
- which stronger tiers remain unclaimed

## Verification

After changing this document or tier language, run:

```bash
node --test test/repositoryGovernance.test.js
git diff --check
```

Run affected level gates only when the change alters counts, manifests, command behavior, release posture, or generated artifact claims.

## Update Triggers

Update this document when tier names, tier meanings, compatibility command names, review manifest schema names, deck-ready boundaries, or release-facing tier claims change.
