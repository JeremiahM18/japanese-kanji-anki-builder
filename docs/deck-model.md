# Deck Model

This document describes the learner-facing card contracts for the kanji and word decks.

Kanji cards and word cards are separate products. A kanji card teaches one target kanji. A word card teaches one exact written form and reading.

## Kanji card preview

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

## Word card preview

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
ExampleSentence: 春雨スープを食べます。 ／ はるさめスープをたべます。 ／ I eat glass noodle soup.
Notes: Common food and seasonal word; retained because it gives a real learner-facing 春雨 word for the 雨 -> さめ pattern.
```

## Tiny TSV excerpt

```tsv
Surface	Reading	Meaning	Example
日	ひ	day / sun	今日はいい日です。 ／ きょうはいいひです。 ／ Today is a good day.
春雨	はるさめ	glass noodles / spring rain	春雨スープを食べます。 ／ はるさめスープをたべます。 ／ I eat glass noodle soup.
```

The tracked mini fixture in [../examples/n5-mini](../examples/n5-mini) contains sample input metadata and exact generated TSV rows. The previews above are plain-text summaries of exported fields.

## Kanji card fields

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

The front of a kanji card shows only the target kanji. The back starts with `PrimaryReading` plus the learner-facing meaning associated with that reading from `MeaningJP`.

The chosen reading must be the most learner-useful, level-appropriate reading for the kanji, not simply the first dictionary reading or whichever reading already has audio. Broader kanji meanings live separately in `KanjiMeanings`; they must not be collapsed into the primary-reading line.

Curated starter entries may use `blockedMeanings` to suppress low-value dictionary glosses from `KanjiMeanings` without hiding the governed learner-facing meaning. `StrokeOrder` is the single learner-facing looping stroke-order animation field. Static stroke-order images remain managed media/provenance inputs but are not exported as Anki note fields.

`DisplayWord` remains an exported contract field and must equal the target kanji, but it is not repeated as a visible card-back study word. `StudyWordKanji` is blank for kanji cards because the learning target is the individual kanji. Compounds and study words belong in ruby-formatted notes, examples, and word decks.

The build pipeline rejects kanji exports that replace the target-kanji anchor with a compound or omit the primary reading. Audio is selected only when managed media has an exact `kanji-reading` asset for the target kanji and exported primary reading.

## Word card fields

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

`PitchAccent` is a dedicated pronunciation field. In exported word cards it renders a learner-facing Tokyo pitch contour graph with mora labels and no redundant source-pattern caption. Leave it blank unless the accent pattern comes from a product-approved source in [../templates/word_pitch_accent_data.json](../templates/word_pitch_accent_data.json) or an explicitly curated, source-declared override.

Generated VOICEVOX pitch may ship only with the visible `Generated pitch (unverified)` label. The label is a learner/reviewer warning, not dictionary-backed pitch proof.

Word deck readiness verifies pitch accent accuracy against the governed source pattern. A word row with a non-empty `PitchAccent` field is not enough. The rendered pitch contour must decode to the same accent numbers as the tracked source entry, and the source entry must belong to the same written word and reading.

Rows with missing, ungoverned, invalid, source/render-mismatched, source-identity-mismatched, or generated-but-unlabeled pitch accent block readiness. Generated pitch provenance by itself does not block readiness when the governed source identity, source/render match, and visible generated label all pass.

`KanjiBreakdown` includes constituent meanings, readings, stroke-order animation, and cross-level badges such as `JLPT N4 kanji`. Its readings are bound to `ReadingBreakdown`: safe per-kanji ruby drives the constituent reading (`電車` shows `車 -> しゃ`), while non-decomposable whole-word ruby is labeled as `word reading: ...`.

`CoversReading` uses the whole written surface for whole-word readings, such as `今日: きょう`, instead of pretending each kanji has that reading. Word readiness fails when a constituent panel drifts from deterministic ruby, when whole-word ruby is counted as a per-kanji reading, when `FocusKanji` names a kanji that is not in the written word, or when word-level placement lacks a current-level kanji anchor or later all-easier-kanji placement lacks an explicit learner-fit rationale.

## Pitch accent provenance

Word-card pitch accent data is source-governed separately from the starter vocabulary contract:

- [../templates/word_pitch_accent_data.json](../templates/word_pitch_accent_data.json) stores pitch patterns and source IDs.
- `npm run data:import:pitch:kanjium -- --levels=5` imports dictionary-backed matches from `downloads/kanjium/accents.txt`; use `--levels=4` for N4.
- `npm run data:import:pitch:voicevox -- --levels=5 --allow-reading-fallback` fills remaining generated pronunciation guidance from the local VOICEVOX Nemo engine; use `--levels=4` for N4.

Kanjium-derived entries are dictionary data under CC BY-SA 4.0 and must keep attribution in release notes. VOICEVOX-derived entries are generated accent-query results and are tracked with a different source ID; they are not described as dictionary-verified.
