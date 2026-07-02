# Word Obsidian v2.5 Workflow

This is the governing workflow for word Obsidian proof under
`word-obsidian-v2.5-sentence-audio`.

Obsidian v2.5 is the current word Obsidian standard. Older word Obsidian proof is
legacy history: useful for audit continuity, but not current certification. A
word card counts as current Obsidian only after the exact generated word-reading
card has passed real card-surface rereview, exact example-sentence audio review,
and governed JSONL proof-ledger append.

## Authority

- Canonical proof storage is tracked JSONL under
  `templates/obsidian_proof_ledger/word_n<level>.jsonl`.
- JSONL is the NoSQL proof ledger. SQLite mirrors and compatibility views are
  generated query support only.
- Obsidian proof is substantive card-quality evidence. It is not Platinum,
  Sapphire, Gold, release readiness, migration theater, or a structural stamp.
- The generated active word rows are the denominator. Do not silently shrink the
  denominator to make a status pass.
- The active reviewer owns the natural-language and learner-quality judgment.
  Do not record a generic "human review" label or automation-only approval.

## Non-Negotiable Stop Rules

- Do not generate example-sentence audio before verifying the sentence is good,
  natural, useful, level-appropriate, and correctly translated.
- Do not append proof for a weak, misleading, stale, product-bad, or
  level-inappropriate card.
- Do not treat old word Obsidian proof, Platinum proof, NLP output, generated
  examples, or passing structure as current Obsidian v2.5 proof.
- Do not force a pass. If a row is bad, fix the governed upstream surface,
  remove it, or defer/block it through the documented lane path, then rerun the
  gates.
- Do not create proof from a batch report alone. Review each live card surface
  one at a time.

## Batch Selection

1. Run live status for the requested word level:

   ```bash
   npm run deck:words:obsidian:rereview-status -- --levels=<level> --json
   npm run deck:words:obsidian:certify-status -- --levels=<level> --json
   ```

2. Select only rows in `needs_substantive_rereview` unless an explicit blocker
   fix is the task.
3. If no batch selector exists, derive the next identities from the status JSON
   gap output and record that derivation in the work summary.
4. Use batches of 10 candidates unless fewer remain or the user gives a stricter
   batch size.
5. Recompute the queue before every batch. Do not reuse stale candidate lists.

## One-Card Review Checklist

For each selected `word|reading` identity, inspect the live generated card and
the tracked review/source/media evidence from square zero:

- written form and exact reading
- meaning and sense fit
- example sentence
- example reading
- example translation
- notes, support labels, and learner-facing surface
- word audio identity
- pitch source and rendered pitch value
- constituent kanji breakdown and support labels
- coverage role and level/product fit
- Gold binding
- Sapphire binding
- Platinum binding
- Japanese-source evidence and source limitations
- media provenance
- natural Japanese quality
- learner usefulness
- risk flags and verification limitations

The example must be something a learner should actually study. A technically
parseable sentence is not enough.

## Fix Before Audio

If the example sentence, reading, translation, label, meaning, or card surface is
weak:

1. Edit the governed upstream files for the exact problem.
2. Keep lower-lane manifests consistent with the corrected surface.
3. Rerun the affected Gold, Sapphire, and Platinum gates.
4. Only continue to example-sentence audio after the card surface is genuinely
   good.

Example-sentence audio is generated for the reviewed sentence, not used to make a
weak sentence acceptable.

## Example-Sentence Audio

After the sentence passes card-quality review:

1. Generate exact example-sentence audio for the selected identities.
2. Sync it into the managed media surface.
3. Review it with the word example-audio review command.
4. Confirm the audio category is `word-example-sentence`, the source and voice
   are policy-compliant, and the asset is bound to the exact word identity,
   example text, and example reading.
5. Confirm shared example text does not bleed audio across different word
   identities.

The proof event must include structured `sentenceAudioReview` with category,
source, voice, locale, asset path, identity hash, example text, example reading,
translation, exact-text/exact-reading flags, policy compliance, ready-to-review,
and reviewer judgment.

## Proof Draft And Append

Create complete draft events under `out/obsidian-proof/drafts/`.

Every word Obsidian v2.5 proof event must include:

- `obsidianStandardVersion: "word-obsidian-v2.5-sentence-audio"`
- `mechanicalMigration: false`
- `reviewedAfterStandard: true`
- exact `target.cardReviewed` and `proof.cardReviewed` as `written|reading`
- full `evidenceChecked`
- structured `sentenceQualityReview`
- structured `sentenceAudioReview`
- `reviewSession.mode: "card-by-card-observable-rereview"`
- reviewer judgment that explains why the actual card is acceptable

Dry-run first:

```bash
npm run data:obsidian:proof:append -- --events=<draft-path>
```

Only after reviewing the draft and dry-run output, append:

```bash
npm run data:obsidian:proof:append -- --events=<draft-path> --write
```

## Batch Verification

After each batch, run the full focused verification set before selecting another
batch:

```bash
npm run deck:words:completion:n<level>
npm run deck:words:review:n<level>
npm run deck:words:sapphire:n<level>
npm run deck:words:platinum:n<level>
npm run deck:words:obsidian:rereview-status -- --levels=<level> --json
npm run deck:words:obsidian:certify-status -- --levels=<level> --json
npm run data:obsidian:proof:validate
npm run data:obsidian:proof:reconcile -- --deck-kind=word --levels=<level>
npm run data:obsidian:proof:provider-parity -- --deck-kind=word --levels=<level>
npm run data:audit:audio -- --json
git diff --check
```

`certify-status` is expected to fail while real backlog remains. It is a blocker
only when it reports unexpected `blocked_or_failing` rows or fails for reasons
other than visible remaining backlog.

## Commit-Cycle Verification

After the agreed number of one-at-a-time batches, or when backlog reaches zero,
run the full commit cycle requested for that work. At minimum, include:

```bash
npm run docs:status-audit
npm run deck:words:completion:n<level>
npm run deck:words:review:n<level>
npm run deck:words:sapphire:n<level>
npm run deck:words:platinum:n<level>
npm run deck:words:obsidian:rereview-status -- --levels=<level> --json
npm run deck:words:obsidian:certify-status -- --levels=<level> --json
npm run data:obsidian:proof:validate
npm run data:obsidian:proof:reconcile -- --deck-kind=word --levels=<level>
npm run data:obsidian:proof:provider-parity -- --deck-kind=word --levels=<level>
npm run lint
npm run typecheck
npm test
npm run supply-chain:audit
npm run security:advisories
npm run ci:smoke
npm run release:gate
git diff --check
```

Do not claim release readiness from Obsidian proof. Release readiness requires
the release QA path and scoped release evidence.

## Required Summary

Every Obsidian v2.5 handoff must report:

- starting and final git state
- exact generated denominator
- Gold, Sapphire, Platinum, current Obsidian v2.5, needs-Obsidian, and blocked
  counts
- exact candidates reviewed in each batch
- card-surface fixes, deferrals, removals, and blockers with reasons
- exact example-sentence audio assets added or rejected
- proof events appended, grouped by batch
- every verification command and result
- whether any failures are expected backlog or real blockers
- whether local main equals origin/main, if protected-main hygiene was in scope
- verified recommended next step from live commands
