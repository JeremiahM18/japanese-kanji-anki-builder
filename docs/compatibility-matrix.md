# Compatibility Matrix

This document defines the supported compatibility surface for shipped deck artifacts.

## Supported artifact types

- TSV exports for kanji decks
- TSV exports for word decks
- optional `.apkg` bundles when native Python packaging is available

## Current supported environments

### Build and verification environments

| Surface | Status | Notes |
| --- | --- | --- |
| Node.js 20.19+, 22.13+, or 24+ | Supported | Project engine range is Node `^20.19.0 \|\| ^22.13.0 \|\| >=24`, aligned with the ESLint 10 development toolchain; CI verifies the latest Node 20 and Node 22 releases |
| Windows desktop build | Supported | Primary local development path |
| macOS smoke build | Supported | Verified in CI smoke lane |
| Ubuntu smoke build | Supported | Verified in CI smoke lane |
| Ubuntu release gate | Supported | Primary tagged-release verification lane |

### Learner import environments

| Client | Status | Notes |
| --- | --- | --- |
| Anki desktop (Windows) | Intended; unverified for `v0.3.0-beta.1` | Native import/render QA was not performed for the automation-reviewed preview |
| Anki desktop (macOS) | Intended; unverified for `v0.3.0-beta.1` | Native import/render QA was not performed for the automation-reviewed preview |
| Anki desktop (Linux) | Intended; unverified for `v0.3.0-beta.1` | APKG structure is inspected, but native client behavior was not exercised |
| AnkiDroid | Unverified preview target | Mobile QA was not performed |
| AnkiMobile | Unverified preview target | Mobile QA was not performed |

## Required release verification

Production/GA requires native import, rendering, stroke-order, audio, badge, accessibility, and applicable mobile verification. An automation-reviewed preview instead requires exact APKG structural inspection and explicit `PROD-REL-001` disclosure for every interaction/perception check that was not performed.

## Non-goals

- formal screen-reader certification across every Anki client
- guaranteed visual parity across all community Anki add-ons
- full mobile-gate automation

## How to use this matrix

Use this matrix for release notes and QA scope. Do not turn intended compatibility into a verified-support claim without native client evidence.
