# Compatibility Matrix

This document defines the intended compatibility surface for shipped deck artifacts.

## Supported artifact types

- TSV exports for kanji decks
- TSV exports for word decks
- optional `.apkg` bundles when native Python packaging is available

## Current supported environments

### Build and verification environments

| Surface | Status | Notes |
| --- | --- | --- |
| Windows desktop build | Supported | Primary local development path |
| macOS smoke build | Supported | Verified in CI smoke lane |
| Ubuntu smoke build | Supported | Verified in CI smoke lane |
| Ubuntu release gate | Supported | Primary tagged-release verification lane |

### Learner import environments

| Client | Status | Notes |
| --- | --- | --- |
| Anki desktop (Windows) | Supported | Primary manual QA target |
| Anki desktop (macOS) | Supported | Secondary manual QA target |
| Anki desktop (Linux) | Supported | Artifact-compatible, less frequently spot-reviewed manually |
| AnkiDroid | Sanity-check target | Needs periodic manual review, not yet a formal gate |
| AnkiMobile | Sanity-check target | Needs periodic manual review, not yet a formal gate |

## Required verification before calling a deck release-ready

- import succeeds on supported Anki desktop targets
- card templates render without clipped core content
- stroke-order media renders correctly
- governed audio plays correctly where audio is shipped
- word-card cross-level badges remain visible and understandable

## Known non-goals today

- formal screen-reader certification across every Anki client
- guaranteed visual parity across all community Anki add-ons
- full mobile-gate automation

## How to use this matrix

Treat this as the support contract for release notes and QA. If a new platform or client matters enough to mention publicly, add it here and define the expected validation level instead of assuming it is covered implicitly.
