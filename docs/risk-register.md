# Risk And Exception Register

## Purpose

This register records security, release, source-governance, and operational risks that are not fully resolved by current automated gates.

Use it to distinguish blockers, accepted residual risks, temporary exceptions, expected fail-closed backlog, and items that need owner action outside local code changes.

## Scope

Covered:

- hosted GitHub security settings
- release artifact and attestation posture
- dependency and supply-chain exceptions
- local runtime and ignored-input boundaries
- source-governance and card-review blockers
- manual QA and release readiness risks
- assistive NLP boundaries

Not covered:

- per-card Platinum or Obsidian review history
- every transient CI failure
- private local source files or credentials
- upstream service incidents outside this repository's control

## Authority Boundary

This register does not accept risk by itself. A risk is accepted only when the `Decision` field says `Accepted`, the owner is named, the rationale is explicit, and the next review date is current.

Open, blocked, unverified, or overdue risks are not release-ready claims.

## Severity Scale

| Severity | Definition |
| --- | --- |
| Critical | Can undermine repository integrity, release trust, vulnerability intake, or public user safety. |
| High | Can cause wrong release claims, untriaged security exposure, unsafe generated content, or significant governance drift. |
| Medium | Can create review confusion, local-only exposure, or narrower process gaps. |
| Low | Documentation or workflow improvement with limited immediate security impact. |

## Decision States

| Decision | Meaning |
| --- | --- |
| Open | Needs mitigation, verification, or owner action. |
| Blocked external | Cannot be fixed from local files alone. |
| Accepted | Residual risk is intentionally accepted with rationale and next review date. |
| Mitigated | Control exists and current verification is clean. |
| Superseded | Risk was replaced by a newer record. |

## Register

| ID | Severity | Decision | Owner | Risk | Evidence | Required next action | Next review |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-P0-001 | Critical | Mitigated | Repository owner | Hosted `main` must enforce the tracked branch-protection policy or required checks and review policy can be bypassed. | On 2026-08-01, owner-authenticated `npm run security:github-settings:auth` passed against `main` commit `0674dadc03ee35c2718105a50ffedf717680c326`: branch protection is enabled and matches [../.github/branch-protection.main.json](../.github/branch-protection.main.json), and the exact post-merge CI run [30725356186](https://github.com/JeremiahM18/japanese-kanji-anki-builder/actions/runs/30725356186) and CodeQL run [30725356170](https://github.com/JeremiahM18/japanese-kanji-anki-builder/actions/runs/30725356170) both succeeded. | Keep the hosted audit in security verification; rerun after workflow names, required checks, branch policy, or repository ownership changes. | 2026-09-01 |
| SEC-P0-002 | High | Mitigated | Repository owner | Private vulnerability reporting must remain enabled for confidential intake. | On 2026-08-01, owner-authenticated `npm run security:github-settings:auth` verified private vulnerability reporting remains enabled, repository security settings are readable, secret scanning and push protection are enabled, and there are zero open secret-scanning alerts. | Keep private vulnerability reporting enabled or record an approved private intake alternative in [../SECURITY.md](../SECURITY.md). | 2026-09-01 |
| SEC-P0-003 | High | Mitigated | Repository owner | Dependabot alert state and Dependency Graph must remain visible so open dependency alerts cannot hide from release-trust evidence. | 2026-07-26 post-merge owner-authenticated `npm run security:github-settings:auth` reported `0` open Dependabot alerts and a readable Dependency Graph SBOM after merge commit `2e9eca2dd37bd2ea146da111e31bbfbd504f9426`; `npm audit --audit-level=low` also reported `0` vulnerabilities. | Keep authenticated hosted alert visibility and the internet-backed advisory audit in merge/release verification; reopen immediately if either surface reports an unresolved alert. | 2026-08-26 |
| SEC-P0-004 | High | Mitigated | Repository owner | Release attestation creation and all-file constrained verification must remain proven by a successful tagged-ref Release workflow and independent downloaded-asset verification. | On 2026-08-01 tagged Release workflow [30706783927](https://github.com/JeremiahM18/japanese-kanji-anki-builder/actions/runs/30706783927) succeeded for immutable tag `v0.3.0-beta.4` at commit `f9b7c3f2423c5f26edc3c88857e3aedac44aeede` and published the labeled [N5 prerelease](https://github.com/JeremiahM18/japanese-kanji-anki-builder/releases/tag/v0.3.0-beta.4) with seven assets. A fresh download verified exact six-file checksum-manifest membership and hashes, including CycloneDX SBOM SHA-256 `5d1dfefb28f1efd40ea1d93a479fd33fba2f991b7ab23f0c937349d02fe05302`; constrained `gh attestation verify` passed for all `7/7` assets against the exact repository, signer workflow, tag ref, and source digest. Immutable Actions artifact `8820594202` retained the same seven files byte-for-byte, and owner-authenticated `npm run security:github-settings:auth` passed with artifact attestation verification proven. [github-repository-settings-checklist.md](github-repository-settings-checklist.md), [release-process.md](release-process.md), [../.github/workflows/release.yml](../.github/workflows/release.yml) | Keep checksum, SBOM, provenance/SBOM attestation, immutable Actions evidence, all-file constrained verification, and owner-authenticated hosted audit gates mandatory; reopen on any failed tagged run, missing/mismatched asset, verification failure, permission drift, or release-workflow change. | 2026-08-26 |
| SEC-P0-005 | High | Mitigated | Repository owner | Live CodeQL, secret-scanning, and dependency alert state must stay visible and triaged before hosted security can be cited as clean release evidence. | 2026-07-26 post-merge owner-authenticated `npm run security:github-settings:auth` reported latest `main` CI and CodeQL `success`, with `0` open CodeQL, secret-scanning, and Dependabot alerts at merge commit `2e9eca2dd37bd2ea146da111e31bbfbd504f9426`. | Keep the hosted audit in merge/release verification and reopen if any required `main` run fails or any CodeQL, secret-scanning, or Dependabot alert remains unresolved. | 2026-08-26 |
| SEC-SUP-001 | Medium | Accepted | Repository owner | Native dependency install scripts and reviewed dependency-license exceptions are allowed for specific packages and could expand attack surface or attribution obligations if versions drift. | On 2026-08-01, registry metadata and published tarball manifests/README license matrices were rechecked for the exact optional `@img/sharp-libvips-*@1.3.2`, `@img/sharp-win32-*@0.35.3`, and `@img/sharp-wasm32@0.35.3` package families. The release bundle excludes `node_modules` and includes the generated dependency-license inventory. The gate now requires exact package-version binding for every exception; `npm run supply-chain:audit` passes with `3` exact lifecycle-script packages and `npm run security:licenses -- --as-of=2026-09-01` passes for `268` packages with `14` reviewed exceptions. | Keep lifecycle-script allowlist exact by package and version; keep reviewed license exceptions current by exact package version, reason, owner, and next-review date; reassess every new native dependency, version, package-content, distribution-boundary, or license-expression change. | 2026-09-01 |
| SEC-SUP-002 | Medium | Mitigated | Repository owner | A transitive security override outside an upstream parent range can create compatibility drift even when it removes a known advisory. | On 2026-08-01, the registry reported latest `@huggingface/transformers@4.2.0` still declaring `sharp ^0.34.5`, which excludes the forced patched `sharp@0.35.3`; removing the override would reintroduce the high-severity `GHSA-f88m-g3jw-g9cj` vulnerable range. Policy version 2 now makes the exception fail closed: `npm run supply-chain:audit` parses executable module loads and calls, ignores comment decoys, rejects unreviewed computed imports and aliases, permits only the declared `src/services/nlpEmbeddingModelEvaluationService.js` import and literal `feature-extraction` pipeline task, reconciles active model tasks to embedding-only, requires current upstream evidence, and binds the live embedding evaluation into validation. Regression fixtures reject an undeclared Transformers import, comment-decoy/computed-import bypass, image-task/model expansion, malformed-policy report crash, and an upstream range that now accepts the forced version. `npm run nlp:embeddings:evaluate` passed against the installed override with remote downloads disabled and reproduced the tracked benchmark metrics. This technical mitigation does not claim image/vision compatibility and does not accept broader residual use on the owner’s behalf. | Keep the fail-closed source/model boundary and every recorded validation command current; re-review before any Transformers import, pipeline task, active model task, parent/child version, or upstream range change, and remove the override once the parent range safely resolves a patched Sharp version. | 2026-08-26 |
| SEC-LOCAL-001 | Medium | Accepted | Repository owner | Local Express server has no authentication and is safe only under localhost/trusted-network assumptions. | On 2026-08-01, direct inspection confirmed `src/config.js` still defaults `SERVER_HOST` to `127.0.0.1`, while [../SECURITY.md](../SECURITY.md) and [threat-model.md](threat-model.md) keep deliberate broad binding temporary and trusted-network-only. The focused config, server, VOICEVOX-helper, and VOICEVOX-doctor suite passed `33/33`. | Keep `SERVER_HOST` default at `127.0.0.1`; document any deliberate broad binding as temporary and trusted-network only. | 2026-09-01 |
| SEC-LOCAL-002 | Medium | Mitigated | Repository owner | VOICEVOX runtime could expose a broad host bind or weak container posture. | On 2026-08-01, the focused local-runtime suite passed `33/33`, including rejection of broad host binding and containers missing the required capability, `no-new-privileges`, restart, init, memory, CPU, and process controls. `npm run voicevox:status` and `npm run doctor:voicevox` also confirmed that the Docker daemon and engine were stopped, so no live container posture or release-speaker readiness is claimed; a passing live doctor remains mandatory before any governed audio generation. | Keep helper-enforced localhost bind, capability drop, no-new-privileges, and resource limits; rerun status and doctor after Docker/runtime changes and before governed audio generation. | 2026-09-01 |
| SEC-DATA-001 | High | Mitigated | Repository owner | Dedicated hostile-input and fuzz-style coverage was thin for parsers, generated HTML, media paths, generated-output cleanup, Docker-helper arguments, and package boundaries. | On 2026-08-01, [../test/hostileInputSecurity.test.js](../test/hostileInputSecurity.test.js) passed `5/5` adversarial cases covering Anki HTML escaping, hostile source rows, media/generated-output path traversal, Docker-helper argument separation, and supply-chain mutation detection; the exact post-merge full CI matrix also passed. [software-development-life-cycle-audit.md](software-development-life-cycle-audit.md) | Keep adversarial fixtures in tracked tests and add new cases whenever parser, renderer, media, Docker, or dependency-policy surfaces change. | 2026-09-01 |
| GOV-SRC-001 | High | Accepted | Repository owner | Free/public JLPT source expansion is paused because available permitted surfaces have been expanded as far as current access allows; source-access gaps and manual-citation-only lanes can still be mistaken for complete source truth if release evidence blurs the boundary. | On 2026-08-01, `npm run data:audit:jlpt:source-access` still reported `1765` rows needing governed source review, with Sou Matome paused at `442` reviewed / `473` source-access gaps / `1297` pending. `npm run data:audit:jlpt:sources -- --governance-strict --limit=25` reported source-use governance passing and evidence depth failing: `388` high-confidence, `60` standard-confidence, `22` disputed, and `1742` weak-evidence kanji. N5 has no source review queue or contract mismatch, but `32/80` N5 kanji remain weak-evidence; that limitation remains accepted and non-voting. [source-acquisition-register.md](source-acquisition-register.md), [product-exit-criteria.md](product-exit-criteria.md), source-evidence manifests, and [../templates/release_qa_evidence_packet.template.json](../templates/release_qa_evidence_packet.template.json) preserve the boundary. | Keep source-access gaps and manual-citation-only lanes non-voting; do not claim source evidence-depth completion; record `acceptedRiskRecord: GOV-SRC-001` in release QA evidence while source depth is incomplete; reopen if any source_access_gap, manual-citation-only, generated, NLP, or Obsidian compatibility surface is promoted into source truth without exact permitted assignment evidence. | 2026-09-01 |
| PROD-REL-001 | High | Accepted | Repository owner | Green automated gates, packaged Golden regression, and structural APKG inspection do not prove native desktop import/rendering, mobile behavior, interactive screen-reader behavior, listening/naturalness, or stroke-sequence visual correctness. | On 2026-08-01 the repository owner explicitly accepted this bounded residual risk for labeled automation-reviewed previews because independent human/device QA is not realistically available for the foreseeable release horizon. Packet version 3 keeps the five exact limitations explicit, commit-bound, and non-transferable; production/GA still requires passed QA. [releases/v0.3.0-beta.4-n5-automation-preview.md](releases/v0.3.0-beta.4-n5-automation-preview.md), [release-process.md](release-process.md), [product-exit-criteria.md](product-exit-criteria.md), [../templates/release_qa_evidence_packet.template.json](../templates/release_qa_evidence_packet.template.json), `npm run product:release-qa:evidence`, `npm run product:release-qa:apkg-inspect -- --require-golden` | Keep every unavailable check visible in packet and release labeling; publish only as a GitHub prerelease; never claim production/GA or human/device approval; reconsider if human QA becomes available, an incident occurs, or the release class changes. | 2027-08-01 |
| NLP-001 | Medium | Accepted | Repository owner | NLP/model outputs can influence review focus but must not become certification proof. | On 2026-08-01, `npm run nlp:models:audit`, `npm run nlp:doctor`, and `npm run nlp:governance-gate` all passed. The gate validated model, tokenization, embedding, suggestion, review-packet, draft, and runtime surfaces while explicitly reporting that NLP cannot certify cards, write tracked templates, or claim release readiness and still requires human promotion. [nlp-model-governance.md](nlp-model-governance.md), [threat-model.md](threat-model.md) | Keep `nlp:governance-gate` assistive-only and preserve Platinum/Obsidian authority boundaries. | 2026-09-01 |

## Exception Rules

- Exceptions must be narrow, dated, owned, and tied to a concrete verification command or artifact.
- Exceptions must not bypass source-use restrictions, secret handling, branch protection, vulnerability intake, release attestation verification, Platinum review, or Obsidian proof. Manual/device release QA may be deferred only for an explicitly labeled automation-reviewed prerelease under an accepted risk record; production/GA must still pass it.
- Expired exceptions revert to `Open` until reviewed.
- Accepted risks must be reconsidered after any incident, dependency change, release workflow change, or new public-facing claim.

## Verification

Run after changing this register:

```bash
git status --short --untracked-files=all
npm run security:github-settings
npm run security:github-settings:auth
npm run supply-chain:audit
npm run security:branch-protection
npm run security:licenses
npm run security:secrets
npm run lint
npm test
```

`security:github-settings:auth` may fail while SEC-P0 records remain open. That failure is evidence, not a pass.

## Update Triggers

Update this register when:

- a live hosted GitHub setting changes
- a risk is mitigated, accepted, reopened, or becomes overdue
- a dependency exception, workflow permission exception, source-use exception, or release blocker changes
- incident response, post-incident review, or recovery work creates a new residual risk
- dependency-license policy automation changes the risk posture
