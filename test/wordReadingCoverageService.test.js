const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCoverageSourceSummary,
  buildWordReadingCoverageReport,
  normalizeReadingToken,
  parseCoverageRole,
  parseCoversReadingField,
  parseDelimitedReadingField,
  parseExampleEntries,
  parseFocusKanjiField,
  parseKanjiTsv,
  parseWordTsv,
} = require('../src/services/wordReadingCoverageService');

test('normalizeReadingToken normalizes katakana and dictionary punctuation', () => {
  assert.equal(normalizeReadingToken('オン: ショウ'), 'しょう');
  assert.equal(normalizeReadingToken('くん: -あ.がる'), 'あがる');
});

test('parseDelimitedReadingField splits on and kun readings cleanly', () => {
  assert.deepEqual(parseDelimitedReadingField('オン: ショウ、 ジョウ', 'オン: '), ['しょう', 'じょう']);
  assert.deepEqual(parseDelimitedReadingField('くん: -あ.がる、 うえ、 うえ', 'くん: '), ['あがる', 'うえ']);
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
    'Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tOnReading\tKunReading\tStrokeOrder\tStrokeOrderImage\tStrokeOrderAnimation\tAudio\tRadical\tNotes\tExampleSentence',
    '上\t上\t上 ／ up\tうえ\tオン: ジョウ\tくん: うえ、 あ.がる\t\t\t\t\t\t上手 （じょうず） - skillful ／ 上がる （あがる） - go up\t',
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
    'Kanji	DisplayWord	MeaningJP	PrimaryReading	OnReading	KunReading	StrokeOrder	StrokeOrderImage	StrokeOrderAnimation	Audio	Radical	Notes	ExampleSentence',
    '後	後	後 ／ after	あと	オン: ゴ	くん: あと、 うし.ろ						後ろ （うしろ） - behind / back	',
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
    'Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tOnReading\tKunReading\tStrokeOrder\tStrokeOrderImage\tStrokeOrderAnimation\tAudio\tRadical\tNotes\tExampleSentence',
    '今\t今\t今 （いま） ／ now\tいま\tオン: コン、 キン\tくん: いま\t\t\t\t\t\t今年 （ことし） - this year\t',
    '日\t日\t日 （ひ） ／ day\tひ\tオン: ニチ\tくん: ひ\t\t\t\t\t\t今日 （きょう） - today\t',
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
  assert.equal(report.kanji[0].kunCoverage[0].status, 'covered');
  assert.equal(report.kanji[0].kunCoverage[0].coverageSource, 'core');
  assert.equal(report.kanji[1].kunCoverage[0].status, 'covered');
  assert.equal(report.kanji[1].kunCoverage[0].coverageSource, 'core');
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

