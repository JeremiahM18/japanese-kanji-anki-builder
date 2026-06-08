# Command Reference

This reference lists the npm commands exposed by the repository and the role each command plays.

For lane authority, use [review-system-forward-contract.md](review-system-forward-contract.md). For workflow ordering, use [workflows.md](workflows.md). For the exact Obsidian pass checklist, use [obsidian-batch-workflow.md](obsidian-batch-workflow.md). For release gate boundaries, use [release-process.md](release-process.md) and [verification.md](verification.md).

| Command | Purpose |
| --- | --- |
| `npm test` | Run the full test suite |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run the staged JSDoc typecheck gate |
| `npm run supply-chain:audit` | Verify lockfile registry/integrity, reviewed install-script packages, pinned GitHub Actions, workflow permissions, and release artifact boundaries |
| `npm run security:advisories` | Run the internet-backed npm advisory audit gate at `moderate` severity or higher |
| `npm run security:branch-protection` | Verify tracked branch-protection policy, documentation, and CI required-check names stay aligned |
| `npm run security:github-settings` | Live-check hosted GitHub repository security settings and fail on unprotected or unverified P0 settings |
| `npm run security:github-settings:auth` | Run the hosted GitHub settings audit with `GH_TOKEN`/`GITHUB_TOKEN`, or safely obtain the token from authenticated GitHub CLI |
| `npm run security:licenses` | Validate dependency license expressions against the tracked allowlist and current reviewed exceptions without writing an artifact |
| `npm run security:licenses:write` | Write the release dependency-license summary to `out/security/dependency-licenses.json` after the license audit passes |
| `npm run security:requirements` | Validate the tracked security requirements traceability matrix, including implementation files, evidence files, verification commands, manual QA posture, risk-record links, and release-blocker counts |
| `npm run security:release-trust` | Fail closed unless unresolved high/critical release-blocker risks and unimplemented release-blocker requirements are both zero |
| `npm run security:release-trust:pre` | Fail closed before a tagged release workflow while deferring only explicitly listed post-release attestation-proof records |
| `npm run security:sdlc-metrics` | Validate the tracked SDLC security metrics contract, reviewer training checklist coverage, risk-register review posture, and requirements backlog visibility |
| `npm run security:secrets` | Scan tracked files for high-confidence token and private-key patterns |
| `npm run security:sbom` | Validate deterministic CycloneDX SBOM generation from `package-lock.json` without writing an artifact |
| `npm run security:sbom:write` | Write the release CycloneDX SBOM to `out/security/sbom.cdx.json` |
| `npm run bench:export` | Measure export-service performance for local regression investigation |
| `npm run bench:obsidian-proof-etl` | Measure tracked Obsidian proof ledger validation, compatibility-view generation, and SQLite mirror generation |
| `npm run bench:obsidian-proof-etl:gate` | Manual local Obsidian proof ETL performance guardrail; not a CI gate unless explicitly wired |
| `npm run bench:build:gate` | Manual local-data build performance guardrail; requires a ready workspace and writes benchmark output; append `-- --repeat=3` before budget changes or stability claims |
| `npm run bench:build:cold-apkg:gate` | Manual local-data cold native APKG package-performance guardrail; clears the generated APKG cache and gates the package phase; append `-- --repeat=3` before budget changes or stability claims |
| `npm run perf:memory:matrix` | Validate the tracked performance and memory audit matrix without running timing budgets |
| `npm run ci:smoke` | Build deterministic smoke artifacts |
| `npm run release:gate` | Validate smoke-fixture release artifact contracts |
| `npm run product:artifacts:n5` | Build and validate the tracked-source N5 word TSV artifact |
| `npm run product:artifacts:kanji:n5:preflight` | Report whether tracked-source N5 kanji TSV certification is possible |
| `npm run product:artifacts:kanji:n4:preflight` | Report whether tracked-source N4 kanji TSV certification is possible |
| `npm run product:artifacts:kanji:n3:preflight` | Report whether tracked-source N3 kanji TSV certification is possible |
| `npm run product:artifacts:kanji:preflight` | Run the tracked-source kanji preflight across N5 through N1 |
| `npm run product:artifacts:kanji:n5` | Build and validate the source-derived tracked-source N5 kanji TSV artifact |
| `npm run product:artifacts:kanji:n4` | Build and validate the source-derived tracked-source N4 kanji TSV artifact |
| `npm run product:artifacts:kanji:n3` | Build and validate the source-derived tracked-source N3 kanji TSV artifact |
| `npm run product:artifacts:kanji:all` | Run the tracked-source kanji TSV artifact gate across N5 through N1, failing closed where source contracts are incomplete |
| `npm run product:artifacts:kanji:release-qa` | Gate tracked-source kanji TSV, APKG, managed-media, and manual QA readiness across N5 through N1 |
| `npm run product:release-qa:evidence` | Validate the release-specific QA evidence packet for APKG import, managed media, Anki import, mobile, accessibility, listening QA, accepted source-governance posture while source depth is incomplete, and known blockers |
| `npm run product:readiness:n5` | Run the automated N5 product readiness checkpoint |
| `npm run dev` | Start the local development server with `nodemon` |
| `npm start` | Start the local Express server; equivalent to `npm run start` |
| `npm run doctor` | Check setup, coverage, readiness, and next steps |
| `npm run doctor:voicevox` | Verify local governed VOICEVOX setup |
| `npm run voicevox:status` | Inspect the local VOICEVOX Docker container, required host-to-container port mapping, and Docker runtime hardening |
| `npm run voicevox:start` | Start the governed local VOICEVOX Docker container when it already has the required port mapping and runtime hardening |
| `npm run voicevox:start:fresh` | Recreate the local VOICEVOX Docker container with local host `127.0.0.1:50021` mapped to container `50121` plus required runtime hardening when the old container shape is wrong |
| `npm run voicevox:stop` | Stop the local VOICEVOX Docker container after governed audio work |
| `npm run deck:readiness` | Report per-level quality gates |
| `npm run deck:preview` | Preview kanji cards |
| `npm run deck:sapphire:batch -- --level=1 --limit=8 --queue=missing-current-standard` | Build a read-only core-kanji Sapphire review packet for generated rows missing current-standard Sapphire coverage |
| `npm run deck:sapphire:promote -- --level=1 --input=<reviewed-json>` | Validate and merge reviewed Sapphire candidate entries; writes only with `--write`, does not create Platinum or Obsidian proof |
| `npm run deck:platinum:batch -- --level=5 --limit=12` | Build a read-only native kanji Platinum expert-content packet for generated rows that already have current-standard Sapphire but are missing native Platinum content certification |
| `npm run deck:legacy-platinum:batch -- --level=5 --limit=12` | Legacy read-only kanji compatibility packet for historical structural/proof-provider workflows; new structural core-kanji work uses `deck:sapphire:batch`, and expert content work uses `deck:platinum:batch` |
| `npm run deck:package` | Build package artifacts through the Node artifact wrapper |
| `npm run deck:kanji:surface-audit` | Audit generated kanji deck surface details before review or release claims |
| `npm run deck:kanji:partition-plan` | Report core/additional kanji partition decisions and duplicate-claim handling |
| `npm run deck:kanji:obsidian:rereview-status -- --levels=5,4,3,2` | Classify kanji Sapphire or legacy compatibility structural pass versus Obsidian proof; N5/N4/N3/N2 complete proof reads canonical JSONL through the scoped proof provider |
| `npm run deck:kanji:obsidian:certify-status -- --levels=5,4,3,2` | Fail-closed kanji Obsidian certification status for the completed N5/N4/N3/N2 scope |
| `npm run deck:ready` | Build and package kanji TSV artifacts |
| `npm run deck:apkg` | Build kanji `.apkg` artifacts |
| `npm run deck:kanji:additional:ready` | Build the separate optional additional-unverified kanji TSV/APKG surface |
| `npm run deck:kanji:review-status` | Report core/additional kanji generated, Gold, native Sapphire coverage where migrated, legacy compatibility fallback where not migrated, revalidation backlog, and duplicate-claim status |
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
| `npm run deck:kanji:additional:platinum:n5` | Run the additional-unverified N5 kanji compatibility structural gate |
| `npm run deck:kanji:additional:platinum:n4` | Run the additional-unverified N4 kanji compatibility structural gate |
| `npm run deck:kanji:additional:platinum:n3` | Run the additional-unverified N3 kanji compatibility structural gate |
| `npm run deck:kanji:additional:platinum:n2` | Run the additional-unverified N2 kanji compatibility structural gate |
| `npm run deck:kanji:additional:platinum:n1` | Run the additional-unverified N1 kanji compatibility structural gate |
| `npm run deck:review:coverage` | Audit Gold regression coverage |
| `npm run deck:review:accessibility` | Report automated accessibility checklist status for kanji or word decks |
| `npm run deck:legacy-platinum:rereview-status -- --levels=5,4,3,2` | Legacy kanji compatibility rereview-status gate; proof-provider input defaults to ledger-if-available, but new proof workflows should use `deck:kanji:obsidian:rereview-status` |
| `npm run deck:legacy-platinum:governance-gate` | Run the local-data legacy structural governance gate against real generated N5/N4 rows before release claims that depend on those rows; migrated kanji and word Obsidian proof inputs default to ledger-if-available |
| `npm run deck:sapphire:n5` | Run the native N5 core-kanji Sapphire gate; current coverage is `80/80` |
| `npm run deck:sapphire:n4` | Run the native N4 core-kanji Sapphire gate; current coverage is `212/212` |
| `npm run deck:sapphire:n3` | Run the native N3 core-kanji Sapphire gate; current coverage is `341/341` |
| `npm run deck:sapphire:n2` | Run the native N2 core-kanji Sapphire gate; current coverage is `349/349` |
| `npm run deck:sapphire:n1` | Run the native N1 core-kanji Sapphire gate; current coverage is `320/1230`, so the full-level gate fails closed on `910` missing Sapphire entries |
| `npm run deck:platinum:n5` | Run the native N5 kanji Platinum expert-content gate; currently fails closed because native Platinum content coverage is `0/80` |
| `npm run deck:platinum:n4` | Run the native N4 kanji Platinum expert-content gate; currently fails closed because native Platinum content coverage is `0/212` |
| `npm run deck:platinum:n3` | Run the native N3 kanji Platinum expert-content gate; currently fails closed because native Platinum content coverage is `0/341` |
| `npm run deck:platinum:n2` | Run the native N2 kanji Platinum expert-content gate; currently fails closed because native Platinum content coverage is `0/349` |
| `npm run deck:platinum:n1` | Run the native N1 kanji Platinum expert-content gate; currently fails closed with `0/1230` native Platinum content, `320` Sapphire-ready rows missing Platinum content, and `910` rows blocked by missing Sapphire |
| `npm run deck:legacy-platinum:n5` | Legacy read-only N5 kanji compatibility gate retained as a migration/proof-provider input; use `deck:sapphire:n5` for structure and `deck:platinum:n5` for native Platinum content |
| `npm run deck:legacy-platinum:n4` | Legacy read-only N4 kanji compatibility gate retained as a migration/proof-provider input; use `deck:sapphire:n4` for structure and `deck:platinum:n4` for native Platinum content |
| `npm run deck:legacy-platinum:n3` | Legacy read-only N3 kanji compatibility gate retained as a migration/proof-provider input; use `deck:sapphire:n3` for structure and `deck:platinum:n3` for native Platinum content |
| `npm run deck:legacy-platinum:n2` | Legacy read-only N2 kanji compatibility gate retained as a migration/proof-provider input; use `deck:sapphire:n2` for structure and `deck:platinum:n2` for native Platinum content |
| `npm run deck:legacy-platinum:n1` | Legacy read-only N1 kanji compatibility gate retained as a migration/proof-provider input; use `deck:sapphire:n1` for structure and `deck:platinum:n1` for native Platinum content |
| `npm run deck:words:ready` | Build and package word TSV artifacts |
| `npm run deck:words:apkg` | Build word `.apkg` artifacts |
| `npm run deck:words:sapphire:batch -- --level=5 --limit=8 --queue=missing-current-standard` | Build a read-only word Sapphire structural/card-quality review packet for generated rows missing current-standard Sapphire coverage |
| `npm run deck:words:platinum:batch -- --level=5 --limit=8` | Build a read-only native word Platinum expert-content packet for generated rows that already have current-standard Sapphire but are missing native Platinum content certification |
| `npm run deck:words:legacy-platinum:batch -- --level=5 --limit=8` | Legacy read-only word compatibility/proof packet; use `deck:words:sapphire:batch` for structure and `deck:words:platinum:batch` for native Platinum content |
| `npm run deck:words:review:n5` | Run the N5 word Gold regression benchmark |
| `npm run deck:words:review:n4` | Run the N4 word Gold regression benchmark |
| `npm run deck:words:sapphire:n5` | Run the native N5 word Sapphire gate; current coverage is `287/287` active generated rows, with deferred/removed tracked separately |
| `npm run deck:words:sapphire:n4` | Run the native N4 word Sapphire gate; current coverage is `700/700` |
| `npm run deck:words:sapphire:n3` | Run the native N3 word Sapphire gate; currently fails closed because the manifest is empty and `269` generated rows are missing Sapphire |
| `npm run deck:words:sapphire:n2` | Run the native N2 word Sapphire gate; currently fails closed because the manifest is empty and `28` generated rows are missing Sapphire |
| `npm run deck:words:sapphire:n1` | Run the native N1 word Sapphire gate; currently fails closed because the manifest is empty and `26` generated rows are missing Sapphire |
| `npm run deck:words:platinum:n5` | Run the native N5 word Platinum expert-content gate; currently fails closed because native Platinum content coverage is `0/287` |
| `npm run deck:words:platinum:n4` | Run the native N4 word Platinum expert-content gate; currently fails closed because native Platinum content coverage is `0/700` |
| `npm run deck:words:platinum:n3` | Run the native N3 word Platinum expert-content gate; currently fails closed because native Platinum content coverage is `0/269` and word Sapphire is missing |
| `npm run deck:words:platinum:n2` | Run the native N2 word Platinum expert-content gate; currently fails closed because native Platinum content coverage is `0/28` and word Sapphire is missing |
| `npm run deck:words:platinum:n1` | Run the native N1 word Platinum expert-content gate; currently fails closed because native Platinum content coverage is `0/26` and word Sapphire is missing |
| `npm run deck:words:legacy-platinum:n5` | Legacy N5 word compatibility gate retained for proof-provider and downstream migration compatibility; use `deck:words:sapphire:n5` for structure and `deck:words:platinum:n5` for native Platinum content |
| `npm run deck:words:legacy-platinum:n4` | Legacy N4 word compatibility gate retained for proof-provider and downstream migration compatibility; use `deck:words:sapphire:n4` for structure and `deck:words:platinum:n4` for native Platinum content |
| `npm run deck:words:obsidian:rereview-status -- --levels=5,4` | Classify legacy word Platinum compatibility structural pass versus Obsidian proof; migrated N5/N4 word proof reads canonical JSONL through the scoped proof provider, while native `deck:words:sapphire:*` owns word Sapphire coverage |
| `npm run deck:words:obsidian:certify-status -- --levels=5,4` | Fail-closed word Obsidian certification status; migrated N5/N4 word proof reads canonical JSONL through the scoped proof provider |
| `npm run deck:words:legacy-platinum:source-posture -- --levels=5,4` | Classify active structurally current-standard word source-family independence posture; legacy compatibility report, not native Platinum content certification |
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
| `npm run deck:words:expansion-support -- --levels=5,4,3,2,1` | Run broad model-backed word NLP review amplification for selected word levels and finish with artifact validation plus the NLP governance gate; this cannot certify cards or write tracked templates |
| `npm run deck:words:expansion-support:n5` | Run governed NLP expansion support for N5 word expansion/review |
| `npm run deck:words:expansion-support:n4` | Run governed NLP expansion support for N4 word expansion/review |
| `npm run deck:words:expansion-support:n3` | Run governed NLP expansion support for N3 word expansion/review |
| `npm run deck:words:expansion-support:n2` | Run governed NLP expansion support for N2 word expansion/review |
| `npm run deck:words:expansion-support:n1` | Run governed NLP expansion support for N1 word expansion/review |
| `npm run deck:kanji:nlp-signals -- --levels=5,4,3,2,1` | Run narrow kanji-card NLP signal support for selected kanji levels without invoking word expansion, embeddings, example reranking, reading-gap discovery, or sense-fit lanes; this cannot certify cards or write tracked templates |
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
| `npm run data:obsidian:proof:append -- --events=out/obsidian-proof/drafts/<batch>.jsonl` | Dry-run append of complete human-reviewed proof-event drafts to the canonical JSONL ledger. Rerun with `--write` only after the dry-run is clean; validates schema, card binding, tracked review-set targets, duplicate proof ids, duplicate proof targets, canonical ledger path, and post-write reconciliation |
| `npm run data:obsidian:proof:validate` | Validate canonical tracked JSONL Obsidian proof ledger files |
| `npm run data:obsidian:proof:reconcile -- --levels=5,4,3,2` | Bind canonical JSONL proof to tracked review-set entries; if legacy inline proof exists during a transition, compare it to the ledger. `--allow-incomplete` may skip a missing review-set scope only when no scoped ledger proof exists for that scope |
| `npm run data:obsidian:proof:migrate-inline -- --deck-kind=<kanji\|word> --levels=<levels>` | Dry-run migration from tracked inline `rereviewProvenance` into JSONL ledger events for not-yet-canonicalized kanji or word levels; use `--write --update-source-review-set` only after the dry-run reports exact identity, sentence-quality, and duplicate safety |
| `npm run data:obsidian:proof:remove-inline -- --levels=5,4,3,2` | Dry-run removal of legacy inline proof after scoped canonical JSONL ledger events are present and bound |
| `npm run data:obsidian:proof:views` | Generate compatibility review-set JSON from canonical ledger events |
| `npm run data:obsidian:proof:sqlite` | Generate the local SQLite query mirror from canonical ledger events |
| `npm run data:obsidian:proof:sqlite:query` | Query the generated local SQLite mirror after rebuilding it from JSONL |
| `npm run data:obsidian:proof:provider-parity -- --levels=5,4,3,2 --row-source=tracked-review-set` | CI-safe provider integrity test for switched proof consumers using tracked review-set row proxies; it performs dual-read parity while inline proof exists and canonical-ledger integrity after inline proof removal. Add `--consumer=kanji-legacy-platinum-level`, `--consumer=kanji-legacy-platinum-batch-report`, `--consumer=kanji-field-source-contract`, `--consumer=legacy-platinum-governance-gate`, `--consumer=word-rereview-status --deck-kind=word --levels=5,4`, `--consumer=word-certify-status --deck-kind=word --levels=5,4`, `--consumer=word-legacy-platinum-batch-report --deck-kind=word --levels=5,4 --queue=substantive-rereview --limit=8`, `--consumer=word-legacy-platinum-level --deck-kind=word --levels=5,4`, or `--consumer=word-governance-inputs --deck-kind=word --levels=5,4` for consumer-specific legacy/proof-provider projections, and use `--row-source=generated` locally to compare against live generated rows |
| `npm run data:audit:jlpt:sources -- --governance-strict` | Audit JLPT kanji source evidence and fail only on source-governance regressions while evidence depth remains incomplete |
| `npm run data:audit:jlpt:source-levels -- --worklist-only --limit=10` | Report the focused all-level governed review packet with current level, candidate levels, consensus, vote weights, and resolved source-input worksheet progress without changing decks or readiness |
| `npm run data:audit:jlpt:source-access` | Rank source lanes by governed usefulness and current source-access state before spending another manual review batch |
| `npm run data:audit:jlpt:source-ocr-intake` | Inventory ignored private Shin scan files and OCR prerequisites before purchased-book extraction |
| `npm run data:audit:jlpt:official-occurrences` | Report or extract official JLPT positive occurrence evidence without storing question text or assigning levels |
| `npm run data:benchmark:jlpt:sources:gate -- --source=<source-id>` | Manual source-evidence performance guardrail; fail locally when benchmark timing exceeds configured default budgets |
| `npm run bench:build:gate` | Manual local-data build performance guardrail; requires a ready workspace and writes benchmark output; append `-- --repeat=3` before budget changes or stability claims |
| `npm run bench:build:cold-apkg:gate` | Manual local-data cold native APKG package-performance guardrail; clears the generated APKG cache and gates the package phase; append `-- --repeat=3` before budget changes or stability claims |
| `npm run perf:memory:matrix` | Validate which performance, memory, package, and smoke lanes are budgeted, sampled, CI-backed, or manual/local |
| `npm run data:packet:jlpt:source-review -- --source=<source-id> --limit=25` | Emit compact read-only JSON planning rows for the next governed source-review packet |
| `npm run data:pin:jlpt:source-input -- --source=<source-id>` | Pin a reviewed ignored source input with a milestone reason before governed source import |
| `npm run data:audit:jlpt:source-inputs -- --source=tanos_legacy_direct` | Preflight the pinned local Tanos direct legacy normalized source file before source-evidence import |
| `npm run data:audit:jlpt:source-inputs -- --source=tanos_estimated_split` | Preflight the pinned local Tanos estimated N2/N3 normalized source file before source-evidence import |
| `npm run data:audit:jlpt:source-inputs -- --source=kanjidic2_legacy` | Preflight a pinned local JLPT kanji source file before source-evidence import |
| `npm run data:audit:jlpt:source-inputs -- --source=jlptsensei` | Preflight a restricted manual JLPT Sensei source worksheet before source-evidence import |
| `npm run data:packet:jlpt:source-access -- --source=<source-id> --surface-type=<surface-type> --title="<surface title>" --citation="<source citation>" --evidence-ref="<source reference>" --notes="<exact assignment proof>"` | Write an ignored source-access packet required before `100+` all-level source-review generation or merge of `100+` importable reviewed rows |
| `npm run data:merge:jlpt:source-batch -- --source=<source-id> --batch=<ignored-batch.tsv>` | Dry-run merge a reusable local source-decision batch into its full ignored source worksheet without importing evidence or changing decks; pass `--source-access-packet=<ignored-packet.json>` for `100+` importable reviewed rows |
| `npm run data:normalize:kanjidic2-jlpt` | Normalize ignored local KANJIDIC2 XML into the pinned source-input TSV shape |
| `npm run data:build:kanji-reading-reference` | Build the tracked KANJIDIC2 on/kun reading-reference contract without moving JLPT levels or certifying card fields |
| `npm run data:build:kanji-field-source-contract -- --level=<level>` | Build a tracked per-level kanji card-field source contract from current-standard Platinum Japanese-source evidence without reading ignored `data/` inputs; kanji Obsidian proof input defaults to ledger-if-available for migrated levels |
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
| `npm run media:review:audio` | Emit scoped kanji audio review packets for selected cards; not a full-level media-completeness gate |
| `npm run media:review:word-audio` | Emit scoped word audio review packets for selected cards; not a full-level media-completeness gate |
| `npm run data:import:pitch:kanjium` | Import governed Kanjium pitch-accent data into the canonical word pitch store |
| `npm run data:import:pitch:voicevox` | Import generated VOICEVOX pitch-accent support labels into the canonical word pitch store |
