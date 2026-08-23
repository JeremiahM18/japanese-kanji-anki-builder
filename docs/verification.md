# Verification

Run these checks before merging changes that affect decks, contracts, media, generated artifacts, CI, release behavior, or documentation claims.

Benchmark budget commands are manual/local performance guardrails, not GitHub Actions CI gates, because timing budgets depend on runner hardware and the build benchmark requires a ready local workspace.

## Testing philosophy

- [../test/repositoryGovernance.test.js](../test/repositoryGovernance.test.js) protects source-of-truth boundaries, README/source-lane consistency, CI contract names, supply-chain policy, CODEOWNERS coverage, and source-evidence routing.
- [../test/documentationStatusAudit.test.js](../test/documentationStatusAudit.test.js) and `npm run docs:status-audit` compare tracked documentation status language against current review counts, generated denominators, npm command routing, and lane-boundary rules so stale README, CHANGELOG, CLAUDE, workflow, command-reference, architecture, and overview claims fail before another review batch lands.
- The tracked [../examples/n5-mini](../examples/n5-mini) fixture locks exact generated TSV rows against the live note schemas so schema or export drift is visible immediately.
- Candidate is a pre-trust workflow input, not a certification lane.
- Gold regression protects generated card output from drift.
- Native Sapphire gates check current structural evidence. Platinum gates check current card-surface inspection evidence after the structural lane.
- Obsidian proof records substantive current-version rereview.
- GitHub CodeQL scans JavaScript/TypeScript source and GitHub Actions workflow code in CI; there is no local npm equivalent for that hosted code-scanning upload gate.
- Tagged release workflows create GitHub artifact attestations for release-bundle provenance and SBOM binding; there is no local npm equivalent for the hosted Sigstore-backed attestation upload gate.
- [../test/hostileInputSecurity.test.js](../test/hostileInputSecurity.test.js) keeps adversarial parser, Anki HTML, media path, generated-output cleanup, Docker-helper, and supply-chain mutation fixtures explicit inside `npm test`.
- [../test/cliFailClosedArgs.test.js](../test/cliFailClosedArgs.test.js) requires every script-level `parseArgs` surface to reject or explicitly collect unknown arguments; operational commands must not continue after a misspelled or unsupported option.

## Standard gate bundle

```bash
npm test
npm run lint
npm run typecheck
npm run docs:status-audit
npm run supply-chain:audit
npm run security:advisories
npm run security:branch-protection
npm run security:github-settings:auth
npm run security:licenses
npm run security:requirements
npm run security:release-trust:pre
npm run security:release-trust
npm run security:sdlc-metrics
npm run security:secrets
npm run security:sbom
npm run perf:memory:matrix
npm run data:audit:jlpt
npm run data:audit:jlpt:sources -- --governance-strict --limit=25
npm run data:audit:jlpt:source-levels -- --worklist-only --limit=25
npm run deck:kanji:partition-plan -- --limit=25
npm run deck:kanji:review-status
npm run deck:ready -- --levels=<level>
npm run data:audit:jlpt:source-access
npm run data:benchmark:jlpt:sources -- --source=<source-id> --repeat=2 --limit=10
npm run data:benchmark:jlpt:sources:gate -- --source=<source-id> --repeat=2 --limit=10
npm run data:audit:jlpt:official-occurrences -- --strict
npm run data:audit:jlpt:source-inputs -- --source=tanos_legacy_direct --strict
npm run data:audit:jlpt:source-inputs -- --source=tanos_estimated_split --strict
npm run data:audit:jlpt:source-inputs -- --source=kanjidic2_legacy --strict
npm run data:packet:jlpt:source-review -- --source=<source-id> --limit=25
npm run data:packet:jlpt:source-access -- --source=<source-id> --surface-type=<surface-type> --title="<surface title>" --citation="<source citation>" --evidence-ref="<source reference>" --notes="<exact assignment proof>"
npm run data:merge:jlpt:source-batch -- --source=<source-id> --batch=<ignored-batch.tsv>
npm run data:pin:jlpt:source-input -- --source=<source-id> --reason="<review milestone reason>"
npm run data:audit:jlpt:words
npm run deck:words:level-anchor-audit -- --level=5
npm run data:audit:audio -- --json
npm run data:audit:stroke-order -- --json
npm run deck:review:accessibility -- --deck-kind=kanji
npm run deck:review:accessibility -- --deck-kind=word
npm run deck:review:accessibility -- --deck-kind=kanji --levels=<levels> --run-id=<release-candidate-id>
npm run deck:review:accessibility -- --deck-kind=word --levels=<levels> --run-id=<release-candidate-id>
npm run product:artifacts:n5
npm run product:artifacts:kanji:n5:preflight
npm run product:artifacts:kanji:n5
npm run product:artifacts:kanji:n4:preflight
npm run product:artifacts:kanji:n4
npm run product:artifacts:kanji:n3:preflight
npm run product:artifacts:kanji:n3
npm run product:artifacts:kanji:all
npm run product:artifacts:kanji:release-qa
npm run product:release-qa:evidence
npm run product:release-qa:apkg-inspect -- --packet=out/release-qa/release-qa-evidence.json --artifact-dir=<candidate-package-directory> --require-golden
npm run product:readiness:n5
npm run release:gate
```

## Focused verification planning

Use `npm run verify:focused -- --deck=<word|kanji> --lane=<selector> --level=<level>` to plan an inner-loop check set for a specific certification lane or support work area. The certification lane order is Silver, Gold, Sapphire, Platinum, Obsidian. Discovery/intake, NLP, source governance, media/audio, release, and ops selectors are work areas, not certification lanes; discovery is not required before every batch. The command is read-only. It prints live git posture, changed-file risk, focused commands, mapped focused tests, changed-file-specific commands, the full merge gate, and the source-of-truth docs behind the boundaries.

Focused verification does not run commands, certify cards, approve source truth, write proof ledgers, edit templates, replace Gold/Sapphire/Platinum/Obsidian gates, replace release QA, shrink denominators, hide expected backlog, or replace the full merge gate before commit, merge, or release claims.

Scoped `npm test` runs are available for focused feedback only:

- `npm test -- --scope=ci-release`
- `npm test -- --scope=docs-governance`
- `npm test -- --scope=kanji-lanes`
- `npm test -- --scope=media-audio`
- `npm test -- --scope=nlp`
- `npm test -- --scope=obsidian-proof`
- `npm test -- --scope=performance`
- `npm test -- --scope=source-evidence`
- `npm test -- --scope=word-lanes`

Every discovered `test/*.test.js` file must belong to at least one focused scope; [../test/runNodeTestsScript.test.js](../test/runNodeTestsScript.test.js) fails if a test is omitted. The full `npm test` command remains part of the full merge gate because focused scopes intentionally overlap and do not replace full-suite execution.

### Runner integrity and child-process failures

The full suite intentionally exercises real Node, Git, Python, APKG packaging,
and other child-process boundaries. A restricted Windows runner can deny those
processes with errors such as `spawnSync EPERM` or prevent package construction
even when the implementation is correct. Treat every such result as nonzero
evidence, not as a pass and not automatically as an engineering regression.

The required resolution is to preserve the exact first command, exit status,
and failing tests, then rerun the complete, unmodified `npm test` command on a
supported host that permits the required child processes. Report both results.
A passing supported-host rerun qualifies the first result as an environment
limitation; it does not erase it. Focused retries may help classify the failure,
but they do not replace the complete suite.

Never add skips, mocks, silent fallbacks, weaker assertions, smaller scopes, or
reduced denominators merely to make an incapable runner appear green. A runner
that cannot execute the declared test contract must be changed or bypassed in
favor of a capable host; the product and verification standards remain intact.

## Workspace side-effect and vault validation

Use the two-phase ignored/local side-effect audit around commands whose generated-output behavior matters:

```bash
npm run audit:workspace-side-effects -- --write-baseline=out/workspace-side-effects/<run-id>.json
<command under review>
npm run audit:workspace-side-effects -- --baseline=out/workspace-side-effects/<run-id>.json
```

Baselines are immutable and confined under `out/workspace-side-effects/`. `--allow=<prefixes>` must name explicit paths inside the governed roots. The policy SHA-256 hashes compact governed `data/`, `downloads/`, and CI/release-fixture files while high-volume `cache/` and generated `out/` files use size plus mtime metadata. Unreadable files/directories, missing roots, and skipped symlinks are reported as coverage limitations rather than silently omitted. A `pass-with-limitations` result proves no unexpected visible change; it does not prove inaccessible content was unchanged.

Validate the external Kanji Builder vault project read-only with:

```bash
npm run vault:validate -- --vault="<absolute Kanji Builder vault project path>" --max-age-days=14
```

This checks YAML/frontmatter shape, current-note commit binding and freshness, real calendar dates, Markdown structure, duplicate titles/basenames, wikilinks, registered npm command references, contained repository-path references, and high-confidence secret shapes. Historical snapshots retain their original verification dates without stale-current warnings. Scoped `AGENTS.md` and `CLAUDE.md` AI instruction contracts are excluded from note/frontmatter and duplicate-basename validation, matching the vault-wide validator's explicit contract-file boundary; ordinary Markdown notes are never exempted. This does not certify lane content or make vault notes repository authority.

## Product artifact gates

`product:artifacts:n5` builds a fresh N5 word TSV from tracked templates only. It disables network inference, excludes ignored local `data/` word, sentence, JLPT, cache, and media inputs, validates schema, checks canonical row counts, enforces canonical-only governance, and repeats output generation for determinism.

It does not certify tracked-source kanji TSVs, `.apkg` files, managed media packages, or manual QA.

`product:artifacts:kanji:n5:preflight`, `product:artifacts:kanji:n4:preflight`, and `product:artifacts:kanji:n3:preflight` inspect tracked templates and report whether N5, N4, or N3 kanji source availability is sufficient for tracked-source kanji TSV certification without ignored local `data/` inputs. N5, N4, and N3 currently report `certifiable: yes` because JLPT level, starter meanings, component/radical data, KANJIDIC2 on/kun reading reference, and level-specific card-field source provenance are tracked and audited. `product:artifacts:kanji:preflight` runs the check across N5 through N1 and fails closed where governed card-field source contracts are missing.

`product:artifacts:kanji:n5`, `product:artifacts:kanji:n4`, and `product:artifacts:kanji:n3` build fresh source-derived kanji TSVs from tracked contracts only: JLPT level, KANJIDIC2 reading-reference, level-specific card-field source provenance, and component/radical data. They validate the kanji note schema header, row count, required learner-facing fields, primary-reading reference membership, and deterministic repeated output. They do not read ignored local `data/`, use network inference, package `.apkg` files, or certify media/manual QA.

`product:artifacts:kanji:all` runs the same tracked-source kanji TSV gate across N5 through N1. Today N5, N4, and N3 pass and write TSV artifacts; N2 and N1 fail closed on missing governed card-field source contracts. That failure is expected until each level has a source-derived field contract in the existing governance lane.

`deck:review:accessibility` reads the legacy shared kanji or word package root when `--run-id` is omitted. For release-candidate or parallel builds, pass the exact build `--run-id` and `--levels`; the command then reads only `out/run-outputs/<run-id>/<deck-kind>-n*/package/`. It rejects mismatched package-summary `rootDir`/`exportsDir` fields and symbolic-link escapes so a selected candidate cannot silently audit another build. `--out-dir-base` is allowed only with `--run-id` and must still resolve inside a governed generated-output root.

`product:release-qa:evidence` validates packet version 3 copied from [../templates/release_qa_evidence_packet.template.json](../templates/release_qa_evidence_packet.template.json). It binds package version, `v*` tag, full lowercase current-HEAD commit, release class, candidate run, unique deck kinds, and exactly one APKG per deck kind. Every APKG declares canonical levels, isolated local path, unique portable release basename, note/card/media counts, positive byte size, and lowercase SHA-256. Automated and artifact-QA evidence must bind to the same commit. Production permits only passed artifact QA. An automation-reviewed preview must be a semantic prerelease distributed as a GitHub prerelease with the exact warning label and may use `accepted-risk` only under `PROD-REL-001` for governed limitations. Source posture and explicit empty blockers remain mandatory. `--artifact-dir=<dir> --expected-tag=<tag>` switches verification to downloaded release assets and rejects missing or undeclared files.

`product:release-qa:apkg-inspect` reads the packet and independently inspects each APKG from `--artifact-dir`. It rejects unsafe, duplicate, encrypted, or corrupt ZIP members; noncanonical media maps or archive membership; SQLite integrity/schema/version failures; deck-name/count drift; note field-count or GUID failures; broken card references; and unresolved media references. Release evidence must add `--require-golden`, which also checks every packaged note and learner-facing field against the tracked full-level kanji or exact `written|reading` word Golden manifest and rejects missing, duplicate, unmatched, or extra rows. This still does not prove native Anki rendering, mobile behavior, screen-reader interaction, listening naturalness, or stroke-order visual correctness.

`product:artifacts:kanji:release-qa` is the strict production/GA gate. It checks tracked-source TSV prerequisites and blocks until actual APKG approval, managed stroke-order/audio media QA, manual import, mobile, screen-reader, and listening QA are recorded. It is intentionally not weakened for automation-reviewed previews; those previews use packet-v3 accepted-risk evidence without claiming this strict gate passed.

Use `-- --require-certifiable` when the tracked source contracts are expected to be complete and the command should fail closed on any missing governed source lane.

Tracked CI tests must not read ignored root `data/*` inputs. Use tracked contracts, tracked fixtures, or explicit temp fixtures in CI. Exact kanji primary-reading checks against generated `OnReading`/`KunReading` remain in local generated-row Sapphire gates; the tracked KANJIDIC2 contract is reading-reference evidence only, and the tracked N5/N4/N3 card-field source contracts are source-provenance evidence only.

`product:readiness:n5` runs the current local-data N5 product checkpoint: JLPT audits, governed audio provenance, tracked-source N5 word TSV generation, tracked-source N5 kanji TSV generation, N5 word-level placement audit, and N5 kanji and word Gold regression checks. `npm run product:readiness:n5 -- --tracked-only` is the clean-hosted companion: it derives only the runtime level map from the tracked JLPT contract, redirects every ignored input/output path into an isolated temporary workspace, runs the six checks that can be reproduced from tracked inputs, and deletes the workspace. It explicitly does not claim workstation-local media provenance or regenerated local Gold; the tagged workflow obtains full-level Golden regression directly from the exact downloaded APKGs via `product:release-qa:apkg-inspect -- --require-golden`.

It does not run or gate on the JLPT kanji source-evidence audit yet. That audit is read-only transparency until taxonomy confidence is governed and passing. It also does not replace the all-level tracked-source kanji gate, `.apkg` artifacts, manual Anki import review, mobile behavior, screen-reader behavior, or listening QA.

## JLPT source-evidence gates

`data:audit:jlpt:sources` audits the operational JLPT kanji contract against the independent source-evidence registry. It computes external source consensus from active voting sources that are legally/use-policy allowed to store assignment judgments, then compares the current operational contract against that consensus.

Frequency, background, occurrence, methodology, operational, derived, blocked, and `needs_review` lanes do not vote in the current assignment-consensus engine.

Use `--governance-strict` when CI should fail only on source-use, license, reference-integrity, illegal consensus-use, declared-mismatch, or storage-governance regressions while evidence-depth work is incomplete. Full `--strict` still fails until missing independent/Japanese-published evidence, disputes, and contract/consensus mismatches are resolved.

For `data:audit:jlpt:word-sources`, an explicit `--level` or `--levels` also scopes the top-level denominator and strict result to every exact identity in the selected operational word contract. Dictionary identity and positive commonness are separate mandatory policy gates when enabled. They require explicit reviewed support claims and do not count as JLPT-placement sources or lineages. `--governance-strict` may therefore exit zero while the report still says overall and evidence-depth failing; preserve all three results.

The report includes per-contract-level confidence counts, missing/disagreement work-queue counts, missing Japanese-published source counts, publisher-independence groups, and disputed vote-weight samples. It does not change the active contract or any decks.

`data:audit:jlpt:source-levels` is a read-only companion audit for source-claimed level deltas. It reports current contract counts, active source-candidate counts, source-consensus counts, per-source claim counts, missing source candidates, missing source-consensus rows, disputed missing candidates, current-level rows whose source consensus points elsewhere, and current-level rows without same-level source support.

Add `--worklist` to append an all-level source-lane batch packet, or `--worklist-only` to show only that packet. This command is informational only: it does not move kanji, move words, update decks, or change readiness.

`deck:kanji:partition-plan` converts the source-level delta audit into a read-only kanji product plan: five core logical decks plus five `additional_unverified_Nx` logical decks. It does not move contracts, generate decks, import evidence, or change readiness.

`deck:kanji:review-status` reports generated, Gold, active native Sapphire structural coverage, Platinum coverage, non-certifying revalidation backlog/history, and structured verification-limitation counts for the five core kanji decks and five `additional_unverified_Nx` decks. It also fails on unresolved duplicate additional source claims.

`deck:kanji:additional:ready` builds the additional-kanji source-claim diagnostic and any selected optional additional-unverified TSV/APKG output. It does not move the core JLPT contract or certify source-evidence confidence.

`data:audit:jlpt:source-access` ranks source lanes before another manual textbook batch is generated. It combines all-level source-review pressure with the source-use manifest, tracked source-input config, local worksheet existence, tracked assignment counts, and worksheet status counts.

Occurrence-only, derived, background, frequency, blocked, and non-Japanese lanes are reported, but they are not replacements for Japanese-published assignment evidence.

`data:audit:jlpt:source-ocr-intake` inventories ignored private source scans and checks local OCR prerequisites before a purchased-book source review. It is read-only and does not extract evidence, import assignments, move kanji, move words, or change readiness.

`data:benchmark:jlpt:sources` is a read-only cost report for the JLPT kanji source-evidence workflow. It measures evidence-manifest load, source-input preflight, source-input import dry-run/materialization, full evidence-manifest serialization, source-evidence audit timing, and process memory snapshots.

Memory deltas are process snapshots, not allocation-profiler output. Use repeated runs for trends. `data:benchmark:jlpt:sources:gate` is a manual budget guardrail, not CI.

## Performance and memory matrix

`perf:memory:matrix` validates [../templates/performance_memory_audit_matrix.json](../templates/performance_memory_audit_matrix.json), the tracked contract for performance, memory, package, and smoke lanes. It checks that package scripts exist, manual/local timing budget gates are not wired into GitHub Actions, CI-backed package lanes are wired where declared, and present memory-sampling lanes name a real implementation file.

The matrix is CI-safe metadata validation. It does not run timing benchmarks, read ignored local data, build product decks, certify Obsidian proof, or claim release readiness.

Current manual/local timing budget gates:

```bash
npm run data:benchmark:jlpt:sources:gate -- --source=<source-id> --repeat=2 --limit=10
npm run bench:obsidian-proof-etl:gate
npm run bench:build:gate
npm run bench:build:cold-apkg:gate
```

The word multi-lane status path has a separate manual diagnostic with no timing budget:

```bash
npm run bench:word-multi-lane-status -- --level=4 --repeat=3
```

It measures one read-only process that shares only deep-frozen loaded inputs and read-only indexes while independently evaluating Silver, Gold, Sapphire, Platinum, and Obsidian. Its lane result remains fail-closed, including expected backlog. It does not replace any owning lane command, share approval, change a budget, certify proof, or make a release claim.

Before changing a timing budget, raising a performance claim, or calling a close run stable, run the benchmark gate standalone, append `--repeat=3` to the relevant command, and keep the same machine, runtime, cache mode, and input boundary. The matrix records this as the minimum repeat-evidence rule; a single passing run is enough for the gate result, but not enough to change the budget standard. Do not run timing-budget commands in parallel with tests, audits, builds, or other IO-heavy work.

For benchmark report triage, `--summary` emits compact JSON timing/accounting output and `--keys-only` emits report shape without large nested payloads. These modes do not change measured work, budget evaluation, repeat requirements, cache mode, output roots, or fail/pass behavior.

Current memory-sampled benchmark lanes report process snapshots for trend analysis only:

- `data:benchmark:jlpt:sources:gate` samples source-governance stages and the whole source-evidence cost report.
- `bench:obsidian-proof-etl:gate` samples ledger validation, compatibility-view generation, SQLite mirror generation, and the whole ETL run.
- `bench:build:gate` runs a warmup first, then samples the whole measured hot-cache build and the package stage.
- `bench:build:cold-apkg:gate` samples the same build/package surfaces while clearing the generated APKG cache before the measured run, and its budget gate is scoped to the package phase so export/media-sync jitter does not mask the cold native APKG path.
- `bench:word-multi-lane-status` samples the complete word status process and reports timing plus process memory. It is diagnostic-only and preserves independent lane evaluation and nonzero backlog status.

Process memory snapshots are not allocation-profiler output and can be noisy under garbage collection. The current matrix policy keeps memory thresholds as trend-only until repeated samples identify a stable regression-sensitive metric, a concrete failure mode, and a rollback path.

## Source packet and import gates

`data:packet:jlpt:source-review` emits a compact read-only JSON packet for AI or human source-review planning. It filters the all-level governed source worklist for the selected lane's supported levels, skips rows already resolved in that lane's local worksheet, and includes compact source-input status and blocker reason.

The packet is planning context only. It does not create source-access proof, import evidence, move kanji, move words, update decks, or change readiness.

`data:packet:jlpt:source-access` writes an ignored JSON packet that records the exact source surface behind a large manual source-review session. Use it before generating `100+` all-level source-review rows and before merging a batch with `100+` importable `reviewed` rows.

The packet is not evidence and is not imported. It only proves the batch was scoped from a source surface that can support exact assignment review.

`data:audit:jlpt:official-occurrences` reports the tracked official occurrence manifest without changing decks or assignments. With `--source=<ignored-local.json|tsv>`, it extracts observed kanji from locally extracted official PDF text and emits only minimal occurrence rows: `level`, `sourcePdf`, `section`, `page`, `questionRef`, and `observedKanji`.

PDF extraction must be Unicode-verified and manually reduced to question/page-scoped occurrence rows before writing. Occurrence can support later review, but it is not a complete JLPT kanji list and cannot assign or move a kanji by itself.

`data:audit:jlpt:source-inputs` preflights ignored local source files before they can become source evidence. It verifies source id, source status, license status, SHA-256, byte size, row count, per-row kanji/level validity, review status, citation, and evidence reference.

`reviewed` rows must have valid levels, citations, and evidence references. Blank `needs_review` rows remain pending. Use `source_access_gap` only after permitted source material was checked and exact source-level assignment proof is not available yet.

`data:merge:jlpt:source-batch` merges a small ignored batch worksheet back into the configured ignored source worksheet. It is dry-run by default. Add `--write` only after reviewing changed rows and blockers.

The merge rejects unknown columns, duplicate or missing kanji, batch kanji outside the source worksheet, invalid review statuses, accidental downgrades from `reviewed` back to pending, and large importing batches without a source-access packet.

`data:pin:jlpt:source-input` recomputes SHA-256, byte size, and parsed row count for one configured ignored source worksheet. It updates only those tracked integrity pins plus `checkedAt` when `--write` is supplied.

## Normalization and source templates

`data:normalize:kanjidic2-jlpt` converts an ignored local KANJIDIC2 XML or `.xml.gz` file into the normalized TSV shape required by [../templates/jlpt_kanji_source_inputs.json](../templates/jlpt_kanji_source_inputs.json).

`data:build:kanji-reading-reference` creates the tracked KANJIDIC2 reading-reference contract from ignored local `downloads/kanjidic2.xml.gz`. The output records the raw source SHA-256, KANJIDIC2 database version, included reading types, source-use boundary, and coverage counts. It is reading-reference evidence only; it does not move kanji, verify full card fields, certify cards, or change readiness.

`data:build:kanji-field-source-contract -- --level=<level>` creates a tracked per-level kanji card-field source contract from current-standard Platinum `japanese-source` evidence. N5 uses the legacy path `templates/kanji_card_field_source_contract.json`; other levels use `templates/kanji_card_field_source_contracts/n<level>.json`. The command reads kanji Obsidian proof through the scoped proof-provider path, defaulting to canonical JSONL for migrated levels; levels without a scoped ledger still fall back through the provider path until migrated. The output records the exact card-field values, field-bound source evidence, source IDs, source-origin independence context, rereview binding, and coverage counts. It is `kanji-field-verification` evidence only; it does not move JLPT placement, bulk-copy restricted source data, generate TSVs, certify Obsidian proof, or change release readiness.

`data:normalize:tanos-jlpt-kanji` converts ignored local Tanos source text files into the normalized TSV shape required by [../templates/jlpt_kanji_source_inputs.json](../templates/jlpt_kanji_source_inputs.json). The default lane normalizes only N1/N4/N5 direct legacy base files for `tanos_legacy_direct`; `-- --lane=estimated-split` normalizes only extracted N2/N3 PDF text for `tanos_estimated_split`.

The generated TSVs remain ignored local input until SHA-256, byte size, and row count are pinned. Source imports are dry-run by default and write only with explicit `--write` after preflight passes.

`data:template:jlpt:source-input` creates an ignored worksheet for one selected manual source lane, such as `jlptsensei` or a Japanese-published textbook source. It deliberately leaves `level`, `citation`, and `evidenceRef` blank so no row can become evidence until a reviewer fills permitted source citations, pins TSV integrity, and activates the source intentionally.

Use `--priority=source-review-worklist --limit=<n> --out=<ignored-batch.tsv>` for the default governed batch flow. Broad source-review worklists from `11` to `99` rows require `--source-access-note="<exact source surface reviewed>"`. Unbounded or `100+` row worklists require `--source-access-packet=<ignored-packet.json>`.

Shin Kanzen Master, Nihongo Sou Matome, TRY!, and ASK Hajimete JLPT Kanji remain `manual-citation-only`: review from actual source access, store only reviewer level judgment plus citation/evidenceRef/notes, and do not copy textbook lists or passages.

## Release gates

`release:gate` validates deterministic smoke-fixture artifacts and packaging contracts. It does not certify public product deck readiness. Add level-specific readiness, Gold regression, accessibility, provenance, and manual QA commands for the surface being changed.

For media claims, distinguish the gates clearly:

- `deck:ready -- --levels=<level>` is the full-level media-completeness and package-readiness gate for generated exports.
- `data:audit:audio -- --json` and, for kanji media, `data:audit:stroke-order -- --json` are policy/provenance audits.
- `media:review:audio` and `media:review:word-audio` are scoped review packets for selected cards only. They may support card-level evidence, but they do not prove full-level media completeness.

Clean CI runs `security:licenses`, `security:requirements`, `security:sdlc-metrics`, `data:obsidian:proof:validate`, `data:obsidian:proof:reconcile -- --levels=5,4,3,2`, `data:obsidian:proof:reconcile -- --deck-kind=word --levels=5,4`, `data:obsidian:proof:provider-parity -- --levels=5,4,3,2 --row-source=tracked-review-set`, `data:obsidian:proof:provider-parity -- --consumer=kanji-batch-report --levels=5,4,3,2 --queue=substantive-rereview --limit=8 --row-source=tracked-review-set`, `data:obsidian:proof:provider-parity -- --consumer=kanji-platinum-level --levels=5,4,3,2 --row-source=tracked-review-set`, `data:obsidian:proof:provider-parity -- --consumer=kanji-field-source-contract --levels=5,4,3,2 --row-source=tracked-review-set`, `data:obsidian:proof:provider-parity -- --consumer=platinum-governance-gate --levels=5,4,3,2 --row-source=tracked-review-set`, `data:obsidian:proof:provider-parity -- --consumer=word-rereview-status --deck-kind=word --levels=5,4 --row-source=tracked-review-set`, `data:obsidian:proof:provider-parity -- --consumer=word-certify-status --deck-kind=word --levels=5,4 --row-source=tracked-review-set`, `data:obsidian:proof:provider-parity -- --consumer=word-batch-report --deck-kind=word --levels=5,4 --queue=substantive-rereview --limit=8 --row-source=tracked-review-set`, `data:obsidian:proof:provider-parity -- --consumer=word-platinum-level --deck-kind=word --levels=5,4 --row-source=tracked-review-set`, `data:obsidian:proof:provider-parity -- --consumer=word-governance-inputs --deck-kind=word --levels=5,4 --row-source=tracked-review-set`, `perf:memory:matrix`, `data:audit:jlpt -- --strict --tracked-only`, `data:audit:jlpt:sources -- --governance-strict --limit=25`, `data:audit:jlpt:words`, and `deck:words:platinum:source-posture -- --levels=5,4` from tracked inputs.

Full `data:audit:jlpt`, `deck:platinum:governance-gate`, and generated-row Obsidian proof-provider parity remain local-data gates because they validate ignored runtime/generated-row inputs under `data/`. Their absence from clean CI is a release-scope limitation, not proof that real generated rows were validated.

The CI source-boundary guard rejects tracked tests that read ignored root `data/*` paths. Local-data gates can still validate live generated rows in a prepared workstation, but they must stay explicit release QA rather than becoming hidden CI truth.
