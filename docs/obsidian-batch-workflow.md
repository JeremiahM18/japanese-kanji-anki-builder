# Obsidian Batch Workflow

Use this runbook for every Obsidian pass. Do not wait until a level is complete before running these commands. The status and batch commands are the work queue.

Obsidian is human rereview proof. Automation can prepare packets, reject bad structure, and verify that proof is present and card-bound. Automation does not perform the human review.

Before running any Platinum or Obsidian batch, read the binding [Platinum And Obsidian Review Contract](platinum-obsidian-review-contract.md). It defines the lane boundaries, required actual card-data review, NLP boundary, `fixed_then_platinum` rule, proof authority, verification requirements, and report shape.

## Kanji Obsidian Pass

1. Start clean and identify the current queue.

```bash
git status --short --untracked-files=all
npm run deck:kanji:review-status
npm run deck:kanji:obsidian:rereview-status -- --levels=<level>
```

2. Generate the next human-review batch.

```bash
npm run deck:platinum:batch -- --level=<level> --limit=12
```

The default queue is `substantive-rereview`. It includes current-standard Platinum entries until explicit non-mechanical Obsidian proof exists. Use `--queue=missing-current-standard` only when the task is actual card-data Platinum coverage, not Obsidian proof.

3. Generate or refresh the kanji deck surface.

```bash
npm run deck:ready -- --levels=<level>
```

This refreshes the live generated TSV/APKG surface used by the reviewer. It is not Obsidian proof.

4. Run the kanji NLP support lane.

```bash
npm run deck:kanji:nlp-signals -- --levels=<level>
```

This audits the NLP manifest/runtime, refreshes generated kanji TSVs, tokenizes bare kanji-card anchors, creates kanji-scoped review packets and draft notes, validates artifacts, and runs `nlp:governance-gate`.

It does not run word expansion, word reading-gap discovery, word example reranking, word sense-fit audits, or word-card embeddings.

Kanji tokenizer differences are usually reading variants or tokenizer coverage gaps, not automatic defects, because one bare kanji can legitimately have multiple readings. NLP is review amplification only. It cannot certify Obsidian proof, approve source truth, write tracked templates, or replace the reviewer.

5. Review each queued card manually.

The reviewer checks the live generated card, the batch rubric, tracked evidence, and any NLP signals:

- primary reading
- meanings
- example sentence
- reading and translation
- audio identity
- stroke-order media
- notes and support surface
- source evidence
- limitations
- learner usefulness

If NLP or the batch rubric exposes a real issue, fix tracked source/card data first. Then regenerate, rerun the affected gates, rerun NLP if its support artifact changed, and only then continue.

6. Record Obsidian proof only after the review happened.

The canonical proof record is a complete JSONL ledger event under `templates/obsidian_proof_ledger/*.jsonl`. It must carry structured proof fields plus actual card-bound example-sentence quality evidence. Do not add inline `rereviewProvenance` to tracked review sets for migrated ledger levels such as N3 kanji.

Use the governed appender instead of ad hoc helper scripts. Keep the draft input under an ignored/local path such as `out/obsidian-proof/drafts/`, inspect the dry-run report, then rerun with `--write` only after the human review and dry-run both pass:

```bash
npm run data:obsidian:proof:append -- --events=out/obsidian-proof/drafts/<batch>.jsonl
npm run data:obsidian:proof:append -- --events=out/obsidian-proof/drafts/<batch>.jsonl --write
```

The appender validates the proof-event schema, card identity binding, tracked review-set target, canonical ledger output path, duplicate proof ids, duplicate proof targets, and post-write reconciliation. Do not record proof from `revalidatedAt`, lane-valid text, NLP output, generated TSVs, Gold fixtures, Platinum structural pass text, or a clean batch report alone.

7. Verify the structural and reading gates for the batch.

Use the level-specific Platinum alias:

```bash
npm run deck:platinum:n<level>
```

For example, N3 is:

```bash
npm run deck:platinum:n3
```

This local generated-row gate enforces the primary-reading rule against the live generated `OnReading` and `KunReading` fields.

Then run the CI-safe tracked reading guard:

```bash
node --test test/platinumTrackedReviewSets.test.js
```

That tracked test checks active N3 through N5 Platinum primary readings against the governed KANJIDIC2 reading-reference contract. It does not read ignored root `data/*`.

8. If the level has a governed tracked-source card-field contract, run its source artifact gates.

N5:

```bash
npm run product:artifacts:kanji:n5:preflight
npm run product:artifacts:kanji:n5
```

N4:

```bash
npm run product:artifacts:kanji:n4:preflight
npm run product:artifacts:kanji:n4
```

N3:

```bash
npm run product:artifacts:kanji:n3:preflight
npm run product:artifacts:kanji:n3
```

For N2/N1, the all-level source preflight is expected to fail closed until those governed field-source contracts exist:

```bash
npm run product:artifacts:kanji:preflight
```

9. Re-check Obsidian progress and the next queue.

```bash
npm run deck:kanji:obsidian:rereview-status -- --levels=<level>
npm run deck:platinum:batch -- --level=<level> --limit=12
```

10. Commit only the completed batch.

Commit the canonical ledger changes and the exact verification notes together. Do not mix source-contract generation, Obsidian proof, APKG/media QA, unrelated cleanup, draft input files, or generated ignored artifacts into the same commit.

11. Run certification only when the selected level is expected to be fully Obsidian.

```bash
npm run deck:kanji:obsidian:certify-status -- --levels=<level>
```

If this fails during an in-progress level, treat the failure as the remaining queue. Do not weaken the gate.

## Word Obsidian Pass

1. Start clean and identify the current queue.

```bash
git status --short --untracked-files=all
npm run deck:words:obsidian:rereview-status -- --levels=<level>
```

2. Generate the next human-review batch.

```bash
npm run deck:words:platinum:batch -- --level=<level> --limit=8
```

The default queue is `substantive-rereview`. Use `--queue=missing-current-standard` only when the task is actual card-data Platinum coverage, not Obsidian proof.

3. Generate or refresh the word deck surface.

```bash
npm run deck:words:ready -- --levels=<level>
```

This refreshes the live generated word rows used by the reviewer. It is not Obsidian proof.

4. Run the word NLP support lane.

```bash
npm run deck:words:expansion-support -- --levels=<level>
```

Word NLP is broad and model-backed. This command runs model/runtime checks, tokenization, embeddings, example reranking, sense-fit warnings, reading-gap candidate discovery, review packets, draft proposals, artifact validation, and `nlp:governance-gate`.

Review packets point the human reviewer at exact word-reading targets, tokenizer issues, example alternatives, sense-fit risks, and candidate words. NLP cannot certify Obsidian proof, approve source truth, or write tracked templates.

5. Review each queued word card manually.

The reviewer checks the live generated row, exact written-reading identity, source evidence, word audio, pitch evidence/rendering, reading breakdown, support labels, example naturalness, learner usefulness, level fit, release quality, reading, translation, and any NLP signals.

If NLP or the batch rubric exposes a real issue, fix tracked source/card data first. Then regenerate, rerun the affected gates, rerun NLP if its support artifact changed, and only then continue.

6. Record Obsidian proof only after the review happened.

Only after the live generated word row is actually rereviewed should Obsidian proof be added. New substantive word proof should be recorded directly as canonical JSONL ledger events, not as inline `rereviewProvenance` that gets migrated later. Word proof must bind exact written+reading identity, the full word-card `evidenceChecked` checklist, and actual example-sentence quality evidence.

Use the governed appender with an ignored/local draft input, dry-run first, and write only after the dry-run report is clean:

```bash
npm run data:obsidian:proof:append -- --events=out/obsidian-proof/drafts/<batch>.jsonl
npm run data:obsidian:proof:append -- --events=out/obsidian-proof/drafts/<batch>.jsonl --write
```

7. Verify the batch.

Use the level-specific Platinum alias when it exists:

```bash
npm run deck:words:platinum:n<level>
```

For example, N4 is:

```bash
npm run deck:words:platinum:n4
```

For a future word level without an npm alias, use the script directly after that level's Platinum manifest exists:

```bash
node scripts/reviewPlatinumWordLevel.js --level=<level> --require-all
```

Then re-check Obsidian progress and the next queue:

```bash
npm run deck:words:obsidian:rereview-status -- --levels=<level>
npm run deck:words:platinum:batch -- --level=<level> --limit=8
```

8. Commit only the completed batch.

Commit the canonical ledger changes and the exact verification notes together. Do not mix source-contract generation, Obsidian proof, APKG/media QA, unrelated cleanup, draft input files, or generated ignored artifacts into the same commit.

9. Run certification only when the selected level is expected to be fully Obsidian.

```bash
npm run deck:words:obsidian:certify-status -- --levels=<level>
```

If this fails during an in-progress level, treat the failure as the remaining queue. Do not weaken the gate.

## Proof Ledger ETL And Consumer Switch

Canonical Obsidian proof is tracked JSONL under `templates/obsidian_proof_ledger/*.jsonl`. Migrated kanji proof levels (N5/N4/N3/N2) and migrated word proof levels (N5/N4) no longer carry inline `rereviewProvenance` objects in tracked review-set JSON; switched consumers read those proofs through the scoped proof-provider path. The generated compatibility view under `out/obsidian-proof/compatibility/` can recreate compatibility-shaped review-set JSON for older tooling; the SQLite database under `out/obsidian-proof/sqlite/` is a local query mirror only.

Keep these lanes separate:

- Canonical proof ledger: `templates/obsidian_proof_ledger/*.jsonl`.
- Tracked review-set binding source: `templates/platinum_n<level>_review_set.json` and `templates/platinum_n<level>_word_review_set.json`.
- Ignored/local proof-event draft input: `out/obsidian-proof/drafts/*.jsonl`; this is an input staging aid only and must not be staged as source truth.
- Generated compatibility view: `out/obsidian-proof/compatibility/templates/platinum_n<level>_review_set.json` and `out/obsidian-proof/compatibility/templates/platinum_n<level>_word_review_set.json`.
- Generated local query mirror: `out/obsidian-proof/sqlite/obsidian-proof-ledger.sqlite`.

Required parity gates before any consumer switch:

```bash
git status --short --untracked-files=all
npm run data:obsidian:proof:validate
npm run data:obsidian:proof:reconcile -- --levels=5,4,3,2
npm run data:obsidian:proof:reconcile -- --deck-kind=word --levels=5,4
npm run data:obsidian:proof:provider-parity -- --levels=5,4,3,2 --row-source=tracked-review-set
npm run data:obsidian:proof:provider-parity -- --consumer=kanji-batch-report --levels=5,4,3,2 --queue=substantive-rereview --limit=8 --row-source=tracked-review-set
npm run data:obsidian:proof:provider-parity -- --consumer=kanji-platinum-level --levels=5,4,3,2 --row-source=tracked-review-set
npm run data:obsidian:proof:provider-parity -- --consumer=kanji-field-source-contract --levels=5,4,3,2 --row-source=tracked-review-set
npm run data:obsidian:proof:provider-parity -- --consumer=platinum-governance-gate --levels=5,4,3,2 --row-source=tracked-review-set
npm run data:obsidian:proof:provider-parity -- --levels=5,4,3,2 --row-source=generated
npm run data:obsidian:proof:provider-parity -- --consumer=kanji-batch-report --levels=5,4,3,2 --queue=substantive-rereview --limit=8 --row-source=generated
npm run data:obsidian:proof:provider-parity -- --consumer=kanji-platinum-level --levels=5,4,3,2 --row-source=generated
npm run data:obsidian:proof:provider-parity -- --consumer=word-rereview-status --deck-kind=word --levels=5,4 --row-source=tracked-review-set
npm run data:obsidian:proof:provider-parity -- --consumer=word-rereview-status --deck-kind=word --levels=5,4 --row-source=generated
npm run data:obsidian:proof:views
npm run data:obsidian:proof:sqlite
npm run data:obsidian:proof:sqlite:query -- --deck-kind=kanji --level=3 --limit=5
node --test test/obsidianProofLedger.test.js test/obsidianProofReconciliation.test.js test/obsidianProofCompatibilityView.test.js test/obsidianProofSqliteMirror.test.js test/obsidianProofProviderService.test.js test/obsidianProofProviderParity.test.js
```

`--row-source=tracked-review-set` is the clean-CI path: it uses tracked review-set card-identity proxies so proof-provider parity never depends on ignored local `data/*` inputs. `--row-source=generated` is the local live-row path for release workstations that have the real generated-row inputs; it verifies the same provider switch against the actual deck row surface.

No-go conditions:

- Reconciliation is not exact: inline-only, ledger-only, mismatch, or duplicate-inline counts are non-zero, or canonical ledger proofs do not bind to tracked review-set entries.
- Provider integrity is not exact: inline source and ledger-derived proof must produce identical consumer-specific counts during dual-read transition; after inline removal, every scoped ledger event must apply cleanly to a tracked review-set entry.
- The compatibility view fails to recreate ledger-derived `rereviewProvenance` for a migrated proof event.
- The SQLite mirror cannot rebuild from JSONL without reading generated TSV/APKG output.
- Any consumer switch changes `deck:kanji:obsidian:rereview-status -- --levels=5,4,3,2` counts without a matching proof-ledger change, or changes the completed N5/N4/N3/N2 certification pass posture without matching proof.
- Any word consumer switch changes `deck:words:obsidian:rereview-status -- --levels=5,4` counts without a matching proof-ledger change, or changes the `987/987` Obsidian, `0` needs, `0` blocked N5/N4 word status.
- `deck:kanji:obsidian:certify-status -- --levels=5,4,3,2` fails for any selected row.

Switch consumers in small stages:

1. Inventory consumers that read inline `rereviewProvenance`: start with `src/services/platinumKanjiRereviewStatusService.js`, `src/services/obsidianKanjiCertificationStatusService.js`, `src/services/platinumKanjiBatchReportService.js`, and `src/services/kanjiCardFieldSourceContractService.js`.
2. Add a proof-provider abstraction that can load canonical JSONL and return compatibility-shaped `rereviewProvenance` without changing status behavior.
3. Run provider integrity tests for the switched consumer: dual-read parity while inline proof exists, then canonical-ledger integrity after inline proof removal.
4. Switch one consumer at a time. Commit each consumer switch with its focused tests and the parity gates above.
5. Only after all consumers for that deck kind are ledger-fed, remove inline proof from tracked review-set source or make it generated-only. That removal must be its own commit and must keep the generated compatibility view available for older tooling until all callers are migrated.

Current transition state:

- `deck:kanji:obsidian:rereview-status`, `deck:kanji:obsidian:certify-status`, `deck:platinum:rereview-status`, `deck:platinum:batch`, `deck:platinum:n<level>`, `data:build:kanji-field-source-contract`, and `deck:platinum:governance-gate` are switched kanji consumers. They use the scoped proof-provider path so N5/N4/N3/N2 kanji proof comes from canonical JSONL. N1 currently has no trusted scoped canonical ledger, `232/1230` trusted current-standard Platinum entries, and `998` remaining actual card-data Platinum gaps; fresh N1 Obsidian proof must only be recorded after real card-level Platinum review creates trusted current-standard entries. `deck:platinum:governance-gate` still requires a local-data workspace for the real generated-row gate itself; its clean-CI provider integrity is a tracked-row kanji proof-provider projection, not a replacement for local release QA. N2 Obsidian proof is complete at the full generated denominator; N1 kanji proof must not be claimed as complete Obsidian certification until the generated denominator is fully covered and gates pass.

- `deck:words:obsidian:rereview-status`, `deck:words:obsidian:certify-status`, their older Platinum compatibility aliases, `deck:words:platinum:batch`, `deck:words:platinum:n<level>`, and `deck:platinum:governance-gate` word inputs are the switched word consumers. For migrated N5/N4 word proof they default to `ledger-if-available` and can be audited with `--proof-provider=ledger` or `--proof-provider=ledger-if-available`. `--proof-provider=inline` is now only a negative-control legacy audit for those migrated word levels because tracked inline proof has been removed.

Do not treat the word proof-ledger migration as new Obsidian review. It is a representation migration for already-certified N5/N4 word proof. Word proof has separate exact written-reading identity binding, evidence checklist, and release-quality sentence review requirements.

For future or unmigrated word Obsidian lanes, including N3/N2/N1 word, do not add inline `rereviewProvenance` first and migrate it later. New substantive word Obsidian proof should be created directly as canonical JSONL ledger events during the real card-level review, after the live generated word card, tracked review entry, source evidence, media identity, pitch evidence, limitations, and release-quality sentence review have been inspected. Reconciliation must then bind those new ledger events back to the tracked review-set identities before any consumer status or certification claim is trusted.

## What Not To Claim

- A clean NLP packet is not Obsidian.
- A passing NLP gate is not Obsidian.
- A generated TSV is not Obsidian.
- A Gold regression pass is not Obsidian.
- A Platinum card-quality pass is not Obsidian.
- A tracked reading-reference match is not full card-field verification.
- A tracked-source TSV gate is not APKG, media, accessibility, listening, or manual import QA.
