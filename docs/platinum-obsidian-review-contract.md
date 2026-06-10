# Platinum And Obsidian Review Contract

This is the front-door contract for every Sapphire, Platinum, or Obsidian review pass in this repository. Read this before touching `templates/sapphire_n*_review_set.json`, `templates/sapphire_n*_word_review_set.json`, `templates/platinum_*_review_set.json`, `templates/platinum_*_word_review_set.json`, or `templates/obsidian_proof_ledger/*.jsonl`.

For program-wide lane authority, read [review-system-forward-contract.md](review-system-forward-contract.md) first, then [review-tier-governance.md](review-tier-governance.md). Core kanji and words use native Sapphire files and commands; additional surfaces still retain compatibility names until their own deliberate migration is implemented.

This file does not replace the schemas, validators, tests, or detailed runbooks. It states the operating standard those files enforce.

## Non-Negotiables

- Sapphire is structural certification only, not a softer name for "almost reviewed" and not card-surface inspection.
- Core-kanji and word Sapphire commands and manifests are the structural lane. Do not put structure-only work into Platinum naming.
- Platinum is card-surface inspection. The existing Platinum commands and manifests remain active Platinum inputs; do not describe them as gone, legacy-only, future-only, or unimplemented.
- Obsidian is the repository's current non-human governed native/fluent-quality content-certification proof lane for a scoped version. It is separate non-mechanical rereview proof, not a synonym for Platinum and not an inference from prior passes.
- Deck Ready, Word Deck Ready, APKG readiness, and package staging are mechanical artifact states, not content trust tiers.
- Release artifact QA is not a second content-certification lane. If import, render, media, accessibility, or listening QA exposes a content issue, reopen Sapphire, Platinum, and Obsidian for the affected cards.
- Future human or native/fluent review is human-reviewed provenance for the same native/fluent-quality standard Obsidian already checks. It is not a different content standard.
- NLP is required review support where the lane defines it, but NLP never approves cards, writes tracked templates, certifies Obsidian, or claims release readiness.
- Kanji and word lanes are separate products. Do not borrow proof, status, counts, or source decisions across them.
- Generated rows, source evidence, internal checks, reviewer judgment, media identity, NLP support, Platinum, Obsidian proof, and release readiness are separate lanes.
- Scoped media review commands are card-level evidence only. Full-level media completeness must be verified with `deck:ready -- --levels=<level>` and the relevant media policy audits.
- If a real core-kanji or word card field is corrected during Sapphire review, the outcome is `fixed_then_sapphire`, and the entry must include `fixSummary`. Compatibility-named additional surfaces still use their current `fixed_then_platinum` status until migrated.
- If core truth remains uncertain, defer or remove the card. Do not hide uncertainty in prose.
- Do not lower N2 through N5 standards to match N1. Raise N1 to the governed standard already enforced elsewhere.
- Do not claim a batch is complete until the actual card data was reviewed and the relevant gates were run.
- If a commit changes review counts, proof posture, readiness posture, or gate expectations, update the affected README, docs, and changelog claims in that same commit.

## Evidence Boundaries

Gold protects generated output against drift. It does not prove source truth, Sapphire structural coverage, Platinum, Obsidian proof, or release readiness.

Sapphire proves the live generated card currently passes the active structural standard for its product:

- Core kanji: `kanji-sapphire-v1-evidence-lanes`.
- Word: `word-sapphire-v1-evidence-lanes`.

Platinum proves the live generated card has passed card-surface inspection under the current Platinum standard:

- Core kanji: `kanji-platinum-v3-evidence-lanes`.
- Word: `word-platinum-v3-evidence-lanes`.

Obsidian proves explicit, non-mechanical current-version native/fluent-quality rereview was performed for the live card and recorded in the canonical proof path. Current Obsidian proof is non-human governed proof produced under this repository's evidence-backed workflow, schemas, checklists, and fail-closed gates. It must check natural Japanese, sense and translation fit, learner usefulness, level fit, reading/example quality, evidence, limitations, and release-quality content. The proof claim must not be widened to human-reviewed provenance unless that separate provenance is recorded.

`sourceEvidence` is external governed Japanese-source card-field truth only. It must not contain generated-output checks, Gold regression, media checks, source-governance placement claims, NLP output, or manual judgment. Those belong in their own lanes.

Generated TSVs, Gold fixtures, local caches, ignored `data/` or `out/` files, batch reports, clean structure, `revalidatedAt`, and `current-standard-review` prose are not Obsidian proof.

## Sapphire Structural Batch Standard

Every Sapphire or compatibility-structural batch starts from live repo state:

```bash
git status --short --untracked-files=all
git log -1 --oneline
```

Use the appropriate selector/report command for the lane, then review the selected cards one at a time:

```bash
npm run deck:sapphire:batch -- --level=<level> --limit=<batch-size> --queue=missing-current-standard --json
npm run deck:words:sapphire:batch -- --level=<level> --limit=<batch-size> --queue=missing-current-standard --json
```

Use `deck:platinum:batch -- --queue=missing-current-standard` for Platinum work. Native core-kanji structural work uses `deck:sapphire:batch`.

Use `deck:sapphire:batch` for core-kanji Sapphire work and `deck:words:sapphire:batch` for word Sapphire work. Use the `platinum`-named batch commands for Platinum or Obsidian/substantive proof preparation.

A Sapphire structural pass must inspect the actual live generated card data, not just the manifest shape, but its conclusion is structural only.

Core-kanji Sapphire review must check structural identity only:

- target kanji identity and deck fit
- `DisplayWord`
- `PrimaryReading`, `MeaningJP`, and `KanjiMeanings` are present and protected by structural snippets
- notes and support vocabulary
- example sentence, reading, and translation fields are present and protected by structural snippets
- evidence lanes are separate and do not contain Obsidian proof
- source-origin independence from placement/source-governance claims
- exact primary-reading audio identity
- stroke-order media target and provenance
- verification limitations are explicit when present

Word Sapphire review must check structural identity only:

- exact written form and reading identity
- deck fit, current-level anchor, support-kanji labels, and placement rationale
- meaning, example sentence, reading, and translation fields are present and protected by structural snippets
- evidence lanes are separate and do not contain Obsidian proof
- reading breakdown and constituent labels
- exact word-reading audio identity
- pitch source/render state
- media provenance
- verification limitations are explicit when present

If any reviewed structural surface is wrong, fix the source/card data first, regenerate as needed, rerun affected gates, and record `fixed_then_sapphire` with `fixSummary`. A card that needed correction is not plain `sapphire`.

## Platinum Card-Surface Batch Standard

Platinum starts after or alongside satisfied structural checks, but it answers a different question: whether the actual generated card surface has been inspected beyond structure.

Use:

```bash
npm run deck:platinum:batch -- --level=<level> --limit=<batch-size> --queue=missing-current-standard --json
npm run deck:words:platinum:batch -- --level=<level> --limit=<batch-size> --queue=missing-current-standard --json
```

A Platinum pass must inspect the actual live generated card data for learner-facing reading, meaning, example, notes/support surface, media identity, level/product fit, evidence boundaries, limitations, and final keep/fix/defer/remove judgment. If the card surface is wrong, fix source/card data first, regenerate as needed, rerun affected gates, and record `fixed_then_platinum` with `fixSummary`. A card that needed correction is not plain `platinum`.

`media:review:audio` and `media:review:word-audio` may support exact-audio review for the selected batch, but they are not level readiness gates. Do not summarize a scoped audio packet count as the level's media status.

## NLP Support

NLP support is part of the review workflow when the lane defines it.

Kanji uses:

```bash
npm run deck:kanji:nlp-signals -- --levels=<level>
```

Words use:

```bash
npm run deck:words:expansion-support -- --levels=<level>
```

The Obsidian pass must inspect relevant NLP review packets, tokenization signals, draft notes, warnings, and limitations for the selected cards. NLP can reveal issues, prioritize review, or provide supporting context. It cannot certify the card. If NLP reveals a real issue, fix tracked data first and rerun the affected review artifacts or gates.

## Obsidian Batch Standard

Obsidian starts after the live card has valid current-standard Platinum. Use the Obsidian queue, not the missing-Platinum queue:

```bash
npm run deck:kanji:obsidian:rereview-status -- --levels=<level>
npm run deck:platinum:batch -- --level=<level> --limit=<batch-size> --queue=substantive-rereview --json
```

```bash
npm run deck:words:obsidian:rereview-status -- --levels=<level>
npm run deck:words:platinum:batch -- --level=<level> --limit=<batch-size> --queue=substantive-rereview --json
```

The Obsidian pass must rereview the actual live card data again, including source evidence, examples, media identity, limitations, any NLP support, and native/fluent-quality content criteria. Obsidian proof is not inferred from the Sapphire entry or the Platinum entry.

Canonical Obsidian proof is tracked JSONL under:

```text
templates/obsidian_proof_ledger/*.jsonl
```

Draft events stay ignored/local under:

```text
out/obsidian-proof/drafts/*.jsonl
```

Append proof only through the governed appender. Dry-run first, inspect the report, then write only if the dry-run is clean and the governed rereview actually happened:

```bash
npm run data:obsidian:proof:append -- --events=out/obsidian-proof/drafts/<batch>.jsonl
npm run data:obsidian:proof:append -- --events=out/obsidian-proof/drafts/<batch>.jsonl --write
```

The proof event must bind the exact card identity, review standard, reviewer, reviewed date, non-mechanical current-standard rereview type, evidence checklist, limitation decision, sentence-quality review, source review-set path, batch id, and proof authority boundary.

## Required Verification

Run the smallest complete verification set for the lane and scope. Do not substitute one gate for another.

Core-kanji Sapphire structural batch verification normally includes:

```bash
npm run deck:sapphire:n<level>
node --test test/sapphireTrackedReviewSets.test.js
```

For word levels with an npm alias, run `npm run deck:words:sapphire:n<level>`. Native word Sapphire commands fail closed for empty or incomplete manifests. Platinum commands remain the card-surface inspection lane, not the structural lane.

When a batch report makes a media-readiness claim for a level, also run:

```bash
npm run deck:ready -- --levels=<level>
npm run data:audit:audio -- --json
```

For kanji media claims, also run:

```bash
npm run data:audit:stroke-order -- --json
```

Scoped `media:review:*` commands may be listed as card-level review evidence, but they do not replace these full-level gates.

Obsidian proof verification normally includes:

```bash
npm run data:obsidian:proof:validate
npm run data:obsidian:proof:reconcile -- --levels=<levels>
npm run data:obsidian:proof:reconcile -- --deck-kind=word --levels=<levels>
npm run deck:kanji:obsidian:rereview-status -- --levels=<level>
npm run deck:words:obsidian:rereview-status -- --levels=<level>
```

Run certification only when the selected scope is expected to be fully Obsidian:

```bash
npm run deck:kanji:obsidian:certify-status -- --levels=<level>
npm run deck:words:obsidian:certify-status -- --levels=<level>
```

For release, CI, or broad product claims, run the full documented verification bundle from `docs/verification.md`, `docs/release-process.md`, and `docs/product-exit-criteria.md`. At minimum, product-impacting changes require the relevant lane gates plus:

```bash
npm test
npm run lint
npm run typecheck
```

If a command cannot run, the final report must say exactly which command was skipped or failed and why.

## Required Report Shape

Every batch report must state:

- exact repo state at start: `git status` and latest commit
- exact scope: product, level, queue, batch size, and selected cards
- exact files inspected
- exact commands run
- cards fixed, with the lane-native fixed status such as `fixed_then_sapphire` or `fixed_then_platinum`, and `fixSummary`
- cards promoted without data changes, with a statement that actual card data was reviewed
- cards deferred or removed, with reasons
- source-evidence status and any unresolved source boundary
- NLP artifacts inspected and any resulting action
- media/audio/stroke-order/pitch checks performed
- Obsidian proof written or not written
- tests/gates run and results
- README, docs, and changelog posture lines updated when counts or gate expectations changed
- what remains explicitly unclaimed

## Forbidden Shortcuts

Do not:

- promote by structure alone
- claim examples were reviewed without reading the sentence, reading, and translation
- leave a corrected card as plain `sapphire` or plain `platinum`
- use NLP as approval
- use generated output, Gold, local cache, or source-governance placement evidence as Japanese-source card-field proof
- use Sapphire as Platinum, or Platinum as Obsidian proof
- stage ignored proof drafts from `out/obsidian-proof/drafts`
- shrink an Obsidian denominator because Sapphire or structural compatibility coverage is incomplete
- call a level release-ready because one lane passed
- continue a batch after discovering a real core-field uncertainty without fixing, deferring, or removing the card

If there is doubt, fail closed and report the blocker.
