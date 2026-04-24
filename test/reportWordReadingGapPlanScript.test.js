const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildKanjiApiCandidateRows,
  buildSentenceCandidateRows,
  buildTrackedWordCandidateRows,
  parseArgs,
} = require('../scripts/reportWordReadingGapPlan');

test('parseArgs supports gap-plan level, limit, deferred, and json options', () => {
  assert.deepEqual(parseArgs([
    '--level=4',
    '--limit=25',
    '--suggestions=3',
    '--min-suggestion-score=60',
    '--include-deferred',
    '--json',
  ]), {
    json: true,
    includeDeferred: true,
    level: 4,
    limit: 25,
    minSuggestionScore: 60,
    suggestions: 3,
    unknownArgs: [],
  });
});

test('parseArgs keeps max-items as a compatibility alias for limit', () => {
  assert.equal(parseArgs(['--max-items=12']).limit, 12);
});

test('candidate row helpers expose tracked sentence and cached word suggestions', () => {
  assert.deepEqual(buildTrackedWordCandidateRows({
    '悪性|おせい': { written: '悪性', reading: 'おせい', meaning: 'bad nature' },
  }), [{
    written: '悪性',
    reading: 'おせい',
    meaning: 'bad nature',
    source: 'tracked_word',
  }]);

  assert.deepEqual(buildSentenceCandidateRows([{
    written: '汚染',
    reading: 'おせん',
    english: 'pollution',
    frequencyRank: 80,
  }]), [{
    written: '汚染',
    reading: 'おせん',
    meaning: 'pollution',
    source: 'sentence_corpus',
    frequencyRank: 80,
  }]);

  assert.deepEqual(buildKanjiApiCandidateRows({
    悪: [{
      variants: [{ written: '悪性', pronounced: 'おせい', priorities: ['news1'] }],
      meanings: [{ glosses: ['bad nature', 'malignancy'] }],
    }],
  }), [{
    written: '悪性',
    reading: 'おせい',
    meaning: 'bad nature',
    allGlossText: 'bad nature malignancy',
    source: 'kanjiapi_cache',
    sourceKanji: '悪',
    priorityCount: 1,
  }]);
});
