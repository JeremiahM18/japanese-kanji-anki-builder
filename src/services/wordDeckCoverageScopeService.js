const { buildWordStudyEntryKey } = require('../datasets/wordStudyData');
const { parseWordTsv } = require('./wordReadingCoverageService');

function normalizeCoverageLevels(levels) {
  return [...new Set((Array.isArray(levels) ? levels : [])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 5)
  )].sort((a, b) => b - a);
}

function buildCoverageLevels(level, { availableLevels = null } = {}) {
  const targetLevel = Number(level);
  if (!Number.isInteger(targetLevel) || targetLevel < 1 || targetLevel > 5) {
    throw new Error('Word deck coverage level must be 1-5.');
  }

  const scopedLevels = normalizeCoverageLevels(availableLevels);
  if (scopedLevels.length > 0) {
    return scopedLevels;
  }

  return [5, 4, 3, 2, 1].filter((candidateLevel) => candidateLevel >= targetLevel);
}

function buildRequiredCoverageLevels(levels = []) {
  return normalizeCoverageLevels(
    (Array.isArray(levels) ? levels : [])
      .flatMap((level) => buildCoverageLevels(level))
  );
}

function isContiguousCoverageRange(levels = []) {
  if (!Array.isArray(levels) || levels.length < 2) {
    return false;
  }

  const normalized = normalizeCoverageLevels(levels);
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1] - normalized[index] !== 1) {
      return false;
    }
  }
  return true;
}

function buildCoverageLabel(levels = []) {
  const normalized = normalizeCoverageLevels(levels);
  if (normalized.length === 0) {
    return '';
  }
  if (normalized.length === 1) {
    return `N${normalized[0]}`;
  }
  if (isContiguousCoverageRange(normalized)) {
    return `N${Math.min(...normalized)}-N${Math.max(...normalized)}`;
  }
  return normalized.map((level) => `N${level}`).join(' + ');
}

function buildCoverageWordRows({ level, wordTsvByLevel = {}, availableLevels = null }) {
  const coverageLevels = buildCoverageLevels(level, { availableLevels });
  const mergedRows = new Map();
  const sourceLevelCounts = {};

  for (const coverageLevel of coverageLevels) {
    const tsv = wordTsvByLevel[coverageLevel];
    if (typeof tsv !== 'string') {
      throw new Error(`Missing word TSV for cumulative coverage level N${coverageLevel}. Run npm run deck:words:ready -- --levels=${coverageLevel} first.`);
    }

    const parsedRows = parseWordTsv(tsv);
    sourceLevelCounts[coverageLevel] = parsedRows.length;

    for (const row of parsedRows) {
      const key = buildWordStudyEntryKey({
        written: row?.Word || row?.word,
        reading: row?.Reading || row?.reading,
      });
      if (!key || mergedRows.has(key)) {
        continue;
      }

      mergedRows.set(key, {
        ...row,
        SourceDeckLevel: `N${coverageLevel}`,
        SourceDeckLevelNumber: coverageLevel,
      });
    }
  }

  const targetLevel = Number(level);
  const activeLevelRowCount = Number.isInteger(targetLevel)
    ? sourceLevelCounts[targetLevel] || 0
    : 0;

  return {
    coverageLevels,
    activeLevel: targetLevel,
    activeLevelLabel: Number.isInteger(targetLevel) ? `N${targetLevel}` : '',
    activeLevelRowCount,
    coverageLabel: buildCoverageLabel(coverageLevels),
    readingScopeRowCount: mergedRows.size,
    sourceLevelCounts,
    wordRows: [...mergedRows.values()],
  };
}

module.exports = {
  buildCoverageLabel,
  buildCoverageLevels,
  buildRequiredCoverageLevels,
  buildCoverageWordRows,
  normalizeCoverageLevels,
};
