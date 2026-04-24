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

## Additional release responsibility

Before publishing a release artifact, confirm:

- dependency licensing remains acceptable for distribution
- managed media provenance remains governed
- release notes or artifact docs include any required source attributions

This file is the starting point for explicit product attribution. Expand it as additional governed sources become part of shipped artifacts.
