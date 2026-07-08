const fs = require('node:fs');
const path = require('node:path');

const { loadConfig } = require('../config');
const {
  assertNoUnknownArgs,
  collectUnknownArg,
  parseNumericOption,
} = require('../utils/cliArgs');
const {
  buildWordReadingCoverageReport,
  buildWordReadingGapTriage,
  formatWordReadingGapTriage,
  parseKanjiTsv,
} = require('./wordReadingCoverageService');
const { buildCoverageWordRows, buildCoverageLevels } = require('./wordDeckCoverageScopeService');

function parseArgs(argv) {
  const options = {
    json: false,
    includeVariants: false,
    level: 5,
    maxItems: 50,
    unknownArgs: [],
  };

  for (const arg of argv) {
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--include-variants') {
      options.includeVariants = true;
    } else if (arg.startsWith('--level=')) {
      options.level = parseNumericOption(arg, 'level');
    } else if (arg.startsWith('--max-items=')) {
      options.maxItems = parseNumericOption(arg, 'max-items');
    } else {
      collectUnknownArg(options, arg);
    }
  }

  return options;
}

function assertValidWordReadingGapLevel(level, label) {
  const numericLevel = Number(level);
  if (!Number.isInteger(numericLevel) || numericLevel < 1 || numericLevel > 5) {
    throw new Error(`${label} level must be 1-5.`);
  }
  return numericLevel;
}

function resolveKanjiTsvPath(config, level) {
  return path.join(config.buildOutDir, 'exports', `jlpt-n${level}.tsv`);
}

function resolveWordTsvPath(level) {
  return path.join(process.cwd(), 'out', 'word-build', 'exports', `jlpt-n${level}-words.tsv`);
}

function loadCoverageWordTsvByLevel(level) {
  const wordTsvByLevel = {};
  for (const coverageLevel of buildCoverageLevels(level)) {
    const wordTsvPath = resolveWordTsvPath(coverageLevel);
    if (!fs.existsSync(wordTsvPath)) {
      throw new Error(`Missing cumulative coverage word TSV at ${wordTsvPath}. Run npm run deck:words:ready -- --levels=${coverageLevel} first.`);
    }
    wordTsvByLevel[coverageLevel] = fs.readFileSync(wordTsvPath, 'utf8');
  }
  return wordTsvByLevel;
}

function assertRequiredCoverageExportsExist({ kanjiTsvPath, wordTsvPath, level }) {
  if (!fs.existsSync(kanjiTsvPath)) {
    throw new Error(`Missing kanji TSV export at ${kanjiTsvPath}. Run npm run deck:ready -- --levels=${level} first.`);
  }
  if (!fs.existsSync(wordTsvPath)) {
    throw new Error(`Missing word TSV export at ${wordTsvPath}. Run npm run deck:words:ready -- --levels=${level} first.`);
  }
}

function buildWordReadingGapTriageForLevel({ config = loadConfig(), level }) {
  const normalizedLevel = assertValidWordReadingGapLevel(level, 'Word reading gap triage');
  const kanjiTsvPath = resolveKanjiTsvPath(config, normalizedLevel);
  const wordTsvPath = resolveWordTsvPath(normalizedLevel);

  assertRequiredCoverageExportsExist({
    kanjiTsvPath,
    wordTsvPath,
    level: normalizedLevel,
  });

  const kanjiRows = parseKanjiTsv(fs.readFileSync(kanjiTsvPath, 'utf8'));
  const coverageScope = buildCoverageWordRows({
    level: normalizedLevel,
    wordTsvByLevel: loadCoverageWordTsvByLevel(normalizedLevel),
  });
  const coverageReport = buildWordReadingCoverageReport({
    kanjiRows,
    wordRows: coverageScope.wordRows,
    levelLabel: `N${normalizedLevel}`,
  });
  const triage = buildWordReadingGapTriage(coverageReport);

  return {
    coverageReport,
    coverageScope,
    kanjiTsvPath,
    level: normalizedLevel,
    triage,
    wordTsvPath,
  };
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  assertNoUnknownArgs('deck:words:triage', options.unknownArgs);

  const { triage } = buildWordReadingGapTriageForLevel({
    level: options.level,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(triage, null, 2)}\n`);
    return;
  }

  process.stdout.write(formatWordReadingGapTriage(triage, {
    maxItems: options.maxItems,
    includeVariants: options.includeVariants,
  }));
}

module.exports = {
  assertRequiredCoverageExportsExist,
  assertValidWordReadingGapLevel,
  buildWordReadingGapTriageForLevel,
  loadCoverageWordTsvByLevel,
  main,
  parseArgs,
  resolveKanjiTsvPath,
  resolveWordTsvPath,
};
