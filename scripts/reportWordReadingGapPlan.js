const fs = require('node:fs');
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseNumericOption } = require('../src/utils/cliArgs');
const {
  buildWordReadingCoverageReport,
  buildWordReadingGapTriage,
  parseKanjiTsv,
} = require('../src/services/wordReadingCoverageService');
const { buildCoverageWordRows } = require('../src/services/wordDeckCoverageScopeService');
const {
  buildWordReadingGapPlan,
  formatWordReadingGapPlan,
} = require('../src/services/wordReadingGapPlanService');
const {
  loadCoverageWordTsvByLevel,
  resolveKanjiTsvPath,
  resolveWordTsvPath,
} = require('./reportWordReadingGapTriage');
const { loadConfig } = require('../src/config');

function parseArgs(argv) {
  const options = {
    json: false,
    includeDeferred: false,
    level: 5,
    limit: 50,
    unknownArgs: [],
  };

  for (const arg of argv) {
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--include-deferred') {
      options.includeDeferred = true;
    } else if (arg.startsWith('--level=')) {
      options.level = parseNumericOption(arg, 'level');
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseNumericOption(arg, 'limit');
    } else if (arg.startsWith('--max-items=')) {
      options.limit = parseNumericOption(arg, 'max-items');
    } else {
      collectUnknownArg(options, arg);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertNoUnknownArgs('deck:words:gap-plan', options.unknownArgs);

  const level = Number(options.level);
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    throw new Error('Word reading gap plan level must be 1-5.');
  }

  const limit = Number(options.limit);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('Word reading gap plan limit must be a positive integer.');
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

  const coverageScope = buildCoverageWordRows({
    level,
    wordTsvByLevel: loadCoverageWordTsvByLevel(level),
  });
  const coverageReport = buildWordReadingCoverageReport({
    kanjiRows: parseKanjiTsv(fs.readFileSync(kanjiTsvPath, 'utf8')),
    wordRows: coverageScope.wordRows,
    levelLabel: `N${level}`,
  });
  const triage = buildWordReadingGapTriage(coverageReport);
  const plan = buildWordReadingGapPlan(triage, {
    coverageSummary: coverageReport.summary,
    includeDeferred: options.includeDeferred,
    limit,
  });

  if (options.json) {
    process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
    return;
  }

  process.stdout.write(formatWordReadingGapPlan(plan));
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
};
