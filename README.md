# Japanese Kanji Anki Builder

A Node.js tool and local web service for generating structured JLPT kanji Anki decks using kanjiapi.dev, KRADFILE radicals, and deterministic TSV exports.

## Features

- Builds JLPT kanji decks for N5-N1
- Generates deterministic TSV output for easy Anki import
- Extracts radicals/components from KRADFILE
- Adds example vocabulary with furigana-style readings
- Separates kanji and word API caching for faster reruns
- Recovers from corrupted cache files automatically
- Deduplicates concurrent in-flight API requests
- Supports browser download and local export routes
- Includes automated tests for caching, concurrency, retries, and export formatting

## Output Fields

The exported TSV includes these columns:
- `Kanji`
- `MeaningJP`
- `Reading`
- `StrokeOrder`
- `Radical`
- `Notes`

## Project Goal

The goal of this project is to generate clean, reusable and customizable kanji study decks that can be imported directly into Anki and imporved over time without rebuilding the entire pipeline from scratch.

## Tech Stack

- Node.js
- Express
- kanjiapi.dev
- KRADFILE
- Custom TSV export pipeline

## Current Status

The project currently supports deterministic JLPT TSV generation, cache-backed API access, radical extraction, and tested export formatting. StrokeOrder is currently left blank in the TSV because stroke assets are handled separately in Anki media.

## Example Use Cases

- Build a clean N5 starter kanji deck
- Generate higher-level JLPT decks for personal study
- Create a custom kanji pipeline for Anki with your own templates and media
- Experiment with better example-word ranking and future stroke-order animation support