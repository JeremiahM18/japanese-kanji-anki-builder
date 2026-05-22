# Command Reference

This reference lists the npm commands exposed by the repository and the role each command plays.

For workflow ordering, use [workflows.md](workflows.md). For release gate boundaries, use [release-process.md](release-process.md) and [verification.md](verification.md).

| Command | Purpose |
| --- | --- |
| `npm test` | Run the full test suite |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run the staged JSDoc typecheck gate |
| `npm run supply-chain:audit` | Verify lockfile registry/integrity, reviewed install-script packages, pinned GitHub Actions, workflow permissions, and release artifact boundaries |
| `npm run bench:export` | Measure export-service performance for local regression investigation |
| `npm run bench:build:gate` | Manual local-data build performance guardrail; requires a ready workspace and writes benchmark output |
| `npm run ci:smoke` | Build deterministic smoke artifacts |
| `npm run release:gate` | Validate smoke-fixture release artifact contracts |
| `npm run product:artifacts:n5` | Build and validate the tracked-source N5 word TSV artifact |
| `npm run product:artifacts:kanji:n5:preflight` | Report whether tracked-source N5 kanji TSV certification is possible |
| `npm run product:readiness:n5` | Run the automated N5 product readiness checkpoint |
| `npm run dev` | Start the local development server with `nodemon` |
| `npm start` | Start the local Express server; equivalent to `npm run start` |
| `npm run doctor` | Check setup, coverage, readiness, and next steps |
| `npm run doctor:voicevox` | Verify local governed VOICEVOX setup |
| `npm run voicevox:status` | Inspect the local VOICEVOX Docker container and required host-to-container port mapping |
| `npm run voicevox:start` | Start the governed local VOICEVOX Docker container when it already has the required port mapping |
| `npm run voicevox:start:fresh` | Recreate the local VOICEVOX Docker container with local host `127.0.0.1:50021` mapped to container `50121` when the old container shape is wrong |
| `npm run voicevox:stop` | Stop the local VOICEVOX Docker container after governed audio work |
| `npm run deck:readiness` | Report per-level quality gates |
| `npm run deck:preview` | Preview kanji cards |
| `npm run deck:platinum:batch -- --level=5 --limit=12` | Build a read-only kanji review packet for the selected queue |
| `npm run deck:package` | Build package artifacts through the Node artifact wrapper |
| `npm run deck:kanji:surface-audit` | Audit generated kanji deck surface details before review or release claims |
| `npm run deck:kanji:partition-plan` | Report core/additional kanji partition decisions and duplicate-claim handling |
| `npm run deck:kanji:obsidian:rereview-status -- --levels=5,4` | Classify kanji Platinum pass versus Obsidian proof |
| `npm run deck:kanji:obsidian:certify-status -- --levels=5,4` | Fail-closed kanji Obsidian certification status |
| `npm run deck:ready` | Build and package kanji TSV artifacts |
| `npm run deck:apkg` | Build kanji `.apkg` artifacts |
| `npm run deck:kanji:additional:ready` | Build the separate optional additional-unverified kanji TSV/APKG surface |
| `npm run deck:kanji:review-status` | Report core/additional kanji generated, Gold, Platinum, revalidation backlog, and duplicate-claim status |
| `npm run deck:review:n5` | Run the N5 kanji Gold regression benchmark |
| `npm run deck:review:n4` | Run the N4 kanji Gold regression benchmark |
| `npm run deck:review:n3` | Run the N3 kanji Gold regression benchmark |
| `npm run deck:review:n2` | Run the N2 kanji Gold regression benchmark |
| `npm run deck:review:n1` | Run the N1 kanji Gold regression benchmark |
| `npm run deck:kanji:additional:review:n5` | Run the additional-unverified N5 kanji Gold regression benchmark |
| `npm run deck:kanji:additional:review:n4` | Run the additional-unverified N4 kanji Gold regression benchmark |
| `npm run deck:kanji:additional:review:n3` | Run the additional-unverified N3 kanji Gold regression benchmark |
| `npm run deck:kanji:additional:review:n2` | Run the additional-unverified N2 kanji Gold regression benchmark |
| `npm run deck:kanji:additional:review:n1` | Run the additional-unverified N1 kanji Gold regression benchmark |
| `npm run deck:kanji:additional:platinum:n5` | Run the additional-unverified N5 kanji Platinum gate |
| `npm run deck:kanji:additional:platinum:n4` | Run the additional-unverified N4 kanji Platinum gate |
| `npm run deck:kanji:additional:platinum:n3` | Run the additional-unverified N3 kanji Platinum gate |
| `npm run deck:kanji:additional:platinum:n2` | Run the additional-unverified N2 kanji Platinum gate |
| `npm run deck:kanji:additional:platinum:n1` | Run the additional-unverified N1 kanji Platinum gate |
| `npm run deck:review:coverage` | Audit Gold regression coverage |
| `npm run deck:review:accessibility` | Report automated accessibility checklist status for kanji or word decks |
| `npm run deck:platinum:governance-gate` | Run the local-data Platinum governance gate against real generated N5/N4 rows before release claims that depend on those rows |
| `npm run deck:platinum:n5` | Run the N5 kanji Platinum gate |
| `npm run deck:platinum:n4` | Run the N4 kanji Platinum gate |
| `npm run deck:platinum:n3` | Run the N3 kanji Platinum gate |
| `npm run deck:platinum:n2` | Run the N2 kanji Platinum gate |
| `npm run deck:platinum:n1` | Run the N1 kanji Platinum gate |
| `npm run deck:words:ready` | Build and package word TSV artifacts |
| `npm run deck:words:apkg` | Build word `.apkg` artifacts |
| `npm run deck:words:platinum:batch -- --level=5 --limit=8` | Build a read-only word review packet for the selected queue |
| `npm run deck:words:review:n5` | Run the N5 word Gold regression benchmark |
| `npm run deck:words:review:n4` | Run the N4 word Gold regression benchmark |
| `npm run deck:words:platinum:n5` | Run the N5 word Platinum gate |
| `npm run deck:words:platinum:n4` | Run the N4 word Platinum gate |
| `npm run deck:words:obsidian:rereview-status -- --levels=5,4` | Classify word Platinum pass versus Obsidian proof |
| `npm run deck:words:obsidian:certify-status -- --levels=5,4` | Fail-closed word Obsidian certification status |
| `npm run deck:words:platinum:source-posture -- --levels=5,4` | Classify active word Platinum source-family independence posture |
| `npm run deck:words:level-anchor-audit -- --level=5` | Fail when canonical word rows lack a current-level kanji anchor or later all-easier-kanji placement lacks learner-fit rationale |
| `npm run deck:words:completion:n5` | Audit N5 word inventory and reading coverage |
| `npm run deck:words:completion:n4` | Audit N4 word inventory and reading coverage |
| `npm run deck:words:completion:n3` | Audit N3 word Silver inventory and reading coverage |
| `npm run deck:words:completion:n2` | Audit N2 word Silver inventory and reading coverage |
| `npm run deck:words:completion:n1` | Audit N1 word Silver inventory and reading coverage |
| `npm run deck:words:reading-audit:n4` | Audit N4 word reading coverage |
| `npm run deck:words:reading-audit:n5` | Audit N5 word reading coverage |
| `npm run deck:words:reading-audit:n3` | Audit N3 word reading coverage |
| `npm run deck:words:reading-audit:n2` | Audit N2 word reading coverage |
| `npm run deck:words:reading-audit:n1` | Audit N1 word reading coverage |
| `npm run deck:words:triage:n4` | Classify N4 word reading gaps |
| `npm run deck:words:triage:n5` | Classify N5 word reading gaps |
| `npm run deck:words:triage:n3` | Classify N3 word reading gaps |
| `npm run deck:words:triage:n2` | Classify N2 word reading gaps |
| `npm run deck:words:triage:n1` | Classify N1 word reading gaps |
| `npm run deck:words:gap-plan:n5 -- --limit=50` | Rank the next N5 word coverage or enhancement batch |
| `npm run deck:words:gap-plan:n4 -- --limit=50` | Rank the next N4 word coverage batch |
| `npm run deck:words:gap-plan:n3 -- --limit=50` | Rank the current N3 word gap queue; generated candidate suggestions remain separate from source activation and review |
| `npm run deck:words:gap-plan:n2 -- --limit=50` | Rank the current N2 word gap queue; generated candidate suggestions remain separate from source activation and review |
| `npm run deck:words:gap-plan:n1 -- --limit=50` | Rank the current N1 word gap queue; generated candidate suggestions remain separate from source activation and review |
| `npm run deck:words:expansion-candidates:n4 -- --limit=50` | Diff the manifest-pinned level source into read-only word expansion candidates |
| `npm run deck:words:expansion-candidates:n5 -- --limit=50` | Diff the manifest-pinned N5 source into read-only word expansion candidates |
| `npm run data:normalize:tanos-jlpt-words -- --level=3` | Normalize ignored Tanos N3 extracted vocabulary text into the pinned local source TSV |
| `npm run deck:words:expansion-candidates:n3 -- --limit=50` | Diff the manifest-pinned Tanos N3 candidate-discovery source into read-only word expansion candidates |
| `npm run data:normalize:tanos-jlpt-words -- --level=2` | Normalize ignored Tanos N2 Mnemosyne English and hiragana exports into the pinned local source TSV |
| `npm run deck:words:expansion-candidates:n2 -- --limit=50` | Diff the manifest-pinned Tanos N2 candidate-discovery source into read-only word expansion candidates |
| `npm run data:normalize:tanos-jlpt-words -- --level=1` | Normalize ignored Tanos N1 Mnemosyne English and hiragana exports into the pinned local source TSV |
| `npm run deck:words:expansion-candidates:n1 -- --limit=50` | Diff the manifest-pinned Tanos N1 candidate-discovery source into read-only word expansion candidates |
| `npm run deck:words:expansion-support -- --levels=5,4,3,2,1` | Run governed NLP expansion support for selected word levels and finish with artifact validation plus the NLP governance gate |
| `npm run deck:words:expansion-support:n5` | Run governed NLP expansion support for N5 word expansion/review |
| `npm run deck:words:expansion-support:n4` | Run governed NLP expansion support for N4 word expansion/review |
| `npm run deck:words:expansion-support:n3` | Run governed NLP expansion support for N3 word expansion/review |
| `npm run deck:words:expansion-support:n2` | Run governed NLP expansion support for N2 word expansion/review |
| `npm run deck:words:expansion-support:n1` | Run governed NLP expansion support for N1 word expansion/review |
| `npm run deck:kanji:nlp-signals -- --levels=5,4` | Run governed kanji-card NLP signal support for selected kanji levels without invoking word expansion lanes |
| `npm run deck:kanji:nlp-signals:n5` | Run governed kanji-card tokenization signals, review packets, draft notes, validation, and NLP governance for N5 kanji |
| `npm run deck:kanji:nlp-signals:n4` | Run governed kanji-card NLP signal support for N4 kanji |
| `npm run deck:kanji:nlp-signals:n3` | Run governed kanji-card NLP signal support for N3 kanji |
| `npm run deck:kanji:nlp-signals:n2` | Run governed kanji-card NLP signal support for N2 kanji |
| `npm run deck:kanji:nlp-signals:n1` | Run governed kanji-card NLP signal support for N1 kanji |
| `npm run data:normalize:words:jmdict` | Normalize ignored local JMdict XML into the pinned word dictionary/commonness TSV shape |
| `npm run deck:words:candidate-agreement -- --levels=5,4` | Rebuild the N5/N4 candidate universe from the governed word source manifest with source-purpose, agreement, triage, and placement signals |
| `npm run deck:words:expansion-signals -- --levels=5,4` | Summarize per-level reading and enhancement expansion exhaustion without claiming release readiness |
| `npm run nlp:models:audit` | Validate the assistive-only NLP model registry before model-backed suggestion or draft lanes are trusted |
| `npm run nlp:doctor` | Preflight NLP runtimes, package-lock integrity, installed package metadata, tokenizer dictionaries, pinned model files or directory bundles, and assistive-only release boundaries |
| `npm run nlp:tokenization:generate -- --level=5` | Generate governed assistive-only `kuromoji-js` tokenization artifacts from the generated word TSV |
| `npm run nlp:tokenization:generate -- --deck=kanji --level=5` | Generate governed assistive-only `kuromoji-js` tokenization artifacts from the generated kanji TSV |
| `npm run nlp:tokenization:validate` | Validate governed morphological tokenization artifacts under `out/nlp-tokenization/`; tokenization remains assistive-only and cannot certify cards |
| `npm run nlp:tokenization:audit` | Summarize validated tokenization artifacts into assistive review-packet signals without certifying cards or writing tracked templates |
| `npm run nlp:embeddings:evaluate` | Re-run the tracked Japanese smoke benchmark for the active local embedding model; evaluation remains assistive-only and cannot certify cards |
| `npm run nlp:embeddings:generate -- --level=5` | Generate governed assistive-only word-card embedding artifacts from the generated word TSV |
| `npm run nlp:embeddings:validate` | Validate governed embedding artifacts under `out/nlp-embeddings/`; embeddings remain assistive-only and require an active pinned embedding model before non-empty artifacts pass |
| `npm run nlp:examples:rerank -- --level=5` | Generate assistive example-reranking suggestions from generated word rows, sentence corpus candidates, and validated word-card embeddings |
| `npm run nlp:sense-fit:audit -- --level=5` | Generate assistive sense-fit warning suggestions for possible meaning/example/translation alignment risks |
| `npm run nlp:reading-gaps:discover -- --level=5 --include-deferred` | Generate assistive candidate-discovery suggestions from the governed word reading-gap plan without changing gap disposition or card certification |
| `npm run nlp:suggestions:validate` | Validate governed NLP suggestion artifacts under `out/nlp-suggestions/`; artifacts remain assistive-only and require human promotion |
| `npm run nlp:review-packets:generate -- --level=5` | Generate assistive human review packets from validated suggestion artifacts and tokenization audit signals |
| `npm run nlp:review-packets:validate` | Validate governed review packet artifacts under `out/nlp-review-packets/`; packets aggregate signals only and cannot certify cards |
| `npm run nlp:drafts:generate -- --level=5` | Generate governed draft-proposal artifacts from validated model-backed suggestions and review packets without writing tracked templates or certifying cards |
| `npm run nlp:drafts:validate` | Validate governed draft-proposal artifacts under `out/nlp-drafts/`; model-backed drafts must bind to active assistive models and remain human-promotion-only |
| `npm run nlp:governance-gate` | Run the complete NLP fail-closed gate: model manifest audit, tokenization artifact validation, tokenization audit signals, embedding artifact validation, suggestion artifact validation, review packet validation, draft-proposal validation, and runtime/model-artifact preflight |
| `npm run data:audit:jlpt` | Audit local-data kanji taxonomy, starter alignment, and Gold review placement; use `-- --strict --tracked-only` for clean CI tracked-input alignment |
| `npm run data:verify:jlpt` | Verify tracked JLPT inventory contract shape and consistency |
| `npm run data:audit:jlpt:sources -- --governance-strict` | Audit JLPT kanji source evidence and fail only on source-governance regressions while evidence depth remains incomplete |
| `npm run data:audit:jlpt:source-levels -- --worklist-only --limit=10` | Report the focused all-level governed review packet with current level, candidate levels, consensus, vote weights, and resolved source-input worksheet progress without changing decks or readiness |
| `npm run data:audit:jlpt:source-access` | Rank source lanes by governed usefulness and current source-access state before spending another manual review batch |
| `npm run data:audit:jlpt:source-ocr-intake` | Inventory ignored private Shin scan files and OCR prerequisites before purchased-book extraction |
| `npm run data:audit:jlpt:official-occurrences` | Report or extract official JLPT positive occurrence evidence without storing question text or assigning levels |
| `npm run data:benchmark:jlpt:sources:gate -- --source=<source-id>` | Manual source-evidence performance guardrail; fail locally when benchmark timing exceeds configured default budgets |
| `npm run bench:build:gate` | Manual local-data build performance guardrail; requires a ready workspace and writes benchmark output |
| `npm run data:packet:jlpt:source-review -- --source=<source-id> --limit=25` | Emit compact read-only JSON planning rows for the next governed source-review packet |
| `npm run data:pin:jlpt:source-input -- --source=<source-id>` | Pin a reviewed ignored source input with a milestone reason before governed source import |
| `npm run data:audit:jlpt:source-inputs -- --source=tanos_legacy_direct` | Preflight the pinned local Tanos direct legacy normalized source file before source-evidence import |
| `npm run data:audit:jlpt:source-inputs -- --source=tanos_estimated_split` | Preflight the pinned local Tanos estimated N2/N3 normalized source file before source-evidence import |
| `npm run data:audit:jlpt:source-inputs -- --source=kanjidic2_legacy` | Preflight a pinned local JLPT kanji source file before source-evidence import |
| `npm run data:audit:jlpt:source-inputs -- --source=jlptsensei` | Preflight a restricted manual JLPT Sensei source worksheet before source-evidence import |
| `npm run data:packet:jlpt:source-access -- --source=<source-id> --surface-type=<surface-type> --title="<surface title>" --citation="<source citation>" --evidence-ref="<source reference>" --notes="<exact assignment proof>"` | Write an ignored source-access packet required before `100+` all-level source-review generation or merge of `100+` importable reviewed rows |
| `npm run data:merge:jlpt:source-batch -- --source=<source-id> --batch=<ignored-batch.tsv>` | Dry-run merge a reusable local source-decision batch into its full ignored source worksheet without importing evidence or changing decks; pass `--source-access-packet=<ignored-packet.json>` for `100+` importable reviewed rows |
| `npm run data:normalize:kanjidic2-jlpt` | Normalize ignored local KANJIDIC2 XML into the pinned source-input TSV shape |
| `npm run data:normalize:tanos-jlpt-kanji` | Normalize ignored local Tanos N1/N4/N5 base text files into the pinned source-input TSV shape |
| `npm run data:normalize:tanos-jlpt-kanji -- --lane=estimated-split` | Normalize ignored local Tanos N2/N3 estimated PDF text into the pinned source-input TSV shape |
| `npm run data:import:jlpt:source-input -- --source=tanos_legacy_direct` | Dry-run import of the passing Tanos direct legacy source input into the JLPT kanji source-evidence manifest |
| `npm run data:import:jlpt:source-input -- --source=tanos_estimated_split` | Dry-run import of the passing Tanos estimated N2/N3 source input into the JLPT kanji source-evidence manifest |
| `npm run data:import:jlpt:source-input -- --source=kanjidic2_legacy` | Dry-run import of a passing source input into the JLPT kanji source-evidence manifest |
| `npm run data:import:jlpt:source-input -- --source=<source-id> --full-rematerialize` | Intentionally rebuild every materialized kanji rollup entry after source policy, source config, or materialization logic changes |
| `npm run data:template:jlpt:source-input -- --source=jlptsensei --level=5` | Create an ignored manual-review worksheet for a restricted JLPT kanji source lane |
| `npm run data:template:jlpt:textbook-source -- --source=<source-id> --priority=source-review-worklist --limit=10 --out=<ignored-batch.tsv>` | Create or overwrite one reusable ignored all-level manual-review batch for a Japanese-published textbook source lane |
| `npm run data:template:jlpt:textbook-source -- --source=<source-id> --priority=source-gaps --limit=10 --out=<ignored-batch.tsv>` | Create or overwrite one reusable ignored manual-review batch for a Japanese-published textbook source lane ordered by current source-evidence blockers |
| `npm run data:template:jlpt:textbook-source -- --source=<source-id> --priority=source-level-deltas --source-level=5 --limit=10 --out=<ignored-batch.tsv>` | Create or overwrite one reusable ignored manual-review batch for active source-claimed deltas outside the current operational contract |
| `npm run data:template:jlpt:textbook-consensus -- --source=<source-id>` | Create a governed textbook-consensus source worksheet using the shared template generator |
| `npm run data:audit:jlpt:words` | Audit word taxonomy and starter alignment |
| `npm run data:audit:audio` | Audit managed audio provenance |
| `npm run data:audit:stroke-order` | Audit governed stroke-order source policy and managed media posture |
| `npm run data:sync:jlpt` | Sync local ignored JLPT data to the tracked contract |
| `npm run corpus:init` | Create or merge sentence corpus data |
| `npm run corpus:normalize` | Normalize the ignored sentence corpus into the expected local-data shape |
| `npm run corpus:report` | Report sentence corpus coverage and readiness |
| `npm run curated:init` | Create or merge curated kanji data |
| `npm run curated:normalize` | Normalize ignored curated kanji data into the expected local-data shape |
| `npm run curated:report` | Report curated kanji data coverage |
| `npm run words:init` | Create or merge curated word data |
| `npm run media:init` | Create media source folders and `.env` |
| `npm run media:plan` | Report missing media and accepted filenames |
| `npm run media:sync` | Sync media into managed storage |
| `npm run media:sync:words` | Sync governed word audio into managed storage |
| `npm run media:report` | Report managed media coverage |
| `npm run media:sources` | Report configured managed media source folders |
| `npm run media:report:animations` | Report missing managed stroke-order animation files |
| `npm run media:report:animations:n1` | Report missing managed N1 stroke-order animation files with the N1 default limit |
| `npm run media:import:stroke-order` | Import governed free stroke-order files from a local source directory |
| `npm run media:import:kanjivg` | Import governed KanjiVG stroke-order files from a local source directory |
| `npm run media:import:audio` | Import governed local audio files into managed media |
| `npm run media:voicevox` | Generate governed kanji reading audio through local VOICEVOX |
| `npm run media:voicevox:words` | Generate governed word reading audio through local VOICEVOX |
| `npm run media:review:audio` | Emit kanji audio review packets |
| `npm run media:review:word-audio` | Emit word audio review packets |
| `npm run data:import:pitch:kanjium` | Import governed Kanjium pitch-accent data into the canonical word pitch store |
| `npm run data:import:pitch:voicevox` | Import generated VOICEVOX pitch-accent support labels into the canonical word pitch store |
