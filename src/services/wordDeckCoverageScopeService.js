const { buildWordStudyEntryKey } = require('../datasets/wordStudyData');
const { parseWordTsv } = require('./wordReadingCoverageService');

function buildCoverageLevels(level) {
  const targetLevel = Number(level);
  if (!Number.isInteger(targetLevel) || targetLevel < 1 || targetLevel > 5) {
    throw new Error('Word deck coverage level must be 1-5.');
  }

  return [5, 4, 3, 2, 1].filter((candidateLevel) => candidateLevel >= targetLevel);
}

function buildCoverageLabel(levels = []) {
  return levels.map((level) => `N${level}`).join(' + ');
}

function buildCoverageWordRows({ level, wordTsvByLevel = {} }) {
  const coverageLevels = buildCoverageLevels(level);
  const mergedRows = new Map();

  for (const coverageLevel of coverageLevels) {
    const tsv = wordTsvByLevel[coverageLevel];
    if (typeof tsv !== 'string') {
      throw new Error(`Missing word TSV for cumulative coverage level N${coverageLevel}. Run npm run deck:words:ready -- --levels=${coverageLevel} first.`);
    }

    for (const row of parseWordTsv(tsv)) {
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

  return {
    coverageLevels,
    coverageLabel: buildCoverageLabel(coverageLevels),
    wordRows: [...mergedRows.values()],
  };
}

module.exports = {
  buildCoverageLabel,
  buildCoverageLevels,
  buildCoverageWordRows,
};
