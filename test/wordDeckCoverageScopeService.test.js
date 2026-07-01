const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCoverageLabel,
  buildCoverageLevels,
  buildRequiredCoverageLevels,
  buildCoverageWordRows,
} = require('../src/services/wordDeckCoverageScopeService');
const { buildWordReadingCoverageReport } = require('../src/services/wordReadingCoverageService');

const WORD_TSV_HEADER = 'Word\tReading\tCoverageRole\tFocusKanji\tCoversReading\tJLPTLevel';

test('buildCoverageLevels can scope coverage to selected word-product levels', () => {
  assert.deepEqual(buildCoverageLevels(5), [5]);
  assert.deepEqual(buildCoverageLevels(4), [5, 4]);
  assert.deepEqual(buildCoverageLevels(5, { availableLevels: [5, 4, 3] }), [5, 4, 3]);
  assert.deepEqual(buildCoverageLevels(3, { availableLevels: [3, 5] }), [5, 3]);
});

test('buildRequiredCoverageLevels expands selected lower-numbered decks to cumulative earlier levels', () => {
  assert.deepEqual(buildRequiredCoverageLevels([3]), [5, 4, 3]);
  assert.deepEqual(buildRequiredCoverageLevels([4, 3]), [5, 4, 3]);
  assert.deepEqual(buildRequiredCoverageLevels([1]), [5, 4, 3, 2, 1]);
});

test('buildCoverageLabel names contiguous cumulative scopes as level ranges', () => {
  assert.equal(buildCoverageLabel([5]), 'N5');
  assert.equal(buildCoverageLabel([5, 4]), 'N4-N5');
  assert.equal(buildCoverageLabel([5, 4, 3]), 'N3-N5');
  assert.equal(buildCoverageLabel([5, 3]), 'N5 + N3');
});

test('selected higher-level word decks can cover lower-level reading targets', () => {
  const n5Tsv = [
    WORD_TSV_HEADER,
    '火\tひ\tJLPT core\t火\t火: ひ\tJLPT N5',
  ].join('\n');
  const n3Tsv = [
    WORD_TSV_HEADER,
    '火事\tかじ\tReading coverage support\t火\t火: か\tJLPT N3',
  ].join('\n');
  const coverageScope = buildCoverageWordRows({
    level: 5,
    wordTsvByLevel: {
      5: n5Tsv,
      3: n3Tsv,
    },
    availableLevels: [5, 3],
  });
  const report = buildWordReadingCoverageReport({
    kanjiRows: [{
      Kanji: '火',
      DisplayWord: '火',
      PrimaryReading: 'ひ',
      OnReading: 'オン: カ',
      KunReading: 'くん: ひ',
    }],
    wordRows: coverageScope.wordRows,
    levelLabel: 'N5',
  });

  assert.deepEqual(coverageScope.coverageLevels, [5, 3]);
  assert.equal(coverageScope.activeLevelRowCount, 1);
  assert.equal(coverageScope.readingScopeRowCount, 2);
  assert.deepEqual(coverageScope.sourceLevelCounts, { 3: 1, 5: 1 });
  assert.equal(report.summary.coverageLabel, 'N5 + N3');
  assert.equal(report.summary.coveredReadings, 2);
  assert.equal(report.summary.currentLevelCoveredReadings, 1);
  assert.equal(report.summary.laterLevelCoveredReadings, 1);
});
