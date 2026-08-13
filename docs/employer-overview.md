# Employer Overview

Program identity: governed data pipeline / release-controlled content generation system.

This repository is not primarily "a flashcard deck." The Anki cards are the distribution artifact. The program is the controlled system that turns tracked source contracts, curated study data, media policy, review manifests, and proof ledgers into deterministic Japanese study content with fail-closed validation.

For a hiring reviewer, the important signal is not "I made flashcards." The important signal is that this project treats learning content like release-critical product data: scoped contracts, lane boundaries, evidence provenance, regression protection, certification gates, generated artifact boundaries, and release locks.

## Sixty-Second Read

| What to inspect | Current verified state | Why it matters |
| --- | --- | --- |
| System type | Governed data pipeline and release-controlled content generation system for JLPT kanji and vocabulary. | Evaluates as backend/data/product engineering, not as a static content file. |
| Governed surfaces | Current generated denominators cover `2212` core kanji rows and `2820` word rows across JLPT N5-N1. | The system is a multi-surface data product, not a single static deck. |
| Locked certification scope | The v0.2.0 scoped lock historically certified `982` kanji rows and `1008` word rows through the then-current Obsidian proof path; current word Obsidian v2.5 work is a stricter successor standard and does not create a release-readiness claim. | Release claims are explicit, bounded, and separate from ongoing work. |
| Proof model | Canonical JSONL proof ledger validates with `2688` events across 6 ledger files. | Certification evidence is tracked, queryable, and replayable. |
| Release discipline | `docs/releases/v0.2.0-scoped-obsidian-lock.md` freezes N5/N4 word and N5-N2 kanji scope. Future edits belong to the next version. | The repo has an explicit release boundary instead of an informal "current state." |
| NLP support | `nlp:governance-gate` passes, while the docs and commands state NLP does not certify cards or write tracked templates. | Automation assists review without becoming unchecked authority. |

## What The Program Is

The program has four jobs:

- Normalize tracked and local inputs into stable kanji and word identities.
- Generate deterministic card surfaces and package-ready exports.
- Promote exact card identities through separate review lanes without borrowing authority across lanes.
- Preserve trust decisions in proof ledgers, gate output, and scoped release locks.

## What The Program Produces

The program builds two related products:

- Kanji decks: one target kanji per card, with reading, meaning, examples, notes, audio, and stroke-order media.
- Word decks: one exact written form plus reading per card, with meaning, example, reading breakdown, pitch accent, audio, and support labels.

The products share infrastructure but not certification authority. A word card passing a gate does not certify a kanji card. A generated card does not become reviewed just because it exists. A release package does not become content-certified because it imports into Anki.

## Engineering Signals

| Signal | Evidence in this repo |
| --- | --- |
| Deterministic build and packaging | Scripts produce TSV exports and optional byte-stable `.apkg` packages from tracked contracts and generated package inputs. |
| Fail-closed quality gates | Incomplete generated denominators stay visible; gates fail coverage instead of silently shrinking the denominator. |
| Explicit trust ladder | Silver, Gold, Sapphire, Platinum, and Obsidian are separate lanes with different authority and separate commands. |
| Canonical proof storage | Obsidian proof lives in tracked JSONL under `templates/obsidian_proof_ledger/*.jsonl`; SQLite is a generated query mirror only. |
| Source and media boundaries | Source evidence, generated TSVs, media identity, pitch evidence, package readiness, NLP artifacts, and release QA are separate. |
| Real release lock | `v0.2.0` records certified scope, artifact hashes, excluded scopes, and broader release-trust caveats. |
| Honest incompleteness | Unlocked or unfinished surfaces are excluded from release claims instead of being merged into completed scopes. |

## Current Product State

### Locked First-Version Scope

The scoped `v0.2.0` lock covers:

- Word N5 and N4.
- Core kanji N5, N4, N3, and N2.

Live certification commands confirm:

| Scope | Generated rows | Current Obsidian certified | Needs Obsidian | Blocked/failing |
| --- | ---: | ---: | ---: | ---: |
| Kanji N5-N2 | 982 | 982 | 0 | 0 |
| Word N5-N4 | 1622 | 588 | 1034 | 0 |

This is a scoped content/package release lock, not a blanket claim that every product surface is finished.

### Product Denominators

| Surface | Current generated denominator | Current Obsidian-certified denominator | Boundary |
| --- | --- | --- | --- |
| Core kanji | `2212/2212` across N5-N1 | `982/2212` | The lock covers N5-N2. Remaining generated kanji rows are not Obsidian-certified. |
| Words | `2820/2820` across N5-N1 | `588/2820` current v2.5 | Current word Obsidian v2.5 covers all current N5 generated rows. Legacy N5/N4 word proof history remains audit-visible, but it is not current v2.5 certification. |

## Why This Is More Than A Deck

The hard part is not rendering flashcards. The hard part is keeping a large educational data product honest while it changes:

- Generated surfaces are tracked separately from reviewed surfaces.
- Source truth is separated from regression protection.
- Structural review is separated from card-surface inspection.
- Content proof is separated from package readiness.
- Package QA is separated from broader release trust.
- Assistive NLP is useful but cannot certify or mutate tracked templates.

That design makes the project auditable. A reviewer can rerun commands, inspect manifests, and see why a card or level is trusted, incomplete, deferred, or blocked.

## Verification Commands

These commands backed the snapshot above:

```bash
git status --short --branch
git log -1 --oneline --decorate
git ls-remote --heads origin
npm run deck:closeout -- --levels=5,4,3,2,1
npm run deck:kanji:obsidian:certify-status -- --levels=5,4,3,2
npm run deck:words:obsidian:certify-status -- --levels=5,4
npm run data:obsidian:proof:validate
npm run nlp:governance-gate
```

`deck:closeout` is an orientation report. It does not replace lane gates, proof-ledger validation, package QA, hosted checks, or manual evidence.
