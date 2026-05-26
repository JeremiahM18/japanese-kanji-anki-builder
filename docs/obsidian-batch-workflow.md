# Obsidian Batch Workflow

Use this runbook for every Obsidian pass. Do not wait until a level is complete before running these commands. The status and batch commands are the work queue.

Obsidian is human rereview proof. Automation can prepare packets, reject bad structure, and verify that proof is present and card-bound. Automation does not perform the human review.

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

The default queue is `substantive-rereview`. It includes structurally valid Platinum entries until explicit non-mechanical Obsidian proof exists. Use `--queue=missing-current-standard` only when the task is structural Platinum coverage, not Obsidian proof.

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

The manifest entry must carry structured `rereviewProvenance` plus actual card-bound example-sentence quality evidence. Do not record proof from `revalidatedAt`, lane-valid text, NLP output, generated TSVs, Gold fixtures, or a clean batch report alone.

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

For N3/N2/N1, the all-level source preflight is expected to fail closed until those governed field-source contracts exist:

```bash
npm run product:artifacts:kanji:preflight
```

9. Re-check Obsidian progress and the next queue.

```bash
npm run deck:kanji:obsidian:rereview-status -- --levels=<level>
npm run deck:platinum:batch -- --level=<level> --limit=12
```

10. Commit only the completed batch.

Commit the manifest changes and the exact verification notes together. Do not mix source-contract generation, Obsidian proof, APKG/media QA, unrelated cleanup, or generated ignored artifacts into the same commit.

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

The default queue is `substantive-rereview`. Use `--queue=missing-current-standard` only when the task is structural Platinum coverage, not Obsidian proof.

3. Generate or refresh the word deck surface.

```bash
npm run deck:words:ready -- --levels=<level>
```

This refreshes the live generated word rows used by the reviewer. It is not Obsidian proof.

4. Run the word NLP support lane.

```bash
npm run deck:words:expansion-support -- --levels=<level>
```

Word NLP can run tokenization, embeddings, example reranking, sense-fit warnings, reading-gap candidate discovery, review packets, draft proposals, artifact validation, and `nlp:governance-gate`. It cannot certify Obsidian proof, approve source truth, or write tracked templates.

5. Review each queued word card manually.

The reviewer checks the live generated row, exact written-reading identity, source evidence, word audio, pitch evidence/rendering, reading breakdown, support labels, example naturalness, learner usefulness, level fit, release quality, reading, translation, and any NLP signals.

If NLP or the batch rubric exposes a real issue, fix tracked source/card data first. Then regenerate, rerun the affected gates, rerun NLP if its support artifact changed, and only then continue.

6. Record Obsidian proof only after the review happened.

Word proof must bind exact written+reading identity, structured `rereviewProvenance`, the full word-card `evidenceChecked` checklist, and actual example-sentence quality evidence.

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

Commit the manifest changes and the exact verification notes together. Do not mix source-contract generation, Obsidian proof, APKG/media QA, unrelated cleanup, or generated ignored artifacts into the same commit.

9. Run certification only when the selected level is expected to be fully Obsidian.

```bash
npm run deck:words:obsidian:certify-status -- --levels=<level>
```

If this fails during an in-progress level, treat the failure as the remaining queue. Do not weaken the gate.

## What Not To Claim

- A clean NLP packet is not Obsidian.
- A passing NLP gate is not Obsidian.
- A generated TSV is not Obsidian.
- A Gold regression pass is not Obsidian.
- A Platinum structural pass is not Obsidian.
- A tracked reading-reference match is not full card-field verification.
- A tracked-source TSV gate is not APKG, media, accessibility, listening, or manual import QA.
