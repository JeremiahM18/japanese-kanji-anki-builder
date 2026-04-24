const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildWordReadingGapPlan,
  formatWordReadingGapPlan,
  scoreReadingPracticality,
  scoreGapPlanItem,
} = require('../src/services/wordReadingGapPlanService');

test('scoreGapPlanItem favors promotable curated examples over raw editorial gaps', () => {
  const promotable = {
    priority: 'medium',
    suggestedAction: 'promote_curated_example',
    status: 'missing_word_card',
    gapKind: 'distinct',
    curatedExampleCandidates: [{ written: '後ろ', reading: 'うしろ' }],
    deckExampleCandidates: [],
  };
  const editorial = {
    priority: 'medium',
    suggestedAction: 'editorial_review',
    status: 'missing_example',
    gapKind: 'distinct',
    curatedExampleCandidates: [],
    deckExampleCandidates: [],
  };

  assert.ok(scoreGapPlanItem(promotable) > scoreGapPlanItem(editorial));
});

test('scoreReadingPracticality deprioritizes long classical-looking readings', () => {
  assert.ok(
    scoreReadingPracticality({ readingType: 'on', reading: 'かい', suggestedAction: 'editorial_review' })
    > scoreReadingPracticality({ readingType: 'kun', reading: 'いずくんぞ', suggestedAction: 'editorial_review' })
  );
});

test('buildWordReadingGapPlan hides deferred variants by default and ranks active work', () => {
  const plan = buildWordReadingGapPlan({
    levelLabel: 'N4',
    summary: { totalItems: 3 },
    items: [
      {
        kanji: '未',
        displayWord: '未',
        readingType: 'kun',
        reading: 'ひつじ',
        priority: 'low',
        suggestedAction: 'defer_variant',
        status: 'missing_example',
        gapKind: 'variant',
        curatedExampleCandidates: [],
        deckExampleCandidates: [],
      },
      {
        kanji: '後',
        displayWord: '後',
        readingType: 'kun',
        reading: 'うしろ',
        priority: 'medium',
        suggestedAction: 'promote_curated_example',
        status: 'missing_word_card',
        gapKind: 'distinct',
        curatedExampleCandidates: [{ written: '後ろ', reading: 'うしろ' }],
        deckExampleCandidates: [],
      },
      {
        kanji: '強',
        displayWord: '強い',
        readingType: 'on',
        reading: 'ごう',
        priority: 'high',
        suggestedAction: 'editorial_review',
        status: 'missing_example',
        gapKind: 'distinct',
        curatedExampleCandidates: [],
        deckExampleCandidates: [],
      },
    ],
  }, {
    coverageSummary: {
      coveredReadings: 345,
      totalReadings: 651,
      coverageLabel: 'N5 + N4',
      priorLevelCoveredReadings: 66,
      currentLevelCoveredReadings: 279,
    },
    limit: 10,
  });

  assert.equal(plan.summary.activePlanItems, 2);
  assert.equal(plan.summary.deferredHiddenItems, 1);
  assert.equal(plan.summary.coverageLabel, 'N5 + N4');
  assert.equal(plan.items[0].suggestedAction, 'promote_curated_example');
  assert.equal(plan.items[1].suggestedAction, 'editorial_review');
  assert.deepEqual(plan.kanjiClusters.map((cluster) => cluster.kanji).sort(), ['強', '後']);
});

test('buildWordReadingGapPlan can include deferred variants explicitly', () => {
  const plan = buildWordReadingGapPlan({
    levelLabel: 'N5',
    summary: { totalItems: 1 },
    items: [
      {
        kanji: '万',
        displayWord: '万',
        readingType: 'kun',
        reading: 'よろず',
        priority: 'low',
        suggestedAction: 'defer_variant',
        status: 'missing_example',
        gapKind: 'variant',
        curatedExampleCandidates: [],
        deckExampleCandidates: [],
        editorialNote: 'Archaic reading; defer unless product scope changes.',
      },
    ],
  }, { includeDeferred: true });

  assert.equal(plan.summary.deferredHiddenItems, 0);
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].suggestedAction, 'defer_variant');
});

test('formatWordReadingGapPlan renders a batching-oriented queue', () => {
  const text = formatWordReadingGapPlan({
    levelLabel: 'N4',
    summary: {
      totalTriageItems: 2,
      activePlanItems: 2,
      promoteCuratedExampleItems: 1,
      editorialReviewItems: 1,
      deferredHiddenItems: 0,
      coveredReadings: 345,
      totalReadings: 651,
      coveragePercent: 52.99539170506912,
      coverageLabel: 'N5 + N4',
      priorLevelCoveredReadings: 66,
      currentLevelCoveredReadings: 279,
    },
    items: [
      {
        rank: 1,
        kanji: '後',
        displayWord: '後',
        readingType: 'kun',
        reading: 'うしろ',
        actionLabel: 'promote curated example',
        priority: 'medium',
        score: 335,
        reason: 'curated example already exists; distinct reading target',
        candidateSummary: '後ろ (うしろ)',
      },
    ],
    kanjiClusters: [
      {
        kanji: '後',
        displayWord: '後',
        itemCount: 1,
        readings: ['kun:うしろ'],
      },
    ],
  });

  assert.match(text, /Word Reading Gap Plan \(N4\)/);
  assert.match(text, /Coverage counted from decks: N5 \+ N4/);
  assert.match(text, /Recommended next batch \(1 item\)/);
  assert.match(text, /後 kun-reading うしろ/);
  assert.match(text, /Highest-density kanji clusters/);
});
