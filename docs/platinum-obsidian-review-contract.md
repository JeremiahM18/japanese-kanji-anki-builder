# Platinum And Obsidian Review Contract

This is the front-door contract for every Platinum or Obsidian review pass in this repository. Read this before touching `templates/platinum_*_review_set.json`, `templates/platinum_*_word_review_set.json`, or `templates/obsidian_proof_ledger/*.jsonl`.

This file does not replace the schemas, validators, tests, or detailed runbooks. It states the operating standard those files enforce.

## Non-Negotiables

- Platinum is actual card-data review, not structure-only cleanup.
- Obsidian is separate non-mechanical rereview proof, not a synonym for Platinum.
- NLP is required review support where the lane defines it, but NLP never approves cards, writes tracked templates, certifies Obsidian, or claims release readiness.
- Kanji and word lanes are separate products. Do not borrow proof, status, counts, or source decisions across them.
- Generated rows, source evidence, internal checks, reviewer judgment, media identity, NLP support, Obsidian proof, and release readiness are separate lanes.
- Scoped media review commands are card-level evidence only. Full-level media completeness must be verified with `deck:ready -- --levels=<level>` and the relevant media policy audits.
- If a real card field is corrected during review, the outcome is `fixed_then_platinum`, and the entry must include `fixSummary`.
- If core truth remains uncertain, defer or remove the card. Do not hide uncertainty in prose.
- Do not lower N2 through N5 standards to match N1. Raise N1 to the governed standard already enforced elsewhere.
- Do not claim a batch is complete until the actual card data was reviewed and the relevant gates were run.
- If a commit changes review counts, proof posture, readiness posture, or gate expectations, update the affected README/docs claims in that same commit.

## Evidence Boundaries

Gold protects generated output against drift. It does not prove source truth, Platinum quality, Obsidian proof, or release readiness.

Platinum proves the live generated card currently passes the active Platinum standard for its product:

- Kanji: `kanji-platinum-v3-evidence-lanes`.
- Word: `word-platinum-v3-evidence-lanes`.

Obsidian proves explicit, non-mechanical current-version rereview was performed for the live card and recorded in the canonical proof path.

`sourceEvidence` is external governed Japanese-source card-field truth only. It must not contain generated-output checks, Gold regression, media checks, source-governance placement claims, NLP output, or manual judgment. Those belong in their own lanes.

Generated TSVs, Gold fixtures, local caches, ignored `data/` or `out/` files, batch reports, clean structure, `revalidatedAt`, and `current-standard-review` prose are not Obsidian proof.

## Platinum Batch Standard

Every Platinum batch starts from live repo state:

```bash
git status --short --untracked-files=all
git log -1 --oneline
```

Use the appropriate selector/report command for the lane, then review the selected cards one at a time:

```bash
npm run deck:platinum:batch -- --level=<level> --limit=<batch-size> --queue=missing-current-standard --json
npm run deck:words:platinum:batch -- --level=<level> --limit=<batch-size> --queue=missing-current-standard --json
```

A Platinum pass must inspect the actual live generated card data, not just the manifest shape.

Kanji Platinum review must check:

- target kanji identity and deck fit
- `DisplayWord`
- `PrimaryReading` and reading rationale
- `MeaningJP`
- `KanjiMeanings`
- notes and support vocabulary
- example sentence, reading, and translation
- example naturalness, learner usefulness, level fit, release quality, and support-only status
- governed Japanese-source field evidence
- source-origin independence from placement/source-governance claims
- exact primary-reading audio identity
- stroke-order media target and provenance
- verification limitations
- learner usefulness and product fit

Word Platinum review must check:

- exact written form and reading identity
- deck fit, current-level anchor, support-kanji labels, and placement rationale
- meaning and usefulness
- example sentence, reading, and translation
- example naturalness, learner usefulness, level fit, and release quality
- governed Japanese-source field evidence
- reading breakdown and constituent labels
- exact word-reading audio identity
- pitch source/render state
- media provenance
- verification limitations
- learner usefulness and product fit

If any reviewed surface is wrong, fix the source/card data first, regenerate as needed, rerun affected gates, and record `fixed_then_platinum` with `fixSummary`. A card that needed correction is not plain `platinum`.

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

The reviewer must inspect relevant NLP review packets, tokenization signals, draft notes, warnings, and limitations for the selected cards. NLP can reveal issues, prioritize review, or provide supporting context. It cannot certify the card. If NLP reveals a real issue, fix tracked data first and rerun the affected review artifacts or gates.

## Obsidian Batch Standard

Obsidian starts after the live card has structurally valid current-standard Platinum coverage. Use the Obsidian queue, not the missing-structure queue:

```bash
npm run deck:kanji:obsidian:rereview-status -- --levels=<level>
npm run deck:platinum:batch -- --level=<level> --limit=<batch-size> --queue=substantive-rereview --json
```

```bash
npm run deck:words:obsidian:rereview-status -- --levels=<level>
npm run deck:words:platinum:batch -- --level=<level> --limit=<batch-size> --queue=substantive-rereview --json
```

The reviewer must rereview the actual live card data again, including source evidence, examples, media identity, limitations, and any NLP support. Obsidian proof is not inferred from the Platinum entry.

Canonical Obsidian proof is tracked JSONL under:

```text
templates/obsidian_proof_ledger/*.jsonl
```

Draft events stay ignored/local under:

```text
out/obsidian-proof/drafts/*.jsonl
```

Append proof only through the governed appender. Dry-run first, inspect the report, then write only if the dry-run is clean and the human review actually happened:

```bash
npm run data:obsidian:proof:append -- --events=out/obsidian-proof/drafts/<batch>.jsonl
npm run data:obsidian:proof:append -- --events=out/obsidian-proof/drafts/<batch>.jsonl --write
```

The proof event must bind the exact card identity, review standard, reviewer, reviewed date, non-mechanical current-standard rereview type, evidence checklist, limitation decision, sentence-quality review, source review-set path, batch id, and proof authority boundary.

## Required Verification

Run the smallest complete verification set for the lane and scope. Do not substitute one gate for another.

Platinum batch verification normally includes:

```bash
npm run deck:platinum:n<level>
node --test test/platinumTrackedReviewSets.test.js
```

For word levels with an npm alias, run `npm run deck:words:platinum:n<level>`. For future word levels without an alias, run `node scripts/reviewPlatinumWordLevel.js --level=<level> --require-all` after that level's Platinum manifest exists.

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
- cards fixed, with `fixed_then_platinum` and `fixSummary`
- cards promoted without data changes, with a statement that actual card data was reviewed
- cards deferred or removed, with reasons
- source-evidence status and any unresolved source boundary
- NLP artifacts inspected and any resulting action
- media/audio/stroke-order/pitch checks performed
- Obsidian proof written or not written
- tests/gates run and results
- README/docs posture lines updated when counts or gate expectations changed
- what remains explicitly unclaimed

## Forbidden Shortcuts

Do not:

- promote by structure alone
- claim examples were reviewed without reading the sentence, reading, and translation
- leave a corrected card as plain `platinum`
- use NLP as approval
- use generated output, Gold, local cache, or source-governance placement evidence as Japanese-source card-field proof
- use Platinum as Obsidian proof
- stage ignored proof drafts from `out/obsidian-proof/drafts`
- shrink an Obsidian denominator because Platinum is incomplete
- call a level release-ready because one lane passed
- continue a batch after discovering a real core-field uncertainty without fixing, deferring, or removing the card

If there is doubt, fail closed and report the blocker.
