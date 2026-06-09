# Review Tier Governance

## Purpose

This document summarizes the program-wide trust ladder for kanji and word deck work. The binding forward-lane contract is [review-system-forward-contract.md](review-system-forward-contract.md). These files exist so future review threads do not reconstruct lane meanings from chat, old summaries, or command names.

## Scope

The trust ladder applies to core kanji decks, word decks, optional additional-unverified kanji decks, source-derived artifacts, review manifests, batch reports, release docs, and AI-assisted review work.

Core kanji and word decks have first-class Sapphire schemas and command families. Platinum remains the active Platinum lane. Optional additional-unverified kanji still retains compatibility command names until its own deliberate migration is implemented.

Candidate rows, selector rows, source rows, expansion targets, migrations, and triage queues are pre-trust workflow inputs. They are not certification tiers and must not move Silver, Gold, Sapphire, Platinum, or Obsidian denominators.

## Authority Boundary

This document defines tier meaning at summary level. [review-system-forward-contract.md](review-system-forward-contract.md) owns required artifacts, command families, denominator rules, pass/fail behavior, consumer rules, forbidden claims, and migration policy. Neither document certifies any current card, level, generated artifact, or release. Live commands and tracked manifests still own counts and pass/fail posture.

## Pre-Trust State

| State | Lane | What it may do | What it must not imply |
| --- | --- | --- | --- |
| Candidate | Proposed work item | Start investigation, queue review, or identify a possible card/source/migration target. | Generated card surface, reviewed content, trusted deck inclusion, release relevance, certification status, or denominator movement. |

## Trust Ladder

| Tier | Lane | Requires | Proves | Does not prove |
| --- | --- | --- | --- | --- |
| Silver | Generated surface | A generated learner-facing row for the scoped product. | A learner-facing card row exists and can be inspected. | Reviewed content, source truth, mechanical readiness, release quality, or learner usefulness. |
| Gold | Regression protection | Matching Silver generated row. | Reviewed generated output is protected from silent drift against tracked expectations. | Source truth, structural certification, Platinum, Obsidian proof, or release approval. |
| Sapphire | Structural certification | Matching passing Gold regression. | The live generated card passed the governed structural contract for its product: required field identity, evidence lane separation, required internal check records, media identity fields, required support artifacts such as NLP where the workflow calls for them, explicit limitations, and a keep/fix/defer/remove decision. | Platinum, source-truth certification, Obsidian proof, native/fluent audit, source-governance confidence, release readiness, or permission to shrink another lane's denominator. |
| Platinum | Card-surface inspection | Matching passing Gold regression plus active current-standard Sapphire. | The actual generated card was reviewed beyond structure for learner-facing reading, meaning, example, notes/support surface, media identity, level/product fit, evidence boundaries, limitations, and final keep/fix/defer/remove judgment under the current Platinum schema. | Obsidian proof, release readiness, manual APKG/mobile/accessibility/listening QA, or later audits not recorded in the schema. |
| Obsidian | Proof-ledger certification | Valid current-standard Platinum plus exact non-mechanical proof. | Explicit non-mechanical current-version rereview proof exists in the canonical proof path and binds to the exact live card identity. | Release readiness, later fluent/native audit, or manual QA unless separately recorded. |

## Deck Ready Boundary

`Deck Ready`, `Word Deck Ready`, APKG readiness, and package staging are mechanical artifact states. They are not trust tiers.

Ready proves only that the selected build can produce the expected deck artifacts and required exported media fields for that command scope. Ready must not be used as a synonym for Gold, Sapphire, Platinum, Obsidian, source-governance confidence, release approval, APKG import QA, mobile QA, accessibility QA, or listening QA.

## Current Native And Compatibility State

Core kanji structural work uses native Sapphire names:

- `templates/sapphire_n*_review_set.json`
- `npm run deck:sapphire:*`
- `kanji-sapphire-v1-evidence-lanes`
- active statuses `sapphire` and `fixed_then_sapphire`

Word structural work uses native Sapphire names:

- `templates/sapphire_n*_word_review_set.json`
- `npm run deck:words:sapphire:*`
- `word-sapphire-v1-evidence-lanes`
- active statuses `sapphire` and `fixed_then_sapphire`

The following names are the active Platinum names for core kanji and words, and compatibility names only for surfaces that have not migrated their structural lane:

- `templates/platinum_*_review_set.json`
- `templates/platinum_*_word_review_set.json`
- `npm run deck:platinum:*`
- `npm run deck:words:platinum:*`
- `kanji-platinum-v3-evidence-lanes`
- `word-platinum-v3-evidence-lanes`

Current-standard `platinum` and `fixed_then_platinum` entries remain valid Platinum coverage. Existing completed work is not invalidated by introducing Sapphire language, but migrated core-kanji and word Sapphire structural work is represented by `sapphire` and `fixed_then_sapphire` under native Sapphire standards and must not be described as Platinum coverage.

For new core-kanji and word structural documentation, prompts, and reviews, use the native Sapphire command families. For Platinum, use the Platinum command families. For additional-unverified surfaces that still carry `platinum` names, describe them as structural compatibility gates unless the work is explicitly Platinum. Do not claim Platinum coverage from a structure-only Sapphire pass.

## Migration Rules

- Do not mass rename manifests, commands, statuses, or historical review entries without a dedicated migration plan, tests, and count-preserving proof.
- Do not demote existing current-standard compatibility coverage merely because the tier language was clarified.
- Do not promote any row into Sapphire, Platinum, or Obsidian when the required prior lane is missing or failing.
- Do not promote structure-only Sapphire coverage to Platinum unless the card passes the Platinum gate.
- Future additional schema work should add Sapphire-native command aliases before removing any compatibility `platinum` names.
- Platinum schema work must inherit Sapphire and add card-surface inspection evidence instead of reusing structure-only wording.
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
