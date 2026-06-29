# Review System Forward Contract

## Purpose

This document defines the review-lane model for every kanji and word deck surface.

It exists so a future reviewer can answer one question per lane without reading old chat, old migration commits, or compatibility command names.

## Scope

This contract applies to core kanji decks, word decks, optional additional-unverified kanji surfaces, generated card rows, Gold fixtures, Sapphire manifests, Platinum manifests, Obsidian proof ledgers, batch reports, command references, release docs, and AI-assisted review work.

Candidate rows, selector output, migration targets, source rows, and expansion triage are pre-trust queues. They are workflow inputs, not certification gates. The trust ladder starts at `Silver`.

## Authority Boundary

This document defines lane meaning and allowed authority. It does not certify any card, level, generated artifact, release, source-evidence claim, hosted security posture, media quality, or manual QA result.

Live commands, tracked schemas, tracked manifests, proof ledgers, and release evidence packets still own pass/fail status.

## Source Of Truth

- Tier meaning: this document and [review-tier-governance.md](review-tier-governance.md).
- Operating workflow: [platinum-obsidian-review-contract.md](platinum-obsidian-review-contract.md) and [obsidian-batch-workflow.md](obsidian-batch-workflow.md).
- Documentation rules: [documentation-standard.md](documentation-standard.md).
- Current command behavior: [command-reference.md](command-reference.md), `package.json`, and the command implementations.
- Current counts and backlog: live gate output, not remembered summaries.
- Closeout/handoff posture: `npm run deck:closeout -- --levels=<levels>` aggregates git state, lane counts, count-complete gate reminders, expected coverage-failure gates, NLP support posture, CI/release hygiene, manual QA boundaries, and proof-ledger dirtiness. Count-complete rows mean the named gate still has to be run for real pass evidence; closeout is not a certification lane.
- Content certification for a scoped version: the relevant fail-closed Obsidian gate plus the canonical proof ledger. Current Obsidian is non-human governed native/fluent-quality review. Release artifact QA and later human-reviewed provenance are separate evidence records.

## Forward Lane Matrix

| Lane | Purpose | Authority | Required artifact | Required command | Precondition rule | Denominator rule | Pass/fail behavior |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Silver | Generated/card surface exists and can be inspected. | May support card-surface review and downstream Gold/Sapphire work. | Generated TSV/APKG input rows or generated report output. | Deck generation, readiness, completion, or preview command for the product. | Candidate/source rows must be generated into the scoped deck surface before Silver exists. | Every generated row in scope remains in the downstream denominator unless explicitly removed/deferred by the governed lane. | Silver can pass while Gold, Sapphire, Platinum, Obsidian, release, media QA, and source-depth lanes remain incomplete. |
| Gold | Regression fixture protects the generated surface against silent drift. | May protect known reviewed output snippets. | `templates/golden_*_review_set.json` or word Gold equivalent. | `deck:review:*`, `deck:words:review:*`, or the level-specific Gold gate. | Gold requires a matching Silver generated row for the same card identity. | Gold protects generated rows; it does not shrink Sapphire, Platinum, or Obsidian denominators. | Gold failure is a regression or stale expected-surface problem until reviewed and fixed upstream. |
| Sapphire | Structural certification. | May certify that the live card currently satisfies the product structural contract: required field identity, evidence lane separation, required internal check records, media identity fields, required support artifacts such as NLP where the workflow calls for them, explicit limitations, and keep/fix/defer/remove decision. | Native Sapphire manifests and schemas, or compatibility structural manifests only for unmigrated surfaces. | `deck:sapphire:*`, `deck:words:sapphire:*`, or a clearly labeled compatibility gate for unmigrated additional surfaces. | Sapphire requires a passing prior Gold regression for the exact card identity. NLP is required support where the workflow calls for it, but it remains support-only. | Generated rows remain in scope until they have active current-standard Sapphire coverage or a governed defer/remove decision. | Empty or incomplete native Sapphire manifests fail closed. Sapphire is not Platinum and is not Obsidian proof. |
| Platinum | Card-surface inspection. | May certify that the actual generated card was reviewed beyond structure for learner-facing reading, meaning, example, notes/support surface, media identity, level/product fit, evidence boundaries, limitations, and final keep/fix/defer/remove judgment. | `templates/platinum_*_review_set.json`, `templates/platinum_*_word_review_set.json`, and the current Platinum schema. | `deck:platinum:*` and `deck:words:platinum:*`. | Platinum requires passing prior Gold and active current-standard Sapphire coverage for the exact card identity. | Platinum cannot shrink generated, Sapphire, or Obsidian denominators; it adds the card-surface-inspected subset. | Empty or incomplete Platinum manifests fail closed. No Platinum claim can come from Sapphire or NLP support alone. |
| Obsidian | Explicit substantive proof ledger/native-fluent-quality content certification. | May certify that non-mechanical current-version native/fluent-quality review proof exists for the exact live card identity under the repository's governed proof standard. | Canonical JSONL proof ledger entries and proof-provider reconciliation. | `data:obsidian:proof:*`, `deck:kanji:obsidian:*`, and `deck:words:obsidian:*`. | Obsidian requires valid current-standard Platinum for the exact card identity plus explicit proof; it cannot satisfy missing Platinum or Sapphire. | Generated rows are the proof denominator for the scoped product unless the lane has a governed defer/remove decision. | Obsidian fails closed when proof is missing, malformed, mechanically inferred, not bound to the live card, or missing required native/fluent-quality content evidence. |

## Current Implementation Status

Native Sapphire is implemented for core kanji and words. Platinum is implemented through the existing Platinum manifests and command families. Do not describe these Platinum commands as legacy-only or unimplemented.

Native word and core-kanji Sapphire manifests are resolver-backed for prior-lane authority. Gold-owned generated-output snippets may be resolved from the matching Gold manifest instead of copied into Sapphire, while Sapphire still owns structural evidence lanes, internal checks, limitations, and the current-standard structural decision. Platinum gates may resolve matching Gold and current-standard Sapphire context, but Platinum still owns its own card-surface inspection, quality gates, and reviewer judgment. Resolver-backed context is a precondition mechanism, not a permission to shrink denominators, relabel authority, or infer Platinum/Obsidian certification.

## Legacy Compatibility Lock

Historical Platinum manifests, statuses, standards, and commands are still the active Platinum lane unless a deliberate count-preserving migration changes that contract.

Locked Platinum inputs include:

- `templates/platinum_*_review_set.json`
- `templates/platinum_*_word_review_set.json`
- `deck:platinum:*`
- `deck:words:platinum:*`
- `kanji-platinum-v3-evidence-lanes`
- `word-platinum-v3-evidence-lanes`
- active legacy statuses `platinum` and `fixed_then_platinum`

Rules:

- Do not add new structure-only Sapphire work to Platinum naming.
- Do not use a Platinum command as the forward structural path when a native Sapphire command exists.
- Do not mass rename legacy files, commands, statuses, or standards without a dedicated migration plan, tests, and count-preserving proof.
- Do not delete Platinum inputs while proof consumers, migration checks, historical audits, or Platinum gates still depend on them.
- Targeted bug fixes are allowed when the Platinum input itself is wrong or a downstream consumer would otherwise be misleading.
- Platinum is not Obsidian proof.

## Consumer Rules

| Lane | May consume | Must not consume |
| --- | --- | --- |
| Silver | Candidate inputs and generated rows. | Gold, Sapphire, Platinum, Obsidian, source truth, release, or manual QA authority. |
| Gold | Silver output and reviewed expected snippets. | Sapphire, Platinum, Obsidian, or source-governance authority. |
| Sapphire | Silver, resolved matching Gold snippets, structural evidence lanes, internal generated/media checks, NLP support where required, and reviewer structural decision fields. | Obsidian proof fields, Platinum claims, Platinum quality gates, release readiness, source-truth certification, or source-governance placement authority. |
| Platinum | Resolved matching Gold, current-standard Sapphire, generated card rows, governed Japanese-source field evidence, internal generated/media checks, review evidence, Platinum quality gates, and reviewer card-surface judgment. | Sapphire alone, Obsidian proof alone, Deck Ready, or NLP approval as sufficient evidence. |
| Obsidian | Current-standard Sapphire or compatibility structural coverage plus actual non-human governed native/fluent-quality rereview proof. | `revalidatedAt`, clean batch reports, NLP output, generated TSVs, Gold fixtures, Sapphire text as standalone proof, release artifact QA, or unrecorded human/native review. |

## Prior-Lane Enforcement

Every forward lane consumes the lane immediately below it as a hard precondition. Public Sapphire gates require matching passing Gold input. Public Platinum gates require matching passing Gold input and current-standard Sapphire coverage. Public Obsidian status/certification consumers require valid Platinum before proof can certify the card.

Scoped diagnostic batch reports may show a requested card that is missing a prior lane, but they must mark the missing lane as blocking rather than selecting it as ready review work. Unscoped forward queues must not advance rows that are missing their required prior-lane coverage.

## Forbidden Claims

Do not claim:

- Candidate queues are reviewed, generated, trusted, release-relevant, or certification gates.
- Silver means reviewed.
- Gold means source truth, Sapphire, Platinum, Obsidian, or release-ready.
- Sapphire counts as Platinum.
- Sapphire means Obsidian proof.
- Platinum can be inferred from Sapphire, NLP support, Obsidian proof, or command naming alone.
- Obsidian can be inferred from `revalidatedAt`, `current-standard-review` prose, Sapphire entries, or compatibility entries.
- Deck Ready, Word Deck Ready, APKG readiness, clean CI, NLP governance, source-use governance, or media completeness certifies unrelated lanes.
- Release artifact QA is a replacement for Obsidian content certification.
- Obsidian lacks native/fluent-quality checks. Obsidian must check those criteria; future human/native work records human-reviewed provenance for the same standard.
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

Before closing a lane bucket or starting a new handoff thread, run:

```bash
npm run deck:closeout -- --levels=<levels>
```

Treat the closeout report as orientation only. It can identify expected fail-closed coverage gaps and dirty proof-ledger files, but it does not replace Gold, Sapphire, Platinum, Obsidian, release, CI, manual import, media listening, or accessibility gates.

## Update Triggers

Update this document when lane names, lane authority, trust-tier wording, manifest standards, command families, compatibility retirement policy, proof-provider behavior, denominator rules, or release-facing lane claims change.
