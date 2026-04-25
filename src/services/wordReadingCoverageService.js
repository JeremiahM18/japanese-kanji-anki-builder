const { katakanaToHiragana } = require('../utils/japanese');
const {
  buildGapOverrideKey,
  loadWordReadingGapTriageOverrides,
} = require('../datasets/wordReadingGapTriageOverrides');

function normalizeReadingToken(value) {
  return katakanaToHiragana(String(value || ''))
    .replace(/^おん:/, '')
    .replace(/^くん:/, '')
    .replace(/[\s・･]/g, '')
    .replace(/[.\-]/g, '')
    .replace(/…/g, '')
    .trim();
}

function parseDelimitedReadingField(fieldValue, prefix) {
  const raw = String(fieldValue || '').trim();
  if (!raw || !raw.startsWith(prefix)) {
    return [];
  }

  return [...new Set(raw.slice(prefix.length)
    .split('、')
    .map((entry) => normalizeReadingToken(entry))
    .filter(Boolean))];
}

function parseKanjiTsv(tsv) {
  const lines = String(tsv || '').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return [];
  }

  const header = lines[0].split('\t');
  return lines.slice(1).map((line) => {
    const cols = line.split('\t');
    const row = {};
    for (let index = 0; index < header.length; index += 1) {
      row[header[index]] = cols[index] || '';
    }
    return row;
  });
}

function parseWordTsv(tsv) {
  const lines = String(tsv || '').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return [];
  }

  const header = lines[0].split('\t');
  return lines.slice(1).map((line) => {
    const cols = line.split('\t');
    const row = {};
    for (let index = 0; index < header.length; index += 1) {
      row[header[index]] = cols[index] || '';
    }
    return row;
  });
}

function parseCoverageRole(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) {
    return 'unknown';
  }
  if (raw.includes('jlpt core')) {
    return 'core';
  }
  if (raw.includes('reading coverage support')) {
    return 'support';
  }
  if (raw.includes('inferred support')) {
    return 'inferred';
  }
  return 'unknown';
}

function parseDeckLevel(value) {
  const match = String(value || '').match(/N?(\d)/i);
  if (!match) {
    return null;
  }

  const level = Number(match[1]);
  return Number.isInteger(level) ? level : null;
}

function parseFocusKanjiField(value) {
  return String(value || '')
    .split('、')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseCoversReadingField(value) {
  const readings = new Map();
  for (const entry of String(value || '').split('／').map((part) => part.trim()).filter(Boolean)) {
    const [kanjiPart, readingPart] = entry.split(':');
    const kanji = String(kanjiPart || '').trim();
    const reading = normalizeReadingToken(readingPart || '');
    if (kanji && reading) {
      readings.set(kanji, reading);
    }
  }
  return readings;
}

function parseExampleEntries(notes) {
  return String(notes || '')
    .split(' ／ ')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(?<word>.+?)\s*（(?<reading>[^）]+)）\s*-\s*(?<meaning>.+)$/u);
      if (!match || !match.groups) {
        return null;
      }
      return {
        written: match.groups.word.trim(),
        reading: String(match.groups.reading || '').trim(),
        normalizedReading: normalizeReadingToken(match.groups.reading || ''),
        meaning: match.groups.meaning.trim(),
        source: 'notes',
      };
    })
    .filter(Boolean);
}

function buildCuratedExamplesForKanji(row) {
  const examples = [];
  const displayWord = String(row.DisplayWord || '').trim();
  const primaryReading = String(row.PrimaryReading || '').trim();

  if (displayWord && primaryReading) {
    examples.push({
      written: displayWord,
      reading: primaryReading,
      normalizedReading: normalizeReadingToken(primaryReading),
      meaning: String(row.MeaningJP || '').trim(),
      source: 'display',
    });
  }

  examples.push(...parseExampleEntries(row.Notes));

  const deduped = new Map();
  for (const example of examples) {
    const key = `${example.written}|${example.reading}`;
    if (!deduped.has(key)) {
      deduped.set(key, example);
    }
  }

  return [...deduped.values()];
}

function readingMatchesExample(targetReading, exampleReading) {
  const target = normalizeReadingToken(targetReading);
  const example = normalizeReadingToken(exampleReading);

  if (!target || !example) {
    return false;
  }

  return example === target
    || example.startsWith(target)
    || example.endsWith(target)
    || (target.length >= 2 && example.includes(target));
}

function classifyGapKind(reading, coveredReadings = []) {
  const target = normalizeReadingToken(reading);
  if (!target) {
    return 'distinct';
  }

  const normalizedCovered = [...new Set((Array.isArray(coveredReadings) ? coveredReadings : [])
    .map((entry) => normalizeReadingToken(entry))
    .filter(Boolean))];

  if (normalizedCovered.some((covered) => covered === target)) {
    return 'covered';
  }

  const isVariant = normalizedCovered.some((covered) => (
    covered.startsWith(target)
    || target.startsWith(covered)
    || covered.endsWith(target)
    || target.endsWith(covered)
  ));

  return isVariant ? 'variant' : 'distinct';
}

function buildWordDeckIndex(wordRows) {
  return wordRows.map((row) => ({
    written: String(row.Word || '').trim(),
    reading: String(row.Reading || '').trim(),
    normalizedReading: normalizeReadingToken(String(row.Reading || '').trim()),
    coverageRole: String(row.CoverageRole || '').trim(),
    coverageRoleKind: parseCoverageRole(row.CoverageRole),
    deckLevel: Number.isInteger(row.SourceDeckLevelNumber)
      ? row.SourceDeckLevelNumber
      : parseDeckLevel(row.SourceDeckLevel || row.JLPTLevel),
    focusKanji: parseFocusKanjiField(row.FocusKanji),
    coverageReadings: parseCoversReadingField(row.CoversReading),
  }));
}

function buildReadingCoverageForKanji(row, wordDeckIndex) {
  const kanji = String(row.Kanji || '').trim();
  const examples = buildCuratedExamplesForKanji(row).filter((example) => example.written.includes(kanji));
  const onReadings = parseDelimitedReadingField(row.OnReading, 'オン:');
  const kunReadings = parseDelimitedReadingField(row.KunReading, 'くん:');

  const evaluateReading = (reading) => {
    const matchingExamples = examples.filter((example) => readingMatchesExample(reading, example.normalizedReading));
    const explicitDeckExamples = wordDeckIndex
      .filter((deckEntry) => deckEntry.focusKanji.includes(kanji)
        && readingMatchesExample(reading, deckEntry.coverageReadings.get(kanji)))
      .map((deckEntry) => ({
        written: deckEntry.written,
        reading: deckEntry.reading,
        normalizedReading: deckEntry.normalizedReading,
        meaning: '',
        source: 'deck',
        coverageRole: deckEntry.coverageRole,
        coverageRoleKind: deckEntry.coverageRoleKind,
        deckLevel: deckEntry.deckLevel,
      }));
    const fallbackDeckExamples = explicitDeckExamples.length > 0
      ? []
      : wordDeckIndex
        .filter((deckEntry) => deckEntry.written.includes(kanji)
          && matchingExamples.some((example) => readingMatchesExample(example.normalizedReading, deckEntry.normalizedReading)))
        .map((deckEntry) => ({
          written: deckEntry.written,
          reading: deckEntry.reading,
          normalizedReading: deckEntry.normalizedReading,
          meaning: '',
          source: 'deck',
          coverageRole: deckEntry.coverageRole,
          coverageRoleKind: deckEntry.coverageRoleKind,
          deckLevel: deckEntry.deckLevel,
        }));
    const deckExamples = explicitDeckExamples.length > 0 ? explicitDeckExamples : fallbackDeckExamples;

    let coverageSource = 'none';
    if (deckExamples.some((example) => example.coverageRoleKind === 'core')) {
      coverageSource = 'core';
    } else if (deckExamples.some((example) => example.coverageRoleKind === 'support')) {
      coverageSource = 'support';
    } else if (deckExamples.some((example) => example.coverageRoleKind === 'inferred')) {
      coverageSource = 'inferred';
    } else if (deckExamples.length > 0) {
      coverageSource = 'unknown';
    }

    let status = 'missing_example';
    if (deckExamples.length > 0) {
      status = 'covered';
    } else if (matchingExamples.length > 0) {
      status = 'missing_word_card';
    }

    return {
      reading,
      status,
      coverageSource,
      matchingExamples,
      deckExamples,
    };
  };

  const onCoverage = onReadings.map(evaluateReading);
  const kunCoverage = kunReadings.map(evaluateReading);
  const coveredReadings = [...onCoverage, ...kunCoverage]
    .filter((entry) => entry.status === 'covered')
    .map((entry) => entry.reading);

  for (const entry of [...onCoverage, ...kunCoverage]) {
    if (entry.status === 'covered') {
      entry.gapKind = 'covered';
      continue;
    }
    entry.gapKind = classifyGapKind(entry.reading, coveredReadings);
  }

  return {
    kanji,
    displayWord: String(row.DisplayWord || '').trim(),
    examples,
    onCoverage,
    kunCoverage,
  };
}

function countCoveredReadingsBySource(entries = [], source) {
  return entries.filter((entry) => entry.status === 'covered' && entry.coverageSource === source).length;
}

function buildCoverageSourceSummary(allReadings = []) {
  return {
    coreCoveredReadings: countCoveredReadingsBySource(allReadings, 'core'),
    supportCoveredReadings: countCoveredReadingsBySource(allReadings, 'support'),
    inferredCoveredReadings: countCoveredReadingsBySource(allReadings, 'inferred'),
    unknownCoveredReadings: countCoveredReadingsBySource(allReadings, 'unknown'),
  };
}

function buildWordReadingCoverageReport({ kanjiRows, wordRows, levelLabel = 'N5' }) {
  const targetLevel = parseDeckLevel(levelLabel);
  const wordDeckIndex = buildWordDeckIndex(wordRows);
  const coverage = kanjiRows.map((row) => buildReadingCoverageForKanji(row, wordDeckIndex));
  const allReadings = coverage.flatMap((entry) => [...entry.onCoverage, ...entry.kunCoverage]);
  const sourceSummary = buildCoverageSourceSummary(allReadings);
  const priorLevelCoveredReadings = allReadings.filter((entry) => (
    entry.status === 'covered'
      && Number.isInteger(targetLevel)
      && entry.deckExamples.some((example) => Number.isInteger(example.deckLevel) && example.deckLevel > targetLevel)
  )).length;
  const currentLevelCoveredReadings = allReadings.filter((entry) => (
    entry.status === 'covered'
      && (
        !Number.isInteger(targetLevel)
        || entry.deckExamples.some((example) => example.deckLevel === targetLevel)
      )
  )).length;
  const coverageLevels = [...new Set(wordDeckIndex
    .map((entry) => entry.deckLevel)
    .filter((value) => Number.isInteger(value))
  )].sort((a, b) => b - a);

  const summary = {
    levelLabel,
    targetLevel,
    coverageLevels,
    coverageLabel: coverageLevels.map((level) => `N${level}`).join(' + '),
    kanjiCount: coverage.length,
    totalReadings: allReadings.length,
    coveredReadings: allReadings.filter((entry) => entry.status === 'covered').length,
    ...sourceSummary,
    priorLevelCoveredReadings,
    currentLevelCoveredReadings,
    missingWordCardReadings: allReadings.filter((entry) => entry.status === 'missing_word_card').length,
    missingExampleReadings: allReadings.filter((entry) => entry.status === 'missing_example').length,
    variantGapReadings: allReadings.filter((entry) => entry.status !== 'covered' && entry.gapKind === 'variant').length,
    distinctGapReadings: allReadings.filter((entry) => entry.status !== 'covered' && entry.gapKind === 'distinct').length,
  };

  return {
    summary,
    kanji: coverage,
  };
}

function buildWordReadingGapTriage(report) {
  const priorityRanks = {
    high: 0,
    medium: 1,
    low: 2,
  };
  const overridesByLevel = loadWordReadingGapTriageOverrides();
  const levelOverrides = overridesByLevel[report.summary.levelLabel] || {};

  const items = report.kanji.flatMap((entry) => {
    const buildItem = (readingType, readingEntry) => {
      if (readingEntry.status === 'covered') {
        return null;
      }

      let suggestedAction = 'editorial_review';
      let priority = 'high';

      if (readingEntry.status === 'missing_word_card') {
        suggestedAction = 'promote_curated_example';
        priority = 'medium';
      } else if (readingEntry.gapKind === 'variant') {
        suggestedAction = 'defer_variant';
        priority = 'low';
      }

      const override = levelOverrides[buildGapOverrideKey({
        kanji: entry.kanji,
        readingType,
        reading: readingEntry.reading,
      })];
      if (override) {
        suggestedAction = override.suggestedAction;
        priority = override.priority || priority;
      }

      return {
        kanji: entry.kanji,
        displayWord: entry.displayWord || entry.kanji,
        readingType,
        reading: readingEntry.reading,
        status: readingEntry.status,
        gapKind: readingEntry.gapKind || 'distinct',
        priority,
        suggestedAction,
        editorialNote: override?.note || '',
        curatedExampleCandidates: readingEntry.matchingExamples.map((example) => ({
          written: example.written,
          reading: example.reading,
          meaning: example.meaning,
          source: example.source,
        })),
        deckExampleCandidates: readingEntry.deckExamples.map((example) => ({
          written: example.written,
          reading: example.reading,
          coverageRole: example.coverageRole,
          coverageRoleKind: example.coverageRoleKind,
        })),
      };
    };

    return [
      ...entry.onCoverage.map((readingEntry) => buildItem('on', readingEntry)),
      ...entry.kunCoverage.map((readingEntry) => buildItem('kun', readingEntry)),
    ].filter(Boolean);
  }).sort((a, b) => (
    (priorityRanks[a.priority] ?? 99) - (priorityRanks[b.priority] ?? 99)
    || a.kanji.localeCompare(b.kanji, 'ja')
    || a.reading.localeCompare(b.reading, 'ja')
  ));

  return {
    levelLabel: report.summary.levelLabel,
    summary: {
      totalItems: items.length,
      highPriorityItems: items.filter((item) => item.priority === 'high').length,
      mediumPriorityItems: items.filter((item) => item.priority === 'medium').length,
      lowPriorityItems: items.filter((item) => item.priority === 'low').length,
      editorialReviewItems: items.filter((item) => item.suggestedAction === 'editorial_review').length,
      promoteCuratedExampleItems: items.filter((item) => item.suggestedAction === 'promote_curated_example').length,
      deferVariantItems: items.filter((item) => item.suggestedAction === 'defer_variant').length,
    },
    items,
  };
}

function formatCoverageBucket(label, entries) {
  if (entries.length === 0) {
    return `  - ${label}: none`;
  }
  return `  - ${label}: ` + entries.map((entry) => {
    const examples = (entry.deckExamples.length > 0 ? entry.deckExamples : entry.matchingExamples)
      .map((example) => `${example.written} (${example.reading})`)
      .join(', ');
    const sourceSuffix = entry.status === 'covered' && entry.coverageSource !== 'none'
      ? `:${entry.coverageSource}`
      : '';
    const gapSuffix = entry.status !== 'covered' && entry.gapKind && entry.gapKind !== 'covered'
      ? `:${entry.gapKind}`
      : '';
    return `${entry.reading} [${entry.status}${sourceSuffix}${gapSuffix}]${examples ? ` -> ${examples}` : ''}`;
  }).join(' | ');
}

function formatWordReadingCoverageReport(report, { maxKanji = 50 } = {}) {
  const lines = [];
  lines.push(`Japanese Kanji Builder Word Reading Coverage Audit (${report.summary.levelLabel})`);
  lines.push('');
  lines.push(`Kanji audited: ${report.summary.kanjiCount}`);
  if (report.summary.coverageLabel) {
    lines.push(`Coverage counted from decks: ${report.summary.coverageLabel}`);
  }
  lines.push(`Readings audited: ${report.summary.totalReadings}`);
  lines.push(`Covered by word deck: ${report.summary.coveredReadings}`);
  lines.push(`  - Covered by JLPT core words: ${report.summary.coreCoveredReadings}`);
  lines.push(`  - Covered by reading-support words: ${report.summary.supportCoveredReadings}`);
  lines.push(`  - Covered by inferred support words: ${report.summary.inferredCoveredReadings}`);
  if (typeof report.summary.priorLevelCoveredReadings === 'number') {
    lines.push(`  - Covered by earlier decks: ${report.summary.priorLevelCoveredReadings}`);
    lines.push(`  - Covered by this deck level: ${report.summary.currentLevelCoveredReadings}`);
  }
  lines.push(`Curated example exists but missing from word deck: ${report.summary.missingWordCardReadings}`);
  lines.push(`No curated example yet: ${report.summary.missingExampleReadings}`);
  lines.push(`  - Distinct missing reading targets: ${report.summary.distinctGapReadings}`);
  lines.push(`  - Variant-style gaps to review later: ${report.summary.variantGapReadings}`);
  lines.push('');

  const focus = report.kanji
    .filter((entry) => [...entry.onCoverage, ...entry.kunCoverage].some((reading) => reading.status !== 'covered'))
    .sort((a, b) => {
      const aMissing = [...a.onCoverage, ...a.kunCoverage].filter((reading) => reading.status !== 'covered');
      const bMissing = [...b.onCoverage, ...b.kunCoverage].filter((reading) => reading.status !== 'covered');
      const aDistinct = aMissing.filter((reading) => reading.gapKind === 'distinct').length;
      const bDistinct = bMissing.filter((reading) => reading.gapKind === 'distinct').length;
      return bDistinct - aDistinct || bMissing.length - aMissing.length || a.kanji.localeCompare(b.kanji, 'ja');
    })
    .slice(0, maxKanji);

  if (focus.length === 0) {
    lines.push('All curated N5 readings currently have at least one supporting word card.');
    return lines.join('\n') + '\n';
  }

  lines.push('Kanji with remaining reading gaps:');
  for (const entry of focus) {
    const missing = [...entry.onCoverage, ...entry.kunCoverage].filter((reading) => reading.status !== 'covered').length;
    lines.push(`- ${entry.kanji} (${entry.displayWord || entry.kanji}) - ${missing} uncovered reading(s)`);
    lines.push(formatCoverageBucket('On-yomi', entry.onCoverage));
    lines.push(formatCoverageBucket('Kun-yomi', entry.kunCoverage));
  }

  return lines.join('\n') + '\n';
}

function formatWordReadingGapTriage(triage, { maxItems = 50, includeVariants = false } = {}) {
  const actionLabels = {
    editorial_review: 'review learner-card value before card work',
    promote_curated_example: 'promote curated learner candidate',
    defer_variant: 'defer or leave uncovered',
  };
  const priorityLabels = {
    high: 'review-needed',
    medium: 'actionable-candidate',
    low: 'deferred-low-value',
  };
  const lines = [];
  lines.push(`Japanese Kanji Builder Word Reading Gap Triage (${triage.levelLabel})`);
  lines.push('');
  lines.push(`Open gap items: ${triage.summary.totalItems}`);
  lines.push(`  - Review needed before card work: ${triage.summary.highPriorityItems}`);
  lines.push(`  - Actionable curated learner candidates: ${triage.summary.mediumPriorityItems}`);
  lines.push(`  - Deferred variants or low learner value: ${triage.summary.lowPriorityItems}`);
  lines.push('');
  lines.push('Product rule: create cards only for common, learner-friendly, useful words. If no good learner card exists, leave the reading uncovered or deferred.');
  lines.push('Review-needed items are not automatic card work; they need learner-value evidence first.');
  lines.push('');

  const focusItems = triage.items
    .filter((item) => includeVariants || item.priority !== 'low')
    .slice(0, maxItems);

  if (focusItems.length === 0) {
    lines.push('No triage items remain for the current filter.');
    return lines.join('\n') + '\n';
  }

  lines.push('Learner-card review queue:');
  for (const item of focusItems) {
    const candidateText = item.curatedExampleCandidates.length > 0
      ? item.curatedExampleCandidates.map((candidate) => `${candidate.written} (${candidate.reading})`).join(', ')
      : item.suggestedAction === 'editorial_review'
        ? 'none yet (review only; no card work without common learner-friendly evidence)'
        : 'none yet';
    lines.push(
      `- ${item.kanji} ${item.readingType}-reading ${item.reading} `
      + `[${priorityLabels[item.priority] || item.priority}; ${actionLabels[item.suggestedAction] || item.suggestedAction}; ${item.status}; ${item.gapKind}]`
    );
    lines.push(`  display anchor: ${item.displayWord}`);
    lines.push(`  curated candidates: ${candidateText}`);
    if (item.editorialNote) {
      lines.push(`  editorial note: ${item.editorialNote}`);
    }
  }

  return lines.join('\n') + '\n';
}

module.exports = {
  buildCuratedExamplesForKanji,
  classifyGapKind,
  buildCoverageSourceSummary,
  buildWordReadingGapTriage,
  buildReadingCoverageForKanji,
  buildWordDeckIndex,
  buildWordReadingCoverageReport,
  formatWordReadingGapTriage,
  formatWordReadingCoverageReport,
  normalizeReadingToken,
  parseCoverageRole,
  parseCoversReadingField,
  parseDeckLevel,
  parseDelimitedReadingField,
  parseExampleEntries,
  parseFocusKanjiField,
  parseKanjiTsv,
  parseWordTsv,
  readingMatchesExample,
};
