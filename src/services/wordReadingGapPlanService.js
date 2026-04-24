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

function getReadingLength(reading) {
  return Array.from(reading || '').length;
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
  return score;
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

function toPlanItem(item, index) {
  return {
    rank: index + 1,
    score: scoreGapPlanItem(item),
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
    editorialNote: item.editorialNote || '',
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

function buildWordReadingGapPlan(triage, {
  coverageSummary = {},
  includeDeferred = false,
  limit = 50,
} = {}) {
  const sourceItems = (triage.items || [])
    .map((item, index) => toPlanItem(item, index))
    .filter((item) => includeDeferred || item.suggestedAction !== 'defer_variant')
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
  buildKanjiClusters,
  buildWordReadingGapPlan,
  formatWordReadingGapPlan,
  scoreReadingPracticality,
  scoreGapPlanItem,
};
