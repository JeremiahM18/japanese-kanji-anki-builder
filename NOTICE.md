# NOTICE

This project packages generated learning artifacts and governed media for JLPT kanji and word study decks.

## Audio attribution

Current shipped audio policy is governed by `templates/audio_source_policy.json`.

When VOICEVOX Nemo audio is shipped, release artifacts and release notes should include credit equivalent to:

`Audio generated with VOICEVOX Nemo`

Follow the current pinned source, speaker, and locale contract defined in the tracked audio policy.

## Pitch accent attribution

Current shipped pitch accent policy is governed by `templates/word_pitch_accent_data.json`.

Kanjium-derived pitch accent entries are derived from the Kanjium pitch accent database by mifunetoshiro and are licensed under CC BY-SA 4.0. Release artifacts that include those entries should include attribution equivalent to:

`Pitch accent data derived from Kanjium by mifunetoshiro, licensed under CC BY-SA 4.0`

VOICEVOX Nemo accent-query entries are generated pronunciation guidance and should be credited consistently with VOICEVOX Nemo usage.

## Stroke-order attribution

Current shipped stroke-order policy is governed by `templates/stroke_order_source_policy.json`.

KanjiVG-derived static SVG stroke-order images are distributed under Creative Commons Attribution-Share Alike 3.0. Release artifacts that include KanjiVG-derived assets should include KanjiVG attribution and license notice.

kanji.gif and AnimCJK animation mirrors are allowed release sources only while source attribution and provenance remain preserved in managed media manifests. Release artifacts that include those animations should include the corresponding upstream attribution from the manifest/source review.

## Kanji dictionary attribution

Current kanji-card readings, meanings, and kanji word-candidate data are fetched from `kanjiapi.dev` unless a local fallback or curated override supplies the field. The upstream API project builds these endpoints from EDRDG KANJIDIC2 and JMdict dictionary files.

The tracked kanji reading-reference contract in `templates/kanji_reading_reference_contract.json` is derived directly from EDRDG KANJIDIC2 `ja_on` and `ja_kun` readings. It is governed as reading-reference evidence only and carries the same CC BY-SA 4.0 attribution obligation.

The tracked N5 and N4 kanji card-field source contracts contain manual field-bound citation notes from governed Platinum review evidence. N5 uses `templates/kanji_card_field_source_contract.json`; N4 uses `templates/kanji_card_field_source_contracts/n4.json`. Kanjipedia is used as restricted manual `kanji-field-verification` evidence; Bunka Joyo Kanji material is supporting reading/index governance only. These citations must not be expanded into copied dictionary entries, bulk source data, or JLPT placement truth.

KANJIDIC2 and JMdict are property of the Electronic Dictionary Research and Development Group and are made available under Creative Commons Attribution-ShareAlike 4.0. Public kanji deck releases that include kanjiapi-derived readings, meanings, or word data must include attribution equivalent to:

`Kanji readings, meanings, and word data derived from kanjiapi.dev using EDRDG KANJIDIC2 and JMdict data, licensed under CC BY-SA 4.0`

Public redistributed kanji deck artifacts that include these fields should be treated as incorporating CC BY-SA 4.0 dictionary-derived content. Private local builds still need provenance preserved in generated artifacts and release notes before any public sharing.

## Word-source support attribution

Tracked or redistributed exact word-identity support facts derived from JMdict
remain JMdict-derived data. JMdict and data files derived from it are made
available by the Electronic Dictionary Research and Development Group under
Creative Commons Attribution-ShareAlike 4.0. The repository's software licence
does not relicense those facts. Any artifact that includes them must preserve
EDRDG/JMdict attribution, include or link the EDRDG licence, apply the required
share-alike treatment to the derived data surface, and must not claim copyright
over JMdict material. Attribution equivalent to the following is required:

`Exact word-identity and priority support data derived from EDRDG JMdict, licensed under CC BY-SA 4.0: https://www.edrdg.org/edrdg/licence.html`

The stored JMdict exact written-reading dictionary identity and priority-marker
facts are support evidence only. They do not establish learner-facing meaning
correctness; that requires a separate governed field-level comparison and
evidence surface. These facts are not JLPT-placement votes, independent
placement lineages, permissioned learner-source evidence, card approval, or
release readiness. The EDRDG licence also requires a procedure for regular
updating from the most recent JMdict versions; the tracked source manifests
define the pinned snapshot and fail-closed refresh interval.

TubeLex-derived commonness support uses only the aggregate Japanese frequency
list published by the NAIST NLP project. The full subtitle corpus is not
published because of source copyright and must not be scraped, reconstructed,
stored, or redistributed through this project. TubeLex frequency facts are
positive commonness/usefulness support only. They do not prove JLPT placement,
dictionary identity, reading, meaning, learner-source coverage, card approval,
or release readiness. The exact upstream commit and aggregate-file checksum
must remain pinned in the tracked source manifests.

TubeLex is distributed under the following BSD 3-Clause licence:

```text
BSD 3-Clause License

Copyright (c) 2022-4, Adam Nohejl
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## Additional release responsibility

Before publishing a release artifact, confirm:

- dependency licensing remains acceptable for distribution
- managed media provenance remains governed
- release notes or artifact docs include any required source attributions

This file is the starting point for explicit product attribution. Expand it as additional governed sources become part of shipped artifacts.
