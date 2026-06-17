const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSuggestedWordCandidates,
  candidateReadingAlignsWithTarget,
  classifySuggestionQuality,
  buildWordReadingGapPlan,
  formatWordReadingGapPlan,
  scoreSuggestedCandidate,
  suggestionMeetsOnlyFilter,
  suggestionMeetsQuality,
  scoreReadingPracticality,
  scoreGapPlanItem,
} = require('../src/services/wordReadingGapPlanService');
const { loadWordReadingGapTriageOverrides } = require('../src/datasets/wordReadingGapTriageOverrides');

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

test('tracked N3 reading-gap overrides defer source-thin batch 119 rows', () => {
  const overrides = loadWordReadingGapTriageOverrides();
  for (const key of [
    '奥|kun|くま',
    '芸|kun|わざ',
    '最|kun|つま',
    '参|kun|みつ',
    '処|kun|おる',
    '存|kun|ある',
    '存|kun|とう',
    '両|kun|てる',
    '解|kun|さとる',
    '観|kun|しめす',
    '芸|kun|うえる',
    '権|kun|おもり',
    '権|kun|はかる',
    '号|kun|さけぶ',
    '号|kun|よびな',
    '歳|kun|よわい',
    '参|kun|まじわる',
    '賛|kun|たすける',
    '残|kun|そこなう',
    '師|kun|いくさ',
  ]) {
    assert.equal(overrides.N3[key].suggestedAction, 'defer_variant');
    assert.match(overrides.N3[key].note, /Live local JMdict review/);
  }
});

test('tracked N3 reading-gap overrides defer source-thin batch 121 rows', () => {
  const overrides = loadWordReadingGapTriageOverrides();
  for (const key of [
    '寝|kun|みたまや',
    '寝|kun|やめる',
    '数|kun|せめる',
  ]) {
    assert.equal(overrides.N3[key].suggestedAction, 'defer_variant');
    assert.match(overrides.N3[key].note, /Live local JMdict review/);
  }
});

test('tracked N3 reading-gap overrides defer source-thin batch 122 rows', () => {
  const overrides = loadWordReadingGapTriageOverrides();
  for (const key of [
    '争|kun|いかでか',
    '存|kun|たもつ',
    '対|kun|こたえる',
    '対|kun|そろい',
    '対|kun|つれあい',
    '対|kun|ならぶ',
    '断|kun|さだめる',
    '伝|kun|つだう',
    '登|kun|あがる',
    '忙|kun|おそれる',
    '夢|kun|くらい',
    '与|kun|ともに',
    '両|kun|ふたつ',
    '労|kun|つかれる',
    '録|kun|しるす',
    '数|kun|わずらわしい',
    '忙|kun|うれえるさま',
  ]) {
    assert.equal(overrides.N3[key].suggestedAction, 'defer_variant');
    assert.match(overrides.N3[key].note, /Live local JMdict review/);
  }
});

test('tracked N3 reading-gap deferrals carry explicit N2 or N1 target placement', () => {
  const overrides = loadWordReadingGapTriageOverrides();
  const n3Deferrals = Object.entries(overrides.N3 || {})
    .filter(([, override]) => override.suggestedAction === 'defer_variant');
  const targetCounts = n3Deferrals.reduce((counts, [, override]) => {
    counts[override.targetLevel] = (counts[override.targetLevel] || 0) + 1;
    return counts;
  }, {});

  assert.equal(n3Deferrals.length, 155);
  assert.deepEqual(targetCounts, { 1: 152, 2: 3 });
  assert.equal(overrides.N3['登|on|とう'].targetLevel, 2);
  assert.match(overrides.N3['登|on|とう'].targetLevelReason, /登場\|とうじょう/);
  assert.equal(overrides.N3['差|kun|さし'].targetLevel, 2);
  assert.match(overrides.N3['差|kun|さし'].targetLevelReason, /差し支え\|さしつかえ/);
  assert.equal(overrides.N3['達|on|たつ'].targetLevel, 2);
  assert.match(overrides.N3['達|on|たつ'].targetLevelReason, /速達\|そくたつ/);
  assert.equal(overrides.N3['指|kun|さし'].targetLevel, 1);
  assert.match(overrides.N3['指|kun|さし'].targetLevelReason, /指図\|さしず/);
  assert.equal(overrides.N3['遊|on|ゆ'].targetLevel, 1);
  assert.match(overrides.N3['遊|on|ゆ'].targetLevelReason, /遊園地\|ゆうえんち/);
  assert.equal(overrides.N3['和|on|か'].targetLevel, 1);
  assert.match(overrides.N3['和|on|か'].targetLevelReason, /英和\|えいわ/);

  for (const [key, override] of n3Deferrals) {
    assert.ok([1, 2].includes(override.targetLevel), `${key} should route to N1 or N2`);
    assert.ok(override.targetLevelReason, `${key} should explain its target placement`);
  }
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
  assert.equal(candidates[0].quality, 'strong');
  assert.equal(candidates.some((candidate) => candidate.written === '水汚れ'), false);
});

test('buildSuggestedWordCandidates can filter to strong contract-extension wins', () => {
  const item = {
    kanji: '所',
    reading: 'しょ',
  };
  const candidates = buildSuggestedWordCandidates(item, {
    only: 'contract-extensions',
    minSuggestionQuality: 'strong',
    targetLevel: 4,
    jlptOnlyJson: {
      所: { jlpt: 4 },
      場: { jlpt: 4 },
    },
    wordStudyEntries: {
      '場所|ばしょ': {
        written: '場所',
        reading: 'ばしょ',
        meaning: 'place',
        tags: ['starter', 'common', 'n4'],
      },
    },
    candidateRows: [
      { written: '場所', reading: 'ばしょ', meaning: 'place', source: 'tracked_word' },
      { written: '急所', reading: 'きゅうしょ', meaning: 'vital point', source: 'kanjiapi_cache', priorityCount: 2 },
    ],
  });

  assert.deepEqual(candidates.map((candidate) => candidate.written), ['場所']);
  assert.equal(candidates[0].action, 'extend_existing_word_contract');
});

test('buildWordReadingGapPlan filters contract-extension items', () => {
  const plan = buildWordReadingGapPlan({
    levelLabel: 'N4',
    summary: { totalItems: 2 },
    items: [
      {
        kanji: '所',
        displayWord: '所',
        readingType: 'on',
        reading: 'しょ',
        priority: 'high',
        suggestedAction: 'editorial_review',
        status: 'missing_example',
        gapKind: 'distinct',
        curatedExampleCandidates: [],
        deckExampleCandidates: [],
      },
      {
        kanji: '悪',
        displayWord: '悪い',
        readingType: 'on',
        reading: 'お',
        priority: 'high',
        suggestedAction: 'editorial_review',
        status: 'missing_example',
        gapKind: 'distinct',
        curatedExampleCandidates: [],
        deckExampleCandidates: [],
      },
    ],
  }, {
    candidateRows: [
      { written: '場所', reading: 'ばしょ', meaning: 'place', source: 'tracked_word' },
      { written: '嫌悪', reading: 'けんお', meaning: 'dislike', source: 'kanjiapi_cache', priorityCount: 2 },
    ],
    jlptOnlyJson: {
      所: { jlpt: 4 },
      場: { jlpt: 4 },
      悪: { jlpt: 4 },
      嫌: { jlpt: 1 },
    },
    only: 'contract-extensions',
    targetLevel: 4,
    wordStudyEntries: {
      '場所|ばしょ': {
        written: '場所',
        reading: 'ばしょ',
        meaning: 'place',
        tags: ['starter', 'common', 'n4'],
      },
    },
  });

  assert.equal(plan.summary.only, 'contract-extensions');
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].kanji, '所');
  assert.equal(plan.items[0].suggestedWordCandidates[0].action, 'extend_existing_word_contract');
});

test('suggestion quality helpers classify and filter candidate confidence', () => {
  assert.equal(classifySuggestionQuality({ action: 'extend_existing_word_contract', score: 90, sentenceCount: 0 }), 'strong');
  assert.equal(classifySuggestionQuality({ action: 'add_governed_support_word', score: 120, sentenceCount: 1 }), 'strong');
  assert.equal(classifySuggestionQuality({ action: 'add_governed_support_word', score: 90, sentenceCount: 0 }), 'review');
  assert.equal(classifySuggestionQuality({ action: 'add_governed_support_word', score: 60, sentenceCount: 0 }), 'weak');
  assert.equal(suggestionMeetsQuality({ quality: 'review' }, 'strong'), false);
  assert.equal(suggestionMeetsQuality({ quality: 'strong' }, 'review'), true);
  assert.equal(suggestionMeetsOnlyFilter({ action: 'extend_existing_word_contract' }, 'contract-extensions'), true);
  assert.equal(suggestionMeetsOnlyFilter({ action: 'add_governed_support_word' }, 'contract-extensions'), false);
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

test('scoreSuggestedCandidate does not borrow sentence support from a different reading', () => {
  const item = { kanji: '生', reading: 'しょう' };
  const scored = scoreSuggestedCandidate(
    { written: '学生', reading: 'がくしょう', meaning: 'Heian-period student', source: 'kanjiapi_cache' },
    item,
    {
      sentenceCorpus: [{
        written: '学生',
        reading: 'あのがくせいはにほんじんです。',
        japanese: 'あの学生は日本人です。',
        english: 'That student is Japanese.',
        frequencyRank: 165,
      }],
      targetLevel: 5,
      jlptOnlyJson: { 学: { jlpt: 5 }, 生: { jlpt: 5 } },
    }
  );
  const breakdown = Object.fromEntries(scored.contributions.map((entry) => [entry.key, entry.value]));

  assert.equal(breakdown.sentence_available, undefined);
  assert.equal(breakdown.sentence_reading_match, undefined);
  assert.equal(breakdown.frequency_rank, 0);
  assert.equal(breakdown.written_only_sentence_mismatch, -20);
  assert.equal(classifySuggestionQuality({
    action: 'add_governed_support_word',
    score: scored.score,
    sentenceCount: scored.sentenceCount,
  }), 'weak');
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
  assert.equal(candidateReadingAlignsWithTarget(
    { written: '映画館', reading: 'えいがかん' },
    { kanji: '画', reading: 'え' },
    { readingBreakdown: '<ruby>映<rt>えい</rt></ruby><ruby>画<rt>が</rt></ruby><ruby>館<rt>かん</rt></ruby>' }
  ), false);
  assert.equal(candidateReadingAlignsWithTarget(
    { written: '台所', reading: 'だいどころ' },
    { kanji: '所', reading: 'どころ' },
    { readingBreakdown: '<ruby>台<rt>だい</rt></ruby><ruby>所<rt>どころ</rt></ruby>' }
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
        targetLevel: 1,
        targetLevelReason: 'Route only to later-level review.',
      },
    ],
  }, { includeDeferred: true });

  assert.equal(plan.summary.deferredHiddenItems, 0);
  assert.deepEqual(plan.summary.deferredTargetLevelCounts, { N1: 1 });
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].suggestedAction, 'defer_variant');
  assert.equal(plan.items[0].targetLevel, 1);
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
      strongSuggestionItems: 1,
      reviewSuggestionItems: 0,
      weakSuggestionItems: 0,
      deferredTargetLevelCounts: { N1: 1 },
      only: 'contract-extensions',
      minSuggestionQuality: 'strong',
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
        suggestedCandidateSummary: '後方 (うしろ) [strong; add_governed_support_word; score 100; sentence-backed]',
        targetLevel: 1,
        targetLevelReason: 'Route only to later-level review.',
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
  assert.match(text, /Deferred target levels: N1 1/);
  assert.match(text, /deferred target level: N1/);
  assert.match(text, /Filter: contract-extensions/);
  assert.match(text, /Minimum suggestion quality: strong/);
  assert.match(text, /Highest-density kanji clusters/);
});
