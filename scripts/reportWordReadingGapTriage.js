const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('../src/config');
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseNumericOption } = require('../src/utils/cliArgs');
const {
  buildWordReadingCoverageReport,
  buildWordReadingGapTriage,
  formatWordReadingGapTriage,
  parseKanjiTsv,
} = require('../src/services/wordReadingCoverageService');
const { buildCoverageWordRows, buildCoverageLevels } = require('../src/services/wordDeckCoverageScopeService');

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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertNoUnknownArgs('deck:words:triage', options.unknownArgs);

  const level = Number(options.level);
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    throw new Error('Word reading gap triage level must be 1-5.');
  }

  const config = loadConfig();
  const kanjiTsvPath = resolveKanjiTsvPath(config, level);
  const wordTsvPath = resolveWordTsvPath(level);

  if (!fs.existsSync(kanjiTsvPath)) {
    throw new Error(`Missing kanji TSV export at ${kanjiTsvPath}. Run npm run deck:ready -- --levels=${level} first.`);
  }
  if (!fs.existsSync(wordTsvPath)) {
    throw new Error(`Missing word TSV export at ${wordTsvPath}. Run npm run deck:words:ready -- --levels=${level} first.`);
  }

  const kanjiRows = parseKanjiTsv(fs.readFileSync(kanjiTsvPath, 'utf8'));
  const coverageScope = buildCoverageWordRows({
    level,
    wordTsvByLevel: loadCoverageWordTsvByLevel(level),
  });
  const coverageReport = buildWordReadingCoverageReport({
    kanjiRows,
    wordRows: coverageScope.wordRows,
    levelLabel: `N${level}`,
  });
  const triage = buildWordReadingGapTriage(coverageReport);

  if (options.json) {
    process.stdout.write(JSON.stringify(triage, null, 2) + '\n');
    return;
  }

  process.stdout.write(formatWordReadingGapTriage(triage, {
    maxItems: options.maxItems,
    includeVariants: options.includeVariants,
  }));
}

if (require.main === module) {
  invokeCliMain(main).catch((error) => {
    console.error(error.stack || error);
    process.exit(1);
  });
}

module.exports = {
  main,
  parseArgs,
  loadCoverageWordTsvByLevel,
  resolveKanjiTsvPath,
  resolveWordTsvPath,
};
