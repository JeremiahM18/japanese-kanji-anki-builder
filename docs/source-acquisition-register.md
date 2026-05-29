# Source Acquisition Register

This register tracks source-access and source-use work for JLPT kanji evidence. It is not a deck-readiness claim and does not store copied source content.

Last verified: 2026-05-28 from live repo audits and source-use review.

## Rules

| Rule | Requirement |
| --- | --- |
| Private source storage | Purchased scans/photos/PDFs stay under ignored `downloads/private/` paths only. |
| Tracked evidence | Store only minimal reviewed facts: kanji, source level, citation, page/surface, entry/row/column. |
| Forbidden tracked content | Do not commit scans, OCR text, copied tables, readings, vocabulary lists, questions, answers, passages, or raw textbook lists. |
| Assignment proof | Mark rows reviewed only from exact kanji tables, target-entry pages, exact assignment pages, or official correction-list target rows. |
| Non-assignment lanes | Frequency, background, occurrence, derived, and blocked lanes do not vote in JLPT assignment consensus. |

## Acquisition Status

| Source | Current status | Private intake path | Product use | Next action |
| --- | --- | --- | --- | --- |
| Shin Kanzen Master Kanji N2 | Awaiting purchased book/source access | `downloads/private/shin-kanzen-master/n2/` | Restricted manual-citation assignment evidence only after exact kanji table/list pages are packeted | Scan only the separate booklet kanji table/list pages, then run OCR intake preflight. |
| Shin Kanzen Master Kanji N3 | Awaiting purchased book/source access | `downloads/private/shin-kanzen-master/n3/` | Restricted manual-citation assignment evidence only after exact kanji table/list pages are packeted | Scan only the separate booklet kanji table/list pages, then run OCR intake preflight. |
| 3A permission inquiry | Sent by project owner on 2026-05-11 | N/A | Clarifies whether minimal citation facts may be used in a product without reproducing source content | Record response before broad commercial reliance on derived textbook facts. |
| ASK permission inquiry | Not sent yet | N/A | Same narrow permission question for ASK textbook lanes | Send the same minimal-facts permission request to ASK before paid Sou/ASK expansion. |
| Sou Matome full books | Not acquired; broad review paused | TBD | Restricted manual-citation assignment evidence only after exact pages are packeted | Resume only with fuller exact assignment access, targeted citations, or publisher permission. |
| ASK Hajimete N4/full exact pages | Not acquired | TBD | Restricted manual-citation assignment evidence only from exact supported surfaces | Pursue only if exact N4/full assignment/checklist/index access becomes available. |

## Sou Matome Broad Review Stop Decision

| Field | Decision |
| --- | --- |
| Date | 2026-05-28 |
| Scope | `nihongo_sou_matome_kanji` JLPT kanji source-evidence lane only. |
| Decision | Pause broad Sou Matome review. Keep the lane active only for exact assignment surfaces already verified by targeted citation, fuller source access, or future publisher-approved use. |
| Why | The free/public surfaces available during review did not provide exact per-kanji source-level assignment proof at scale. Table-of-contents evidence can show a book/section exists, but it does not prove the individual kanji assignment row required by this repository's source-evidence policy. |
| Correction made | Weak table-of-contents rows were corrected from reviewed assignment evidence to non-voting `source_access_gap`. |
| Current tracked state | `442` reviewed assignments, `473` source_access_gap rows, and `1297` pending rows for `nihongo_sou_matome_kanji`. |
| Verification commands | `npm run data:audit:jlpt:source-inputs -- --source=nihongo_sou_matome_kanji --strict`; `npm run data:audit:jlpt:source-access`; `npm run data:audit:jlpt:sources -- --governance-strict --limit=25`. |
| Expected audit posture | Source-use governance may pass while evidence depth still fails. That is expected until more independent lineage and Japanese-published exact assignment evidence are reviewed. |
| Resume criteria | Resume broad Sou work only after exact kanji table/list pages, exact assignment pages, official correction-list target rows, or publisher-permitted equivalent evidence are available. Small targeted rows may continue when they already have exact assignment proof. |
| Source-use boundary | Do not commit copied textbook lists, passages, OCR text, questions, answers, scans, or raw table content. Track only minimal reviewed facts allowed by the manual-citation policy. |

## Reviewed Source-Use Decisions

| Lane | 2026-05-11 decision | Allowed use | Still blocked from |
| --- | --- | --- | --- |
| `joyo_grade` | Approved for covered MEXT/Bunka official background metadata with attribution. | Background-only sanity metadata. | JLPT assignment votes or deck movement. |
| `kanjidic2_reading_reference` | Approved under EDRDG KANJIDIC2 CC BY-SA 4.0 with attribution. | Bulk-derived tracked on/kun reading-reference contract. | Full kanji-card field verification, JLPT placement truth, copied raw XML, or release certification. |
| `kanjipedia` | Restricted field-bound use only through current-standard Platinum review notes and governed kanji card-field source contracts. | Manual kanji-card field verification citations for exact card readings and meanings. | Bulk import, copied entries, JLPT placement truth, generated TSV evidence, Obsidian proof, or release certification by itself. |
| `bunka_joyo_kanji` | Restricted supporting reading/index governance in card-field review notes. | Supporting reading-reference context when paired with a governed field verifier. | Full meaning verification, JLPT assignment votes, bulk copied indexes, or release certification by itself. |
| `jpdb` | Restricted. Terms forbid automated access/scraping and require contact before unintended use. | Sparse manual frequency sanity only, with citation. | Automated extraction, raw data storage, assignment votes. |
| `kanshudo` | Restricted. Terms reserve data and require express permission for non-study use; licensing is offered. | None for product evidence until permission/license. | Assignment import, copying, scraping, distribution, consensus voting. |
| `wanikani` | Restricted. API exists, but terms reserve content rights and require compliance with API terms/rate limits; high-throughput/resale use may require subscription access. | None for product evidence until API/export and permission path is approved. | Assignment import, copying, resale/exploitation, consensus voting. |

## OCR Intake

Run this before attempting extraction from private scans:

```bash
npm run data:audit:jlpt:source-ocr-intake
```

Use `--strict` only when private scan files and local OCR prerequisites are expected to be ready. The command is read-only and does not extract evidence or update source assignments.
