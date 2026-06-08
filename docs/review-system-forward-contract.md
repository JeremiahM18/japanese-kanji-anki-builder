# Review System Forward Contract

## Purpose

This document defines the forward review-lane model for every kanji and word deck surface after the legacy structural `platinum` naming transition.

It exists so a future reviewer can answer one question per lane without reading old chat, old migration commits, or compatibility command names.

## Scope

This contract applies to core kanji decks, word decks, optional additional-unverified kanji surfaces, generated card rows, Gold fixtures, Sapphire manifests, future Platinum manifests, Obsidian proof ledgers, batch reports, command references, release docs, and AI-assisted review work.

`Candidate` is included as a pre-trust workflow state. The trust ladder starts at `Silver`.

## Authority Boundary

This document defines lane meaning and allowed authority. It does not certify any card, level, generated artifact, release, source-evidence claim, hosted security posture, media quality, or manual QA result.

Live commands, tracked schemas, tracked manifests, proof ledgers, and release evidence packets still own pass/fail status.

## Source Of Truth

- Tier meaning: this document and [review-tier-governance.md](review-tier-governance.md).
- Operating workflow: [platinum-obsidian-review-contract.md](platinum-obsidian-review-contract.md) and [obsidian-batch-workflow.md](obsidian-batch-workflow.md).
- Documentation rules: [documentation-standard.md](documentation-standard.md).
- Current command behavior: [command-reference.md](command-reference.md), `package.json`, and the command implementations.
- Current counts and backlog: live gate output, not remembered summaries.

## Forward Lane Matrix

| Lane | Purpose | Authority | Required artifact | Required command | Denominator rule | Pass/fail behavior |
| --- | --- | --- | --- | --- | --- | --- |
| Candidate | Proposed item for review, expansion, migration, or triage. It is not deck-trusted and must not be called Bronze. | May start investigation or queue review. | Candidate packet, triage report, source row, or generated selector output. | The relevant selector, audit, or triage command for the product. | Candidate counts never shrink Silver, Gold, Sapphire, Platinum, or Obsidian denominators. | Missing or rejected candidates do not fail trusted deck lanes unless a command explicitly gates the candidate source. |
| Silver | Generated/card surface exists and can be inspected. | May support card-surface review and downstream Gold/Sapphire work. | Generated TSV/APKG input rows or generated report output. | Deck generation, readiness, completion, or preview command for the product. | Every generated row in scope remains in the downstream denominator unless explicitly removed/deferred by the governed lane. | Silver can pass while Gold, Sapphire, Platinum, Obsidian, release, media QA, and source-depth lanes remain incomplete. |
| Gold | Regression fixture protects the generated surface against silent drift. | May protect known reviewed output snippets. | `templates/golden_*_review_set.json` or word Gold equivalent. | `deck:review:*`, `deck:words:review:*`, or the level-specific Gold gate. | Gold protects generated rows; it does not shrink Sapphire, Platinum, or Obsidian denominators. | Gold failure is a regression or stale expected-surface problem until reviewed and fixed upstream. |
| Sapphire | Structural/card-quality certification. | May certify that the live card currently satisfies the product field contract, evidence lanes, media identity, examples, limitations, NLP support where required, and keep/fix/defer/remove decision. | Native Sapphire manifests and schemas, or compatibility structural manifests only for unmigrated surfaces. | `deck:sapphire:*`, `deck:words:sapphire:*`, or a clearly labeled compatibility gate for unmigrated additional surfaces. | Generated rows remain in scope until they have active current-standard Sapphire coverage or a governed defer/remove decision. | Empty or incomplete native Sapphire manifests fail closed. Sapphire is not future Platinum content certification and is not Obsidian proof. |
| Platinum | Future expert content certification after Sapphire. | May certify stronger human content judgment only after Sapphire is already satisfied. | A dedicated future Platinum schema, manifest, and gate. | Future native Platinum commands only, once implemented. | Platinum cannot shrink generated, Sapphire, or Obsidian denominators; it adds a stronger content-certified subset. | Empty, missing, or unimplemented future Platinum manifests fail closed. No Platinum claim can come from Sapphire or legacy compatibility coverage. |
| Obsidian | Explicit substantive proof ledger/certification. | May certify that non-mechanical current-version review proof exists for the exact live card identity. | Canonical JSONL proof ledger entries and proof-provider reconciliation. | `data:obsidian:proof:*`, `deck:kanji:obsidian:*`, and `deck:words:obsidian:*`. | Generated rows are the proof denominator for the scoped product unless the lane has a governed defer/remove decision. | Obsidian fails closed when proof is missing, malformed, mechanically inferred, or not bound to the live card. |

## Legacy Compatibility Lock

Legacy `platinum` manifests, statuses, standards, and commands are compatibility history after the native Sapphire migration.

Locked compatibility inputs include:

- `templates/platinum_*_review_set.json`
- `templates/platinum_*_word_review_set.json`
- `deck:platinum:*`
- `deck:words:platinum:*`
- `kanji-platinum-v3-evidence-lanes`
- `word-platinum-v3-evidence-lanes`
- active legacy statuses `platinum` and `fixed_then_platinum`

Rules:

- Do not add new core-kanji or word structural work to legacy Platinum naming.
- Do not use a legacy compatibility command as the forward structural path when a native Sapphire command exists.
- Do not mass rename legacy files, commands, statuses, or standards without a dedicated migration plan, tests, and count-preserving proof.
- Do not delete legacy compatibility inputs while proof consumers, migration checks, or historical audits still depend on them.
- Targeted bug fixes are allowed only when the compatibility input itself is wrong or a downstream compatibility/proof-provider consumer would otherwise be misleading.
- Legacy compatibility coverage never certifies future Platinum content review.

## Consumer Rules

| Lane | May consume | Must not consume |
| --- | --- | --- |
| Candidate | Source manifests, triage reports, generated selectors, NLP suggestions, and human review queues. | Gold, Sapphire, Platinum, Obsidian, or release claims as proof. |
| Silver | Candidate inputs and generated rows. | Gold, Sapphire, Platinum, Obsidian, source truth, release, or manual QA authority. |
| Gold | Silver output and reviewed expected snippets. | Sapphire, Platinum, Obsidian, or source-governance authority. |
| Sapphire | Silver, Gold, governed Japanese-source field evidence, internal generated/media checks, NLP support where required, and reviewer judgment in separate evidence lanes. | Obsidian proof fields, future Platinum content claims, release readiness, or source-governance placement authority. |
| Platinum | Current-standard Sapphire plus a dedicated expert content-review schema. | Legacy Platinum compatibility history, Sapphire alone, Obsidian proof alone, Deck Ready, or NLP approval as sufficient evidence. |
| Obsidian | Current-standard Sapphire or compatibility structural coverage plus actual human rereview proof. | `revalidatedAt`, clean batch reports, NLP output, generated TSVs, Gold fixtures, or Sapphire text as standalone proof. |

## Forbidden Claims

Do not claim:

- Candidate is Bronze, reviewed, generated, trusted, or release-relevant.
- Silver means reviewed.
- Gold means source truth, Sapphire, Platinum, Obsidian, or release-ready.
- Sapphire means future Platinum content certification.
- Sapphire means Obsidian proof.
- Future Platinum can be inferred from legacy `platinum` names.
- Obsidian can be inferred from `revalidatedAt`, `current-standard-review` prose, Sapphire entries, or compatibility entries.
- Deck Ready, Word Deck Ready, APKG readiness, clean CI, NLP governance, source-use governance, or media completeness certifies unrelated lanes.
- A denominator can shrink because another lane is incomplete.

## Migration Policy

Forward migration must be deliberate and count-preserving:

1. Create the native artifact and schema before retiring a compatibility name.
2. Add tests that preserve total decisions, active coverage, fixed statuses, limitations, and nonshipping decisions.
3. Preserve migration provenance without promoting old authority.
4. Prove the new native command passes completed scopes and fails closed for empty scopes.
5. Update README, docs, command reference, and changelog posture in the same commit.
6. Keep legacy compatibility inputs until downstream consumers are migrated or explicitly retired.

## Verification

After changing this contract or forward lane wording, run:

```bash
node --test test/repositoryGovernance.test.js
git diff --check
```

Run affected lane gates when the change alters command behavior, manifests, counts, status claims, generated outputs, or release posture.

## Update Triggers

Update this document when lane names, lane authority, trust-tier wording, manifest standards, command families, compatibility retirement policy, proof-provider behavior, denominator rules, or release-facing lane claims change.
