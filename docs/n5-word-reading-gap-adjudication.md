# N5 Word Reading Gap Adjudication

## Purpose

This record captures the complete N5 word-reading gap adjudication performed on
2026-08-01 against content baseline commit
`795286c28142351d0a9ef5065288d241358e093b`. It explains why the current open
reading targets remain explicit deferrals rather than automatic word-card work.

This is a pre-trust workflow record. It does not certify Silver, Gold, Sapphire,
Platinum, Obsidian, Deck Ready, CI, release trust, or release QA.

## Scope And Authority

- Scope: N5 word deck only.
- Identity: exact `kanji|readingType|reading` gap identity and exact
  `written|reading` word identity.
- Current generated evidence: 344 reading targets, 245 covered, 99 open.
- Gap classes: 83 distinct missing readings and 16 variant-style gaps.
- Card state: one `missing_word_card` target (`生|kun|いきる`) and 98
  `missing_example` targets.
- Canonical row-by-row dispositions:
  [word_reading_gap_triage_overrides.json](../templates/word_reading_gap_triage_overrides.json).
- Candidate output is advisory. It cannot place a word in N5, create a card, or
  approve any review lane.

Counts in this file are a dated snapshot. Rerun the owning commands before
using them as current evidence.

## Verification Method

The review used the current generated N5 kanji and word exports, cumulative N5
coverage scope, tracked word-level contract, local candidate sources, and the
live triage and gap-plan implementations. The decisive command surfaces were:

```bash
npm run deck:words:reading-audit:n5
npm run deck:words:triage:n5 -- --include-variants --max-items=200
npm run deck:words:gap-plan:n5 -- --include-deferred --limit=99 --suggestions=20 --min-suggestion-score=0 --quality=weak
```

The gap plan produced 762 candidate links across 87 targets. Of those, 149
reached `review` or `strong` quality and none carried sentence evidence. The 30
strong target links all resolve to existing governed N1-N4 identities: 9 N1,
8 N2, 10 N3, and 3 N4. The other 119 review-quality links are untracked
`add_governed_support_word` proposals. No review-or-strong candidate resolves
to a governed N5 identity.

## Strong Candidate Adjudication

These are all 30 strong target links. Their existing word-level placement is
decisive against pulling them into N5 only to close reading coverage.

| N5 reading target | Strong exact word identity | Governed level | Disposition |
| --- | --- | ---: | --- |
| `男\|on\|なん` | `長男\|ちょうなん` | N2 | Keep N2 |
| `間\|on\|けん` | `世間\|せけん` | N3 | Keep N3 |
| `女\|on\|にょ` | `女房\|にょうぼう` | N1 | Keep N1 |
| `女\|on\|にょう` | `女房\|にょうぼう` | N1 | Keep N1 |
| `食\|on\|じき` | `断食\|だんじき` | N3 | Keep N3 |
| `川\|on\|せん` | `河川\|かせん` | N1 | Keep N1 |
| `白\|on\|びゃく` | `白夜\|びゃくや` | N2 | Keep N2 |
| `生\|kun\|いきる` | `生きる\|いきる` | N4 | Keep N4; do not duplicate in N5 |
| `行\|kun\|ゆく` | `行方\|ゆくえ` | N2 | Keep N2 |
| `千\|kun\|ち` | `千歳\|ちとせ` | N3 | Keep N3 |
| `金\|on\|ごん` | `黄金\|おうごん` | N1 | Keep N1 |
| `上\|kun\|あがり` | `出来上がり\|できあがり` | N2 | Keep N2 |
| `下\|kun\|くだり` | `下り\|くだり` | N3 | Keep N3 |
| `語\|kun\|かたる` | `語る\|かたる` | N3 | Keep N3 |
| `上\|kun\|のぼり` | `上り\|のぼり` | N2 | Keep N2 |
| `食\|kun\|くう` | `食う\|くう` | N3 | Keep N3 |
| `半\|kun\|なかば` | `半ば\|なかば` | N3 | Keep N3 |
| `分\|kun\|わかつ` | `分かつ\|わかつ` | N1 | Keep N1 |
| `聞\|kun\|きこえる` | `聞こえる\|きこえる` | N4 | Keep N4 |
| `下\|kun\|おろす` | `下ろす\|おろす` | N3 | Keep N3 |
| `下\|kun\|くだす` | `下す\|くだす` | N2 | Keep N2 |
| `下\|kun\|くだる` | `下る\|くだる` | N2 | Keep N2 |
| `下\|kun\|さげる` | `下げる\|さげる` | N4 | Keep N4 |
| `外\|kun\|はずれる` | `外れる\|はずれる` | N2 | Keep N2 |
| `学\|kun\|まなぶ` | `学ぶ\|まなぶ` | N3 | Keep N3 |
| `休\|kun\|やすまる` | `休まる\|やすまる` | N3 | Keep N3 |
| `休\|kun\|やすめる` | `休める\|やすめる` | N1 | Keep N1 |
| `後\|kun\|おくれる` | `後れる\|おくれる` | N1 | Keep N1 |
| `生\|kun\|いかす` | `生かす\|いかす` | N1 | Keep N1 |
| `生\|kun\|はやす` | `生やす\|はやす` | N1 | Keep N1 |

## Review-Only Candidate Adjudication

Twenty-three targets had review-quality but no strong candidate. Every
review-quality link was untracked, had no sentence evidence, and lacked a
governed N5 level assignment. The candidate families were still inspected;
none can be promoted from planner output.

| Reading target | Reviewed candidate family | Disposition reason |
| --- | --- | --- |
| `二\|on\|じ` | `二男\|じなん` | Family-order vocabulary, not governed N5 |
| `一\|on\|いつ` | `均一`, `択一`, `単一`, `統一`, `同一`, `唯一`, `画一` | Abstract/later-level compounds |
| `気\|on\|け` | `気配`, `湿気`, `眠気`, and related forms | Untracked compound set; no sentence-backed N5 candidate |
| `山\|on\|さん` | `山積`, `山脈`, `山林`, `沢山`, and related forms | Mixed later-level, proper-name, and specialized senses |
| `出\|on\|すい` | `出納\|すいとう` | Specialized accounting vocabulary |
| `上\|on\|しょう` | `上人\|しょうにん` | Religious title, not beginner coverage |
| `金\|on\|こん` | `金剛`, `金堂` | Religious/material proper-domain vocabulary |
| `行\|on\|あん` | `行脚\|あんぎゃ` | Specialized/literary vocabulary |
| `聞\|on\|もん` | `聴聞\|ちょうもん` | Formal/specialized vocabulary |
| `下\|kun\|しも` | `川下`, `風下`, `下期` | Untracked compounds without N5 evidence |
| `円\|kun\|まる` | `円味`, `円顔` | Learner-facing roundness belongs under `丸` |
| `金\|kun\|がね` | `引き金`, `針金`, `留め金`, and related forms | Untracked technical/material compounds |
| `読\|on\|とく` | `読本\|とくほん` | Specialized/older noun |
| `本\|kun\|もと` | `山本`, `大本`, `本木`, and related forms | Mostly names or later-domain vocabulary |
| `小\|kun\|さ` | `小竹\|ささ` | Name/rare-form risk |
| `母\|kun\|も` | `雲母\|うんも` | Mineral term |
| `毎\|kun\|ごと` | `丸毎\|まるごと` | Nonstandard learner orthography; prefer `丸ごと` |
| `来\|on\|たい` | `出来\|しゅったい` | Formal/literary reading |
| `八\|kun\|やつ` | `八つ当たり\|やつあたり` variants | Later idiom with N3 kanji `当`; not N5 counter support |
| `三\|kun\|みつ` | `三つ折り\|みつおり` variants | Later compound with N3 kanji `折` |
| `四\|kun\|よつ` | `四つ切り\|よつぎり` variants | Photography-size term; not beginner coverage |
| `上\|kun\|のぼせる` | `上気せる`, `逆上せる` | Orthographic/later-level risk |
| `二\|kun\|ふたたび` | `二度\|ふたたび` | Misleading per-kanji analysis; use governed `再び\|ふたたび` in N3 |

## Weak Or No Qualified Candidate Targets

The remaining 46 targets had no strong or review-quality candidate. Their
explicit row notes in the canonical override file record the individual
archaic, rare, misleading, whole-word, duplicate, or learner-value reason:

`子|on|つ`, `上|on|しゃん`, `西|on|す`, `校|on|きょう`,
`今|on|きん`, `入|on|じゅ`, `六|on|りく`, `山|on|せん`,
`読|on|とう`, `外|kun|ほか`, `先|kun|まず`, `十|kun|そ`,
`長|kun|おさ`, `天|kun|あめ`, `百|kun|もも`, `中|kun|うち`,
`三|on|ぞう`, `八|on|はつ`, `左|on|しゃ`, `万|kun|よろず`,
`円|kun|まど`, `六|kun|むつ`, `生|kun|なる`, `六|kun|むい`,
`中|kun|あたる`, `天|kun|あまつ`, `食|kun|はむ`,
`生|kun|なす`, `生|kun|むす`, `円|kun|まるい`,
`行|kun|おこなう`, `食|kun|くらう`, `生|kun|うむ`,
`来|kun|きたる`, `円|kun|まどか`, `円|kun|まろやか`,
`上|kun|のぼす`, `毎|kun|ごとに`, `生|kun|おう`,
`高|kun|たかまる`, `高|kun|たかめる`, `大|kun|おおいに`,
`出|kun|いだす`, `出|kun|いでる`, `来|kun|きたす`, and
`上|kun|たてまつる`.

## Variant Gap Reconciliation

The prior override file had the correct total count for the wrong key set: 16
current variant gaps had no exact override, while 16 obsolete overrides
remained. Fourteen obsolete targets are now covered by the N5 word deck; the
other two (`山|on|ざん` and `西|on|すい`) are no longer current reading targets.

All 16 current variants now have explicit editorial notes:

| Current variant target | Evidence-based disposition |
| --- | --- |
| `三\|kun\|みつ` | Keep whole counter `三つ\|みっつ`; do not duplicate an ungeminated source form |
| `四\|kun\|よつ` | Keep `四つ\|よっつ`; preserve explicit `四 -> よ` analysis in `四つ角\|よつかど` |
| `八\|kun\|やつ` | Keep whole counter `八つ\|やっつ`; later idiom candidates do not justify N5 |
| `六\|kun\|むつ` | Keep whole counter `六つ\|むっつ`; do not duplicate an ungeminated source form |
| `六\|kun\|むい` | Preserve `六日\|むいか` as an explicitly non-decomposable whole-word reading |
| `出\|kun\|いだす` | Literary/older variant; N5 already teaches `出す\|だす` |
| `出\|kun\|いでる` | Literary/older variant; N5 already teaches `出る\|でる` |
| `生\|kun\|うむ` | No governed N5 candidate; N5 already teaches the practical `生まれる` family |
| `生\|kun\|おう` | Uncommon/literary reading with no viable current candidate |
| `高\|kun\|たかまる` | Existing later-level verb; N5 already teaches `高い` and `高さ` |
| `高\|kun\|たかめる` | Governed N2 verb; do not pull it into N5 for coverage |
| `大\|kun\|おおいに` | Governed N3 whole-word adverb `大いに`; not an N5 support need |
| `天\|kun\|あまつ` | Literary/classical form; N5 already covers `天気` and `天の川` |
| `二\|kun\|ふたたび` | Do not misattribute governed N3 `再び\|ふたたび` to `二` |
| `来\|kun\|きたす` | Formal later-level vocabulary; keep N5 on practical `来る` forms |
| `来\|kun\|きたる` | Formal/literary reading; keep N5 on practical `来る` forms |

The 16 obsolete keys were removed only from the triage override map. No word
row, source contract, Silver decision, Gold fixture, Sapphire manifest,
Platinum manifest, Obsidian proof, generated package, or release evidence was
changed.

## Final Disposition

- All 99 current N5 gaps have an exact tracked editorial disposition.
- Default/unconfigured dispositions: 0.
- Stale tracked dispositions: 0.
- N5 card admissions from this adjudication: 0.
- Governed content writes from this adjudication: 0.
- The 99 gaps are expected incomplete coverage, not a regression and not a
  release-readiness claim.

Any future N5 admission requires new exact governed N5 source/level evidence,
learner-value judgment, sentence and media readiness, a dry-run-first Silver
transaction, and fresh downstream lane review. A changed generated gap set must
be reconciled by exact keys; matching totals are not evidence of alignment.

## Update Triggers

Refresh this record and the canonical override file when any of the following
changes:

- N5 kanji reading targets;
- N5 word inventory or explicit coverage metadata;
- word-level placement contracts;
- candidate source inputs or scoring policy;
- gap classification or exact identity rules; or
- any N5 reading gap is admitted, covered, retired, or rerouted.
