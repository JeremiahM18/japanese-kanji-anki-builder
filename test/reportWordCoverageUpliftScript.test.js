const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCoverageLevelSteps,
  buildWordCoverageUpliftReport,
  formatWordCoverageUpliftReport,
  parseArgs,
} = require('../scripts/reportWordCoverageUplift');

const WORD_TSV_HEADER = 'Word\tReading\tCoverageRole\tFocusKanji\tCoversReading\tJLPTLevel';

test('parseArgs accepts numeric and N-prefixed target and through levels', () => {
  assert.deepEqual(parseArgs([
    '--target-level=N5',
    '--through-level=3',
    '--details',
    '--max-examples=7',
    '--json',
  ]), {
    json: true,
    details: true,
    maxExamples: 7,
    targetLevel: 5,
    throughLevel: 3,
    unknownArgs: [],
  });

  assert.equal(parseArgs(['--level=4', '--through=N2']).targetLevel, 4);
  assert.equal(parseArgs(['--level=4', '--through=N2']).throughLevel, 2);
});

test('parseArgs defaults through-level to the selected target level', () => {
  assert.equal(parseArgs([]).targetLevel, 5);
  assert.equal(parseArgs([]).throughLevel, 5);
  assert.equal(parseArgs(['--target-level=N2']).targetLevel, 2);
  assert.equal(parseArgs(['--target-level=N2']).throughLevel, 2);
  assert.throws(() => parseArgs(['--max-examples=-1']), /max-examples must be a non-negative integer/);
  assert.throws(() => parseArgs(['--through-level=N6']), /through-level must be a JLPT level/);
});

test('buildCoverageLevelSteps supports any valid target-through range', () => {
  assert.deepEqual(buildCoverageLevelSteps(5, 5), [{
    addedLevel: 5,
    levels: [5],
  }]);
  assert.deepEqual(buildCoverageLevelSteps(5, 3), [
    { addedLevel: 5, levels: [5] },
    { addedLevel: 4, levels: [5, 4] },
    { addedLevel: 3, levels: [5, 4, 3] },
  ]);
  assert.deepEqual(buildCoverageLevelSteps(2, 1), [
    { addedLevel: 2, levels: [2] },
    { addedLevel: 1, levels: [2, 1] },
  ]);
  assert.deepEqual(buildCoverageLevelSteps(5, 1), [
    { addedLevel: 5, levels: [5] },
    { addedLevel: 4, levels: [5, 4] },
    { addedLevel: 3, levels: [5, 4, 3] },
    { addedLevel: 2, levels: [5, 4, 3, 2] },
    { addedLevel: 1, levels: [5, 4, 3, 2, 1] },
  ]);
  assert.deepEqual(buildCoverageLevelSteps(4, 2), [
    { addedLevel: 4, levels: [4] },
    { addedLevel: 3, levels: [4, 3] },
    { addedLevel: 2, levels: [4, 3, 2] },
  ]);
  assert.deepEqual(buildCoverageLevelSteps(4, 1), [
    { addedLevel: 4, levels: [4] },
    { addedLevel: 3, levels: [4, 3] },
    { addedLevel: 2, levels: [4, 3, 2] },
    { addedLevel: 1, levels: [4, 3, 2, 1] },
  ]);
  assert.throws(() => buildCoverageLevelSteps(3, 5), /through-level must be the same as or harder/);
});

test('buildWordCoverageUpliftReport counts later-level backfill without changing readiness semantics', () => {
  const kanjiRows = [{
    Kanji: '火',
    DisplayWord: '火',
    PrimaryReading: 'ひ',
    OnReading: 'オン: カ',
    KunReading: 'くん: ひ',
  }, {
    Kanji: '水',
    DisplayWord: '水',
    PrimaryReading: 'みず',
    OnReading: 'オン: スイ',
    KunReading: 'くん: みず',
  }];
  const wordTsvByLevel = {
    5: [
      WORD_TSV_HEADER,
      '火\tひ\tJLPT core\t火\t火: ひ\tJLPT N5',
      '水\tみず\tJLPT core\t水\t水: みず\tJLPT N5',
    ].join('\n'),
    4: [
      WORD_TSV_HEADER,
      '火事\tかじ\tReading coverage support\t火\t火: か\tJLPT N4',
    ].join('\n'),
    3: [
      WORD_TSV_HEADER,
      '水中\tすいちゅう\tReading coverage support\t水\t水: すい\tJLPT N3',
    ].join('\n'),
    2: [
      WORD_TSV_HEADER,
      '火口\tかこう\tReading coverage support\t火\t火: か\tJLPT N2',
    ].join('\n'),
    1: [
      WORD_TSV_HEADER,
      '水圧\tすいあつ\tReading coverage support\t水\t水: すい\tJLPT N1',
    ].join('\n'),
  };

  const report = buildWordCoverageUpliftReport({
    targetLevel: 5,
    throughLevel: 3,
    kanjiRows,
    wordTsvByLevel,
  });

  assert.equal(report.baseline.coveredReadings, 2);
  assert.equal(report.final.coveredReadings, 4);
  assert.deepEqual(report.steps.map((step) => step.deltaFromPrevious), [0, 1, 1]);
  assert.deepEqual(report.steps.map((step) => step.newlyCoveredReadings.length), [0, 1, 1]);
  assert.equal(report.steps[1].newlyCoveredReadings[0].key, '火|on|か');
  assert.equal(report.steps[2].newlyCoveredReadings[0].key, '水|on|すい');
});

test('buildWordCoverageUpliftReport supports full N5/N4/N2 through N1 spans', () => {
  const kanjiRows = [{
    Kanji: '火',
    DisplayWord: '火',
    PrimaryReading: 'ひ',
    OnReading: 'オン: カ',
    KunReading: 'くん: ひ、 ほ',
  }, {
    Kanji: '水',
    DisplayWord: '水',
    PrimaryReading: 'みず',
    OnReading: 'オン: スイ',
    KunReading: 'くん: みず',
  }];
  const wordTsvByLevel = {
    5: [
      WORD_TSV_HEADER,
      '火\tひ\tJLPT core\t火\t火: ひ\tJLPT N5',
      '水\tみず\tJLPT core\t水\t水: みず\tJLPT N5',
    ].join('\n'),
    4: [
      WORD_TSV_HEADER,
      '火事\tかじ\tReading coverage support\t火\t火: か\tJLPT N4',
    ].join('\n'),
    3: [
      WORD_TSV_HEADER,
      '水中\tすいちゅう\tReading coverage support\t水\t水: すい\tJLPT N3',
    ].join('\n'),
    2: [
      WORD_TSV_HEADER,
      '火影\tほかげ\tReading coverage support\t火\t火: ほ\tJLPT N2',
    ].join('\n'),
    1: [
      WORD_TSV_HEADER,
      '補足\tほそく\tReading coverage support\t火\t火: ほ\tJLPT N1',
    ].join('\n'),
  };

  const n5ThroughN1 = buildWordCoverageUpliftReport({
    targetLevel: 5,
    throughLevel: 1,
    kanjiRows,
    wordTsvByLevel,
  });
  assert.deepEqual(n5ThroughN1.steps.map((step) => step.addedLevel), [5, 4, 3, 2, 1]);
  assert.deepEqual(n5ThroughN1.steps.map((step) => step.deltaFromPrevious), [0, 1, 1, 1, 0]);
  assert.equal(n5ThroughN1.final.coveredReadings, 5);

  const n4ThroughN1 = buildWordCoverageUpliftReport({
    targetLevel: 4,
    throughLevel: 1,
    kanjiRows,
    wordTsvByLevel,
  });
  assert.deepEqual(n4ThroughN1.steps.map((step) => step.addedLevel), [4, 3, 2, 1]);
  assert.deepEqual(n4ThroughN1.steps.map((step) => step.deltaFromPrevious), [0, 1, 1, 0]);
  assert.deepEqual(n4ThroughN1.final.coverageLevels, [4, 3, 2, 1]);
  assert.equal(n4ThroughN1.final.coveredReadings, 3);

  const n2ThroughN1 = buildWordCoverageUpliftReport({
    targetLevel: 2,
    throughLevel: 1,
    kanjiRows,
    wordTsvByLevel,
  });
  assert.deepEqual(n2ThroughN1.steps.map((step) => step.addedLevel), [2, 1]);
  assert.deepEqual(n2ThroughN1.steps.map((step) => step.deltaFromPrevious), [0, 0]);
  assert.equal(n2ThroughN1.baseline.coveredReadings, 1);
});

test('formatWordCoverageUpliftReport prints a compact staircase with optional details', () => {
  const report = {
    targetLevel: 5,
    throughLevel: 4,
    steps: [{
      addedLevel: 5,
      coveredReadings: 2,
      totalReadings: 3,
      coveragePercent: '66.7%',
      missingReadings: 1,
      deltaFromPrevious: 0,
      deltaFromBaseline: 0,
      newlyCoveredReadings: [],
    }, {
      addedLevel: 4,
      coveredReadings: 3,
      totalReadings: 3,
      coveragePercent: '100.0%',
      missingReadings: 0,
      deltaFromPrevious: 1,
      deltaFromBaseline: 1,
      newlyCoveredReadings: [{
        kanji: '火',
        readingType: 'on',
        reading: 'か',
        examples: [{ written: '火事', reading: 'かじ', deckLevel: 4 }],
      }],
    }],
  };

  const text = formatWordCoverageUpliftReport(report, { details: true });
  assert.match(text, /Japanese Kanji Builder Word Coverage Uplift \(N5 through N4\)/);
  assert.match(text, /Baseline counts only the target word deck/);
  assert.match(text, /Baseline N5 only: 2\/3 \(66.7%\), missing 1/);
  assert.match(text, /\+ N4: 3\/3 \(100.0%\), missing 0, \+1 from previous, \+1 total/);
  assert.match(text, /火 on-reading か -> 火事 \(かじ, N4\)/);
});
