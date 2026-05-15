# JLPT Kanji Source Evidence Batching

This workflow applies only to the JLPT kanji source-evidence layer. It does not move kanji, move words, update deck content, change Gold regression or Platinum coverage, or alter readiness.

## Research Basis

The batching policy is intentionally conservative:

- Google Engineering Practices recommends small, self-contained changes with related tests, and separate reviewable steps for large work: https://google.github.io/eng-practices/review/developer/small-cls.html
- DORA recommends small batches plus fast automated tests for continuous integration: https://dora.dev/capabilities/continuous-integration/
- Microsoft Fabric ALM guidance emphasizes source control, test-before-promotion, descriptive commits, and avoiding excessive noisy commits: https://learn.microsoft.com/en-us/fabric/data-science/data-agent-source-control
- Apple TestFlight and App Store Connect workflows separate test guidance, feedback, metadata, and release notes from final release submission: https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/ and https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

For this repository, that means manual source review stays small, source-input integrity is automated, source evidence is imported only after explicit gates pass, and release/product readiness remains separate.

The tracked evidence manifest keeps reviewer evidence in routed per-source assignment files that load as source-centric assignment rows. Assignment files may use local `evidenceRecords` to deduplicate repeated `citation`, `evidenceRef`, and reviewer `notes`, but worksheets and normalized loader output still expose normal per-kanji assignment rows. The derived `kanji` rollup should not duplicate reviewer evidence fields; regenerate it through `data:import:jlpt:source-input -- --full-rematerialize` only when materialization logic or source policy changes intentionally.

## Priority Order

Use source-review priorities in this order unless a tracked issue says otherwise:

| Priority | Use when | Command flag |
| --- | --- | --- |
| Source review worklist | Default all-level batch queue: disputed consensus, missing evidence, missing Japanese-published evidence, contract/consensus mismatches, independence gaps, then weak evidence. | `--priority=source-review-worklist` |
| Source gaps | You need a broad evidence-depth scan in operational contract order. | `--priority=source-gaps` |
| Source level deltas | You are intentionally investigating active source-claimed candidates for one source level. | `--priority=source-level-deltas --source-level=<N1-N5>` |

Keep the human review batch at `--limit=10` unless you have a specific source-access session where a larger ignored worksheet is easier to manage. Broad `source-review-worklist` batches from `11` to `99` rows require `--source-access-note="<exact source surface reviewed>"`. Broad `source-review-worklist` batches with no limit or `100+` rows require a source-access packet before generation. Merge also requires that packet when the batch contains `100+` importable `reviewed` rows. Larger manual decisions should still be reviewed in small passes, but commits are reserved for real milestones.

## Before Choosing A Lane

Run the source-access audit before generating another manual textbook batch:

```bash
npm run data:audit:jlpt:source-access
```

Use this report to decide whether reviewer time should stay on the current lane or move to another governed source. If an active lane is producing mostly `source_access_gap` rows, pause broad review until fuller exact assignment access exists. If a planned or in-review Japanese-published kanji-review lane is ranked first, do a source-access spike there before creating importable rows.

The source-access audit is read-only. It ranks source lanes from tracked source-use policy, tracked source-input config, local worksheet state, tracked assignments, and the all-level source-review worklist. It does not import evidence, move kanji, move words, update decks, or change readiness.

Use dedicated kanji sources before grammar or vocabulary-adjacent sources. TRY! is blocked from assignment-consensus batching under current source access: the 2026-05-08 source-access spike found official public TRY materials expose grammar/can-do and vocabulary surfaces, not exact per-kanji assignment proof. `ask_hajimete_jlpt_kanji` is an active ASK kanji-book lane with source-input `supportedLevels` set to N1, N2, N3, and separately verified N5 checklist rows; target-entry, checklist, or index rows must explicitly show kanji assignment proof, and N4 remains unsupported until exact source access is verified.

Before creating a `100+` row source-review worksheet, write an ignored source-access packet for the exact surface that makes the rows reviewable:

```bash
npm run data:packet:jlpt:source-access -- --source=<source-id> --surface-type=<exact-kanji-table|official-correction-list-target-row|exact-assignment-page|target-entry-page> --title="<surface title>" --citation="<source citation>" --evidence-ref="<source URL or local source reference>" --notes="<why this surface proves exact source-level assignment>" --out=downloads/source-access-packets/<source-id>-<surface>.json
```

This packet is not evidence and is not imported. It records the source-access proof for the batch session. Use only exact kanji tables, official correction-list target rows, exact assignment pages, or target-entry pages. Do not use appearance-only, vocabulary-only, adjacent schedule, review table, grammar, or can-do surfaces as assignment proof.

## Per Review Pass

Generate or refresh one reusable ignored batch file for the lane selected by `data:audit:jlpt:source-access`:

```bash
npm run data:template:jlpt:textbook-source -- --source=<source-id> --priority=source-review-worklist --limit=10 --out=<ignored-batch.tsv>
```

For a larger source-access session, name the exact surface in the command:

```bash
npm run data:template:jlpt:textbook-source -- --source=<source-id> --priority=source-review-worklist --limit=50 --source-access-note="<exact source surface reviewed>" --out=<ignored-batch.tsv>
```

For `100+` rows, pass the source-access packet instead:

```bash
npm run data:template:jlpt:textbook-source -- --source=<source-id> --priority=source-review-worklist --limit=100 --source-access-packet=downloads/source-access-packets/<source-id>-<surface>.json --out=<ignored-batch.tsv>
```

Review only the permitted manual fields in the batch:

- `level`
- `reviewStatus`
- `citation`
- `evidenceRef`
- `notes`

Do not copy textbook lists, passages, prompts, questions, answers, or source excerpts into the TSV. Do not include deck previews or Gold/Platinum decisions in the source batch.

Dry-run the merge:

```bash
npm run data:merge:jlpt:source-batch -- --source=<source-id> --batch=<ignored-batch.tsv>
```

For batch files with `100+` importable `reviewed` rows, pass the same source-access packet to the dry-run and write commands:

```bash
npm run data:merge:jlpt:source-batch -- --source=<source-id> --batch=<ignored-batch.tsv> --source-access-packet=downloads/source-access-packets/<source-id>-<surface>.json
```

If the dry-run is clean, merge into the ignored full worksheet:

```bash
npm run data:merge:jlpt:source-batch -- --source=<source-id> --batch=<ignored-batch.tsv> --write
```

For batch files with `100+` importable `reviewed` rows, keep the same `--source-access-packet=...` on the write command.

For sparse source worksheets that intentionally contain only resolved rows, use `--allow-additions` after the dry-run confirms the added row count:

```bash
npm run data:merge:jlpt:source-batch -- --source=<source-id> --batch=<ignored-batch.tsv> --allow-additions --write
```

If a previously reviewed row no longer meets current source-access policy, correct it through the merge tool instead of manually bypassing the downgrade guard. The correction batch should preserve the inspected citation/evidenceRef, set `reviewStatus` to `source_access_gap` when permitted material was checked but does not prove exact assignment, or `blocked` for a source-use/worksheet defect, and carry notes explaining the correction. Use a reason on both dry-run and write:

```bash
npm run data:merge:jlpt:source-batch -- --source=<source-id> --batch=<ignored-correction-batch.tsv> --allow-reviewed-downgrade --reviewed-downgrade-reason="<why reviewed evidence is being corrected>"
```

The downgrade option is only for deliberate corrections from `reviewed` to non-voting resolved statuses. It does not make weak surfaces importable, and it must not be used to return checked evidence to vague pending work.

At this point, do not import yet by habit. The full ignored worksheet has changed, so strict source-input preflight is expected to fail until the tracked integrity pin is intentionally updated.

## Per Milestone

A milestone is not every small review pass. It is usually 5 to 10 reviewed passes, exhaustion of an exact source surface, or a smaller separately valuable evidence correction that should be promoted into the tracked evidence manifest. At milestone time, pin the ignored worksheet, preflight it, import it, then run tests.

Preview the new integrity pins:

```bash
npm run data:pin:jlpt:source-input -- --source=<source-id> --reason="<review milestone reason>"
```

Write the pin only when the preview shows the expected SHA-256, byte size, and row count changes:

```bash
npm run data:pin:jlpt:source-input -- --source=<source-id> --reason="<review milestone reason>" --write
```

Run strict source-input preflight:

```bash
npm run data:audit:jlpt:source-inputs -- --source=<source-id> --strict
```

Dry-run and then write the source-evidence import:

```bash
npm run data:import:jlpt:source-input -- --source=<source-id>
npm run data:import:jlpt:source-input -- --source=<source-id> --write
```

Read the dry-run's `Materialized consensus/confidence shifts` before `--write`. The shift list shows changed `consensusLevel`, `confidence`, and `agreementScore` values for the kanji touched by the import; use `--json` when a large milestone needs a machine-readable review packet.

Run the source-evidence fast feedback scope:

```bash
npm test -- --scope=source-evidence
```

Run the read-only cost report before choosing any source-evidence performance refactor:

```bash
npm run data:benchmark:jlpt:sources -- --source=<source-id> --repeat=2 --limit=10
```

The report includes observed Node process memory snapshots for manifest loading, preflight, import dry-run, serialization, and audit, plus parent-manifest and assignment-file storage totals. Treat memory deltas as trend signals, not exact allocation counts; use them to justify assignment-file storage changes or cache work before changing the source-evidence architecture again.

Then run the full commit gate:

```bash
npm run data:audit:jlpt:sources -- --governance-strict --limit=25
npm run data:audit:jlpt:source-levels -- --worklist-only --limit=15
npm run data:audit:jlpt:official-occurrences -- --strict
npm run lint
npm test
```

Commit the tracked pin, tracked evidence manifest, docs, and tests together only at a real review milestone or for a separate tracked-file fix. Do not commit every small review pass. Do not commit ignored worksheets, generated APKGs, generated TSVs, media caches, downloaded source files, or private source material.

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
