# Workflows

This document collects the common local workflows for setup, preview, build, media, word expansion, and output review.

The commands here are operational tools. They do not replace candidate triage boundaries, Gold regression, native Sapphire structural gates, Platinum, Obsidian proof, Deck Ready boundaries, release QA, or manual Anki import review. For lane authority, use [review-system-forward-contract.md](review-system-forward-contract.md), then [review-tier-governance.md](review-tier-governance.md). For the exact Obsidian pass checklist, use [obsidian-batch-workflow.md](obsidian-batch-workflow.md).

## Setup

```bash
npm run doctor
npm run voicevox:status
npm run voicevox:start
npm run doctor:voicevox
npm run voicevox:stop
npm run deck:readiness
```

- `doctor` checks datasets, local files, media folders, managed media, tooling, and next steps.
- `voicevox:status`, `voicevox:start`, and `voicevox:stop` manage the local Docker container named `voicevox-nemo`.
- `voicevox:start:fresh` recreates the container with `-p 127.0.0.1:50021:50121`, `no-new-privileges`, `cap-drop ALL`, only `SETUID`/`SETGID` restored for `gosu`, `--restart no`, Docker `--init`, and bounded memory, CPU, and process counts when an old local container exists without the required governed shape.
- `doctor:voicevox` verifies the local VOICEVOX Nemo engine and pinned release speaker.
- `deck:readiness` reports per-level deck readiness.

## Bootstrap local data

```bash
npm run corpus:init
npm run curated:init
npm run words:init
npm run media:init
```

Useful variants:

```bash
npm run corpus:init -- --merge
npm run curated:init -- --merge
npm run curated:init -- --refresh-starter
npm run words:init -- --merge
npm run words:init -- --refresh-starter
```

Tracked starter files are the baseline. Local ignored files may add workspace overrides. Runtime loaders refresh stale starter-derived local rows in memory before builds and audits.

## Preview and review

```bash
npm run deck:preview -- --level=5 --limit=5
npm run deck:preview -- --kanji=日,本,学
npm run deck:sapphire:batch -- --level=5 --limit=12
npm run deck:sapphire:batch -- --level=5 --kanji=父,生,男
npm run deck:sapphire:promote -- --level=5 --input=<reviewed-json>
npm run deck:words:sapphire:batch -- --level=5 --limit=8
npm run deck:words:sapphire:batch -- --level=5 --words=今日:きょう,八日:ようか
npm run deck:words:sapphire:promote -- --level=5 --input=<reviewed-json>
npm run deck:words:gold:scaffold -- --level=3 --limit=8
npm run deck:words:level-anchor-audit -- --level=5
npm run deck:review:n5
npm run deck:review:n4
npm run deck:review:n3
npm run deck:review:n2
npm run deck:review:n1
npm run deck:kanji:review-status
npm run deck:review:coverage
npm run deck:review:coverage -- --level=1
npm run deck:sapphire:n5
npm run deck:words:review:n5
npm run deck:words:review:n4
npm run deck:words:review:n3
npm run deck:words:review:n2
npm run deck:words:review:n1
npm run deck:words:sapphire:n5
```

Trust terms: candidate/discovery means proposed pre-Silver intake work, not a certification lane. Certification lanes are Silver for generated surface, Gold for regression protection, Sapphire for current-standard structural certification, Platinum for current-standard card-surface inspection, and Obsidian for explicit non-mechanical current-version rereview proof. Deck Ready is mechanical artifact readiness only, not a trust tier.

Use `npm run deck:ops -- --deck=<word|kanji> --lane=<selector> --level=<level>` when choosing the next safe local action. The `--lane` flag is the legacy selector name. Certification-lane selectors are silver, gold, sapphire, platinum, and obsidian. Discovery/intake plus support selectors such as nlp, source, media, release, and ops are work areas, not certification lanes; discovery is not required before every batch. The command is read-only and reports git/change-risk posture, visible lower-lane backlog from closeout counts, exact next legal commands, focused verification, full merge gates, safe parallelism, serial write roots, architecture prerequisites, and fail-closed rules. It does not run lane gates, write proof/source/templates, certify cards, shrink denominators, or hide expected backlog. `npm run deck:lane-status` is an alias for the same command.

Use `npm run verify:focused -- --deck=<word|kanji> --lane=<selector> --level=<level>` before an inner-loop check set. It is read-only and prints exact focused commands, mapped focused tests, changed-file-specific verification, and the full merge gate that still has to run before commit, merge, or release claims. Discovery/intake and support selectors are work areas, not certification lanes. It does not run the commands, certify cards, replace Silver/Gold/Sapphire/Platinum/Obsidian gates, write proof/source/templates, shrink denominators, or hide expected backlog.

Use `npm run deck:work-packet -- --deck=<word|kanji> --lane=<lane> --level=<level> --batch-report=<batch-json> --run-id=<id> --write` only after a read-only batch report has been emitted as JSON. The packet records selected identities, queue before/after counts, optional decision records from `--decisions=<json-or-jsonl>`, optional verification classifications from `--verification-results=<json-or-jsonl>`, exact expected verification commands, and fail-closed rules under `out/lane-work-packets/<id>/`. It is generated operational evidence only: it does not write proof ledgers, source evidence, tracked review templates, release QA evidence, deck data, or approval state; it does not replace Deck Ready, Silver, Gold, Sapphire, Platinum, Obsidian, source adequacy, or the full merge gate. Use `npm run deck:work-packet -- --packet=<packet-json>` to validate an existing packet before citing it in a commit or PR.

`deck:sapphire:batch` is the read-only core-kanji Sapphire pre-review report. `deck:words:sapphire:batch` is the read-only word Sapphire pre-review report. They do not create entries or prove release readiness. Use `--queue=missing-current-standard` only when intentionally inspecting current-standard structural coverage gaps. `deck:words:sapphire:promote` merges already-reviewed word Sapphire candidate JSON only after validating live generated rows, matching Gold preconditions, and current-standard Sapphire evidence lanes; it does not create Platinum, Obsidian proof, source truth, or release readiness.

`data:migrate:kanji-sapphire-slim` and `data:migrate:word-sapphire-slim` are dry-run-first authority-cleanup tools. They remove copied prior-lane payload only after exact generated-row, Gold, and evidence bindings resolve and preserve status/identity counts. They do not review cards, approve Sapphire, create Platinum, record Obsidian proof, change source truth, or shrink denominators.

`deck:words:gold:scaffold` is a Gold-only draft helper. It reads live generated word rows and existing Gold expectations, selects rows missing Gold coverage, and emits draft skeletons with mechanical identity fields plus failing TODO sentinels for meaning, example, and provenance checks. It does not write tracked templates, shrink the generated denominator, approve Gold review, create Sapphire/Platinum entries, record Obsidian proof, or prove release readiness.

The `npm run deck:sapphire:n5` and `npm run deck:words:sapphire:n5` commands are full-level structural gates. They fail unless every generated N5 card has an active current-standard structural entry and matching passing Gold regression input. Platinum is a separate lane after Sapphire and requires both prior Gold and current-standard Sapphire for the same card identity.

## Run Obsidian batches

Use [obsidian-batch-workflow.md](obsidian-batch-workflow.md) as the source of truth for every Obsidian pass. Do not wait until the level is complete before running the status and batch commands; they are the work queue.

### Kanji Obsidian batch

1. Confirm the workspace and current level posture:

```bash
git status --short --untracked-files=all
npm run deck:kanji:review-status
npm run deck:kanji:obsidian:rereview-status -- --levels=<level>
```

2. Generate the next Obsidian rereview worklist:

```bash
npm run deck:platinum:batch -- --level=<level> --limit=12 --queue=substantive-rereview
```

Obsidian workflows must request `--queue=substantive-rereview` explicitly. The default Platinum batch queue is `missing-current-standard` and is for Platinum coverage work, not Obsidian proof. Use `deck:sapphire:batch -- --queue=missing-current-standard` when the task is actual card-data Sapphire coverage rather than Obsidian proof.

3. Generate or refresh the kanji TSV with the normal kanji build, then run the governed kanji NLP support workflow before or during review:

```bash
npm run deck:ready -- --levels=<level>
npm run deck:kanji:nlp-signals -- --levels=<level>
```

That audits the NLP manifest/runtime, refreshes generated kanji TSVs, tokenizes bare kanji-card anchors, creates kanji-scoped review packets and draft notes, validates artifacts, and runs `nlp:governance-gate`.

It does not run word expansion, word reading-gap discovery, word example reranking, word sense-fit audits, or word-card embeddings.

Kanji tokenizer differences are usually treated as reading variants or tokenizer coverage gaps, not automatic defects, because one bare kanji can legitimately have multiple readings. NLP is review amplification only. It cannot certify Obsidian proof, approve source truth, or replace Obsidian rereview.

4. Run Obsidian rereview for each queued card against the live generated card, the batch rubric, tracked evidence, and any NLP signals. Check primary reading, meanings, example sentence, reading/translation, audio identity, stroke-order media, notes/support surface, source evidence, limitations, learner usefulness, and native/fluent-quality content criteria. If a signal reveals a real card/source issue, fix tracked data, regenerate, rerun the affected gates, and rerun NLP if its support artifact changed.

5. Record Obsidian proof only after the review happened. Canonical proof must be appended to the scoped JSONL ledger and provide structured compatibility-shaped `rereviewProvenance` plus actual card-bound example-sentence quality evidence. Do not record proof from `revalidatedAt`, lane-valid text, NLP output, or a clean batch report alone.

6. Verify the batch:

```bash
npm run deck:platinum:n<level>
npm run deck:kanji:obsidian:rereview-status -- --levels=<level>
npm run deck:platinum:batch -- --level=<level> --limit=12 --queue=substantive-rereview
```

For core-kanji Sapphire structural verification, replace the first command with `npm run deck:sapphire:n<level>`, such as `deck:sapphire:n3` for N3. Keep `deck:platinum:batch` here only for the Obsidian substantive rereview queue.

7. Run the fail-closed certification gate only when the selected scope is expected to be fully Obsidian:

```bash
npm run deck:kanji:obsidian:certify-status -- --levels=<level>
```

If this fails during an in-progress level, treat the failure as the remaining queue, not as permission to weaken the gate.

### Word Obsidian batch

1. Confirm the workspace and current level posture:

```bash
git status --short --untracked-files=all
npm run deck:words:obsidian:rereview-status -- --levels=<level>
```

2. Generate the next Obsidian rereview worklist:

```bash
npm run deck:words:platinum:batch -- --level=<level> --limit=8 --queue=substantive-rereview
```

Obsidian word workflows must request `--queue=substantive-rereview` explicitly. The default word Platinum batch queue is `missing-current-standard` and is for Platinum coverage work, not Obsidian proof. For word structural work, use `deck:words:sapphire:batch`.

3. Generate or refresh the word deck surface, then run the governed word NLP support workflow before or during review:

```bash
npm run deck:words:ready -- --levels=<level>
npm run deck:words:expansion-support -- --levels=<level>
```

Word NLP is broader than kanji NLP: it runs model/runtime checks, tokenization, embeddings, example reranking, sense-fit warnings, reading-gap candidate discovery, review packets, draft proposals, artifact validation, and `nlp:governance-gate`. Review packets point the Obsidian pass at exact word-reading targets, tokenizer issues, example alternatives, sense-fit risks, and candidate words. It still cannot certify Obsidian proof or write tracked templates.

4. Run the Obsidian rereview for each queued word card against the live generated row, exact written-reading identity, source evidence, word audio, pitch evidence/rendering, reading breakdown, support labels, example naturalness, learner usefulness, level fit, release quality, reading, translation, native/fluent-quality content criteria, and any NLP signals. The example sentence is reviewed as card content before any example-sentence audio is generated. Fix tracked source/card data first when NLP or the rubric exposes a real issue, then regenerate, rerun relevant gates, and rerun NLP if the affected support artifact changed.

5. After the sentence passes review, generate, sync, and review exact example-sentence audio for the approved live sentence surface only:

```bash
npm run media:voicevox:word-examples -- --level=<level> --word=<written1>,<written2>
npm run media:sync:word-examples -- --level=<level> --word=<written1>,<written2>
npm run media:review:word-example-audio -- --level=<level> --word=<written1>,<written2>
```

Example-sentence audio is downstream evidence for an accepted sentence. It is not a substitute for the Obsidian natural-language review and must not be generated for weak or unresolved sentences.

6. Record Obsidian proof only after the live generated word row is actually rereviewed and the exact example-sentence audio review is clean. Word proof must bind exact written+reading identity, structured `rereviewProvenance`, the full word-card `evidenceChecked` checklist, actual example-sentence quality evidence, and `sentenceAudioReview` evidence for the `word-example-sentence` asset. Canonical JSONL is the NoSQL proof ledger; generated SQLite output is query support only.

7. Verify the batch. Use the native word Sapphire alias for structural coverage, then rerun the Obsidian status queue for proof posture.

```bash
npm run deck:words:sapphire:n<level>
npm run deck:words:obsidian:rereview-status -- --levels=<level>
npm run deck:words:platinum:batch -- --level=<level> --limit=8 --queue=substantive-rereview
```

Replace `n<level>` with the actual npm alias when one exists, such as `deck:words:sapphire:n4`.

8. Run the fail-closed certification gate only when the selected scope is expected to be fully Obsidian:

```bash
npm run deck:words:obsidian:certify-status -- --levels=<level>
```

For both kanji and words, commit batches with the manifest changes and the exact verification commands. Do not mix source-contract generation, Obsidian proof, APKG/media QA, and unrelated cleanup in one commit.

## Build kanji decks

```bash
npm run deck:ready -- --levels=5
npm run deck:apkg -- --levels=5
npm run deck:kanji:additional:ready
```

`deck:ready` validates setup, syncs media, builds exports, packages files under `out/build/package`, reports managed manifest coverage and exported card media completeness, and fails on export fallbacks by default. When native `.apkg` creation succeeds, package media is read directly from managed-media source paths through the integrity sidecar instead of being duplicated into `package/media`; if `.apkg` creation is skipped, `package/media` is materialized for TSV/manual-copy compatibility.

Default `deck:ready` writes through the shared `out/build` root. Use `npm run deck:ready -- --levels=<level> --run-id=<id>` to isolate a generated output root under `out/run-outputs/<id>/kanji-n*` for local parallel build/package experiments. Use explicit `--out-dir=<path>` only when you are intentionally controlling the generated root. Do not run cold APKG cache clearing, timing-budget benchmarks, proof/source writes, or release certification gates in parallel with these builds.

The generated package also includes `media-integrity.json`, a local sidecar used to bind packaged media filenames to managed-media SHA-256 identities during deterministic APKG creation. It is not source evidence, Obsidian proof, or release QA.

Native `.apkg` creation may reuse a SHA-verified, content-addressed generated cache outside the cleaned build root when exports, note schema, media integrity, and the APKG builder script are unchanged. The default build therefore uses `out/.apkg-cache`; benchmark warmup and measured roots share `out/bench-build/.apkg-cache`, and explicitly isolated callers may supply their own generated cache root. Cache entries include a generated metadata manifest binding the cache key, artifact byte size, and APKG SHA-256. A cache miss rebuilds the package normally; a corrupt cache entry is ignored and rebuilt. The cold native APKG path is independently measurable with `npm run bench:build:cold-apkg:gate`, which clears the cache selected for that benchmark root before the measured build and verifies the Python archive path rather than the hot-cache path.

The Python APKG writer is a governed native runtime boundary. It streams files into the archive, replaces the final `.apkg` only after a staged archive is complete, and checks media-integrity SHA-256/byte-size metadata against source-backed media while writing the archive. Python runtime metadata in the package summary is diagnostic only; it is not deck source truth, Obsidian proof, or release readiness.

Exported card media completeness is the release-critical signal for kanji deck media readiness. Use `--allow-export-fallbacks` only for an explicitly degraded local artifact.

`deck:kanji:additional:ready` writes separate `additional_unverified_Nx` exports under `out/build/additional_unverified` and packages them as a separate `kanji-additional` APKG. The governed default currently writes empty `0`-row exports because all raw additional source claims are already-core source-claim collisions and are suppressed from the physical surface.

Do not merge additional rows into the core deck or treat additional Gold manifests as source-evidence proof.

## Build word decks

```bash
npm run deck:words:ready -- --levels=5
npm run deck:words:apkg -- --levels=5
```

Run separate default `deck:words:ready` invocations serially. The default command writes through the shared `out/word-build` package directory, so parallel per-level runs can collide during media cleanup or package creation. Use `npm run deck:words:ready -- --levels=<level> --run-id=<id>` to isolate a generated output root under `out/run-outputs/<id>/word-n*` for local parallel build/package experiments. The run-id root only isolates generated build/package files; it does not certify cards, replace Gold/Sapphire/Platinum/Obsidian gates, coordinate proof/source writes, or make timing benchmarks safe to run in parallel.

For reading readiness, `deck:words:ready` expands each requested word level to its cumulative easier-level support stack while keeping the packaged deck scoped to the requested level. For example, `--levels=3` packages N3 word cards but evaluates N3 reading coverage with the N3-N5 word-support range. Reports keep the active deck count separate from the cumulative reading-scope count.

Word readiness reports:

- shipped row governance
- canonical inventory counts
- source-only exclusions, if any
- word-level placement violations
- explicit reading-coverage contract counts
- selected-level reading coverage
- active triage backlog
- reading-gap override alignment, including unconfigured current gaps and stale tracked keys
- deck-policy violations
- sentence orthography review
- reading-breakdown review
- card-back field readiness
- pitch-accent review
- true looping animation coverage
- word-audio review where enabled

Use the N5 guard when changing stabilized N5 word content:

```bash
npm run deck:words:ready -- --levels=5 --require-no-active-triage
```

The stabilized guard fails when active editorial/promotion triage remains, when a current gap is using an unconfigured default disposition, or when a tracked override no longer matches a current gap. Intentional `defer_variant` rows are ready only when every current gap has an exact tracked disposition and no stale override keys remain.

## Plan word reading coverage

```bash
npm run deck:words:gap-plan:n4 -- --limit=50
npm run deck:words:gap-plan:n4 -- --only=contract-extensions --quality=strong --limit=15 --suggestions=3
npm run deck:words:expansion-support:n4
```

The gap planner ranks open reading coverage work and suggests candidate support words from:

- tracked word entries
- sentence corpus rows
- local kanjiapi word cache evidence

Planner output is advisory. A suggested card still needs canonical contract coverage, explicit reading intent, cross-level labels, media, sentence review, and deck-policy validation before shipping. Deferred reading gaps may carry explicit target-level routing metadata; a `defer_variant` row routed to N2 or N1 is not promoted by that routing alone and still needs exact target-level contract and starter-data review before any card exists.

The triage report also reconciles the exact live gap-key set against tracked editorial overrides. Review `Tracked editorial dispositions applied`, `Default (unconfigured) dispositions`, and `Stale tracked dispositions`; matching total counts do not prove that the key sets align. A stabilized level should reach zero default and zero stale dispositions before its deferred backlog is treated as fully adjudicated. The current N5 decision record is [n5-word-reading-gap-adjudication.md](n5-word-reading-gap-adjudication.md).

`deck:words:expansion-support:n4` adds the governed NLP expansion layer for the same level: tokenization, embeddings, example reranking, sense-fit warnings, reading-gap candidate discovery, review packets, draft proposals, validation, and the NLP governance gate.

This is review amplification, not certification. If a word NLP packet exposes a real card/source issue, fix tracked source or card data first, regenerate the live word row, rerun the relevant gates, and rerun NLP when the affected support artifact changed. Word Obsidian proof is added only after the corrected live generated row and tracked evidence pass the Obsidian native/fluent-quality rereview. Certification remains under `deck:words:obsidian:rereview-status` and `deck:words:obsidian:certify-status`.

### N3 Silver word expansion cadence

Use this cadence only for one active word Silver/source-expansion lane. It is not Gold, Sapphire, Platinum, Obsidian, release QA, or proof-ledger work.

- Default to four N3 Silver batches per commit.
- Use three batches when candidates are source-thin, deferral-heavy, or editorially risky.
- Use five batches only when candidates are unusually clean, same-pattern, and focused gates stay routine.
- Verify after every batch with N3 word readiness or generation as required, completion, gap-plan, reading-audit, and `nlp:governance-gate`.
- At the commit boundary, classify N3 word Gold/Sapphire/Platinum failures as expected backlog versus regression, then run `lint`, `typecheck`, `npm test`, `git diff --check`, and the normal git status/stat/name-status checks.
- Keep the lane to N3 word Silver starter/source expansion. Do not write proof ledgers, record Obsidian proof, shrink denominators, certify downstream lanes, touch frozen N4/N5 word data, touch kanji lanes, or keep extra remote branches after merge cleanup.
- The sentence corpus remains support infrastructure for examples and candidate assistance; it does not replace exact word-reading identity, governed source evidence, schema support, or reviewer promotion judgment.

### N3 Gold word review cadence

Use this cadence only after the N3 Silver generated surface exists and the thread is explicitly scoped to N3 word Gold review. It is not Silver/source expansion, Sapphire, Platinum, Obsidian, release QA, kanji work, or proof-ledger work.

- Start from live generated rows and current missing Gold expectations. Use `npm run deck:words:gold:scaffold -- --level=3 --limit=10` only as a fail-closed drafting helper; it writes no tracked templates, uses TODO sentinels for judgment fields, and cannot auto-pass a card.
- Review selected rows one at a time. The normal high-throughput shape is eight batches of ten only while focused gates stay clean; stop sooner when candidates expose drift, source weakness, or schema limits.
- For each accepted row, verify exact written-reading identity, source identity, generated card text, reading, meaning, example sentence, audio, pitch, labels, card-back fields, and N3 learner fit before adding a Gold expectation.
- Fill meaning, example, and provenance note assertions by human review. Do not leave TODO sentinels, bulk-accept scaffold text, shrink denominators, or convert missing unreviewed rows into regressions.
- If Gold review exposes N3 starter/source/card drift, fix the upstream tracked N3 word data required to make the reviewed card true, then regenerate and rerun the focused gates. Do not touch frozen N4/N5 word data, kanji lanes, Sapphire, Platinum, Obsidian proof, or release-lock files unless the live N3 Gold gate proves a direct blocker.
- Verify during and after the batch with `npm run deck:words:completion:n3`, `npm run deck:words:gap-plan:n3`, `npm run deck:words:reading-audit:n3`, `npm run deck:words:review:n3`, and `npm run nlp:governance-gate`; add `npm run words:init -- --refresh-starter` when starter-derived rows changed.
- At the commit boundary, classify missing N3 Gold rows as expected coverage backlog, classify Sapphire/Platinum failures as expected downstream backlog, confirm no reviewed-row failures, and then run the normal lint, typecheck, `npm test`, security, diff, status, stat, and name-status checks.

## Check kanji NLP support before Obsidian rereview

```bash
npm run deck:ready -- --levels=3
npm run deck:kanji:nlp-signals -- --levels=3
```

The kanji NLP command refreshes generated kanji TSVs, audits NLP manifest/runtime readiness, tokenizes bare kanji-card anchors, creates kanji-scoped review packets and draft notes, validates artifacts, and runs the NLP governance gate.

It deliberately does not run word expansion, word reading-gap discovery, word example reranking, word sense-fit audits, or word-card embeddings. Kanji tokenizer differences are usually reading variants or tokenizer coverage gaps, not automatic defects, because one bare kanji can legitimately have multiple readings.

The Obsidian pass still inspects the live kanji card: primary reading, meanings, example sentence, reading/translation, audio identity, stroke-order media, notes/support surface, source evidence, limitations, learner usefulness, and native/fluent-quality content criteria. If a kanji NLP signal reveals a real card/source issue, fix tracked data first, regenerate, rerun gates, and rerun NLP when the affected support artifact changed. Kanji Obsidian proof is added only after the corrected live card passes Obsidian native/fluent-quality rereview. Certification remains under `deck:kanji:obsidian:rereview-status` and `deck:kanji:obsidian:certify-status`.

## Plan word inventory expansion

```bash
npm run deck:words:expansion-candidates:n5 -- --source=downloads/n5-vocab.tsv --source-label=jlptstudy.net-n5 --limit=50
npm run deck:words:expansion-candidates:n5 -- --source=downloads/n5-vocab.tsv --source-label=jlptstudy.net-n5 --kanji-scope=target-level --require-source-level
npm run deck:words:expansion-candidates:n4 -- --limit=50
npm run deck:words:expansion-support:n4
npm run data:normalize:tanos-jlpt-words -- --level=5 --reviewed --citation="<citation>" --evidence-ref="<paired export refs>"
npm run data:normalize:tanos-jlpt-words -- --level=4 --reviewed --citation="<citation>" --evidence-ref="<paired export refs>"
npm run data:normalize:tanos-jlpt-words -- --level=3 --reviewed --citation="<citation>" --evidence-ref="<PDF ref>"
npm run deck:words:expansion-candidates:n3 -- --limit=50
npm run deck:words:expansion-support:n3
npm run data:normalize:tanos-jlpt-words -- --level=2 --reviewed --citation="<citation>" --evidence-ref="<paired export refs>"
npm run deck:words:expansion-candidates:n2 -- --limit=50
npm run deck:words:expansion-support:n2
npm run data:normalize:tanos-jlpt-words -- --level=1 --reviewed --citation="<citation>" --evidence-ref="<paired export refs>"
npm run deck:words:expansion-candidates:n1 -- --limit=50
npm run deck:words:expansion-support:n1
```

The expansion candidate report is a read-only post-coverage tool. Use it after the current reading-coverage pass to compare an explicit sourced vocabulary list against the governed word contract.

It filters for written-reading rows that contain target-level kanji, are not already governed or excluded, and fit the requested kanji scope:

- `at-or-below` keeps words whose kanji are all target-level or easier.
- `target-level` keeps only words whose kanji are all from the requested level.
- `known-jlpt` allows harder known JLPT kanji but reports them for review.
- `any` allows outside-JLPT kanji but reports them for review.

Expansion candidates are not product truth. Every promoted word still needs source/commonness review, level-fit review, examples, reading breakdowns, kanji labels, audio, pitch policy compliance, Gold regression, native Sapphire evidence, and readiness validation.

Rows that contain known JLPT kanji but no current-level kanji are reported separately as cross-level routing rows. They are not current-level promotion candidates and do not make the current level active by themselves. Physical movement still requires explicit target-level contract and starter-data review.

Tracked triage decisions live in [../templates/word_inventory_expansion_triage.json](../templates/word_inventory_expansion_triage.json). These decisions are read-only planning metadata, not card approvals.

When `--source` is omitted, the report resolves the single active `candidate-discovery` source for the requested level from [../templates/word_source_manifest.json](../templates/word_source_manifest.json), applies its source label, format, candidate policy, and local integrity pins, then fails instead of trusting a mismatched ignored TSV.

## Select governed common-word expansion candidates

```bash
npm run deck:words:common-expansion -- --levels=5,4,3,2,1
npm run deck:words:expansion-status -- --levels=5,4,3,2,1
npm run deck:words:vocab-expansion -- --levels=5,4,3,2,1
npm run deck:words:vocab-expansion -- --levels=5 --source=tanos-n5-vocab --strict --limit=80
npm run deck:words:vocab-expansion -- --levels=4 --source=tanos-n4-vocab --strict --limit=80
npm run data:normalize:words:tubelex -- --strict --json
npm run deck:words:vocab-expansion -- --levels=5 --source=common-pool --frequency-source=tubelex-ja-frequency --strict --limit=80
npm run deck:words:vocab-expansion -- --levels=5 --source=common-pool --common-pool-mode=raw --frequency-source=tubelex-ja-frequency --strict --limit=80
npm run deck:words:common-expansion -- --levels=5 --placement-mode=vocabulary-level --limit=40
```

The common-word selector is a read-only Silver planning report. It starts from each level's active `candidate-discovery` source, then adds JMdict dictionary verification and JMdict priority/commonness support from the governed word source manifest.

Use `--summary` when only queue accounting, source labels, work-order posture, and visible backlog counts are needed; it emits compact JSON without full selector row arrays. Use `--keys-only` to inspect the report shape before wiring automation or dashboards. These modes do not change selector logic, source labels, denominators, or lane authority.

Use `--source=<source-id>` only after the level's normal prerequisites open the extra expansion lane. A reviewed fallback/free-source family such as `tanos-n5-vocab` or `tanos-n4-vocab` is the first extra-source preview. When those reviewed family rows are exhausted, `--source=common-pool` continues the same extra expansion lane with the `DICTIONARY COMMON POOL`; it is not a separate source-depth lane. Both modes mark the source universe as `EXTRA SOURCE FAMILY`, preserve the row label `Source level claim unverified`, remain pre-trust triage queues, and do not promote Silver rows or change Silver/Gold/Sapphire/Platinum/Obsidian denominators. N3/N2/N1 already use their Tanos sources as the configured source family, so their extra source-family preview requires a separate permitted family before falling through to the common pool.

Use `deck:words:expansion-status` when the question is "what work is next for this N-level?" The report prints governed unique deck progress against the current expansion target minimums, then an expansion work order in priority order: reading fast promotions, reading editorial research, current selector ready rows, current selector triage rows, move-candidate routing, blocked/deferred recorded backlog, then the extra expansion lane. This makes an exhausted current selector explicit instead of quiet: when the prerequisites are clear, the extra lane says it is ready and still warns that work is not done. If a reviewed extra/free source-family selector is available, it comes first. If no reviewed family rows have priority and the pinned JMdict dictionary/commonness inputs are available, the same lane opens the `DICTIONARY COMMON POOL` instead of sending reviewers through another source-hunting loop.

The common-word queue is only active after the selected level's reading-gap expansion signal is exhausted: no active reading-gap editorial or promote-curated-example items may remain. The configured source-list enhancement and word-placement signals are still reported as governance context, but they do not block the post-reading common-word queue from opening. Deferred variants and low-value readings remain recorded as reading-lane decisions; they do not become permission to bypass source governance.

Fallback/free-source expansion is a later lane, not a shortcut. Do not activate the extra expansion lane until both prerequisites are true for the level: reading expansion is exhausted, and the current new-word selector has no `ready_for_editorial_review`, no `needs_triage`, and no unresolved same-source `move_candidate` routing left. A `move_candidate` row with a valid different `targetLevel` is handled for the source level once the selector can route it into the target-level queue; it remains pre-trust target-level work and may become Silver only through that target level's contract/starter review. Extra source-family rows and dictionary common-pool rows must be visibly labeled `Source level claim unverified`; the label means "this free/permitted source or commonness signal does not prove official JLPT level truth and is still pre-trust."

Version naming: call the post-reading common-word expansion for N5 and N4 the word `v2` path. For N3, N2, and N1, the same common-word expansion belongs to their word `v1` implementation because those levels have not shipped the same lower-lane frozen vocabulary surface. Do not use future-name placeholders for this work.

Use the placement mode deliberately:

- `kanji-anchor` is the default view. It preserves the older reading-coverage posture: a current-level word candidate must contain current-level kanji, and source rows with only harder kanji remain cross-level routing rows.
- `vocabulary-level` is the expansion view for common N-level vocabulary after reading-gap expansion is exhausted. It keeps exact source-listed vocabulary eligible for that source JLPT level even when the written form contains harder support kanji, provided the row is dictionary verified, commonness supported, missing from the governed contract, and explicitly top-level triaged as `keep_candidate`.
- Top-level `move_candidate` decisions in [../templates/word_inventory_expansion_triage.json](../templates/word_inventory_expansion_triage.json) are authoritative in every selector view. They remain target-level routing work and must not be bypassed with placement-specific overrides. When a requested target level has ungoverned rows routed from another source level, the common-word selector loads that source level as routing support and surfaces the missing rows in the target level's queue. For example, an N5 source row with `move_candidate` targeting N3 appears as N3 target-review work until it is physically placed in N3's `jlpt_word_level_contract` entry and `starter_word_study_data_n3.json` shard.

Selector rows are still pre-trust. A row marked `ready_for_editorial_review` has source identity, dictionary support, commonness support, and a keep-style triage decision; it still needs explicit card approval, starter/contract edits in a later scoped expansion, examples, reading breakdown, kanji labels, audio, pitch, Gold, Sapphire, Platinum, and readiness gates before it becomes a shipped word card.

Build Silver review packets only after the selector queue for the level is the intended work surface:

```bash
npm run deck:words:silver:packets -- --level=4 --limit=25 --source=common-pool --queue=silver --markdown
npm run deck:words:silver:manifest:validate -- --input=out/word-silver-review-packets/<decision-manifest>.json
npm run deck:words:silver:apply -- --input=out/word-silver-review-packets/<decision-manifest>.json
```

Word Silver packets are generated review-support artifacts for any N-level, not N4-only tooling. They aggregate selector, source, commonness, learner-utility, duplicate/variant, and risk signals so the reviewer can make governed keep/fix/defer/reject/remove/reroute decisions. Packets do not write tracked templates, approve cards, certify source truth, create Obsidian proof, or change release posture.

A Word Silver decision manifest is the governed handoff between editorial review and tracked-template writes. The manifest must use `codex_editorial_review` provenance, not fake native/human-review claims, and keep/fix decisions must include the complete starter card surface plus source-claim labels, learner-fit rationale, duplicate/variant review, and product-risk review. The applicator dry-runs unless `--write` is provided; it only applies validated keep/fix rows to the level starter shard and `jlpt_word_level_contract.json`, skips defer/reject/remove/reroute rows, and still requires normal completion, gap-plan, Gold, Sapphire, Platinum, docs, and diff verification afterward.

Every selector row carries a source-level label. For free/permitted candidate-discovery sources, the label is `Source level claim unverified`; do not remove, hide, or soften it for fallback rows. The label is separate from learner usefulness: a word can be useful/common/learner-friendly and still need the unverified source-level label until source adequacy reaches the governed universe standard.

Standalone one-kanji written forms are queue-eligible when the level gate is active; do not block them only because the word is one kanji. If the active source row uses template notation in the reading, keep it as `needs_triage` until editorial review resolves whether the notation represents a useful card identity.

The selector reports `sourceUniverse.configuredSourceOnly: true` for every level. This is intentional: N5/N4 configured-source exhaustion means only that the currently pinned source list has no active current-level keep backlog, not that every common JLPT word in the world has been evaluated. A zero-row ready queue is not source adequacy. If the editorial target is broader than the pinned source row count, add approved candidate-discovery sources only after prior selector work is exhausted, and keep the extra rows labeled as unverified source-level claims. For example, the current JLPTStudy discovery sources are 537 rows for N5 and 681 rows for N4, so they cannot settle broader common-vocabulary claims by themselves.

### Free word expansion doctrine

The word expansion goal is learner usefulness after coverage: once a level's reading expansion is fully exhausted, keep adding useful, common, free, verifiable words that are missing from that level's governed word deck. This is the answer to the "words containing 本" case: the deck should not stop just because one reading has already been represented by one card.

Expansion targets are useful minimums, not hard caps or approval quotas: N5 ~800, N4 ~1000, N3 ~2250, N2 ~2250, and N1 ~4000 unique governed words. Target-progress reporting starts after reading expansion; it must not activate common-word expansion before reading work is exhausted. Missing a target is never permission to accept weak rows: every added row must be common, useful, learner-friendly, dictionary verified, commonness supported, non-duplicate, correctly labeled, and promoted only through the normal Silver and downstream review gates.

Source-depth is not a Silver blocker; it is a claim limiter. `deck:words:source-adequacy` may fail evidence depth while free labeled expansion remains allowed. That incomplete source-depth posture blocks only claims such as "all common JLPT words are covered" or "the broad vocabulary universe is represented." It does not block a labeled, dictionary-verified, commonness-supported, learner-friendly Silver candidate from entering review after its lane gates open.

The free word expansion order is:

1. Finish the reading-gap expansion lane for the level.
2. Exhaust the configured source-list selector for the level.
3. Exhaust any reviewed extra/free source-family selector for the level.
4. Continue the same extra expansion lane with the dictionary common pool for missing useful/common words that contain level-relevant kanji or otherwise fit the level's vocabulary deck policy.
5. Promote only through normal Silver card review, then Gold, Sapphire, Platinum, and Obsidian catch-up gates.

The dictionary common pool is part of the extra expansion lane, not a separate source-depth lane. It is not a license to import a dictionary. It is a governed review route that uses permitted dictionary and commonness signals, such as JMdict containment/commonness discovery, to surface exact `written|reading` identities that are not already governed or excluded. TubeLex everyday-language frequency support may rank and explain dictionary common-pool rows after `npm run data:normalize:words:tubelex` creates the pinned derived exact-identity TSV. TubeLex is frequency/usefulness support only; it is not candidate discovery, JLPT level truth, reading proof, meaning proof, pitch proof, or card approval. Dictionary common-pool rows must remain labeled `DICTIONARY COMMON POOL` plus `Source level claim unverified`. The label is what keeps the source claim honest; it is not a reason to block the row when the word is useful, common, learner-friendly, and otherwise passes card review.

The default dictionary common-pool view is an editorial shortlist over an audit-visible raw pool, not the raw pool itself. The default shortlist is capped at `200` rows per selected level, while `sourceUniverse.rawRowCount`, `commonPoolSummary.eligibleRowsBeforeEditorialFilter`, and `commonPoolSummary.deprioritizedByEditorialQueueLimit` keep the evidence denominator visible. Dictionary common-pool operational queues filter already-reviewed keep, defer, reject, and move rows before the `200`-row cap while keeping their counts audit-visible. Use `--queue=discovery` for the next untriaged review window. Use `--queue=silver` to surface kept common-pool rows for later Silver preparation without mixing them into discovery triage. Use `--queue=all` or `--common-pool-mode=raw` only when auditing the full pool/history; do not treat audit/history views as learner-facing review queues.

Dictionary common-pool editorial queues are ordered by a transparent learner-utility score before the `200`-row cap is applied. The score is an ordering signal only, never card approval. Its components must stay visible for every row: everyday usefulness, concrete/common domain fit, target-kanji reinforcement value, duplicate or near-duplicate safety, specialized/proper-noun penalty signals, exampleability, and pitch/audio/media readiness. TubeLex-backed everyday-language evidence adds frequency rank, dispersion, category concentration, match status, frequency band, and exact reason output to that score. Ambiguous TubeLex written/reading matches stay visibly marked and cannot create reading proof. Human reviewers still decide keep/defer/reject/move, but the report must print the score, band, reasons, and penalties so a reviewer can see why a row entered the current queue.

Learner-value buckets classify common-pool rows as core candidates, family representatives, support-label candidates, same-written ambiguities, redundant family members, domain-narrow rows, or raw audit low-fit rows. Redundant family members, domain-narrow rows, and raw audit low-fit rows stay counted in the raw denominator but are audit-only by default, not human review queue work. Family caps are review-ordering safeguards, not deletion rules: a high-frequency, learner-useful exception can still surface, while repetitive pattern-family rows that teach nothing new remain visible only as evidence accounting.

Discovery yield reports strong, good, borderline, and poor frequency/usefulness bands for each 200-row window. The stop rule is advisory and deterministic: after two consecutive 200-row windows produce fewer than 10 keep/ready-quality rows or below 5% keep yield, stop broad discovery for that source shape and do not accept weak rows just to chase a target.

Outside-JLPT and higher-level support kanji are label/review needs, not automatic common-pool deprioritization. A dictionary common-pool row that has a level-relevant anchor may stay near the front of the queue when it is common and learner-useful, even if another support kanji is N3, N1, or outside the JLPT kanji contract. The card still must visibly label that support kanji and pass normal level-fit review before promotion.

Dictionary common-pool review must still reject weak rows: unclear written/reading identity, missing dictionary verification, missing commonness support, kana-only rows outside the active policy, duplicate governed identities, adult or unsafe content, narrow proper nouns, highly specialized technical terms, bad learner fit, unnatural examples, missing media, missing pitch policy handling, or unresolved level-placement risk. If a word belongs in another N-level, route it with the authoritative `move_candidate` mechanism and place it in that target level's word JSON before promotion.

Paid/private sources are optional future improvements, not a prerequisite for free labeled word expansion. Do not recommend paid source acquisition as the next step when the real unblocker is finishing the active reading/current-source/extra/dictionary queue. Broad source-depth work may resume later if a specific permitted source surface appears, but the free expansion lane remains valid with clear labels and normal review gates.

## Govern word source adequacy

```bash
npm run data:audit:jlpt:word-sources -- --governance-strict
npm run deck:words:source-adequacy -- --levels=5,4,3,2,1
npm run deck:words:source-access
npm run data:audit:jlpt:word-source-inputs -- --source=jlptstudy.net-n5 --strict
npm run data:packet:jlpt:word-source-access -- --source=tanos-n5-vocab --surface-type=permitted-machine-readable-source --title="Tanos JLPT N5 vocabulary Mnemosyne exports" --citation="<Tanos N5 page and CC BY sharing statement>" --evidence-ref="<paired export URLs>"
npm run data:audit:jlpt:word-source-inputs -- --source=tanos-n5-vocab --strict
npm run data:import:jlpt:word-source-input -- --source=tanos-n5-vocab
npm run data:packet:jlpt:word-source-access -- --source=tanos-n4-vocab --surface-type=permitted-machine-readable-source --title="Tanos JLPT N4 vocabulary Mnemosyne exports" --citation="<Tanos N4 page and CC BY sharing statement>" --evidence-ref="<paired export URLs>"
npm run data:audit:jlpt:word-source-inputs -- --source=tanos-n4-vocab --strict
npm run data:import:jlpt:word-source-input -- --source=tanos-n4-vocab
npm run data:packet:jlpt:word-source-access -- --source=tanos-n3-vocab --surface-type=exact-word-list-table --title="Tanos JLPT N3 vocabulary PDF" --citation="<Tanos N3 PDF and CC BY sharing statement>" --evidence-ref="<PDF URL>"
npm run data:audit:jlpt:word-source-inputs -- --source=tanos-n3-vocab --strict
npm run data:import:jlpt:word-source-input -- --source=tanos-n3-vocab
npm run data:packet:jlpt:word-source-access -- --source=tanos-n2-vocab --surface-type=permitted-machine-readable-source --title="Tanos JLPT N2 vocabulary Mnemosyne exports" --citation="<Tanos N2 page and CC BY sharing statement>" --evidence-ref="<paired export URLs>"
npm run data:audit:jlpt:word-source-inputs -- --source=tanos-n2-vocab --strict
npm run data:import:jlpt:word-source-input -- --source=tanos-n2-vocab
npm run data:packet:jlpt:word-source-access -- --source=tanos-n1-vocab --surface-type=permitted-machine-readable-source --title="Tanos JLPT N1 vocabulary Mnemosyne exports" --citation="<Tanos N1 page and CC BY sharing statement>" --evidence-ref="<paired export URLs>"
npm run data:audit:jlpt:word-source-inputs -- --source=tanos-n1-vocab --strict
npm run data:import:jlpt:word-source-input -- --source=tanos-n1-vocab
npm run data:template:jlpt:word-source-input -- --source=textbook-word-list
npm run data:packet:jlpt:word-source-access -- --source=textbook-word-list --surface-type=exact-textbook-index-page --title="<title>" --citation="<citation>" --evidence-ref="<page/row>"
npm run data:merge:jlpt:word-source-batch -- --source=<source-id> --batch=<ignored-batch.tsv>
npm run data:import:jlpt:word-source-input -- --source=<source-id>
```

`deck:words:source-access` distinguishes actionable review work from registered future placeholders. `registered_no_current_source_access` means the family is tracked for future use, but current free/public access has no governed work to spend time on. Do not repeat source discovery just to get the same answer; reopen broad source-depth research only with a specific newly permitted source surface, publisher permission, or a completed source-access packet for an exact surface. Paid/private sources are optional future improvements, not a prerequisite for free labeled word expansion.

Word source adequacy is a separate source-governance lane, parallel to kanji source evidence. It tracks exact `written|reading` identities, source tiers, source lineages, independent source families, reviewed source-access surfaces, and source-origin posture. It does not add Silver rows, edit starter data, move denominators, certify review tiers, or touch kanji lanes.

The current word source posture is expected to be source-depth incomplete. Existing JLPTStudy and Tanos source files are configured and pinned discovery inputs, not broad common-vocabulary universe proof. A level may say "configured source evaluated" when its pinned source list has been exhausted; it may not say "all common JLPT words covered" until the word source-evidence audit reaches `level_universe_standard` for that level.

Reviewed word source-input rows require exact source-level evidence: an exact word-list table, exact dictionary entry, official correction row, exact textbook/index assignment page, target-entry page, or permitted machine-readable source. Marketing pages, grammar/can-do-only surfaces, example-only pages, copied unlicensed raw lists, and vague common-vocabulary summaries must be rejected or marked `source_access_gap` / `license_blocked`.

## Check word expansion signals

```bash
npm run deck:words:expansion-signals -- --levels=5,4
```

The expansion signal command answers the narrow "fully expanded under current restraints?" question for each selected word level. It must not be read as global common-vocabulary exhaustion.

It has three separate signals:

- Reading signal: `exhausted` only when active reading-gap triage is cleared.
- Enhancement signal: `exhausted` only when the configured source vocabulary list has no remaining `keep_candidate` rows and no untriaged review candidates.
- Placement signal: `resolved` only when canonical word rows either have a current-level kanji anchor or carry a tracked learner-fit reason for later all-easier-kanji placement.

The configured source TSVs under `downloads/` are ignored local inputs. The signal source config pins their source URL, source label, SHA-256, byte size, and parsed row count.

The signal is deliberately not a release claim. It does not replace Gold regression, native Sapphire structural gates, Platinum, Obsidian proof, APKG import QA, accessibility checks, media/listening QA, or readiness gates.

## Stroke order

```bash
npm run media:plan -- --level=5 --limit=25
npm run media:import:stroke-order -- --input-dir=/path/to/files
npm run media:import:kanjivg -- --input-dir=/path/to/extracted-kanjivg/kanji --level=4
npm run media:sync -- --level=5 --limit=25
npm run media:report:animations -- --level=5 --limit=25
npm run data:audit:stroke-order -- --json
```

Managed animation priority:

1. `REMOTE_STROKE_ORDER_ANIMATION_BASE_URL`
2. `REMOTE_STROKE_ORDER_ANIMCJK_BASE_URL`
3. local source files

True animation coverage requires real looping animation assets. Static images and SVG fallbacks do not satisfy that rule. Use the configured GitHub animation mirrors or reviewed local source files.

Stroke-order release provenance is governed by [../templates/stroke_order_source_policy.json](../templates/stroke_order_source_policy.json). The automated gate verifies approved source policy, managed manifests, and target-bound review evidence. It does not prove stroke-sequence correctness by itself.

Native Sapphire or structural compatibility evidence must state that the stroke-order media was visually checked for the target kanji.

## Audio

```bash
npm run voicevox:status
npm run voicevox:start
npm run doctor:voicevox
npm run media:voicevox -- --list-speakers
npm run media:voicevox -- --level=5 --speaker-id=10005 --concurrency=4
npm run media:voicevox:words -- --level=5 --speaker-id=10005 --concurrency=4
npm run media:voicevox:word-examples -- --level=5 --speaker-id=10005 --word=<written1>,<written2>
npm run voicevox:stop
npm run media:sync -- --level=5 --limit=100
npm run media:sync:words -- --level=5
npm run media:sync:word-examples -- --level=5 --word=<written1>,<written2>
npm run media:review:audio -- --level=5 --limit=25
npm run media:review:word-audio -- --level=5 --limit=25
npm run media:review:word-example-audio -- --level=5 --word=<written1>,<written2>
npm run data:audit:audio -- --json
```

Use the npm scripts for governed audio work. The word-audio generator is `scripts/generateWordVoicevoxAudio.js` behind `npm run media:voicevox:words`; `scripts/generateVoicevoxWordAudio.js` is not a repo path.

`media:voicevox:word-examples` is only for approved live word example sentences after Obsidian card-surface review has accepted the sentence text, reading, translation, level fit, and learner usefulness. Do not use it before fixing or deferring weak sentences.

`media:review:audio`, `media:review:word-audio`, and `media:review:word-example-audio` are scoped review packets for exact card audio identity and listening QA on the selected cards. They do not prove full-level media completeness or prove that an example sentence is natural. Full-level media completeness must come from `deck:ready -- --levels=<level>` and the relevant policy audits, such as `data:audit:audio -- --json` and `data:audit:stroke-order -- --json` for kanji media.

The release audio policy requires:

- VOICEVOX Nemo
- pinned release speaker `女声1`, style id `10005`
- local engine reachable at `http://127.0.0.1:50021`
- host `127.0.0.1:50021` mapped to Nemo container port `50121`
- explicit source, voice, locale, and category provenance
- one release audio source
- no remote-audio release provider

Generated audio must pass review before release.
