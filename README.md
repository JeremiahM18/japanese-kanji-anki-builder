# Japanese Kanji Anki Builder

Japanese Kanji Anki Builder creates reviewed Anki flashcard decks for JLPT kanji and vocabulary. It combines curated study data, example sentences, pronunciation audio, stroke-order media, pitch-accent information, and tracked review contracts into exportable Anki decks.

Run this first:

```bash
npm run doctor
```

Kanji cards and word cards are separate learning products. A kanji card teaches one target kanji; a word card teaches one exact written form and reading.

Kanji card field preview:

```text
Kanji: 日
DisplayWord: 日
MeaningJP: day / sun
PrimaryReading: ひ
KanjiMeanings: day / sun / Japan / counter for days
StudyWordKanji: [blank]
OnReading: ジツ、 ニチ
KunReading: -か、 -び、 ひ
StrokeOrder: 65E5_日-stroke-order.gif
Audio: 65E5_日-kanji-reading-日-ひ.wav
Radical: 日
Notes: 日(ひ) - day / sun ／ 日本(にほん) - Japan ／ 日曜日(にちようび) - Sunday
ExampleSentence: 今日はいい日です。 ／ きょうはいいひです。 ／ Today is a good day.
```

Word card field preview:

```text
Word: 春雨
Reading: はるさめ
ReadingBreakdown: 春[はる] 雨[さめ]
Audio: 96E8_雨-word-reading-春雨-はるさめ.wav
PitchAccent: Pitch 1: 0
Meaning: glass noodles / spring rain
JLPTLevel: JLPT N5
CoverageRole: Reading coverage support
FocusKanji: 雨
CoversReading: 雨: さめ
KanjiBreakdown:
  春[はる] - spring, JLPT N4 kanji, stroke order 6625_春-stroke-order.gif, On: シュン, Kun: はる
  雨[さめ] - rain, stroke order 96E8_雨-stroke-order.gif, On: ウ, Kun: -さめ、 あま-、 あめ
ExampleSentence: 春雨スープを食べます。 ／ はるさめスープをたべます。 ／ I eat harusame soup.
Notes: Common food and seasonal word; retained because it gives a real learner-facing 春雨 word for the 雨 -> さめ pattern, not just coverage padding.
```

Tiny TSV excerpt:

```tsv
Surface	Reading	Meaning	Example
日	ひ	day / sun	今日はいい日です。 ／ きょうはいいひです。 ／ Today is a good day.
春雨	はるさめ	glass noodles / spring rain	春雨スープを食べます。 ／ はるさめスープをたべます。 ／ I eat harusame soup.
```

See the tracked mini fixture in [examples/n5-mini](examples/n5-mini) for sample input metadata and exact generated TSV rows. The field previews above are plain text summaries of those exported fields.

```mermaid
flowchart TD
    A["Governed inputs<br/>JLPT contracts + curated study data<br/>sentence corpus + media manifests"] --> B["Loaders + normalizers"]
    B --> C["Inference + ranking + validation"]
    C --> D["Kanji deck rows"]
    C --> E["Word deck rows"]
    D --> F["TSV exports + optional APKG packaging"]
    E --> F
    F --> G["Gold regression + Platinum gate<br/>Obsidian proof + release gates"]
```

## About

Japanese Kanji Anki Builder makes Anki study decks for Japanese learners. It builds JLPT kanji decks and JLPT vocabulary decks with readings, meanings, example sentences, notes, stroke-order animations, audio, pitch accent data for word cards, and labels for kanji that are above the current deck level or outside the tracked JLPT list.

The kanji decks and word decks are separate products:

- Kanji decks teach one kanji at a time. The front of the card is only the target kanji. The back teaches that kanji's primary learner-facing reading and meaning, then uses words and sentences as support.
- Word decks teach vocabulary by exact written form and reading, such as `学校|がっこう`. A useful word can appear even if it contains harder kanji, but the card must label those kanji instead of pretending they belong to the current level.

The engineering goal is controlled output. The repository does not rely on silent fallbacks or untracked local edits for release-ready decks. Tracked JSON contracts define the JLPT kanji inventory, word eligibility, Anki note fields, media policy, and review expectations. Build scripts produce deterministic TSV exports and byte-stable optional `.apkg` packages from unchanged packaged inputs. Audit, review, readiness, and release-gate commands check for missing audio, missing stroke-order media, schema drift, bad labels, unreviewed learner-facing content, and generated content that has not been promoted into tracked source files.

Ignored local files under `data/` are workspace inputs. They are not product truth unless a tracked contract or template promotes the data into the repository. Deck-facing JLPT runtime readers fail closed when the ignored `data/kanji_jlpt_only.json` inventory drifts from [templates/jlpt_level_contract.json](templates/jlpt_level_contract.json); use `data:audit:jlpt` for details or `data:sync:jlpt` to resync that local file.

## Testing Philosophy

- [Repository governance tests](test/repositoryGovernance.test.js) protect source-of-truth boundaries, README/source-lane consistency, CI contract names, CODEOWNERS coverage, and source-evidence routing.
- The tracked [examples/n5-mini](examples/n5-mini) fixture locks exact generated TSV rows against the live note schemas so schema or export drift is visible immediately.
- Gold regression protects generated card output from drift; Platinum gates check current structural evidence; Obsidian proof records substantive current-version rereview.

## Scope

- Kanji decks for JLPT N5 through N1.
- Word decks grouped by JLPT level.
- Curated learner-facing readings, meanings, examples, notes, and media.
- Managed stroke-order images, looping stroke-order animations, and governed audio.
- Offline-safe preview, review, build, and package commands.
- CI smoke verification and release-gate validation.

## Quick Start

```bash
npm install
npm run doctor
npm run corpus:init
npm run curated:init
npm run words:init
npm run media:init
npm run deck:ready -- --levels=5
npm run deck:words:ready -- --levels=5
```

Kanji deck readiness requires governed audio and complete exported media fields. A level with missing exact primary-reading audio must not be treated as ready even if the managed manifest inventory reports audio coverage.

Use the workflow sections below for preview, `.apkg`, media, audio, and release commands. Native `.apkg` commands require the Python packaging toolchain. If packaging is blocked on a workstation, use the readiness output and package directory for review, and run `.apkg` packaging in a supported environment before release.

## Review Tiers

These tier names are product gates, not marketing labels. Kanji and word decks run them separately.

| Tier | What it means | What it does not prove |
| --- | --- | --- |
| Silver | A generated card surface exists for the product. | Reviewed content, source truth, release quality, or learner usefulness. |
| Gold | Gold regression protects reviewed generated output from drift. | Source truth, release approval, or substantive current-version rereview. |
| Platinum | The card passes the current product's structural Platinum gate against live generated rows. Evidence lanes are separated into governed source truth, internal checks, and reviewer judgment. | Obsidian proof, native-level language judgment, or permission to shrink the square-zero certification denominator. |
| Obsidian | Explicit non-mechanical current-version rereview proof exists for the live card. For kanji, this includes structured rereview provenance and actual example-sentence review evidence for naturalness, learner usefulness, level fit, support-only usage, reading, and translation. | A later fluent/native audit unless that provenance is separately recorded. |

## Current Baseline

Run live commands for release decisions. This section is an orientation snapshot, not the release gate.

### Kanji Product

| Surface | Current state | Main gates |
| --- | --- | --- |
| N5 kanji | `80/80` Gold, `80/80` Platinum, `80/80` Obsidian. | `deck:platinum:n5`, `deck:kanji:platinum:certify-status -- --levels=5`, `deck:ready -- --levels=5` |
| N4 kanji | `212/212` Gold, `212/212` Platinum, `212/212` Obsidian. | `deck:platinum:n4`, `deck:platinum:rereview-status -- --levels=5,4`, `deck:ready -- --levels=4` |
| N3 kanji | `341/341` Gold; Platinum not started. | `deck:kanji:review-status`, `deck:ready -- --levels=3` |
| N2 kanji | `349/349` Gold; Platinum not started. | `deck:kanji:review-status`, `deck:ready -- --levels=2` |
| N1 kanji | `1230/1230` Gold; Platinum not started. | `deck:kanji:review-status`, `deck:ready -- --levels=1` |
| Additional kanji source-claim diagnostic | `0` physical additional cards. The governed diagnostic currently suppresses `421` raw source claims because they collide with core-retained kanji; unresolved duplicates are `0`. | `deck:kanji:additional:ready`, `deck:kanji:review-status` |

Kanji Platinum uses `kanji-platinum-v3-evidence-lanes`. Only current-standard `platinum` and `fixed_then_platinum` entries count as active Platinum. Legacy or unversioned history is non-certifying backlog until it is revalidated under the current standard.

### Word Product

| Surface | Current state | Main gates |
| --- | --- | --- |
| N5 word | `287` canonical rows plus `20` source-only phrase exclusions. Gold, readiness, tracked-source artifact, and Platinum pass at `287/287`; `160/287` are Obsidian and `127` remain in the square-zero Obsidian queue. | `deck:words:platinum:n5`, `deck:words:platinum:rereview-status -- --levels=5,4` |
| N4 word | `700` canonical rows after finishing the routed N5-source target-N4 move workload. The Silver/generated card surface builds at `700/700` with word audio, pitch, required back-side fields, word-level placement, examples, and labels complete; completion is `ready_with_deferred_variants` with reading coverage `76.7%` (`579/755`) and only deferred variants remaining. Gold and Platinum still cover `667/700`; the 33 routed rows are not Gold, Platinum, or Obsidian yet. Obsidian is `0/700`. | `deck:words:ready -- --levels=4`, `deck:words:completion:n4`, `deck:words:review:n4`, `deck:words:platinum:n4`, `deck:words:expansion-signals -- --levels=5,4` |
| N3 word | `269` canonical rows. Silver generated surface now builds at `269/269` with required back-side fields `2959/2959`, word audio `269/269`, Kanjium pitch `269/269`, reading breakdowns, and deck-policy checks passing for those rows; readiness is still `incomplete`, cumulative reading coverage is `233/1232` (`18.9%`), the Tanos N3 vocabulary lane has `359` review candidates (`350` untriaged, `8` deferred, `1` rejected), and Gold/Platinum/Obsidian are not started. | `deck:words:ready -- --levels=3`, `deck:words:completion:n3`, `deck:words:reading-audit:n3`, `deck:words:triage:n3`, `deck:words:gap-plan:n3`, `deck:words:expansion-candidates:n3` |
| N2 word | `28` canonical rows. Silver generated surface now builds at `28/28` with required back-side fields `308/308`, word audio `28/28`, Kanjium pitch `28/28`, reading breakdowns, and deck-policy checks passing for those rows; readiness is still `incomplete`, cumulative reading coverage is `44/1061` (`4.1%`), the Tanos N2 vocabulary lane has `415` remaining untriaged review candidates, and Gold/Platinum/Obsidian are not started. | `deck:words:ready -- --levels=2`, `deck:words:completion:n2`, `deck:words:reading-audit:n2`, `deck:words:triage:n2`, `deck:words:gap-plan:n2`, `deck:words:expansion-candidates:n2` |
| N1 word | `26` canonical rows. Silver generated surface now builds at `26/26` with required back-side fields `286/286`, word audio `26/26`, Kanjium pitch `26/26`, reading breakdowns, and deck-policy checks passing for those rows; readiness is still `incomplete`, cumulative reading coverage is `39/3284` (`1.2%`), the Tanos N1 vocabulary lane has `1008` remaining untriaged review candidates, and Gold/Platinum/Obsidian are not started. | `deck:words:ready -- --levels=1`, `deck:words:completion:n1`, `deck:words:reading-audit:n1`, `deck:words:triage:n1`, `deck:words:gap-plan:n1`, `deck:words:expansion-candidates:n1` |

Word Platinum uses `word-platinum-v3-evidence-lanes`. Current N5/N4 generated word denominator is `987` rows. Structural Platinum is `954/987`, Obsidian is `160/987`, `794` Platinum entries need Obsidian, and `33` generated N4 rows are blocked/failing because they are newly routed Silver rows without Gold or current-standard Platinum entries yet. The word source-posture report is scoped to the `954` structurally current-standard entries only: `121/954` have independent source families proven, `833/954` are single-source-family, and `0/954` are missing governed source evidence; single-source entries carry `word_source_independence_not_proven`.

Current N5/N4 source-list routing status: N5 enhancement candidates are exhausted for current-level promotion and, after physically routing all 33 target-N4 rows, the N5 signal currently reports `118/118` remaining cross-level routing rows (`108` move candidates, `10` rejected rows, `0` untriaged). All 33 N5-source target-N4 move candidates have now been physically routed into the N4 word contract/starter data; the remaining routed target-level backlog is N4 `0`, N3 `212`, N2 `97`, and N1 `41`. N4 enhancement candidates are also exhausted for current-level promotion, while known-JLPT rows with no N4 anchor are tracked separately and fully triaged at `256/256` cross-level routing rows (`242` move candidates, `11` rejected rows, `3` deferred rows, `0` untriaged). These routing rows do not reopen N5/N4 current-level expansion and do not move cards by themselves.

N3, N2, and N1 word Silver are generated-surface baselines only. There are no `templates/golden_n3_word_review_set.json`, `templates/platinum_n3_word_review_set.json`, `templates/golden_n2_word_review_set.json`, `templates/platinum_n2_word_review_set.json`, `templates/golden_n1_word_review_set.json`, or `templates/platinum_n1_word_review_set.json` files. The active `tanos-n3-vocab`, `tanos-n2-vocab`, and `tanos-n1-vocab` lanes are pinned to ignored normalized TSV files for candidate discovery and weak level hints only; they are not card approval, dictionary evidence, reading evidence, meaning evidence, pitch evidence, frequency evidence, or release readiness.

### Cross-Product Gates

- `deck:platinum:rereview-status -- --levels=5,4` currently reports N5/N4 kanji as `292/292` Platinum, `292/292` Obsidian, `0/292` needing Obsidian, and `0/292` blocked/failing.
- `deck:kanji:platinum:certify-status -- --levels=5,4` is the fail-closed kanji Obsidian gate. It currently passes for the full N5/N4 kanji square-zero certification denominator.
- `deck:words:platinum:rereview-status -- --levels=5,4` uses generated word rows as the denominator. N4 word `0/700` Obsidian remains separate from `667/700` structural Platinum; the 33 newly routed N4 Silver rows are blocked/failing until Gold and Platinum review entries are added.
- `deck:platinum:governance-gate` exercises real generated N5/N4 kanji and word rows when ignored local inputs are present. It currently passes with an `allowed_incomplete_word_platinum_level` warning for the 33 newly routed N4 Silver rows that do not yet have Gold/Platinum review coverage, plus the existing governance warnings for missing Obsidian proof, word single-source-family posture, card-specific or bulk revalidation summaries, marker-only example-quality automation, and zero active verification limitations.
- JLPT kanji source evidence is governed separately from deck readiness. The source audit currently passes source-use governance with `--governance-strict` while evidence-depth work remains incomplete.

## Reading Order

- Tier model, current status, and local gates: this README's Review Tiers, Current Baseline, and Standard Verification sections.
- Release bar: [docs/product-exit-criteria.md](docs/product-exit-criteria.md), [docs/release-process.md](docs/release-process.md), and [docs/release-qa-checklist.md](docs/release-qa-checklist.md).
- Card-quality decisions: [docs/platinum-review-policy.md](docs/platinum-review-policy.md).
- Source-evidence work: [docs/source-evidence-batching.md](docs/source-evidence-batching.md) and [docs/source-acquisition-register.md](docs/source-acquisition-register.md).
- Platform compatibility: [docs/compatibility-matrix.md](docs/compatibility-matrix.md).

## Source Of Truth

Tracked contracts define release behavior:

- JLPT kanji taxonomy: [templates/jlpt_level_contract.json](templates/jlpt_level_contract.json)
- JLPT kanji source-evidence registry, source-use policy, source tiers, publisher-independence groups, evidence lineages, canonical confidence states (`high_confidence`, `standard_confidence`, `disputed`, `weak_evidence`, `unknown`), and routed per-source assignment files: [templates/jlpt_kanji_source_evidence.json](templates/jlpt_kanji_source_evidence.json), [templates/jlpt_kanji_source_evidence/assignments](templates/jlpt_kanji_source_evidence/assignments)
- JLPT kanji source acquisition and private-intake register: [docs/source-acquisition-register.md](docs/source-acquisition-register.md)
- JLPT kanji source-input preflight config for ignored local source files and integrity pins: [templates/jlpt_kanji_source_inputs.json](templates/jlpt_kanji_source_inputs.json)
- JLPT word taxonomy: [templates/jlpt_word_level_contract.json](templates/jlpt_word_level_contract.json)
- Audio source policy: [templates/audio_source_policy.json](templates/audio_source_policy.json)
- Kanji note schema: [src/config/ankiNoteSchema.json](src/config/ankiNoteSchema.json)
- Word note schema: [src/config/ankiWordNoteSchema.json](src/config/ankiWordNoteSchema.json)
- Gold kanji regression sets: [templates/golden_n5_review_set.json](templates/golden_n5_review_set.json), [templates/golden_n4_review_set.json](templates/golden_n4_review_set.json), [templates/golden_n3_review_set.json](templates/golden_n3_review_set.json), [templates/golden_n2_review_set.json](templates/golden_n2_review_set.json), [templates/golden_n1_review_set.json](templates/golden_n1_review_set.json)
- Gold additional-unverified kanji regression sets: [templates/golden_additional_unverified_n5_review_set.json](templates/golden_additional_unverified_n5_review_set.json), [templates/golden_additional_unverified_n4_review_set.json](templates/golden_additional_unverified_n4_review_set.json), [templates/golden_additional_unverified_n3_review_set.json](templates/golden_additional_unverified_n3_review_set.json), [templates/golden_additional_unverified_n2_review_set.json](templates/golden_additional_unverified_n2_review_set.json), [templates/golden_additional_unverified_n1_review_set.json](templates/golden_additional_unverified_n1_review_set.json)
- Gold word regression sets: [templates/golden_n5_word_review_set.json](templates/golden_n5_word_review_set.json), [templates/golden_n4_word_review_set.json](templates/golden_n4_word_review_set.json)
- Platinum policy: [docs/platinum-review-policy.md](docs/platinum-review-policy.md)
- Platinum kanji review sets: [templates/platinum_n5_review_set.json](templates/platinum_n5_review_set.json), [templates/platinum_n4_review_set.json](templates/platinum_n4_review_set.json), [templates/platinum_n3_review_set.json](templates/platinum_n3_review_set.json), [templates/platinum_n2_review_set.json](templates/platinum_n2_review_set.json), [templates/platinum_n1_review_set.json](templates/platinum_n1_review_set.json)
- Platinum additional unverified kanji review sets: [templates/platinum_additional_unverified_n5_review_set.json](templates/platinum_additional_unverified_n5_review_set.json), [templates/platinum_additional_unverified_n4_review_set.json](templates/platinum_additional_unverified_n4_review_set.json), [templates/platinum_additional_unverified_n3_review_set.json](templates/platinum_additional_unverified_n3_review_set.json), [templates/platinum_additional_unverified_n2_review_set.json](templates/platinum_additional_unverified_n2_review_set.json), [templates/platinum_additional_unverified_n1_review_set.json](templates/platinum_additional_unverified_n1_review_set.json)
- Platinum word review sets: [templates/platinum_n5_word_review_set.json](templates/platinum_n5_word_review_set.json), [templates/platinum_n4_word_review_set.json](templates/platinum_n4_word_review_set.json)
- Platinum card-source role manifest: [templates/platinum_card_source_manifest.json](templates/platinum_card_source_manifest.json)
- Word source manifest and source-purpose rules: [templates/word_source_manifest.json](templates/word_source_manifest.json)
- Word source lanes currently include active ignored-local JMdict dictionary verification plus JMdict priority/commonness support; `jpdb-frequency` remains blocked pending permission/governed export.
- Word expansion signal source config and ignored-source integrity pins: [templates/word_expansion_signal_sources.json](templates/word_expansion_signal_sources.json)

## JLPT Kanji Source Evidence At A Glance

The source-evidence manifest is the governed source registry: [templates/jlpt_kanji_source_evidence.json](templates/jlpt_kanji_source_evidence.json). This table is a human-readable summary of the current lanes. The current JLPT kanji contract is an operational comparator, not final source truth, and no source lane can move kanji, move words, update decks, or change readiness by itself.

Reviewer evidence is loaded as source-centric `assignments[sourceId][kanji]` rows and stored in routed per-source assignment files. Assignment files may use local `evidenceRecords` to store repeated `citation`, `evidenceRef`, and reviewer `notes` once; the loader rehydrates those records before audits or imports see the normalized rows. The materialized `kanji` rollup is derived summary state and intentionally keeps only level/review-status facts plus computed consensus, agreement, confidence, and notes so reviewer citations are not duplicated across the manifest.

Manifest status is a lifecycle gate, not a work queue label. `planned` means registered but not under active import/review, `in_review` means manual review or source-input preparation is underway, `active` means the lane may be imported and counted according to its governed use, and `blocked` means it must not enter consensus. Non-active lanes remain inactive/non-voting until reviewed rows, source provenance, source-input integrity, and explicit activation are all in place.

| Source lane | Source / location | Current use |
| --- | --- | --- |
| `current_operational_contract` | [Tracked JLPT kanji contract](templates/jlpt_level_contract.json) | Active non-voting comparator for the current operational taxonomy |
| `tanos_legacy_direct` | [Tanos JLPT direct legacy resources](https://www.tanos.co.uk/jlpt/sharing/) | Active approved bulk-import assignment evidence for direct legacy N1, N4, and N5 mappings |
| `tanos_estimated_split` | [Tanos estimated N2/N3 resources](https://www.tanos.co.uk/jlpt/sharing/) | Active approved lower-weight assignment evidence for estimated N2/N3 splits; cannot settle taxonomy movement alone |
| `tanos_frequency_method_notes` | [Tanos sharing/method notes](https://www.tanos.co.uk/jlpt/sharing/) | Active non-voting methodology lane explaining why Tanos N2/N3 evidence is estimated |
| `kanjidic2_legacy` | [KANJIDIC2 legacy JLPT metadata](https://www.edrdg.org/wiki/KANJIDIC_Project.html) | Active approved bulk-import assignment evidence; current pinned rows are exact N1/N4/N5 only, with old JLPT 2 preserved as N2/N3 range evidence when present |
| `official_jlpt_sample_workbooks` | [Official JLPT sample questions/workbooks](https://www.jlpt.jp/e/samples/sampleindex.html?mode=pc-5) | Active occurrence-only evidence; stores only source PDF, section/page/question reference, and observed kanji |
| `japanese_textbook_consensus` | Derived from individual textbook lanes in the source manifest | Active non-voting derived summary; never manually imported as a copied list |
| `ask_hajimete_jlpt_kanji` | [ASK Hajimete JLPT kanji books](https://ask-books.com/series/jlpt-kanji/) | Active restricted manual-citation kanji textbook lane with `208` reviewed assignments, `0` non-importing `source_access_gap` rows, and `0` pending rows from pinned official N1/N3 sample target-entry and index pages plus exact N2 and N5 checklist pages; N4 remains unsupported until exact assignment proof is verified |
| `jlptsensei` | [JLPT Sensei kanji lists](https://jlptsensei.com/) | Registered secondary non-Japanese manual-citation signal only after Japanese-published evidence is no longer the dominant blocker; inactive/non-voting until reviewed rows are pinned and source activated; do not scrape, copy, or republish lists |
| `shin_kanzen_master_kanji` | [Shin Kanzen Master textbooks](https://www.3anet.co.jp/np/en/list.html?series_id=4) | Active restricted manual-citation assignment lane with `406` reviewed assignments and `236` non-importing `source_access_gap` rows; `1570` worksheet rows remain pending until exact source-level evidence is reviewed |
| `nihongo_sou_matome_kanji` | [Nihongo Sou Matome textbooks](https://www.ask-books.com/jp/somatome/) | Active restricted manual-citation textbook lane with `498` reviewed assignments and `417` non-importing `source_access_gap` rows; `1297` worksheet rows remain pending; continue targeted review only where exact assignment proof is available |
| `try_jlpt_textbook` | [TRY! JLPT textbooks](https://ask-books.com/jlpt-try) | Blocked unless exact per-kanji assignment proof is found; a 2026-05-08 source-access spike found official public TRY materials expose grammar/vocabulary surfaces, not exact per-kanji assignment proof |
| `joyo_grade` | [Agency for Cultural Affairs Joyo kanji index](https://www.bunka.go.jp/seisaku/kokugo_nihongo/kokugo_shisaku/joyokanjihyo_sakuin/index.html) | Approved official background metadata only; not JLPT assignment proof |
| `bccwj_frequency` | [BCCWJ frequency lists](https://clrd.ninjal.ac.jp/bccwj/en/freq-list.html) | Registered frequency sanity only; not assignment truth |
| `kanji_alive` | [Kanji Alive credits/data policy](https://kanjialive.com/credits/) | Registered learner/background metadata only; not JLPT assignment proof |
| `jpdb` | [jpdb kanji metadata](https://jpdb.io/) | Restricted manual frequency sanity only after source-use review; no automated extraction, raw data storage, assignment truth, or consensus voting |
| `kanshudo` | [Kanshudo terms](https://www.kanshudo.com/tc) | Restricted and blocked until express permission/license and a governed use path are approved |
| `wanikani` | [WaniKani terms](https://www.wanikani.com/terms) | Restricted and blocked until source-use/API/export terms and a governed use path are approved |

## Product Rules

Kanji decks:

- Each shipped kanji belongs to the tracked JLPT kanji contract.
- The JLPT kanji contract is the current operational taxonomy, not sole source truth. Non-disputed source consensus can be promoted only by an explicit governed contract migration; source confidence is still audited separately by the JLPT kanji source-evidence audit.
- N5, N4, N3, N2, and N1 kanji are fully protected by Gold regression coverage.
- N1 kanji Gold regression coverage is complete: `1230/1230` reviewed. N1 can only be treated as ready when exact primary-reading audio and level readiness both pass.
- The kanji deck learning target is the individual kanji. `DisplayWord` is the target kanji itself, and `PrimaryReading` is the most learner-useful, level-appropriate reading for that kanji.
- Compound words belong in notes, examples, and word decks; they must not replace the kanji-card anchor.
- `deck:ready` fails on export fallbacks unless `--allow-export-fallbacks` is explicit.
- Static stroke-order images and looping animations are separate managed-media readiness surfaces.
- Audio is governed by policy and required for kanji deck readiness. Exported kanji cards must use exact audio for the target kanji and exported primary reading.
- Additional kanji is currently a source-claim diagnostic with `0` physical cards, not an extra learner backlog. It does not move the core JLPT contract, prove source-evidence confidence, or replace core deck readiness.
- Duplicate additional source claims and source claims for kanji already present in a core deck are suppressed by default so the kanji remains in its core deck placement and no duplicate additional card is generated. Unresolved duplicate additional claims fail `deck:kanji:review-status`.
- Additional Gold and Platinum gates protect only generated `additional_unverified_Nx` output if selected cards exist. Empty additional surfaces are valid only when `deck:kanji:additional:ready` and `deck:kanji:review-status` prove the source claims were governed and suppressed.

Word decks:

- Word identity is `written|reading`.
- The canonical word contract means default-deck eligible.
- Source-only phrase exclusions stay tracked but do not ship as default word cards.
- A word is anchored by kanji from its own deck level. Other constituent kanji are support kanji, regardless of level, and must be visibly labeled.
- If no constituent kanji belongs to the deck level, all-easier-kanji words may ship later only with an explicit learner-fit reason. This prevents hard or abstract words from being dumped into beginner decks just because their kanji are easy, without rejecting useful words outright.
- A word must not ship in an easier/higher-numbered deck when it has no current-level anchor and depends only on harder support kanji.
- Outside-JLPT constituent kanji do not choose the JLPT deck level, but they must be visibly labeled.
- Cross-level and outside-JLPT constituent kanji must be visibly labeled on the card.
- Reading coverage is scoped to the selected word-product levels. A higher-level word card can cover a lower-level reading target when those levels are built together.
- Track reading-coverage intent with `coverage.role`, `coverage.focusKanji`, and `coverage.coversReadings` when the card exists for coverage.
- Expansion triage uses `move_candidate` with a target level for valid source words that belong in another learner deck. That is a routing decision only; the word is physically moved only when the target level's word contract and starter data are updated and pass that level's gates.
- Source rows with known JLPT kanji but no current-level anchor stay out of current-level promotion counts. Expansion reports track them as cross-level routing backlog so source-level hints are preserved without forcing the word into the wrong deck.
- Sentence orthography review is advisory. It flags likely kana-only regressions without banning natural kana usage.

Gold, Platinum, and Obsidian:

- Gold regression protects reviewed generated output from drift. It checks that exported learner-facing fields match the current governed contract.
- Gold regression does not mean release approval.
- Platinum gates current structural and card-quality requirements against live generated rows.
- Platinum requires field-bound source evidence, explicit quality gates, and a keep/fix/defer/remove decision. Evidence that only says a field was "reviewed" is not enough; it must name the card, exported reading, and learner-facing values it supports.
- Active word-card `japanese-source` evidence must cite a source registered in [templates/platinum_card_source_manifest.json](templates/platinum_card_source_manifest.json) for `word-field-verification`. Generated output, Gold regression expectations, tracked starter templates, ignored local data, source-claim lists, and local caches do not satisfy that role by themselves. Kanji-reference evidence may support `single-kanji-word-field-verification` only for one-kanji word cards.
- Active kanji-card `japanese-source` evidence must cite a source registered for `kanji-field-verification` for card-field accuracy. This does not certify JLPT placement or source-governance confidence, and the same source may support kanji and word product reviews when it directly verifies each card's fields. Platinum uses JLPT kanji source-governance origins only to reject circular field verification against the same source family.
- Active word Platinum also enforces word-level placement: a card needs a current-level kanji anchor, or a learner-fit rationale for later all-easier-kanji placement.
- Platinum removes or defers noise instead of preserving cards that are uncommon, awkward, too advanced for the level, or only present to chase coverage.
- Platinum may improve source data and example sentences before promotion.
- Obsidian certification requires explicit non-mechanical current-version rereview proof. Platinum entries without that proof remain in the Obsidian queue.
- Platinum manifests are in progress. Only active `platinum` and `fixed_then_platinum` entries can count as reviewed release coverage, and release coverage must also pass the current versioned platinum standard for that product surface.
- Kanji Platinum entries created before `kanji-platinum-v3-evidence-lanes`, and word Platinum entries created before `word-platinum-v3-evidence-lanes`, are legacy/unversioned history, not trusted release coverage, until they are revalidated and pass the default Platinum command.

## Standard Verification

Run before merging changes that affect decks, contracts, media, or release behavior. Benchmark budget commands are manual/local performance guardrails, not GitHub Actions CI gates, because timing budgets depend on runner hardware and the build benchmark requires a ready local workspace.

```bash
npm test
npm run lint
npm run typecheck
npm run data:audit:jlpt
npm run data:audit:jlpt:sources -- --governance-strict --limit=25
npm run data:audit:jlpt:source-levels -- --worklist-only --limit=25
npm run deck:kanji:partition-plan -- --limit=25
npm run deck:kanji:review-status
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
npm run deck:review:accessibility -- --deck-kind=kanji
npm run deck:review:accessibility -- --deck-kind=word
npm run product:artifacts:n5
npm run product:artifacts:kanji:n5:preflight
npm run product:readiness:n5
npm run release:gate
```

`product:artifacts:n5` builds a fresh N5 word TSV from tracked templates only, with network inference disabled and ignored local `data/` word, sentence, JLPT, cache, and media inputs excluded. It validates schema, canonical row count, canonical-only governance, and deterministic repeated output. It does not yet certify tracked-source kanji TSVs, `.apkg` files, or managed media packages.

`product:artifacts:kanji:n5:preflight` inspects tracked templates and reports whether N5 kanji TSV certification is possible without ignored local `data/` inputs. It currently reports `certifiable: no` because explicit on-yomi, kun-yomi, and rich-source provenance are not yet tracked as product contracts. Component/radical source data is tracked in `templates/kanji_component_contract.json`. Use `-- --require-certifiable` only when the remaining contracts exist and the command is expected to fail closed.

`data:audit:jlpt:sources` audits the operational JLPT kanji contract against the independent source-evidence registry. It is intentionally separate from deck generation and product readiness: it computes external source consensus from active voting sources that are legally/use-policy allowed to store assignment judgments, then compares the current operational contract against that external consensus. Frequency, background, occurrence, methodology, operational, derived, blocked, and `needs_review` lanes do not vote in the current assignment-consensus engine. The audit now reports both `governanceValid` and `evidenceDepthValid`: use `--governance-strict` when CI should fail only on source-use, license, reference-integrity, illegal consensus-use, declared-mismatch, or storage-governance regressions while the evidence-depth work is still honestly incomplete. Full `--strict` still fails until missing independent/Japanese-published evidence, disputes, and contract/consensus mismatches are resolved. The text report includes per-contract-level confidence counts, missing/disagreement work-queue counts, missing Japanese-published source counts, publisher-independence groups, and disputed vote-weight samples so missing evidence, shared lineage, publisher signals, and tie shapes are visible without reading JSON. Confidence ids are the canonical states; the manifest's confidence definitions only describe release meaning and blocking behavior. The audit reports current contract level, source consensus level, agreement count, publisher-independence count, independent evidence-lineage count, computed textbook consensus, confidence reasons, disagreement sources, confidence, source-use profile blockers, license/use evidence blockers, illegal consensus-use blockers, disallowed assignment-storage blockers, and whether the current contract matches consensus without changing the active contract or any decks. Re-run word placement audits after taxonomy confidence is governed and any kanji contract change is proposed, because word placement depends on kanji levels.

`data:audit:jlpt:source-levels` is a read-only companion audit for source-claimed level deltas. It answers questions like "how many kanji do active sources call N5, how many are already in the current N5 contract, and which source-backed candidates are missing from the current N5 deck?" by reporting current contract counts, active source-candidate counts, source-consensus counts, per-source claim counts, missing source candidates from the current level, missing source-consensus rows, disputed missing candidates, current-level rows whose source consensus points elsewhere, and current-level rows without same-level source support. Add `--worklist` to append an all-level source-lane batch packet, or `--worklist-only` to show only that packet, ordered by batch value: disputed source votes, missing evidence, missing Japanese-published evidence, contract/source consensus mismatches, independence gaps, and weak evidence, with each priority bucket ordered N5 through N1. Each worklist row lists the current level, all source-candidate levels, consensus level, vote weights, and exact levels that must be checked in the manual source lane so review is not narrowed to one adjacent N level. It also annotates resolved source-input worksheet progress, including active or in-review rows marked `reviewed`, `blocked`, or `source_access_gap`; those annotations are progress markers only, and reviewed rows vote only after they are imported into the governed source-evidence manifest. Use `data:audit:jlpt:sources` as the governance-closure view for final dispute and contract-movement decisions. This command is informational only: it does not move kanji, move words, update decks, or change readiness.

`deck:kanji:partition-plan` converts the source-level delta audit into a read-only kanji product plan: five core logical decks plus five `additional_unverified_Nx` logical decks. By default it includes only learner-useful earlier-placement candidates whose source consensus matches the proposed target level, excludes disputed rows, excludes source claims whose consensus points elsewhere, and reports duplicate-note risk before any physical export work. Use `--candidate-scope=all-source-claims` only for audit/debug visibility. It does not move contracts, generate decks, import evidence, or change readiness.

`deck:kanji:review-status` reports generated, Gold, active Platinum coverage, non-certifying revalidation backlog/history, and structured verification-limitation counts for the five core kanji decks and five `additional_unverified_Nx` decks. It also fails on unresolved duplicate additional source claims so duplicate notes cannot silently enter optional decks.

`deck:kanji:additional:ready` builds the additional-kanji source-claim diagnostic and any selected optional additional-unverified TSV/APKG output. It currently uses all non-disputed source claims, selects `0` physical additional cards from `421` raw source claims, retains `406` unique kanji in their core deck placement, suppresses `421` source claims, and reports `0` blank audio, `0` blank stroke-order fields, and `0` packaged media for the generated rows. It does not move the core JLPT contract or certify source-evidence confidence; source-claim evidence remains in the governed source manifests. The additional platinum aliases pass as empty surfaces only when `deck:kanji:additional:ready` and `deck:kanji:review-status` prove the source claims were suppressed.

`data:audit:jlpt:source-access` ranks source lanes before another manual textbook batch is generated. It combines the all-level source-review pressure with the source-use manifest, tracked source-input config, local worksheet existence, tracked assignment counts, and worksheet status counts. Use it when a lane starts producing mostly `source_access_gap` decisions or when a planned Japanese-published source may be a better next use of reviewer time. Occurrence-only, derived, background, frequency, blocked, and non-Japanese lanes are reported, but they are not treated as replacements for Japanese-published assignment evidence. This command is read-only and does not import evidence, move kanji, move words, update decks, or change readiness.

`data:audit:jlpt:source-ocr-intake` inventories ignored private source scans under `downloads/private/shin-kanzen-master/` and checks local OCR prerequisites before a purchased-book source review. It is read-only and does not extract evidence, import assignments, move kanji, move words, update decks, or change readiness. Use `--strict` only when private scans and local OCR tooling are expected to be ready.

`data:benchmark:jlpt:sources` is a read-only cost report for the JLPT kanji source-evidence workflow. It measures evidence-manifest load, source-input preflight, source-input import dry-run/materialization, full evidence-manifest serialization, and source-evidence audit timing plus observed Node process memory snapshots, parent-manifest and assignment-file storage, line counts, assignment counts, rollup count, and selected-source citation repetition. Memory deltas are process snapshots, not allocation-profiler output, so use repeated runs for trends. Add `--budget=default` or run `data:benchmark:jlpt:sources:gate` as a manual budget guardrail when source-review timing budgets matter. Use it before choosing performance refactors such as assignment-file evidence-record deduplication or audit caching. It does not import assignments, move kanji, move words, update decks, or change readiness, and it is not a GitHub Actions CI gate.

`data:packet:jlpt:source-review` emits a compact read-only JSON packet for AI or human source-review planning. It filters the all-level governed source worklist for the selected lane's supported levels, skips rows already resolved in that lane's local worksheet, and includes current level, review levels, source candidates, consensus, vote weights, confidence, compact source-input status, and blocker reason. The packet is planning context only: it does not create source-access proof, import evidence, move kanji, move words, update decks, or change readiness.

`data:packet:jlpt:source-access` writes an ignored JSON packet that records the exact source surface behind a large manual source-review session. Use it before generating `100+` all-level source-review rows and before merging a batch with `100+` importable `reviewed` rows. Valid surface types are `exact-kanji-table`, `official-correction-list-target-row`, `exact-assignment-page`, and `target-entry-page`. The packet is not evidence and is not imported; it only proves the batch was scoped from a source surface that can support exact assignment review. It does not create review rows, import evidence, move kanji, move words, update decks, or change readiness.

`data:audit:jlpt:official-occurrences` reports the tracked official occurrence manifest without changing decks or assignments. With `--source=<ignored-local.json|tsv>` it extracts observed kanji from locally extracted official PDF text, then emits only minimal occurrence rows: `level`, `sourcePdf`, `section`, `page`, `questionRef`, and `observedKanji`. Prefer JSON for raw PDF text because TSV source rows must keep text cells on one physical line. Add `--write` only to write the minimal occurrence manifest or TSV; the source text stays ignored and must not be committed. PDF extraction must be Unicode-verified and manually reduced to question/page-scoped occurrence rows before writing. Do not import raw page-level extraction if it includes headings, instructions, answer boilerplate, or unreliable question references. If an extractor produces zero observed kanji or corrupt references, leave the dry-run blocked and use OCR/manual review instead of manufacturing occurrence evidence. This lane is positive occurrence evidence from official JLPT samples/workbooks only: occurrence can support later review, but it is not a complete JLPT kanji list and cannot assign or move a kanji by itself. Official source policy is intentionally conservative because the JLPT sample/workbook page and site policy allow only limited citation/summarization and warn that some questions include third-party works.

`data:audit:jlpt:source-inputs` preflights ignored local source files before they can become source evidence. It verifies the configured source id, evidence manifest source status, license status, SHA-256, byte size, row count, per-row kanji/level validity, review status, citation, and evidence reference. It reports resolved rows as `reviewed + blocked + source_access_gap`, so checked rows that cannot yet become assignment evidence still count as governed review progress. It is read-only and does not import assignments, move kanji, move words, or change readiness. `reviewed` rows must have valid levels, citations, and evidence references; blank `needs_review` rows remain pending so manual source worksheets can be reviewed in governed batches without becoming evidence. Use `source_access_gap` only after permitted source material has actually been checked and exact source-level assignment proof is not available yet; it is non-importing, non-voting, not negative evidence, and is skipped by later batch-template generation until fuller source access changes the row. The `tanos_legacy_direct` input imports only the explicit N1, N4, and N5 base kanji lists. The `tanos_estimated_split` input imports only Tanos N2/N3 estimated split rows as lower-weight estimated evidence; it is visibly labeled and must not move kanji, move words, or claim final taxonomy confidence by itself. `tanos_frequency_method_notes` explains the estimated method and does not vote. The current KANJIDIC2 legacy input maps old JLPT 4 -> N5, old 3 -> N4, and old 1 -> N1 with `1479` exact reviewed rows and `0` old JLPT 2 range rows; if old JLPT 2 appears in a future pinned input, it is retained as N2/N3 range evidence and must not be converted into an exact N2 or N3 vote without governed sources. The `jlptsensei` input is restricted manual evidence only: create a blank worksheet, review level judgments with permitted citations and evidence references, pin integrity, and activate intentionally before import.

`data:merge:jlpt:source-batch` merges a small ignored batch worksheet back into the configured ignored source worksheet. It is dry-run by default; add `--write` only after reviewing the reported changed rows and blockers. For repeated source-depth review, reuse one stable ignored batch path for the lane selected by `data:audit:jlpt:source-access` and overwrite it for each reviewed pass instead of accumulating numbered scratch files. The merge rejects unknown columns, duplicate or missing kanji, batch kanji outside the source worksheet, invalid review statuses, accidental downgrades from `reviewed` back to pending, and batches with `100+` importable `reviewed` rows that do not provide `--source-access-packet=<ignored-packet.json>`. Deliberate evidence corrections from `reviewed` to non-voting statuses require `--allow-reviewed-downgrade` plus `--reviewed-downgrade-reason=...`. For sparse source worksheets that intentionally contain only resolved rows, `--allow-additions` appends new batch kanji explicitly and reports `Added source rows`; strict source-input preflight must still pass before import. It still does not import assignments, move kanji, move words, update decks, or change readiness; see [docs/source-evidence-batching.md](docs/source-evidence-batching.md) for the reviewed-batch, milestone-import, and release-gate cadence.

`data:pin:jlpt:source-input` recomputes the SHA-256, byte size, and parsed row count for one configured ignored source worksheet and updates only those tracked integrity pins plus `checkedAt` when `--write` is supplied. It requires `--reason=<why>` in write mode, refuses checkedAt-only churn when the pins already match, and does not import assignments, move kanji, move words, update decks, or change readiness. Use it after a written source-batch merge and before strict source-input preflight at an import milestone.

`data:normalize:kanjidic2-jlpt` converts an ignored local KANJIDIC2 XML or `.xml.gz` file into the normalized TSV shape required by `templates/jlpt_kanji_source_inputs.json`. The generated TSV remains ignored local input until its SHA-256, byte size, and row count are pinned. `data:import:jlpt:source-input -- --source=kanjidic2_legacy` then performs a dry-run evidence import after preflight; add `--write` only when updating the tracked source-evidence manifest. Source imports materialize only changed kanji rollup entries by default and report materialized `consensusLevel`, `confidence`, and `agreementScore` shifts before write; add `--full-rematerialize` only for intentional full manifest regeneration after source policy, source config, or materialization logic changes. Neither command moves kanji, moves words, updates decks, or changes readiness.

`data:normalize:tanos-jlpt-kanji` converts ignored local Tanos source text files into the normalized TSV shape required by `templates/jlpt_kanji_source_inputs.json`. The default lane normalizes only N1/N4/N5 direct legacy base files for `tanos_legacy_direct`; `-- --lane=estimated-split` normalizes only extracted N2/N3 PDF text for `tanos_estimated_split`. The generated TSV remains ignored local input until its SHA-256, byte size, and row count are pinned. `data:import:jlpt:source-input -- --source=tanos_legacy_direct` or `-- --source=tanos_estimated_split` then performs a dry-run evidence import after preflight; add `--write` only when updating the tracked source-evidence manifest. Source imports materialize only changed kanji rollup entries by default and report materialized `consensusLevel`, `confidence`, and `agreementScore` shifts before write; add `--full-rematerialize` only for intentional full manifest regeneration after source policy, source config, or materialization logic changes. Neither command moves kanji, moves words, updates decks, or changes readiness.

`data:template:jlpt:source-input` creates an ignored worksheet for one selected manual source lane, such as `jlptsensei` or a Japanese-published textbook source. It deliberately leaves `level`, `citation`, and `evidenceRef` blank so no row can become evidence until a reviewer fills permitted source citations, pins the TSV integrity in `templates/jlpt_kanji_source_inputs.json`, and activates that individual source intentionally. Use `--priority=source-review-worklist --limit=<n> --out=<ignored-batch.tsv>` for the default governed batch flow: it orders all levels together by source-lane batch value, disputed consensus first, then missing evidence, missing Japanese-published evidence, contract/consensus mismatches, independence gaps, and weak evidence; within each priority bucket it reviews N5 through N1. Broad source-review worklists from `11` to `99` rows require `--source-access-note="<exact source surface reviewed>"`; unbounded or `100+` row worklists require `--source-access-packet=<ignored-packet.json>`. Source inputs may declare `supportedLevels`; when present, source-review worklists keep only rows whose review levels intersect that source's declared levels. It skips rows already `reviewed`, `blocked`, or `source_access_gap` in the selected full worksheet, and requires explicit `--out` so it cannot overwrite that worksheet. Use `--priority=source-gaps` only when intentionally scanning the operational contract order by evidence-depth issue, and use `--priority=source-level-deltas --source-level=<N1-N5> --out=<ignored-batch.tsv>` only for a targeted source-claimed level delta investigation. For batch review, pass `--limit=<n>` with a reusable `--out` path rather than creating numbered files. Shin Kanzen Master, Nihongo Sou Matome, TRY!, and ASK Hajimete JLPT Kanji remain `manual-citation-only`: review from actual source access, store only reviewer level judgment plus citation/evidenceRef/notes, and do not copy textbook lists or passages. A row becomes `reviewed` only when the source material supports that exact source level judgment; adjacent-level schedules, cumulative review/basic-kanji appendices inside higher-level volumes, review tables, vocabulary-only lists, or appearance-only evidence are not assignment proof. Keep rows `needs_review` until they are actually checked. Use `source_access_gap` only when available permitted source material has been checked and does not provide exact assignment proof yet; use `blocked` only for a source-use or worksheet defect that makes the row unusable for that source lane. The TSV still exposes only import-safe manual-review fields; priority metadata appears in the command report and JSON output, not as source truth. `data:template:jlpt:textbook-source` remains an alias for the same governed worksheet flow. `japanese_textbook_consensus` is derived from individual textbook lanes and is not manually imported.

`product:readiness:n5` runs the current automated N5 product checkpoint: JLPT kanji and word audits, governed audio provenance, tracked-source N5 word TSV generation, N5 word-level placement audit, and N5 kanji and word Gold regression checks. It currently passes. It does not run or gate on the JLPT kanji source-evidence audit yet; that audit is currently read-only transparency until taxonomy confidence is governed and passing. It still does not validate tracked-source kanji TSVs, `.apkg` artifacts, manual Anki import review, mobile behavior, screen-reader behavior, or listening QA. Run the applicable Platinum command separately when a level is being version-1 locked.

`release:gate` validates deterministic smoke-fixture artifacts and packaging contracts. It does not certify public product deck readiness. Add level-specific readiness, Gold regression, accessibility, provenance, and manual QA commands for the surface being changed.

Clean CI runs `data:audit:jlpt -- --strict --tracked-only`, `data:audit:jlpt:sources -- --governance-strict --limit=25`, `data:audit:jlpt:words`, and `deck:words:platinum:source-posture -- --levels=5,4` from tracked inputs. Full `data:audit:jlpt` and `deck:platinum:governance-gate` remain local-data gates because they validate ignored runtime/generated-row inputs under `data/`; their absence from clean CI is a release-scope limitation, not proof that real generated rows were validated.

## Core Workflows

### Setup

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
- `voicevox:start:fresh` intentionally recreates that container with `-p 50021:50121` when an old local container exists without the required port mapping.
- `doctor:voicevox` verifies the local VOICEVOX Nemo engine and pinned release speaker.
- `deck:readiness` reports per-level deck readiness.

### Bootstrap Local Data

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

### Preview And Review

```bash
npm run deck:preview -- --level=5 --limit=5
npm run deck:preview -- --kanji=日,本,学
npm run deck:platinum:batch -- --level=5 --limit=12
npm run deck:platinum:batch -- --level=5 --kanji=父,生,男
npm run deck:words:platinum:batch -- --level=5 --limit=8
npm run deck:words:platinum:batch -- --level=5 --words=今日:きょう,八日:ようか
npm run deck:words:level-anchor-audit -- --level=5
npm run deck:review:n5
npm run deck:review:n4
npm run deck:review:n3
npm run deck:review:n2
npm run deck:review:n1
npm run deck:kanji:review-status
npm run deck:kanji:additional:review:n5
npm run deck:kanji:additional:review:n4
npm run deck:kanji:additional:review:n3
npm run deck:kanji:additional:review:n2
npm run deck:kanji:additional:review:n1
npm run deck:review:coverage
npm run deck:review:coverage -- --level=1
node scripts/reviewPlatinumKanjiLevel.js --level=5
npm run deck:words:review:n5
npm run deck:words:review:n4
node scripts/reviewPlatinumWordLevel.js --level=5
```

Tier names: Silver means generated surface, Gold means regression protection, Platinum means current-standard structural gate, and Obsidian means explicit non-mechanical current-version rereview proof. `deck:platinum:batch` and `deck:words:platinum:batch` are read-only pre-review reports; they do not create entries or prove release readiness. Use `--queue=missing-current-standard` only when intentionally inspecting structural coverage gaps. The `npm run deck:platinum:n5` and `npm run deck:words:platinum:n5` commands are full-level Platinum gates and fail unless every generated N5 card has an active current-standard structural entry.

### Build Kanji Decks

```bash
npm run deck:ready -- --levels=5
npm run deck:apkg -- --levels=5
npm run deck:kanji:additional:ready
```

`deck:ready` validates setup, syncs media, builds exports, packages files under `out/build/package`, rebuilds from a clean package directory, reports managed manifest coverage and exported card media completeness, and fails on export fallbacks by default. Exported card media completeness is the release-critical signal for kanji deck media readiness.

Use `--allow-export-fallbacks` only for an explicitly degraded local artifact.

`deck:kanji:additional:ready` writes separate `additional_unverified_Nx` exports under `out/build/additional_unverified` and packages them as a separate `kanji-additional` APKG. The governed default currently writes empty `0`-row exports because all raw additional source claims are already-core source-claim collisions and are suppressed from the physical surface. Do not merge those rows into the core deck or treat their Gold manifests as source-evidence proof.

### Build Word Decks

```bash
npm run deck:words:ready -- --levels=5
npm run deck:words:apkg -- --levels=5
```

Word readiness reports:

- shipped row governance
- canonical inventory counts
- source-only exclusions
- word-level placement violations
- explicit reading-coverage contract counts
- selected-level reading coverage
- active triage backlog
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

### Plan Word Reading Coverage

```bash
npm run deck:words:gap-plan:n4 -- --limit=50
npm run deck:words:gap-plan:n4 -- --only=contract-extensions --quality=strong --limit=15 --suggestions=3
```

The gap planner ranks open reading coverage work and suggests candidate support words from:

- tracked word entries
- sentence corpus rows
- local kanjiapi word cache evidence

Planner output is advisory. A suggested card still needs canonical contract coverage, explicit reading intent, cross-level labels, media, sentence review, and deck-policy validation before shipping.

### Plan Word Inventory Expansion

```bash
npm run deck:words:expansion-candidates:n5 -- --source=downloads/n5-vocab.tsv --source-label=jlptstudy.net-n5 --limit=50
npm run deck:words:expansion-candidates:n5 -- --source=downloads/n5-vocab.tsv --source-label=jlptstudy.net-n5 --kanji-scope=target-level --require-source-level
npm run deck:words:expansion-candidates:n4 -- --limit=50
npm run data:normalize:tanos-jlpt-words -- --level=3
npm run deck:words:expansion-candidates:n3 -- --limit=50
npm run data:normalize:tanos-jlpt-words -- --level=2
npm run deck:words:expansion-candidates:n2 -- --limit=50
npm run data:normalize:tanos-jlpt-words -- --level=1
npm run deck:words:expansion-candidates:n1 -- --limit=50
```

The expansion candidate report is a read-only post-coverage tool. Use it after the current reading-coverage pass to compare an explicit sourced vocabulary list against the governed word contract. It filters for written-reading rows that contain target-level kanji, are not already governed or excluded, and fit the requested kanji scope:

- `at-or-below` keeps words whose kanji are all target-level or easier; this is the default.
- `target-level` keeps only words whose kanji are all from the requested level.
- `known-jlpt` allows harder known JLPT kanji but reports them for review.
- `any` allows outside-JLPT kanji but reports them for review.

Expansion candidates are not product truth. A candidate list may reveal useful vocabulary, but every promoted word still needs source/commonness review, level-fit review, examples, reading breakdowns, kanji labels, audio, pitch policy compliance, Gold regression, Platinum evidence, and readiness validation.

Rows that contain known JLPT kanji but no current-level kanji are reported separately as cross-level routing rows. They are not current-level promotion candidates and do not make the current level active by themselves; physical movement still requires explicit target-level contract and starter-data review.

The report deduplicates exact `written|reading` identities and also flags same-written candidates that already have another governed or excluded reading. Those warnings are review prompts, not automatic rejection: approve multiple readings only when the extra card is useful, common, level-fit, and worth teaching as its own word identity.

Tracked triage decisions live in [templates/word_inventory_expansion_triage.json](templates/word_inventory_expansion_triage.json). These decisions are read-only planning metadata, not card approvals. `keep_candidate` means "worth source-checking next"; it does not bypass the 8-card word Platinum batch size, generated-surface inspection, Gold regression, Platinum evidence, media review, or readiness gates.

When `--source` is omitted, the report resolves the single active `candidate-discovery` source for the requested level from [templates/word_source_manifest.json](templates/word_source_manifest.json), applies its source label, format, candidate policy, and local integrity pins, then fails instead of trusting a mismatched ignored TSV. N3 resolves the active pinned `tanos-n3-vocab` lane by default, N2 resolves the active pinned `tanos-n2-vocab` lane by default, and N1 resolves the active pinned `tanos-n1-vocab` lane by default.

### Check Word Expansion Signals

```bash
npm run deck:words:expansion-signals -- --levels=5,4
```

The expansion signal command answers the narrow "fully expanded under current restraints?" question for each selected word level. It has three separate signals:

- Reading signal: `exhausted` only when active reading-gap triage is cleared. Remaining coverage gaps may still exist when they are explicitly deferred variants or lower learner value.
- Enhancement signal: `exhausted` only when the configured source vocabulary list has no remaining `keep_candidate` rows and no untriaged review candidates.
- Placement signal: `resolved` only when canonical word rows either have a current-level kanji anchor or carry a tracked learner-fit reason for later all-easier-kanji placement.

The configured source TSVs under `downloads/` are ignored local inputs, so the signal source config pins their source URL, source label, SHA-256, byte size, and parsed row count. The enhancement signal verifies those pins before reporting `exhausted`; a mismatch reports `source_mismatch` and strict mode fails instead of trusting an unverified local file.

The signal is deliberately not a release claim. It does not replace Gold regression, Platinum gates, Obsidian proof, APKG import QA, accessibility checks, media/listening QA, or readiness gates. Levels without configured source lists, matching source integrity, generated TSV exports, or resolved placement policy report that blocker instead of pretending to be complete.

## Media Workflows

### Stroke Order

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

Stroke-order release provenance is governed by `templates/stroke_order_source_policy.json`; run the audit before treating new media as release-ready. The automated gate verifies approved source policy, managed manifests, and target-bound review evidence. It does not prove stroke-sequence correctness by itself. Platinum evidence must state that the stroke-order media was visually checked for the target kanji.

### Audio

```bash
npm run voicevox:status
npm run voicevox:start
npm run doctor:voicevox
npm run media:voicevox -- --list-speakers
npm run media:voicevox -- --level=5 --speaker-id=10005 --concurrency=4
npm run media:voicevox:words -- --level=5 --speaker-id=10005 --concurrency=4
npm run voicevox:stop
npm run media:sync -- --level=5 --limit=100
npm run media:sync:words -- --level=5
npm run media:review:audio -- --level=5 --limit=25
npm run media:review:word-audio -- --level=5 --limit=25
npm run data:audit:audio -- --json
```

Use the npm scripts for governed audio work. The word-audio generator is `scripts/generateWordVoicevoxAudio.js` behind `npm run media:voicevox:words`; `scripts/generateVoicevoxWordAudio.js` is not a repo path.

The release audio policy requires:

- VOICEVOX Nemo
- pinned release speaker `女声1`, style id `10005`
- local engine reachable at `http://127.0.0.1:50021`; the `voicevox-nemo` Docker container must map host `50021` to Nemo container port `50121`
- explicit source, voice, locale, and category provenance
- one release audio source
- no remote-audio release provider

Generated audio must pass review before release.

## CI And Release

GitHub Actions verification:

- Ubuntu lint and full test matrix on Node 18, 20, and 22.
- Tracked-template JLPT kanji source-governance, kanji taxonomy, word taxonomy, and word Platinum source-posture checks on Node 18, 20, and 22.
- Cross-platform smoke matrix on Ubuntu, Windows, and macOS for Node 18 and 22.
- Ubuntu release smoke gate on Node 22 with native `.apkg` packaging validation for fixture artifacts.
- Clean CI does not run `deck:platinum:governance-gate` because that command exercises ignored local `data/*` real generated-row inputs. Run it in a local-data workspace before release claims that depend on current generated N5/N4 rows.
- Benchmark budget commands such as `data:benchmark:jlpt:sources:gate` and `bench:build:gate` are manual/local performance guardrails, not GitHub Actions CI gates. Run them when source-evidence storage, audit performance, build performance, or packaging performance changes; `bench:build:gate` requires a ready local workspace and writes benchmark output under the configured benchmark output directory.

Release process:

- Follow [docs/release-process.md](docs/release-process.md).
- Keep [CHANGELOG.md](CHANGELOG.md) current.
- Use `v<package.json version>` tags.
- Keep [NOTICE.md](NOTICE.md) current for shipped attribution.

Repository governance:

- [docs/branch-protection.md](docs/branch-protection.md)
- [.github/CODEOWNERS](.github/CODEOWNERS)
- [CLAUDE.md](CLAUDE.md)

## Command Reference

| Command | Purpose |
| --- | --- |
| `npm test` | Run the full test suite |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run the staged JSDoc typecheck gate |
| `npm run ci:smoke` | Build deterministic smoke artifacts |
| `npm run release:gate` | Validate smoke-fixture release artifact contracts |
| `npm run product:artifacts:n5` | Build and validate the tracked-source N5 word TSV artifact |
| `npm run product:artifacts:kanji:n5:preflight` | Report whether tracked-source N5 kanji TSV certification is possible |
| `npm run product:readiness:n5` | Run the automated N5 product readiness checkpoint |
| `npm run doctor` | Check setup, coverage, readiness, and next steps |
| `npm run doctor:voicevox` | Verify local governed VOICEVOX setup |
| `npm run voicevox:status` | Inspect the local VOICEVOX Docker container and required host-to-container port mapping |
| `npm run voicevox:start` | Start the governed local VOICEVOX Docker container when it already has the required port mapping |
| `npm run voicevox:start:fresh` | Recreate the local VOICEVOX Docker container with host `50021` mapped to container `50121` when the old container shape is wrong |
| `npm run voicevox:stop` | Stop the local VOICEVOX Docker container after governed audio work |
| `npm run deck:readiness` | Report per-level quality gates |
| `npm run deck:preview` | Preview kanji cards |
| `npm run deck:platinum:batch -- --level=5 --limit=12` | Build a read-only kanji review packet for the selected queue |
| `npm run deck:kanji:platinum:certify-status -- --levels=5,4` | Fail-closed kanji Obsidian certification status |
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
| `npm run deck:words:platinum:rereview-status -- --levels=5,4` | Classify word Platinum pass versus Obsidian proof |
| `npm run deck:words:platinum:source-posture -- --levels=5,4` | Classify active word Platinum source-family independence posture |
| `npm run deck:words:level-anchor-audit -- --level=5` | Fail when canonical word rows lack a current-level kanji anchor or later all-easier-kanji placement lacks learner-fit rationale |
| `npm run deck:words:completion:n5` | Audit N5 word inventory and reading coverage |
| `npm run deck:words:completion:n4` | Audit N4 word inventory and reading coverage |
| `npm run deck:words:completion:n3` | Audit N3 word Silver inventory and reading coverage |
| `npm run deck:words:completion:n2` | Audit N2 word Silver inventory and reading coverage |
| `npm run deck:words:completion:n1` | Audit N1 word Silver inventory and reading coverage |
| `npm run deck:words:reading-audit:n4` | Audit N4 word reading coverage |
| `npm run deck:words:reading-audit:n3` | Audit N3 word reading coverage |
| `npm run deck:words:reading-audit:n2` | Audit N2 word reading coverage |
| `npm run deck:words:reading-audit:n1` | Audit N1 word reading coverage |
| `npm run deck:words:triage:n4` | Classify N4 word reading gaps |
| `npm run deck:words:triage:n3` | Classify N3 word reading gaps |
| `npm run deck:words:triage:n2` | Classify N2 word reading gaps |
| `npm run deck:words:triage:n1` | Classify N1 word reading gaps |
| `npm run deck:words:gap-plan:n4 -- --limit=50` | Rank the next N4 word coverage batch |
| `npm run deck:words:gap-plan:n3 -- --limit=50` | Rank the current N3 word gap queue; generated candidate suggestions remain separate from source activation and review |
| `npm run deck:words:gap-plan:n2 -- --limit=50` | Rank the current N2 word gap queue; generated candidate suggestions remain separate from source activation and review |
| `npm run deck:words:gap-plan:n1 -- --limit=50` | Rank the current N1 word gap queue; generated candidate suggestions remain separate from source activation and review |
| `npm run deck:words:expansion-candidates:n4 -- --limit=50` | Diff the manifest-pinned level source into read-only word expansion candidates |
| `npm run data:normalize:tanos-jlpt-words -- --level=3` | Normalize ignored Tanos N3 extracted vocabulary text into the pinned local source TSV |
| `npm run deck:words:expansion-candidates:n3 -- --limit=50` | Diff the manifest-pinned Tanos N3 candidate-discovery source into read-only word expansion candidates |
| `npm run data:normalize:tanos-jlpt-words -- --level=2` | Normalize ignored Tanos N2 Mnemosyne English and hiragana exports into the pinned local source TSV |
| `npm run deck:words:expansion-candidates:n2 -- --limit=50` | Diff the manifest-pinned Tanos N2 candidate-discovery source into read-only word expansion candidates |
| `npm run data:normalize:tanos-jlpt-words -- --level=1` | Normalize ignored Tanos N1 Mnemosyne English and hiragana exports into the pinned local source TSV |
| `npm run deck:words:expansion-candidates:n1 -- --limit=50` | Diff the manifest-pinned Tanos N1 candidate-discovery source into read-only word expansion candidates |
| `npm run data:normalize:words:jmdict` | Normalize ignored local JMdict XML into the pinned word dictionary/commonness TSV shape |
| `npm run deck:words:candidate-agreement -- --levels=5,4` | Rebuild the N5/N4 candidate universe from the governed word source manifest with source-purpose, agreement, triage, and placement signals |
| `npm run deck:words:expansion-signals -- --levels=5,4` | Summarize per-level reading and enhancement expansion exhaustion without claiming release readiness |
| `npm run data:audit:jlpt` | Audit local-data kanji taxonomy, starter alignment, and Gold review placement; use `-- --strict --tracked-only` for clean CI tracked-input alignment |
| `npm run data:audit:jlpt:sources -- --governance-strict` | Audit JLPT kanji source evidence and fail only on source-governance regressions while evidence depth remains incomplete |
| `npm run data:audit:jlpt:source-levels -- --worklist-only --limit=10` | Report the focused all-level governed review packet with current level, candidate levels, consensus, vote weights, and resolved source-input worksheet progress without changing decks or readiness |
| `npm run data:audit:jlpt:source-access` | Rank source lanes by governed usefulness and current source-access state before spending another manual review batch |
| `npm run data:audit:jlpt:source-ocr-intake` | Inventory ignored private Shin scan files and OCR prerequisites before purchased-book extraction |
| `npm run data:audit:jlpt:official-occurrences` | Report or extract official JLPT positive occurrence evidence without storing question text or assigning levels |
| `npm run data:benchmark:jlpt:sources:gate -- --source=<source-id>` | Manual source-evidence performance guardrail; fail locally when benchmark timing exceeds configured default budgets |
| `npm run bench:build:gate` | Manual local-data build performance guardrail; requires a ready workspace and writes benchmark output |
| `npm run data:packet:jlpt:source-review -- --source=<source-id> --limit=25` | Emit compact read-only JSON planning rows for the next governed source-review packet |
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
| `npm run data:template:jlpt:textbook-source -- --source=<source-id> --priority=source-review-worklist --limit=10 --out=<ignored-batch.tsv>` | Create or overwrite one reusable ignored all-level manual-review batch for a Japanese-published textbook source lane, ordered by source-lane batch value; use a source-access note for `11-99` rows and a source-access packet for `100+` rows |
| `npm run data:template:jlpt:textbook-source -- --source=<source-id> --priority=source-gaps --limit=10 --out=<ignored-batch.tsv>` | Create or overwrite one reusable ignored manual-review batch for a Japanese-published textbook source lane, ordered by current source-evidence blockers in operational contract order |
| `npm run data:template:jlpt:textbook-source -- --source=<source-id> --priority=source-level-deltas --source-level=5 --limit=10 --out=<ignored-batch.tsv>` | Create or overwrite one reusable ignored manual-review batch for active source-claimed deltas outside the current operational contract |
| `npm run data:audit:jlpt:words` | Audit word taxonomy and starter alignment |
| `npm run data:audit:audio` | Audit managed audio provenance |
| `npm run data:sync:jlpt` | Sync local ignored JLPT data to the tracked contract |
| `npm run corpus:init` | Create or merge sentence corpus data |
| `npm run curated:init` | Create or merge curated kanji data |
| `npm run words:init` | Create or merge curated word data |
| `npm run media:init` | Create media source folders and `.env` |
| `npm run media:plan` | Report missing media and accepted filenames |
| `npm run media:sync` | Sync media into managed storage |

## Local Data

Expected ignored workspace data:

- `data/kanji_jlpt_only.json`
- `data/KRADFILE` as a local fallback only; governed deck builds prefer `templates/kanji_component_contract.json`
- `data/sentence_corpus.json`
- `data/curated_study_data.json`
- `data/word_study_data.json`

`data/kanji_jlpt_only.json` is ignored runtime input, not source truth. Deck-facing loaders guard it against the tracked JLPT level contract; audit and sync commands intentionally read it unguarded so they can report or repair drift.

Managed media:

- `data/media/`

Media source folders:

- `data/media_sources/stroke-order/images/`
- `data/media_sources/stroke-order/animations/`
- `data/media_sources/audio/`

Optional `.env` settings:

- `NODE_ENV`
- `WORD_STUDY_DATA_PATH`
- `VOICEVOX_ENGINE_URL`
- `VOICEVOX_SPEAKER_ID`
- `REMOTE_STROKE_ORDER_IMAGE_BASE_URL`
- `REMOTE_STROKE_ORDER_ANIMATION_BASE_URL`
- `REMOTE_STROKE_ORDER_ANIMCJK_BASE_URL`
- `REMOTE_AUDIO_BASE_URL`
- `MEDIA_MANIFEST_CACHE_TTL_MS`

## Pitch Accent Provenance

Word-card pitch accent data is source-governed separately from the starter vocabulary contract:

- `templates/word_pitch_accent_data.json` stores pitch patterns and source IDs.
- `npm run data:import:pitch:kanjium -- --levels=5` imports dictionary-backed matches from `downloads/kanjium/accents.txt`; use `--levels=4` for N4.
- `npm run data:import:pitch:voicevox -- --levels=5 --allow-reading-fallback` fills remaining generated pronunciation guidance from the local VOICEVOX Nemo engine; use `--levels=4` for N4.

Kanjium-derived entries are dictionary data under CC BY-SA 4.0 and must keep attribution in release notes. VOICEVOX-derived entries are generated accent-query results and are tracked with a different source ID; they are not described as dictionary-verified.

## Deck Model

Kanji card fields include:

- `DisplayWord`
- `MeaningJP`
- `PrimaryReading`
- `KanjiMeanings`
- `StudyWordKanji`
- `OnReading`
- `KunReading`
- `StrokeOrder`
- `Audio`

The front of a kanji card shows only the target kanji. The back starts with `PrimaryReading` plus the learner-facing meaning associated with that reading from `MeaningJP`. The chosen reading must be the most learner-useful, level-appropriate reading for the kanji, not simply the first dictionary reading or whichever reading already has audio. Broader kanji meanings live separately in `KanjiMeanings`; they must not be collapsed into the primary-reading line. Curated starter entries may use `blockedMeanings` to suppress low-value dictionary glosses from `KanjiMeanings` without hiding the governed learner-facing meaning. `StrokeOrder` is the single learner-facing looping stroke-order animation field; static stroke-order images remain managed media/provenance inputs but are not exported as Anki note fields. `DisplayWord` remains an exported contract field and must equal the target kanji, but it is not repeated as a visible card-back study word. `StudyWordKanji` is blank for kanji cards because the learning target is the individual kanji; compounds and study words belong in ruby-formatted notes, examples, and word decks. The build pipeline rejects kanji exports that replace the target-kanji anchor with a compound or omit the primary reading. Audio is selected only when managed media has an exact `kanji-reading` asset for the target kanji and exported primary reading.

Word card fields include:

- `Word`
- `Reading`
- `ReadingBreakdown`
- `Audio`
- `PitchAccent`
- `Meaning`
- `JLPTLevel`
- `CoverageRole`
- `FocusKanji`
- `CoversReading`
- `KanjiBreakdown`
- `ExampleSentence`
- `Notes`

The front of a word card shows the written study word without furigana. The back uses `ReadingBreakdown` as the primary reading surface, then shows audio, source-labeled pitch accent guidance when available, meaning, JLPT label, coverage role, example sentence, notes, and a constituent kanji breakdown.

`ReadingBreakdown` is required for every shipped word card. Kanji words render learner-facing ruby furigana, kana-only words render the kana reading in the same position, and whole-word ruby fallback is used when safe segmentation is not available. Irregular compounds use curated overrides instead of unsafe automatic segmentation.

`PitchAccent` is a dedicated pronunciation field. In exported word cards it renders a learner-facing Tokyo pitch contour graph with mora labels and no redundant source-pattern caption. Leave it blank unless the accent pattern comes from a product-approved source in `templates/word_pitch_accent_data.json` or an explicitly curated, source-declared override. Generated VOICEVOX pitch may ship only with the visible `Generated pitch (unverified)` label; the label is a learner/reviewer warning, not dictionary-backed pitch proof.

Word deck readiness verifies pitch accent accuracy against the governed source pattern. A word row with a non-empty `PitchAccent` field is not enough: the rendered pitch contour must decode to the same accent numbers as the tracked source entry, and the source entry must belong to the same written word and reading. Rows with missing, ungoverned, invalid, source/render-mismatched, source-identity-mismatched, or generated-but-unlabeled pitch accent block readiness. Generated pitch provenance by itself does not block readiness when the governed source identity, source/render match, and visible generated label all pass.

`KanjiBreakdown` includes constituent meanings, readings, stroke-order animation, and cross-level badges such as `JLPT N4 kanji`. Its readings are bound to `ReadingBreakdown`: safe per-kanji ruby drives the constituent reading (`電車` shows `車 -> しゃ`), while non-decomposable whole-word ruby is labeled as `word reading: ...` and `CoversReading` uses the whole written surface (`今日: きょう`) instead of pretending each kanji has that reading. Word readiness fails when a constituent panel drifts from deterministic ruby, when whole-word ruby is counted as a per-kanji reading, when `FocusKanji` names a kanji that is not in the written word, or when word-level placement lacks a current-level kanji anchor or later all-easier-kanji placement lacks an explicit learner-fit rationale.

## Output Layout

Kanji build artifacts:

- `out/build/exports/`
- `out/build/reports/`
- `out/build/build-summary.json`
- `out/build/package/`

Word build artifacts:

- `out/word-build/exports/`
- `out/word-build/reports/`
- `out/word-build/build-summary.json`
- `out/word-build/package/`
