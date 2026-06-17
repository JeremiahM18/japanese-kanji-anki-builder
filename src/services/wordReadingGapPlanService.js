const { normalizeText } = require('../utils/text');
const { HAN_CHAR_RE } = require('../utils/japanese');
const {
  buildWordKey,
  extractConstituentKanji,
  inferWordLevel,
  isLikelyPhraseCard,
} = require('./wordExportService');
const {
  normalizeReadingToken,
  readingMatchesExample,
} = require('./wordReadingCoverageService');

const ACTION_LABELS = {
  promote_curated_example: 'promote curated example',
  editorial_review: 'editorial review',
  defer_variant: 'defer variant',
};

const ACTION_SORT = {
  promote_curated_example: 0,
  editorial_review: 1,
  defer_variant: 2,
};

const PRIORITY_SCORE = {
  high: 300,
  medium: 200,
  low: 50,
};

const ACTION_SCORE = {
  promote_curated_example: 80,
  editorial_review: 50,
  defer_variant: 0,
};

const SUGGESTION_SOURCE_SCORE = {
  tracked_word: 70,
  sentence_corpus: 55,
  kanjiapi_cache: 30,
};

const SUGGESTION_QUALITY_RANK = {
  weak: 0,
  review: 1,
  strong: 2,
};

function getReadingLength(reading) {
  return Array.from(reading || '').length;
}

function scoreFrequencyRank(frequencyRank) {
  if (!Number.isInteger(frequencyRank) || frequencyRank <= 0) {
    return 0;
  }

  return Math.max(0, 35 - Math.floor(frequencyRank / 25));
}

function scoreReadingPracticality(item) {
  if (item.suggestedAction === 'promote_curated_example') {
    return 60;
  }

  const readingLength = getReadingLength(item.reading);
  let score = 0;

  if (item.readingType === 'on') {
    score += 45;
  } else if (readingLength <= 2) {
    score += 35;
  } else if (readingLength <= 4) {
    score += 15;
  }

  if (readingLength >= 7) {
    score -= 180;
  } else if (readingLength >= 5) {
    score -= 120;
  }

  if (/ずく|ずん|んぞ|さま$/.test(item.reading || '')) {
    score -= 80;
  }

  return score;
}

function countCandidates(item) {
  return (item.curatedExampleCandidates || []).length + (item.deckExampleCandidates || []).length;
}

function countSuggestions(item) {
  return (item.suggestedWordCandidates || []).length;
}

function getBestSuggestionScore(item) {
  return Math.max(0, ...(item.suggestedWordCandidates || []).map((candidate) => candidate.score || 0));
}

function scoreGapPlanItem(item) {
  let score = PRIORITY_SCORE[item.priority] || 0;
  score += ACTION_SCORE[item.suggestedAction] || 0;
  score += scoreReadingPracticality(item);

  if (item.gapKind === 'distinct') {
    score += 25;
  }
  if (item.status === 'missing_word_card') {
    score += 20;
  }

  score += Math.min(countCandidates(item), 3) * 10;
  score += Math.min(countSuggestions(item), 3) * 12;
  score += Math.min(Math.floor(getBestSuggestionScore(item) / 4), 45);
  return score;
}

function hasHanText(value) {
  return HAN_CHAR_RE.test(String(value || ''));
}

function buildWordKeyFromParts(written, reading) {
  return buildWordKey({ written, pron: reading });
}

function hasCoverageFor(entry, kanji, reading) {
  const covered = entry?.coverage?.coversReadings?.[kanji];
  return Boolean(covered && readingMatchesExample(reading, covered));
}

function normalizeCandidate(candidate = {}) {
  const written = String(candidate.written || '').trim();
  const reading = String(candidate.reading || candidate.pron || '').trim();
  const meaning = String(candidate.meaning || candidate.gloss || '').trim();

  if (!written || !reading || !hasHanText(written)) {
    return null;
  }

  return {
    ...candidate,
    written,
    reading,
    meaning,
    normalizedReading: normalizeReadingToken(reading),
    key: buildWordKeyFromParts(written, reading),
  };
}

function buildCandidateLevelSummary(candidate, { jlptOnlyJson = {}, targetLevel = null } = {}) {
  const constituentKanji = extractConstituentKanji(candidate.written);
  const levels = constituentKanji.map((kanji) => ({
    kanji,
    level: Number.isInteger(jlptOnlyJson?.[kanji]?.jlpt) ? jlptOnlyJson[kanji].jlpt : null,
  }));
  const crossLevelKanji = Number.isInteger(targetLevel)
    ? levels.filter((entry) => Number.isInteger(entry.level) && entry.level !== targetLevel)
    : [];
  const outsideJlptKanji = levels.filter((entry) => !Number.isInteger(entry.level));

  return {
    constituentKanji,
    inferredLevel: inferWordLevel({
      written: candidate.written,
      jlptOnlyJson,
      fallbackLevel: targetLevel,
    }),
    crossLevelKanji,
    outsideJlptKanji,
  };
}

function getRubyReadingsForKanji(readingBreakdown, targetKanji) {
  const readings = [];
  const source = String(readingBreakdown || '');
  let searchStart = 0;
  while (searchStart < source.length) {
    const rubyStart = source.indexOf('<ruby>', searchStart);
    if (rubyStart === -1) {
      break;
    }
    const writtenStart = rubyStart + '<ruby>'.length;
    const rtStart = source.indexOf('<rt>', writtenStart);
    const rtEnd = rtStart === -1 ? -1 : source.indexOf('</rt>', rtStart + '<rt>'.length);
    const rubyEnd = rtEnd === -1 ? -1 : source.indexOf('</ruby>', rtEnd + '</rt>'.length);
    if (rtStart === -1 || rtEnd === -1 || rubyEnd === -1) {
      searchStart = writtenStart;
      continue;
    }

    const written = source.slice(writtenStart, rtStart);
    const reading = source.slice(rtStart + '<rt>'.length, rtEnd);
    if (!written.includes('<') && !written.includes('>') && !reading.includes('<') && !reading.includes('>') && written.includes(targetKanji)) {
      readings.push(normalizeReadingToken(reading));
    }
    searchStart = rubyEnd + '</ruby>'.length;
  }
  return readings.filter(Boolean);
}

function candidateReadingAlignsWithTarget(candidate, item, trackedEntry = null) {
  const written = String(candidate?.written || '');
  const targetKanji = String(item?.kanji || '');
  const targetReading = normalizeReadingToken(item?.reading || '');
  const candidateReading = normalizeReadingToken(candidate?.reading || '');
  if (!written || !targetKanji || !targetReading || !candidateReading || !written.includes(targetKanji)) {
    return false;
  }

  const rubyReadings = getRubyReadingsForKanji(
    candidate?.readingBreakdown || trackedEntry?.readingBreakdown,
    targetKanji
  );
  if (rubyReadings.length > 0) {
    return rubyReadings.some((reading) => reading === targetReading);
  }

  if (candidateReading === targetReading) {
    return true;
  }

  const targetIndex = written.indexOf(targetKanji);
  const previousChar = targetIndex > 0 ? written[targetIndex - 1] : '';
  const nextChar = targetIndex + targetKanji.length < written.length ? written[targetIndex + targetKanji.length] : '';
  const previousIsKanji = HAN_CHAR_RE.test(previousChar);
  const nextIsKanji = HAN_CHAR_RE.test(nextChar);

  if (targetIndex === 0) {
    return candidateReading.startsWith(targetReading);
  }
  if (targetIndex + targetKanji.length === written.length) {
    return candidateReading.endsWith(targetReading);
  }
  if (previousIsKanji && nextIsKanji) {
    return false;
  }

  // Mixed kana/Latin context is too ambiguous for automatic planning.
  return false;
}

function classifyCandidateAction(candidate, item, wordStudyEntries = {}) {
  const trackedEntry = wordStudyEntries[candidate.key];
  if (!trackedEntry) {
    return 'add_governed_support_word';
  }

  if (hasCoverageFor(trackedEntry, item.kanji, item.reading)) {
    return 'already_governed_review_audit';
  }

  return 'extend_existing_word_contract';
}

function scoreSuggestedCandidate(candidate, item, {
  jlptOnlyJson = {},
  targetLevel = null,
  sentenceCorpus = [],
  wordStudyEntries = {},
} = {}) {
  const levelSummary = buildCandidateLevelSummary(candidate, { jlptOnlyJson, targetLevel });
  const trackedEntry = wordStudyEntries[candidate.key];
  const writtenSentenceMatches = (Array.isArray(sentenceCorpus) ? sentenceCorpus : [])
    .filter((entry) => String(entry?.written || '').trim() === candidate.written);
  const sentenceMatches = writtenSentenceMatches
    .filter((entry) => normalizeReadingToken(entry?.reading || '').includes(candidate.normalizedReading));
  const exactReading = normalizeReadingToken(candidate.reading) === normalizeReadingToken(item.reading);
  const readingMatch = readingMatchesExample(item.reading, candidate.reading);
  const constituentCount = levelSummary.constituentKanji.length;
  const priorityCount = Number.isInteger(candidate.priorityCount) ? candidate.priorityCount : 0;
  const tags = Array.isArray(trackedEntry?.tags) ? trackedEntry.tags : [];
  const glossText = normalizeText(`${candidate.meaning || ''} ${candidate.allGlossText || ''}`);
  const contributions = [];

  const add = (key, value) => {
    contributions.push({ key, value });
  };

  add('source', SUGGESTION_SOURCE_SCORE[candidate.source] || 0);
  if (trackedEntry) {
    add('tracked_word_contract', 45);
  }
  if (tags.includes('common')) {
    add('tracked_common_tag', 25);
  }
  if (sentenceMatches.length > 0) {
    add('sentence_available', 30);
  }
  if (writtenSentenceMatches.length > 0 && sentenceMatches.length === 0 && !trackedEntry) {
    add('written_only_sentence_mismatch', -20);
  }
  if (sentenceMatches.length > 0) {
    add('sentence_reading_match', 12);
  }
  if (exactReading) {
    add('exact_reading_match', 25);
  } else if (readingMatch) {
    add('partial_reading_match', 8);
  }
  if (constituentCount === 1) {
    add('single_kanji_word', trackedEntry ? -10 : -70);
  } else if (constituentCount === 2) {
    add('compact_compound', 22);
  } else if (constituentCount === 3) {
    add('medium_compound', 8);
  } else if (constituentCount > 3) {
    add('long_compound', -16);
  }
  if (priorityCount > 0) {
    add('kanjiapi_priority_markers', Math.min(priorityCount, 4) * 12);
  }
  const bestFrequency = sentenceMatches
    .map((entry) => entry.frequencyRank)
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((a, b) => a - b)[0];
  add('frequency_rank', scoreFrequencyRank(bestFrequency));
  if (glossText.includes('surname') || glossText.includes('given name') || glossText.includes('place name')) {
    add('name_penalty', -45);
  }
  if (glossText.includes('archaism') || glossText.includes('classical') || glossText.includes('sexagenary')) {
    add('obscure_penalty', -50);
  }
  if (levelSummary.crossLevelKanji.length > 0) {
    add('cross_level_label_needed', -3);
  }
  if (levelSummary.outsideJlptKanji.length > 0) {
    add('outside_jlpt_label_needed', -5);
  }

  const score = contributions.reduce((sum, entry) => sum + entry.value, 0);
  return {
    score,
    contributions,
    sentenceCount: sentenceMatches.length,
    bestFrequencyRank: bestFrequency || null,
    action: classifyCandidateAction(candidate, item, wordStudyEntries),
    ...levelSummary,
  };
}

function classifySuggestionQuality(suggestion) {
  if (!suggestion) {
    return 'weak';
  }

  if (
    suggestion.action === 'extend_existing_word_contract'
    || suggestion.score >= 140
    || (suggestion.sentenceCount > 0 && suggestion.score >= 110)
  ) {
    return 'strong';
  }

  if (suggestion.score >= 80) {
    return 'review';
  }

  return 'weak';
}

function suggestionMeetsQuality(suggestion, minimumQuality = 'weak') {
  const minimumRank = SUGGESTION_QUALITY_RANK[minimumQuality] ?? SUGGESTION_QUALITY_RANK.weak;
  const suggestionRank = SUGGESTION_QUALITY_RANK[suggestion?.quality] ?? SUGGESTION_QUALITY_RANK.weak;
  return suggestionRank >= minimumRank;
}

function suggestionMeetsOnlyFilter(suggestion, only = 'all') {
  if (only === 'contract-extensions') {
    return suggestion?.action === 'extend_existing_word_contract';
  }

  return true;
}

function buildSuggestionReason(scored) {
  const reasons = [];

  if (scored.action === 'extend_existing_word_contract') {
    reasons.push('already tracked; add explicit coverage intent');
  } else if (scored.action === 'add_governed_support_word') {
    reasons.push('new governed support candidate');
  } else if (scored.action === 'already_governed_review_audit') {
    reasons.push('appears governed; review audit mismatch');
  }

  if (scored.sentenceCount > 0) {
    reasons.push('sentence-backed');
  }
  if (Number.isInteger(scored.bestFrequencyRank)) {
    reasons.push(`frequency rank ${scored.bestFrequencyRank}`);
  }
  if (scored.crossLevelKanji.length > 0) {
    reasons.push(`label cross-level kanji ${scored.crossLevelKanji.map((entry) => `${entry.kanji}=N${entry.level}`).join(', ')}`);
  }
  if (scored.outsideJlptKanji.length > 0) {
    reasons.push(`label outside-JLPT kanji ${scored.outsideJlptKanji.map((entry) => entry.kanji).join(', ')}`);
  }

  return reasons.join('; ');
}

function buildSuggestedWordCandidates(item, {
  candidateRows = [],
  jlptOnlyJson = {},
  minSuggestionScore = 50,
  minSuggestionQuality = 'weak',
  only = 'all',
  targetLevel = null,
  sentenceCorpus = [],
  wordStudyEntries = {},
  maxSuggestionsPerItem = 5,
} = {}) {
  const deduped = new Map();

  for (const rawCandidate of candidateRows) {
    const candidate = normalizeCandidate(rawCandidate);
    if (!candidate || !candidate.written.includes(item.kanji)) {
      continue;
    }
    if (isLikelyPhraseCard(candidate)) {
      continue;
    }
    if (!candidateReadingAlignsWithTarget(candidate, item, wordStudyEntries[candidate.key])) {
      continue;
    }

    const scored = scoreSuggestedCandidate(candidate, item, {
      jlptOnlyJson,
      targetLevel,
      sentenceCorpus,
      wordStudyEntries,
    });
    const suggestion = {
      written: candidate.written,
      reading: candidate.reading,
      meaning: candidate.meaning,
      source: candidate.source,
      action: scored.action,
      score: scored.score,
      reason: buildSuggestionReason(scored),
      sentenceCount: scored.sentenceCount,
      bestFrequencyRank: scored.bestFrequencyRank,
      inferredLevel: scored.inferredLevel,
      constituentKanji: scored.constituentKanji,
      crossLevelKanji: scored.crossLevelKanji,
      outsideJlptKanji: scored.outsideJlptKanji,
      scoreBreakdown: scored.contributions,
    };
    suggestion.quality = classifySuggestionQuality(suggestion);

    if (suggestion.score < minSuggestionScore) {
      continue;
    }
    if (!suggestionMeetsQuality(suggestion, minSuggestionQuality)) {
      continue;
    }
    if (!suggestionMeetsOnlyFilter(suggestion, only)) {
      continue;
    }

    const existing = deduped.get(candidate.key);
    if (!existing || suggestion.score > existing.score) {
      deduped.set(candidate.key, suggestion);
    }
  }

  return [...deduped.values()]
    .sort((a, b) => (
      b.score - a.score
      || b.sentenceCount - a.sentenceCount
      || a.written.length - b.written.length
      || a.written.localeCompare(b.written, 'ja')
      || a.reading.localeCompare(b.reading, 'ja')
    ))
    .slice(0, maxSuggestionsPerItem);
}

function buildReason(item) {
  const reasons = [];

  if (item.suggestedAction === 'promote_curated_example') {
    reasons.push('curated example already exists');
  } else if (item.suggestedAction === 'editorial_review') {
    reasons.push('needs a learner-facing governed support word');
  } else if (item.suggestedAction === 'defer_variant') {
    reasons.push('tracked as a low-value or variant-style gap');
  }

  if (item.gapKind === 'distinct') {
    reasons.push('distinct reading target');
  } else if (item.gapKind === 'variant') {
    reasons.push('variant-style reading');
  }

  if (item.status === 'missing_word_card') {
    reasons.push('candidate exists but is not in the built deck');
  } else if (item.status === 'missing_example') {
    reasons.push('no curated example is covering it yet');
  }

  return reasons.join('; ');
}

function formatCandidates(item) {
  const candidates = [...(item.curatedExampleCandidates || []), ...(item.deckExampleCandidates || [])];
  if (candidates.length === 0) {
    return 'none yet';
  }

  return candidates
    .map((candidate) => `${candidate.written} (${candidate.reading})`)
    .join(', ');
}

function formatSuggestedCandidates(item) {
  const candidates = item.suggestedWordCandidates || [];
  if (candidates.length === 0) {
    return 'none yet';
  }

  return candidates
    .map((candidate) => {
      const reason = candidate.reason ? `; ${candidate.reason}` : '';
      return `${candidate.written} (${candidate.reading}) [${candidate.quality}; ${candidate.action}; score ${candidate.score}${reason}]`;
    })
    .join(' | ');
}

function toPlanItem(item, index, suggestionOptions = {}) {
  const suggestedWordCandidates = buildSuggestedWordCandidates(item, suggestionOptions);
  return {
    rank: index + 1,
    kanji: item.kanji,
    displayWord: item.displayWord,
    readingType: item.readingType,
    reading: item.reading,
    priority: item.priority,
    suggestedAction: item.suggestedAction,
    actionLabel: ACTION_LABELS[item.suggestedAction] || item.suggestedAction,
    status: item.status,
    gapKind: item.gapKind,
    readingPracticalityScore: scoreReadingPracticality(item),
    reason: buildReason(item),
    candidateSummary: formatCandidates(item),
    curatedExampleCandidates: item.curatedExampleCandidates || [],
    deckExampleCandidates: item.deckExampleCandidates || [],
    suggestedCandidateSummary: formatSuggestedCandidates({ suggestedWordCandidates }),
    suggestedWordCandidates,
    editorialNote: item.editorialNote || '',
    targetLevel: item.targetLevel,
    targetLevelReason: item.targetLevelReason || '',
  };
}

function comparePlanItems(a, b) {
  return (
    (ACTION_SORT[a.suggestedAction] ?? 99) - (ACTION_SORT[b.suggestedAction] ?? 99)
    || b.score - a.score
    || a.kanji.localeCompare(b.kanji, 'ja')
    || a.reading.localeCompare(b.reading, 'ja')
  );
}

function buildKanjiClusters(items) {
  const clusterByKanji = new Map();

  for (const item of items) {
    if (!clusterByKanji.has(item.kanji)) {
      clusterByKanji.set(item.kanji, {
        kanji: item.kanji,
        displayWord: item.displayWord,
        itemCount: 0,
        bestScore: 0,
        readings: [],
        suggestedActions: new Set(),
      });
    }

    const cluster = clusterByKanji.get(item.kanji);
    cluster.itemCount += 1;
    cluster.bestScore = Math.max(cluster.bestScore, item.score);
    cluster.readings.push(`${item.readingType}:${item.reading}`);
    cluster.suggestedActions.add(item.suggestedAction);
  }

  return [...clusterByKanji.values()]
    .map((cluster) => ({
      ...cluster,
      suggestedActions: [...cluster.suggestedActions].sort(),
    }))
    .sort((a, b) => b.itemCount - a.itemCount || b.bestScore - a.bestScore || a.kanji.localeCompare(b.kanji, 'ja'));
}

function summarizeDeferredTargetLevels(items = []) {
  return items
    .filter((item) => item.suggestedAction === 'defer_variant' && Number.isInteger(item.targetLevel))
    .reduce((summary, item) => {
      const label = `N${item.targetLevel}`;
      summary[label] = (summary[label] || 0) + 1;
      return summary;
    }, {});
}

function buildWordReadingGapPlan(triage, {
  coverageSummary = {},
  candidateRows = [],
  jlptOnlyJson = {},
  includeDeferred = false,
  limit = 50,
  minSuggestionScore = 50,
  minSuggestionQuality = 'weak',
  maxSuggestionsPerItem = 5,
  only = 'all',
  sentenceCorpus = [],
  targetLevel = null,
  wordStudyEntries = {},
} = {}) {
  const suggestionOptions = {
    candidateRows,
    jlptOnlyJson,
    maxSuggestionsPerItem,
    minSuggestionScore,
    minSuggestionQuality,
    only,
    sentenceCorpus,
    targetLevel,
    wordStudyEntries,
  };
  const sourceItems = (triage.items || [])
    .map((item, index) => {
      const planItem = toPlanItem(item, index, suggestionOptions);
      return {
        ...planItem,
        score: scoreGapPlanItem(planItem),
      };
    })
    .filter((item) => includeDeferred || item.suggestedAction !== 'defer_variant')
    .filter((item) => (only === 'contract-extensions' ? item.suggestedWordCandidates.length > 0 : true))
    .sort(comparePlanItems)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const limitedItems = sourceItems.slice(0, limit);
  const deferredHiddenItems = includeDeferred
    ? 0
    : (triage.items || []).filter((item) => item.suggestedAction === 'defer_variant').length;

  return {
    levelLabel: triage.levelLabel,
    summary: {
      totalTriageItems: triage.summary?.totalItems || 0,
      activePlanItems: sourceItems.filter((item) => item.suggestedAction !== 'defer_variant').length,
      limitedPlanItems: limitedItems.length,
      promoteCuratedExampleItems: sourceItems.filter((item) => item.suggestedAction === 'promote_curated_example').length,
      editorialReviewItems: sourceItems.filter((item) => item.suggestedAction === 'editorial_review').length,
      deferredItems: (triage.items || []).filter((item) => item.suggestedAction === 'defer_variant').length,
      deferredHiddenItems,
      suggestedCandidateItems: sourceItems.filter((item) => item.suggestedWordCandidates.length > 0).length,
      suggestedCandidateCount: sourceItems.reduce((sum, item) => sum + item.suggestedWordCandidates.length, 0),
      strongSuggestionItems: sourceItems.filter((item) => item.suggestedWordCandidates.some((candidate) => candidate.quality === 'strong')).length,
      reviewSuggestionItems: sourceItems.filter((item) => item.suggestedWordCandidates.some((candidate) => candidate.quality === 'review')).length,
      weakSuggestionItems: sourceItems.filter((item) => item.suggestedWordCandidates.some((candidate) => candidate.quality === 'weak')).length,
      deferredTargetLevelCounts: summarizeDeferredTargetLevels(triage.items || []),
      only,
      minSuggestionQuality,
      coveredReadings: coverageSummary.coveredReadings,
      totalReadings: coverageSummary.totalReadings,
      coveragePercent: coverageSummary.totalReadings > 0
        ? (coverageSummary.coveredReadings / coverageSummary.totalReadings) * 100
        : 0,
      coverageLabel: coverageSummary.coverageLabel,
      priorLevelCoveredReadings: coverageSummary.priorLevelCoveredReadings,
      currentLevelCoveredReadings: coverageSummary.currentLevelCoveredReadings,
    },
    items: limitedItems,
    kanjiClusters: buildKanjiClusters(sourceItems),
  };
}

function formatWordReadingGapPlan(plan) {
  const lines = [];
  lines.push(`Japanese Kanji Builder Word Reading Gap Plan (${plan.levelLabel})`);
  lines.push('');

  if (plan.summary.coverageLabel) {
    lines.push(`Coverage counted from decks: ${plan.summary.coverageLabel}`);
  }
  if (typeof plan.summary.coveredReadings === 'number' && typeof plan.summary.totalReadings === 'number') {
    lines.push(
      `Current reading coverage: ${plan.summary.coveragePercent.toFixed(1)}% `
      + `(${plan.summary.coveredReadings}/${plan.summary.totalReadings})`
    );
  }
  if (typeof plan.summary.priorLevelCoveredReadings === 'number') {
    lines.push(`  - Already satisfied by easier decks: ${plan.summary.priorLevelCoveredReadings}`);
    lines.push(`  - Satisfied by this deck level: ${plan.summary.currentLevelCoveredReadings}`);
  }
  lines.push(`Open triage items: ${plan.summary.totalTriageItems}`);
  lines.push(`Active planning items: ${plan.summary.activePlanItems}`);
  lines.push(`  - Fast promotions: ${plan.summary.promoteCuratedExampleItems}`);
  lines.push(`  - Editorial research: ${plan.summary.editorialReviewItems}`);
  lines.push(`  - Deferred variants hidden: ${plan.summary.deferredHiddenItems}`);
  const deferredTargetCounts = Object.entries(plan.summary.deferredTargetLevelCounts || {});
  if (deferredTargetCounts.length > 0) {
    lines.push(`  - Deferred target levels: ${deferredTargetCounts
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([level, count]) => `${level} ${count}`)
      .join(', ')}`);
  }
  lines.push(`  - Items with suggested candidates: ${plan.summary.suggestedCandidateItems}`);
  lines.push(`  - Suggested candidates shown: ${plan.summary.suggestedCandidateCount}`);
  lines.push(`  - Strong suggestion items: ${plan.summary.strongSuggestionItems}`);
  if (plan.summary.only && plan.summary.only !== 'all') {
    lines.push(`  - Filter: ${plan.summary.only}`);
  }
  if (plan.summary.minSuggestionQuality && plan.summary.minSuggestionQuality !== 'weak') {
    lines.push(`  - Minimum suggestion quality: ${plan.summary.minSuggestionQuality}`);
  }
  lines.push('');

  if (plan.items.length === 0) {
    lines.push('No active gap-plan items remain for the current filter.');
    return lines.join('\n') + '\n';
  }

  lines.push(`Recommended next batch (${plan.items.length} item${plan.items.length === 1 ? '' : 's'}):`);
  for (const item of plan.items) {
    lines.push(
      `${item.rank}. ${item.kanji} ${item.readingType}-reading ${item.reading} `
      + `[${item.actionLabel}; ${item.priority}; score ${item.score}]`
    );
    lines.push(`   reason: ${item.reason}`);
    lines.push(`   candidates: ${item.candidateSummary}`);
    lines.push(`   suggested words: ${item.suggestedCandidateSummary}`);
    if (Number.isInteger(item.targetLevel)) {
      lines.push(`   deferred target level: N${item.targetLevel}`);
      if (item.targetLevelReason) {
        lines.push(`   target reason: ${item.targetLevelReason}`);
      }
    }
    if (item.editorialNote) {
      lines.push(`   note: ${item.editorialNote}`);
    }
  }

  const clusters = plan.kanjiClusters.slice(0, 10);
  if (clusters.length > 0) {
    lines.push('');
    lines.push('Highest-density kanji clusters:');
    for (const cluster of clusters) {
      lines.push(`- ${cluster.kanji} (${cluster.displayWord || cluster.kanji}): ${cluster.itemCount} item(s) -> ${cluster.readings.join(', ')}`);
    }
  }

  return lines.join('\n') + '\n';
}

module.exports = {
  buildSuggestedWordCandidates,
  candidateReadingAlignsWithTarget,
  classifySuggestionQuality,
  buildKanjiClusters,
  buildWordReadingGapPlan,
  formatWordReadingGapPlan,
  suggestionMeetsOnlyFilter,
  suggestionMeetsQuality,
  scoreSuggestedCandidate,
  scoreReadingPracticality,
  scoreGapPlanItem,
};
