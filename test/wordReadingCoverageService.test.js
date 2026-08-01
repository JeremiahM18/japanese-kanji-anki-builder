const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildWordReadingGapTriage,
  classifyGapKind,
  buildCoverageSourceSummary,
  buildWordReadingCoverageReport,
  formatWordReadingGapTriage,
  normalizeReadingToken,
  parseCoverageRole,
  parseCoversReadingField,
  parseDelimitedReadingField,
  parseExampleEntries,
  parseFocusKanjiField,
  parseKanjiTsv,
  parseWordTsv,
} = require('../src/services/wordReadingCoverageService');
const { loadWordReadingGapTriageOverrides } = require('../src/datasets/wordReadingGapTriageOverrides');

test('normalizeReadingToken normalizes katakana and dictionary punctuation', () => {
  assert.equal(normalizeReadingToken('オン: ショウ'), 'しょう');
  assert.equal(normalizeReadingToken('くん: -あ.がる'), 'あがる');
});

test('classifyGapKind distinguishes distinct missing readings from covered variants', () => {
  assert.equal(classifyGapKind('たか', ['たかい']), 'variant');
  assert.equal(classifyGapKind('しょう', ['じょう', 'うえ']), 'distinct');
});

test('parseDelimitedReadingField splits on and kun readings cleanly', () => {
  assert.deepEqual(parseDelimitedReadingField('オン: ショウ、 ジョウ', 'オン: '), ['しょう', 'じょう']);
  assert.deepEqual(parseDelimitedReadingField('ショウ、 ジョウ', 'オン: '), ['しょう', 'じょう']);
  assert.deepEqual(parseDelimitedReadingField('くん: -あ.がる、 うえ、 うえ', 'くん: '), ['あがる', 'うえ']);
  assert.deepEqual(parseDelimitedReadingField('-あ.がる、 うえ、 うえ', 'くん: '), ['あがる', 'うえ']);
});

test('word reading coverage metadata parsers understand learner-facing study-focus fields', () => {
  assert.equal(parseCoverageRole('JLPT core + reading coverage'), 'core');
  assert.equal(parseCoverageRole('Reading coverage support'), 'support');
  assert.equal(parseCoverageRole('Inferred support word'), 'inferred');
  assert.deepEqual(parseFocusKanjiField('時、間'), ['時', '間']);
  assert.deepEqual(
    [...parseCoversReadingField('時: じ ／ 間: かん').entries()],
    [['時', 'じ'], ['間', 'かん']]
  );
});

test('parseExampleEntries extracts curated word examples from notes', () => {
  assert.deepEqual(parseExampleEntries('七時 （しちじ） - seven o\'clock ／ 七つ （ななつ） - seven things'), [
    {
      written: '七時',
      reading: 'しちじ',
      normalizedReading: 'しちじ',
      meaning: 'seven o\'clock',
      source: 'notes',
    },
    {
      written: '七つ',
      reading: 'ななつ',
      normalizedReading: 'ななつ',
      meaning: 'seven things',
      source: 'notes',
    },
  ]);
});

test('buildWordReadingCoverageReport distinguishes covered, missing word, and missing example readings', () => {
  const kanjiRows = parseKanjiTsv([
    'Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tKanjiMeanings\tStudyWordKanji\tOnReading\tKunReading\tStrokeOrder\tAudio\tRadical\tNotes\tExampleSentence',
    '上\t上\tup\tうえ\tup\t\tオン: ジョウ\tくん: うえ、 あ.がる\t\t\t\t上手 （じょうず） - skillful ／ 上がる （あがる） - go up\t',
  ].join('\n'));

  const wordRows = parseWordTsv([
    'Word\tReading\tMeaning\tJLPTLevel\tKanjiBreakdown\tExampleSentence\tNotes',
    '上\tうえ\tup\tJLPT N5\t<div>上</div>\t机の上に本があります。\t',
    '上手\tじょうず\tskillful\tJLPT N5\t<div>上</div>\t姉は料理が上手です。\t',
  ].join('\n'));

  const report = buildWordReadingCoverageReport({ kanjiRows, wordRows, levelLabel: 'N5' });
  assert.equal(report.summary.totalReadings, 3);
  assert.equal(report.summary.coveredReadings, 2);
  assert.equal(report.summary.missingWordCardReadings, 1);
  assert.equal(report.summary.missingExampleReadings, 0);

  const entry = report.kanji[0];
  assert.equal(entry.onCoverage[0].status, 'covered');
  assert.equal(entry.kunCoverage[0].status, 'covered');
  assert.equal(entry.kunCoverage[1].status, 'missing_word_card');
});


test('buildWordReadingCoverageReport counts a related word card as covered when the reading matches', () => {
  const kanjiRows = parseKanjiTsv([
    'Kanji	DisplayWord	MeaningJP	PrimaryReading	KanjiMeanings	StudyWordKanji	OnReading	KunReading	StrokeOrder\tAudio	Radical	Notes	ExampleSentence',
    '後	後	after	あと	after		オン: ゴ	くん: あと、 うし.ろ				後ろ （うしろ） - behind / back	',
  ].join('\n'));

  const wordRows = parseWordTsv([
    'Word	Reading	Meaning	JLPTLevel	KanjiBreakdown	ExampleSentence	Notes',
    '後ろ	うしろ	behind / back	JLPT N5	<div>後</div>	家の後ろに公園があります。	',
  ].join('\n'));

  const report = buildWordReadingCoverageReport({ kanjiRows, wordRows, levelLabel: 'N5' });
  assert.equal(report.summary.coveredReadings, 1);
  assert.equal(report.summary.missingWordCardReadings, 1);

  const entry = report.kanji[0];
  assert.equal(entry.kunCoverage[0].status, 'missing_word_card');
  assert.equal(entry.kunCoverage[1].status, 'covered');
  assert.equal(entry.kunCoverage[1].deckExamples[0].written, '後ろ');
});

test('buildWordReadingCoverageReport prefers explicit word-card reading coverage metadata over whole-word readings', () => {
  const kanjiRows = parseKanjiTsv([
    'Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tKanjiMeanings\tStudyWordKanji\tOnReading\tKunReading\tStrokeOrder\tAudio\tRadical\tNotes\tExampleSentence',
    '今\t今\tnow\tいま\tnow\t\tオン: コン、 キン\tくん: いま\t\t\t\t今年 （ことし） - this year\t',
    '日\t日\tday\tひ\tday\t\tオン: ニチ\tくん: ひ\t\t\t\t今日 （きょう） - today\t',
  ].join('\n'));

  const wordRows = parseWordTsv([
    'Word\tReading\tMeaning\tJLPTLevel\tCoverageRole\tFocusKanji\tCoversReading\tKanjiBreakdown\tExampleSentence\tNotes',
    '今日\tきょう\ttoday\tJLPT N5\tJLPT core + reading coverage\t今、日\t今: いま ／ 日: ひ\t<div>今</div>\t今日は図書館へ行きます。\t',
  ].join('\n'));

  const report = buildWordReadingCoverageReport({ kanjiRows, wordRows, levelLabel: 'N5' });
  assert.equal(report.summary.coveredReadings, 2);
  assert.equal(report.summary.coreCoveredReadings, 2);
  assert.equal(report.summary.missingWordCardReadings, 0);
  assert.equal(report.summary.missingExampleReadings, 3);
  assert.equal(report.summary.distinctGapReadings, 3);
  assert.equal(report.summary.variantGapReadings, 0);
  assert.equal(report.kanji[0].kunCoverage[0].status, 'covered');
  assert.equal(report.kanji[0].kunCoverage[0].coverageSource, 'core');
  assert.equal(report.kanji[1].kunCoverage[0].status, 'covered');
  assert.equal(report.kanji[1].kunCoverage[0].coverageSource, 'core');
  assert.equal(report.kanji[0].onCoverage[0].gapKind, 'distinct');
  assert.equal(report.kanji[0].onCoverage[1].gapKind, 'distinct');
});

test('buildWordReadingCoverageReport counts earlier-deck coverage so higher levels do not need duplicate readings', () => {
  const kanjiRows = parseKanjiTsv([
    'Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tKanjiMeanings\tStudyWordKanji\tOnReading\tKunReading\tStrokeOrder\tAudio\tRadical\tNotes\tExampleSentence',
    '会\t会う\tmeet\tあう\tmeet\t\tオン: カイ\tくん: あ.う\t\t\t\t会う （あう） - meet\t',
  ].join('\n'));

  const wordRows = [
    {
      Word: '会う',
      Reading: 'あう',
      JLPTLevel: 'JLPT N5',
      CoverageRole: 'JLPT core + reading coverage',
      FocusKanji: '会',
      CoversReading: '会: あう',
      SourceDeckLevel: 'N5',
      SourceDeckLevelNumber: 5,
    },
  ];

  const report = buildWordReadingCoverageReport({ kanjiRows, wordRows, levelLabel: 'N4' });
  assert.equal(report.summary.coveredReadings, 1);
  assert.equal(report.summary.priorLevelCoveredReadings, 1);
  assert.equal(report.summary.currentLevelCoveredReadings, 0);
  assert.deepEqual(report.summary.coverageLevels, [5]);
  assert.equal(report.summary.coverageLabel, 'N5');
  assert.equal(report.kanji[0].kunCoverage[0].status, 'covered');
});

test('buildCoverageSourceSummary counts covered readings by learner-facing role', () => {
  assert.deepEqual(buildCoverageSourceSummary([
    { status: 'covered', coverageSource: 'core' },
    { status: 'covered', coverageSource: 'support' },
    { status: 'covered', coverageSource: 'inferred' },
    { status: 'covered', coverageSource: 'unknown' },
    { status: 'missing_word_card', coverageSource: 'core' },
  ]), {
    coreCoveredReadings: 1,
    supportCoveredReadings: 1,
    inferredCoveredReadings: 1,
    unknownCoveredReadings: 1,
  });
});

test('buildWordReadingGapTriage classifies open reading gaps into actionable buckets', () => {
  const report = {
    summary: { levelLabel: 'N5' },
    kanji: [
      {
        kanji: '未',
        displayWord: '未',
        onCoverage: [],
        kunCoverage: [
          {
            reading: 'ひつじ',
            status: 'missing_example',
            coverageSource: 'none',
            matchingExamples: [],
            deckExamples: [],
            gapKind: 'distinct',
          },
        ],
      },
      {
        kanji: '後',
        displayWord: '後',
        onCoverage: [],
        kunCoverage: [
          {
            reading: 'うしろ',
            status: 'missing_word_card',
            coverageSource: 'none',
            matchingExamples: [{ written: '後ろ', reading: 'うしろ', meaning: 'behind', source: 'notes' }],
            deckExamples: [],
            gapKind: 'distinct',
          },
          {
            reading: 'あと',
            status: 'missing_example',
            coverageSource: 'none',
            matchingExamples: [],
            deckExamples: [],
            gapKind: 'variant',
          },
        ],
      },
    ],
  };

  const triage = buildWordReadingGapTriage(report);
  assert.equal(triage.summary.totalItems, 3);
  assert.equal(triage.summary.highPriorityItems, 1);
  assert.equal(triage.summary.mediumPriorityItems, 1);
  assert.equal(triage.summary.lowPriorityItems, 1);
  assert.equal(triage.summary.editorialReviewItems, 1);
  assert.equal(triage.items[0].suggestedAction, 'editorial_review');
  assert.equal(triage.items[1].suggestedAction, 'promote_curated_example');
  assert.equal(triage.items[2].suggestedAction, 'defer_variant');
});

test('buildWordReadingGapTriage respects tracked editorial override dispositions', () => {
  const report = {
    summary: { levelLabel: 'N5' },
    kanji: [
      {
        kanji: '万',
        displayWord: '万',
        onCoverage: [],
        kunCoverage: [
          {
            reading: 'よろず',
            status: 'missing_example',
            coverageSource: 'none',
            matchingExamples: [],
            deckExamples: [],
            gapKind: 'distinct',
          },
        ],
      },
    ],
  };

  const triage = buildWordReadingGapTriage(report);
  assert.equal(triage.summary.highPriorityItems, 0);
  assert.equal(triage.summary.lowPriorityItems, 1);
  assert.equal(triage.summary.editorialReviewItems, 0);
  assert.equal(triage.summary.deferVariantItems, 1);
  assert.equal(triage.items[0].suggestedAction, 'defer_variant');
  assert.equal(triage.items[0].priority, 'low');
  assert.match(triage.items[0].editorialNote, /Archaic reading/);

  const n4Report = {
    summary: { levelLabel: 'N4' },
    kanji: [
      {
        kanji: '合',
        displayWord: '合',
        onCoverage: [
          {
            reading: 'かっ',
            status: 'missing_example',
            coverageSource: 'none',
            matchingExamples: [],
            deckExamples: [],
            gapKind: 'distinct',
          },
        ],
        kunCoverage: [],
      },
      {
        kanji: '園',
        displayWord: '園',
        onCoverage: [],
        kunCoverage: [
          {
            reading: 'その',
            status: 'missing_example',
            coverageSource: 'none',
            matchingExamples: [],
            deckExamples: [],
            gapKind: 'distinct',
          },
        ],
      },
      {
        kanji: '区',
        displayWord: '区',
        onCoverage: [
          {
            reading: 'おう',
            status: 'missing_example',
            coverageSource: 'none',
            matchingExamples: [],
            deckExamples: [],
            gapKind: 'distinct',
          },
        ],
        kunCoverage: [],
      },
    ],
  };

  const n4Triage = buildWordReadingGapTriage(n4Report);
  assert.equal(n4Triage.summary.editorialReviewItems, 0);
  assert.equal(n4Triage.summary.deferVariantItems, 3);
  assert.ok(n4Triage.items.every((item) => item.suggestedAction === 'defer_variant'));
  assert.ok(n4Triage.items.some((item) => /合戦 is real and common/.test(item.editorialNote)));
  assert.ok(n4Triage.items.some((item) => /公園/.test(item.editorialNote)));
  assert.ok(n4Triage.items.some((item) => /No exact JMdict learner-facing 区 -> おう/.test(item.editorialNote)));

  const n3Report = {
    summary: { levelLabel: 'N3' },
    kanji: [
      {
        kanji: '登',
        displayWord: '登',
        onCoverage: [
          {
            reading: 'とう',
            status: 'missing_example',
            coverageSource: 'none',
            matchingExamples: [],
            deckExamples: [],
            gapKind: 'distinct',
          },
        ],
        kunCoverage: [],
      },
    ],
  };

  const n3Triage = buildWordReadingGapTriage(n3Report);
  assert.equal(n3Triage.items[0].suggestedAction, 'defer_variant');
  assert.equal(n3Triage.items[0].targetLevel, 2);
  assert.match(n3Triage.items[0].targetLevelReason, /Exact local Tanos N2 candidate 登場\|とうじょう/);
  assert.match(formatWordReadingGapTriage(n3Triage, { includeVariants: true }), /deferred target level: N2/);
});

test('buildWordReadingGapTriage reports exact override alignment when equal totals mask drift', () => {
  const report = {
    summary: { levelLabel: 'N5' },
    kanji: [
      {
        kanji: '万',
        displayWord: '万',
        onCoverage: [],
        kunCoverage: [{
          reading: 'よろず',
          status: 'missing_example',
          coverageSource: 'none',
          matchingExamples: [],
          deckExamples: [],
          gapKind: 'distinct',
        }],
      },
      {
        kanji: '未',
        displayWord: '未',
        onCoverage: [],
        kunCoverage: [{
          reading: 'ひつじ',
          status: 'missing_example',
          coverageSource: 'none',
          matchingExamples: [],
          deckExamples: [],
          gapKind: 'distinct',
        }],
      },
    ],
  };
  const triage = buildWordReadingGapTriage(report, {
    overridesByLevel: {
      N5: {
        '万|kun|よろず': {
          suggestedAction: 'defer_variant',
          priority: 'low',
          note: 'Explicit current disposition.',
        },
        '旧|on|きゅう': {
          suggestedAction: 'defer_variant',
          priority: 'low',
          note: 'Stale disposition.',
        },
      },
    },
  });

  assert.equal(triage.summary.totalItems, 2);
  assert.equal(triage.summary.configuredOverrideItems, 1);
  assert.equal(triage.summary.defaultDispositionItems, 1);
  assert.equal(triage.summary.staleOverrideItems, 1);
  assert.deepEqual(triage.overrideAlignment.configuredOverrideKeys, ['万|kun|よろず']);
  assert.deepEqual(triage.overrideAlignment.unconfiguredGapKeys, ['未|kun|ひつじ']);
  assert.deepEqual(triage.overrideAlignment.staleOverrideKeys, ['旧|on|きゅう']);
});

test('tracked N5 overrides explicitly adjudicate current variants and omit retired gaps', () => {
  const overrides = loadWordReadingGapTriageOverrides().N5;
  const currentVariantKeys = [
    '三|kun|みつ',
    '二|kun|ふたたび',
    '八|kun|やつ',
    '六|kun|むい',
    '六|kun|むつ',
    '出|kun|いだす',
    '出|kun|いでる',
    '四|kun|よつ',
    '大|kun|おおいに',
    '天|kun|あまつ',
    '来|kun|きたす',
    '来|kun|きたる',
    '生|kun|うむ',
    '生|kun|おう',
    '高|kun|たかまる',
    '高|kun|たかめる',
  ];
  const retiredGapKeys = [
    '上|kun|かみ',
    '出|on|しゅつ',
    '南|on|な',
    '南|on|なん',
    '友|on|ゆう',
    '山|on|ざん',
    '時|kun|どき',
    '木|on|ぼく',
    '来|kun|き',
    '火|kun|び',
    '父|on|ふ',
    '生|on|しょう',
    '見|on|けん',
    '西|on|すい',
    '雨|kun|あま',
    '雨|on|う',
  ];

  assert.equal(currentVariantKeys.length, 16);
  assert.equal(retiredGapKeys.length, 16);
  assert.equal(Object.keys(overrides).length, 99);
  for (const key of currentVariantKeys) {
    assert.equal(overrides[key].suggestedAction, 'defer_variant', `${key} should be explicitly deferred`);
    assert.equal(overrides[key].priority, 'low', `${key} should remain low priority`);
    assert.ok(overrides[key].note, `${key} should record editorial reasoning`);
  }
  for (const key of retiredGapKeys) {
    assert.equal(overrides[key], undefined, `${key} should not remain as a stale override`);
  }
});

test('formatWordReadingGapTriage renders a practical backlog summary', () => {
  const text = formatWordReadingGapTriage({
    levelLabel: 'N5',
    summary: {
      totalItems: 2,
      highPriorityItems: 1,
      mediumPriorityItems: 1,
      lowPriorityItems: 0,
      editorialReviewItems: 1,
      promoteCuratedExampleItems: 1,
      deferVariantItems: 0,
    },
    items: [
      {
        kanji: '万',
        displayWord: '万',
        readingType: 'kun',
        reading: 'よろず',
        status: 'missing_example',
        gapKind: 'distinct',
        priority: 'high',
        suggestedAction: 'editorial_review',
        curatedExampleCandidates: [],
      },
      {
        kanji: '後',
        displayWord: '後',
        readingType: 'kun',
        reading: 'うしろ',
        status: 'missing_word_card',
        gapKind: 'distinct',
        priority: 'medium',
        suggestedAction: 'promote_curated_example',
        curatedExampleCandidates: [{ written: '後ろ', reading: 'うしろ' }],
      },
    ],
  }, { maxItems: 10 });

  assert.match(text, /Word Reading Gap Triage \(N5\)/);
  assert.match(text, /Review needed before card work: 1/);
  assert.match(text, /Actionable curated learner candidates: 1/);
  assert.match(text, /Deferred variants or low learner value: 0/);
  assert.match(text, /create cards only for common, learner-friendly, useful words/);
  assert.match(text, /Review-needed items are not automatic card work/);
  assert.doesNotMatch(text, /High priority \(editorial review\)/);
  assert.match(text, /万 kun-reading よろず/);
  assert.match(text, /review-needed; review learner-card value before card work/);
  assert.match(text, /curated candidates: none yet \(review only; no card work without common learner-friendly evidence\)/);
  assert.match(text, /curated candidates: 後ろ \(うしろ\)/);
});
