const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSuggestedWordCandidates,
  candidateReadingAlignsWithTarget,
  buildWordReadingGapPlan,
  formatWordReadingGapPlan,
  scoreSuggestedCandidate,
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
  assert.equal(plan.summary.suggestedCandidateItems, 0);
  assert.equal(plan.items[0].suggestedAction, 'promote_curated_example');
  assert.equal(plan.items[1].suggestedAction, 'editorial_review');
  assert.deepEqual(plan.kanjiClusters.map((cluster) => cluster.kanji).sort(), ['強', '後']);
});

test('buildSuggestedWordCandidates ranks tracked sentence-backed words and surfaces labeling needs', () => {
  const item = {
    kanji: '汚',
    reading: 'お',
  };
  const candidates = buildSuggestedWordCandidates(item, {
    targetLevel: 4,
    jlptOnlyJson: {
      汚: { jlpt: 4 },
      染: { jlpt: 2 },
      水: { jlpt: 5 },
    },
    wordStudyEntries: {
      '汚染|おせん': {
        written: '汚染',
        reading: 'おせん',
        meaning: 'pollution',
        tags: ['starter', 'common', 'n4'],
      },
    },
    sentenceCorpus: [
      {
        written: '汚染',
        reading: 'おせん',
        japanese: '水の汚染を調べます。',
        english: 'We investigate water pollution.',
        frequencyRank: 50,
      },
      {
        written: '水汚れ',
        reading: 'みずよごれ',
        japanese: '水汚れを落とします。',
        english: 'I remove water stains.',
        frequencyRank: 80,
      },
    ],
    candidateRows: [
      { written: '汚染', reading: 'おせん', meaning: 'pollution', source: 'kanjiapi_cache', priorityCount: 2 },
      { written: '汚染', reading: 'おせん', meaning: 'pollution', source: 'tracked_word' },
      { written: '水汚れ', reading: 'みずよごれ', meaning: 'water stain', source: 'kanjiapi_cache' },
    ],
  });

  assert.equal(candidates[0].written, '汚染');
  assert.equal(candidates[0].action, 'extend_existing_word_contract');
  assert.match(candidates[0].reason, /already tracked/);
  assert.match(candidates[0].reason, /label cross-level kanji 染=N2/);
  assert.equal(candidates.some((candidate) => candidate.written === '水汚れ'), false);
});

test('scoreSuggestedCandidate rewards sentence-backed exact readings over raw cache hits', () => {
  const item = { kanji: '夏', reading: 'が' };
  const scoredSentence = scoreSuggestedCandidate(
    { written: '夏季', reading: 'がき', meaning: 'summer season', source: 'sentence_corpus' },
    item,
    {
      sentenceCorpus: [{ written: '夏季', reading: 'がき', japanese: '夏季休暇です。', frequencyRank: 40 }],
      targetLevel: 4,
      jlptOnlyJson: { 夏: { jlpt: 4 }, 季: { jlpt: 3 } },
    }
  );
  const scoredRaw = scoreSuggestedCandidate(
    { written: '夏型', reading: 'がた', meaning: 'summer type', source: 'kanjiapi_cache' },
    item,
    {
      sentenceCorpus: [],
      targetLevel: 4,
      jlptOnlyJson: { 夏: { jlpt: 4 }, 型: { jlpt: 2 } },
    }
  );

  assert.ok(scoredSentence.score > scoredRaw.score);
});

test('candidateReadingAlignsWithTarget rejects mixed-script false positives', () => {
  assert.equal(candidateReadingAlignsWithTarget(
    { written: 'オンライン飲み会', reading: 'オンラインのみかい' },
    { kanji: '飲', reading: 'おん' }
  ), false);
  assert.equal(candidateReadingAlignsWithTarget(
    { written: '嫌悪', reading: 'けんお' },
    { kanji: '悪', reading: 'お' }
  ), true);
  assert.equal(candidateReadingAlignsWithTarget(
    { written: '去年', reading: 'こぞ' },
    { kanji: '去', reading: 'こ' }
  ), true);
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
      suggestedCandidateItems: 1,
      suggestedCandidateCount: 1,
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
        suggestedCandidateSummary: '後方 (うしろ) [add_governed_support_word; score 100; sentence-backed]',
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
  assert.match(text, /suggested words: 後方/);
  assert.match(text, /Highest-density kanji clusters/);
});
