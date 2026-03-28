const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildWordReadingCoverageReport,
  normalizeReadingToken,
  parseDelimitedReadingField,
  parseExampleEntries,
  parseKanjiTsv,
  parseWordTsv,
} = require('../src/services/wordReadingCoverageService');

test('normalizeReadingToken normalizes katakana and dictionary punctuation', () => {
  assert.equal(normalizeReadingToken('オン:ショウ'), 'しょう');
  assert.equal(normalizeReadingToken('くん:-あ.がる'), 'あがる');
});

test('parseDelimitedReadingField splits on and kun readings cleanly', () => {
  assert.deepEqual(parseDelimitedReadingField('オン:ショウ、 ジョウ', 'オン:'), ['しょう', 'じょう']);
  assert.deepEqual(parseDelimitedReadingField('くん:-あ.がる、 うえ、 うえ', 'くん:'), ['あがる', 'うえ']);
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
    '上\t上\t上 ／ up\tうえ\tオン:ジョウ\tくん:うえ、 あ.がる\t\t\t\t\t\t上手 （じょうず） - skillful ／ 上がる （あがる） - go up\t',
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
