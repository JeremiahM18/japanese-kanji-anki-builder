# Review Tier Governance

## Purpose

This document summarizes the program-wide trust ladder for kanji and word deck work. The binding forward-lane contract is [review-system-forward-contract.md](review-system-forward-contract.md). These files exist so future review threads do not reconstruct lane meanings from chat, old summaries, or command names.

## Scope

The trust ladder applies to core kanji decks, word decks, optional additional-unverified kanji decks, source-derived artifacts, review manifests, batch reports, release docs, and AI-assisted review work.

Core kanji and word decks have first-class Sapphire schemas and command families. Optional additional-unverified kanji still retains compatibility command names until its own deliberate migration is implemented.

`Candidate` is a pre-trust workflow state for proposed items, selector rows, source rows, expansion targets, migrations, and triage. It is not a certification tier, is not Bronze, and must not move Silver, Gold, Sapphire, Platinum, or Obsidian denominators.

## Authority Boundary

This document defines tier meaning at summary level. [review-system-forward-contract.md](review-system-forward-contract.md) owns required artifacts, command families, denominator rules, pass/fail behavior, consumer rules, forbidden claims, and migration policy. Neither document certifies any current card, level, generated artifact, or release. Live commands and tracked manifests still own counts and pass/fail posture.

## Pre-Trust State

| State | Lane | What it may do | What it must not imply |
| --- | --- | --- | --- |
| Candidate | Proposed work item | Start investigation, queue review, or identify a possible card/source/migration target. | Generated card surface, reviewed content, trusted deck inclusion, release relevance, Bronze status, or denominator movement. |

## Trust Ladder

| Tier | Lane | Proves | Does not prove |
| --- | --- | --- | --- |
| Silver | Generated surface | A learner-facing card row exists and can be inspected. | Reviewed content, source truth, mechanical readiness, release quality, or learner usefulness. |
| Gold | Regression protection | Reviewed generated output is protected from silent drift against tracked expectations. | Source truth, structural certification, content certification, Obsidian proof, or release approval. |
| Sapphire | Structural/card-quality certification | The live generated card passed the governed card contract for its product: field identity, source-lane separation, required evidence shape, internal checks, media identity, NLP support where required, explicit limitations, and a keep/fix/defer/remove decision. | Expert content certification, Obsidian proof, native/fluent audit, source-governance confidence, release readiness, or permission to shrink another lane's denominator. |
| Platinum | Expert content certification | Sapphire is already satisfied and an explicit higher review has certified the card's learner value, reading and meaning choice, example usefulness, level fit, source interpretation, limitation decision, and final product judgment under a dedicated Platinum schema. | Obsidian proof, release readiness, manual APKG/mobile/accessibility/listening QA, or later audits not recorded in the schema. |
| Obsidian | Proof-ledger certification | Explicit non-mechanical current-version rereview proof exists in the canonical proof path and binds to the exact live card identity. | Release readiness, later fluent/native audit, or manual QA unless separately recorded. |

## Deck Ready Boundary

`Deck Ready`, `Word Deck Ready`, APKG readiness, and package staging are mechanical artifact states. They are not trust tiers.

Ready proves only that the selected build can produce the expected deck artifacts and required exported media fields for that command scope. Ready must not be used as a synonym for Gold, Sapphire, Platinum, Obsidian, source-governance confidence, release approval, APKG import QA, mobile QA, accessibility QA, or listening QA.

## Current Native And Compatibility State

Core kanji structural/card-quality work uses native Sapphire names:

- `templates/sapphire_n*_review_set.json`
- `npm run deck:sapphire:*`
- `kanji-sapphire-v1-evidence-lanes`
- active statuses `sapphire` and `fixed_then_sapphire`

Word structural/card-quality work uses native Sapphire names:

- `templates/sapphire_n*_word_review_set.json`
- `npm run deck:words:sapphire:*`
- `word-sapphire-v1-evidence-lanes`
- active statuses `sapphire` and `fixed_then_sapphire`

The following names remain compatibility names for unmigrated, historical, or proof-provider surfaces:

- `templates/platinum_*_review_set.json`
- `templates/platinum_*_word_review_set.json`
- `npm run deck:legacy-platinum:*`
- `npm run deck:words:legacy-platinum:*`
- older proof-provider compatibility surfaces now exposed through explicit legacy names such as `deck:legacy-platinum:rereview-status` and `deck:words:legacy-platinum:rereview-status`
- `kanji-platinum-v3-evidence-lanes`
- `word-platinum-v3-evidence-lanes`

Native Platinum content certification now uses `templates/platinum_n*_content_review_set.json`, `templates/platinum_n*_word_content_review_set.json`, `deck:platinum:*`, and `deck:words:platinum:*`. Those manifests are empty and fail closed until expert content reviews are recorded. Under this transition, legacy current-standard `platinum` and `fixed_then_platinum` entries remain valid migration inputs where no native Sapphire surface exists, and legacy word Platinum manifests remain compatibility/proof-provider inputs until downstream consumers are migrated. Existing completed work is not invalidated by introducing Sapphire language, but migrated core-kanji and word Sapphire work is represented by `sapphire` and `fixed_then_sapphire` under native Sapphire standards and must not be described as Platinum content certification.

For new core-kanji and word structural documentation, prompts, and reviews, use the native Sapphire command families. For additional-unverified surfaces that still carry `platinum` names, describe them as structural/card-quality compatibility gates unless the work is explicitly implementing the Platinum content-certification schema. Do not claim Platinum content certification from a structural/card-quality pass.

## Migration Rules

- Do not mass rename manifests, commands, statuses, or historical review entries without a dedicated migration plan, tests, and count-preserving proof.
- Do not demote existing current-standard compatibility coverage merely because the tier language was clarified.
- Do not promote existing compatibility coverage to Platinum content certification unless the card passes the native Platinum content schema and gate.
- Future additional-surface schema work should add Sapphire-native command aliases before removing any compatibility `platinum` names.
- Platinum schema work must inherit Sapphire and add stronger content-review evidence instead of reusing structure-only wording.
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
