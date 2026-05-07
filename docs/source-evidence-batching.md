# JLPT Kanji Source Evidence Batching

This workflow applies only to the JLPT kanji source-evidence layer. It does not move kanji, move words, update deck content, change golden or platinum review, or alter readiness.

## Research Basis

The batching policy is intentionally conservative:

- Google Engineering Practices recommends small, self-contained changes with related tests, and separate reviewable steps for large work: https://google.github.io/eng-practices/review/developer/small-cls.html
- DORA recommends small batches plus fast automated tests for continuous integration: https://dora.dev/capabilities/continuous-integration/
- Microsoft Fabric ALM guidance emphasizes source control, test-before-promotion, descriptive commits, and avoiding excessive noisy commits: https://learn.microsoft.com/en-us/fabric/data-science/data-agent-source-control
- Apple TestFlight and App Store Connect workflows separate test guidance, feedback, metadata, and release notes from final release submission: https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/ and https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

For this repository, that means manual source review stays small, source-input integrity is automated, source evidence is imported only after explicit gates pass, and release/product readiness remains separate.

The tracked evidence manifest keeps reviewer evidence in source-centric assignment rows. The derived `kanji` rollup should not duplicate `citation`, `evidenceRef`, or reviewer `notes`; regenerate it through `data:import:jlpt:source-input -- --full-rematerialize` only when materialization logic or source policy changes intentionally.

## Priority Order

Use source-review priorities in this order unless a tracked issue says otherwise:

| Priority | Use when | Command flag |
| --- | --- | --- |
| Source review worklist | Default all-level batch queue: disputed consensus, missing evidence, missing Japanese-published evidence, contract/consensus mismatches, independence gaps, then weak evidence. | `--priority=source-review-worklist` |
| Source gaps | You need a broad evidence-depth scan in operational contract order. | `--priority=source-gaps` |
| Source level deltas | You are intentionally investigating active source-claimed candidates for one source level. | `--priority=source-level-deltas --source-level=<N1-N5>` |

Keep the human review batch at `--limit=10` unless you have a specific source-access session where a larger ignored worksheet is easier to manage. Larger generation is fine; larger manual decisions should still be reviewed in 10-row passes.

## Per 10-Row Review Pass

Generate or refresh one reusable ignored batch file:

```bash
npm run data:template:jlpt:textbook-source -- --source=shin_kanzen_master_kanji --priority=source-review-worklist --limit=10 --out=downloads/shin-kanzen-master-kanji-evidence-working-batch.tsv
```

Review only the permitted manual fields in the batch:

- `level`
- `reviewStatus`
- `citation`
- `evidenceRef`
- `notes`

Do not copy textbook lists, passages, prompts, questions, answers, or source excerpts into the TSV. Do not include deck previews or golden/platinum decisions in the source batch.

Dry-run the merge:

```bash
npm run data:merge:jlpt:source-batch -- --source=shin_kanzen_master_kanji --batch=downloads/shin-kanzen-master-kanji-evidence-working-batch.tsv
```

If the dry-run is clean, merge into the ignored full worksheet:

```bash
npm run data:merge:jlpt:source-batch -- --source=shin_kanzen_master_kanji --batch=downloads/shin-kanzen-master-kanji-evidence-working-batch.tsv --write
```

At this point, do not import yet by habit. The full ignored worksheet has changed, so strict source-input preflight is expected to fail until the tracked integrity pin is intentionally updated.

## Per Milestone

A milestone is usually 5 to 10 reviewed passes, or any smaller set that you want to promote into the tracked evidence manifest. At milestone time, pin the ignored worksheet, preflight it, import it, then run tests.

Preview the new integrity pins:

```bash
npm run data:pin:jlpt:source-input -- --source=shin_kanzen_master_kanji --reason="merged reviewed Shin Kanzen source batch"
```

Write the pin only when the preview shows the expected SHA-256, byte size, and row count changes:

```bash
npm run data:pin:jlpt:source-input -- --source=shin_kanzen_master_kanji --reason="merged reviewed Shin Kanzen source batch" --write
```

Run strict source-input preflight:

```bash
npm run data:audit:jlpt:source-inputs -- --source=shin_kanzen_master_kanji --strict
```

Dry-run and then write the source-evidence import:

```bash
npm run data:import:jlpt:source-input -- --source=shin_kanzen_master_kanji
npm run data:import:jlpt:source-input -- --source=shin_kanzen_master_kanji --write
```

Run the source-evidence fast feedback scope:

```bash
npm test -- --scope=source-evidence
```

Run the read-only cost report before choosing any source-evidence performance refactor:

```bash
npm run data:benchmark:jlpt:sources -- --source=shin_kanzen_master_kanji --repeat=2 --limit=10
```

Then run the full commit gate:

```bash
npm run data:audit:jlpt:sources -- --governance-strict --limit=25
npm run data:audit:jlpt:source-levels -- --worklist-only --limit=15
npm run data:audit:jlpt:official-occurrences -- --strict
npm run lint
npm test
```

Commit the tracked pin, tracked evidence manifest, docs, and tests together. Do not commit ignored worksheets, generated APKGs, generated TSVs, media caches, downloaded source files, or private source material.

## Before Product Release

Source-evidence milestones are not product release approval. Before any release claim, run the applicable product gates:

```bash
npm run deck:ready
npm run deck:words:ready
npm run deck:review:n5
npm run deck:words:review:n5
npm run deck:platinum:n5
npm run deck:words:platinum:n5
npm run release:gate
```

Use the level-specific N4, N3, N2, or N1 commands when that level is the release surface. Kanji deck readiness and word deck readiness remain separate products and must be reported separately.
