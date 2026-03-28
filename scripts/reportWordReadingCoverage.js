const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('../src/config');
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseNumericOption } = require('../src/utils/cliArgs');
const {
  buildWordReadingCoverageReport,
  formatWordReadingCoverageReport,
  parseKanjiTsv,
  parseWordTsv,
} = require('../src/services/wordReadingCoverageService');

function parseArgs(argv) {
  const options = {
    json: false,
    level: 5,
    maxKanji: 50,
    unknownArgs: [],
  };

  for (const arg of argv) {
    if (arg === '--json') {
      options.json = true;
    } else if (arg.startsWith('--level=')) {
      options.level = parseNumericOption(arg, 'level');
    } else if (arg.startsWith('--max-kanji=')) {
      options.maxKanji = parseNumericOption(arg, 'max-kanji');
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertNoUnknownArgs('deck:words:reading-audit', options.unknownArgs);

  const level = Number(options.level);
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    throw new Error('Reading coverage audit level must be 1-5.');
  }

  const config = loadConfig();
  const jlptOnlyJson = JSON.parse(fs.readFileSync(config.jlptJsonPath, 'utf8'));
  const expectedKanjiCount = Object.values(jlptOnlyJson).filter((entry) => entry?.jlpt === level).length;
  const kanjiTsvPath = resolveKanjiTsvPath(config, level);
  const wordTsvPath = resolveWordTsvPath(level);

  if (!fs.existsSync(kanjiTsvPath)) {
    throw new Error(`Missing kanji TSV export at ${kanjiTsvPath}. Run npm run deck:ready -- --levels=${level} first.`);
  }
  if (!fs.existsSync(wordTsvPath)) {
    throw new Error(`Missing word TSV export at ${wordTsvPath}. Run npm run deck:words:ready -- --levels=${level} first.`);
  }

  const kanjiRows = parseKanjiTsv(fs.readFileSync(kanjiTsvPath, 'utf8'));
  const wordRows = parseWordTsv(fs.readFileSync(wordTsvPath, 'utf8'));

  if (kanjiRows.length < expectedKanjiCount) {
    throw new Error(`Kanji TSV at ${kanjiTsvPath} only contains ${kanjiRows.length} rows for N${level}, but the JLPT dataset has ${expectedKanjiCount}. Run npm run deck:ready -- --levels=${level} to regenerate a full kanji export before auditing reading coverage.`);
  }
  const report = buildWordReadingCoverageReport({
    kanjiRows,
    wordRows,
    levelLabel: `N${level}`,
  });

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }

  process.stdout.write(formatWordReadingCoverageReport(report, { maxKanji: options.maxKanji }));
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
  resolveKanjiTsvPath,
  resolveWordTsvPath,
};
