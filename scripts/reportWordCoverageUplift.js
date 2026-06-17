const fs = require('node:fs');
const path = require('node:path');

const { loadConfig } = require('../src/config');
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseNumericOption, parseStringOption } = require('../src/utils/cliArgs');
const {
  buildWordReadingCoverageReport,
  parseKanjiTsv,
} = require('../src/services/wordReadingCoverageService');
const { buildCoverageWordRows } = require('../src/services/wordDeckCoverageScopeService');

function parseJlptLevel(value, optionName) {
  const match = String(value || '').trim().match(/^N?([1-5])$/i);
  if (!match) {
    throw new Error(`${optionName} must be a JLPT level from N1-N5.`);
  }
  return Number(match[1]);
}

function formatLevel(level) {
  return `N${level}`;
}

function formatPercent(count, total) {
  if (!total) {
    return '0.0%';
  }
  return `${((count / total) * 100).toFixed(1)}%`;
}

function parseNonNegativeIntegerOption(arg, name) {
  const value = parseNumericOption(arg, name);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    json: false,
    details: false,
    maxExamples: 20,
    targetLevel: 5,
    throughLevel: null,
    unknownArgs: [],
  };

  for (const arg of argv) {
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--details') {
      options.details = true;
    } else if (arg.startsWith('--target-level=')) {
      options.targetLevel = parseJlptLevel(parseStringOption(arg, 'target-level'), 'target-level');
    } else if (arg.startsWith('--level=')) {
      options.targetLevel = parseJlptLevel(parseStringOption(arg, 'level'), 'level');
    } else if (arg.startsWith('--through-level=')) {
      options.throughLevel = parseJlptLevel(parseStringOption(arg, 'through-level'), 'through-level');
    } else if (arg.startsWith('--through=')) {
      options.throughLevel = parseJlptLevel(parseStringOption(arg, 'through'), 'through');
    } else if (arg.startsWith('--max-examples=')) {
      options.maxExamples = parseNonNegativeIntegerOption(arg, 'max-examples');
    } else {
      collectUnknownArg(options, arg);
    }
  }

  if (options.throughLevel === null) {
    options.throughLevel = options.targetLevel;
  }

  return options;
}

function buildCoverageLevelSteps(targetLevel, throughLevel) {
  const target = Number(targetLevel);
  const through = Number(throughLevel);
  if (!Number.isInteger(target) || target < 1 || target > 5) {
    throw new Error('target-level must be a JLPT level from N1-N5.');
  }
  if (!Number.isInteger(through) || through < 1 || through > 5) {
    throw new Error('through-level must be a JLPT level from N1-N5.');
  }
  if (through > target) {
    throw new Error('through-level must be the same as or harder than target-level.');
  }

  const steps = [];
  for (let level = target; level >= through; level -= 1) {
    const levels = [];
    for (let coverageLevel = target; coverageLevel >= level; coverageLevel -= 1) {
      levels.push(coverageLevel);
    }
    steps.push({
      addedLevel: level,
      levels,
    });
  }
  return steps;
}

function flattenCoverageEntries(report) {
  const entries = new Map();
  for (const kanjiEntry of report.kanji || []) {
    for (const [readingType, coverageList] of [
      ['on', kanjiEntry.onCoverage || []],
      ['kun', kanjiEntry.kunCoverage || []],
    ]) {
      for (const readingEntry of coverageList) {
        const key = `${kanjiEntry.kanji}|${readingType}|${readingEntry.reading}`;
        entries.set(key, {
          key,
          kanji: kanjiEntry.kanji,
          readingType,
          reading: readingEntry.reading,
          status: readingEntry.status,
          gapKind: readingEntry.gapKind || '',
          deckExamples: readingEntry.deckExamples || [],
        });
      }
    }
  }
  return entries;
}

function buildNewlyCoveredReadings(previousReport, currentReport, addedLevel) {
  if (!previousReport) {
    return [];
  }

  const previousEntries = flattenCoverageEntries(previousReport);
  const currentEntries = flattenCoverageEntries(currentReport);
  const rows = [];

  for (const [key, currentEntry] of currentEntries) {
    const previousEntry = previousEntries.get(key);
    if (!previousEntry || previousEntry.status === 'covered' || currentEntry.status !== 'covered') {
      continue;
    }

    const addedExamples = currentEntry.deckExamples.filter((example) => example.deckLevel === addedLevel);
    rows.push({
      key,
      kanji: currentEntry.kanji,
      readingType: currentEntry.readingType,
      reading: currentEntry.reading,
      gapKindBefore: previousEntry.gapKind,
      examples: addedExamples.length > 0 ? addedExamples : currentEntry.deckExamples,
    });
  }

  return rows.sort((a, b) => a.kanji.localeCompare(b.kanji, 'ja')
    || a.reading.localeCompare(b.reading, 'ja')
    || a.readingType.localeCompare(b.readingType));
}

function buildCoverageReportForLevels({ targetLevel, levels, kanjiRows, wordTsvByLevel }) {
  const coverageScope = buildCoverageWordRows({
    level: targetLevel,
    wordTsvByLevel,
    availableLevels: levels,
  });

  return buildWordReadingCoverageReport({
    kanjiRows,
    wordRows: coverageScope.wordRows,
    levelLabel: formatLevel(targetLevel),
  });
}

function buildWordCoverageUpliftReport({ targetLevel, throughLevel, kanjiRows, wordTsvByLevel }) {
  const steps = buildCoverageLevelSteps(targetLevel, throughLevel);
  const reports = [];
  let previousReport = null;
  let baselineCovered = 0;

  for (const step of steps) {
    const coverageReport = buildCoverageReportForLevels({
      targetLevel,
      levels: step.levels,
      kanjiRows,
      wordTsvByLevel,
    });
    const summary = coverageReport.summary;
    if (reports.length === 0) {
      baselineCovered = summary.coveredReadings;
    }

    const missingReadings = summary.totalReadings - summary.coveredReadings;
    const newlyCoveredReadings = buildNewlyCoveredReadings(previousReport, coverageReport, step.addedLevel);
    reports.push({
      addedLevel: step.addedLevel,
      coverageLevels: summary.coverageLevels,
      coverageLabel: summary.coverageLabel,
      totalReadings: summary.totalReadings,
      coveredReadings: summary.coveredReadings,
      coveragePercent: formatPercent(summary.coveredReadings, summary.totalReadings),
      missingReadings,
      distinctGapReadings: summary.distinctGapReadings,
      variantGapReadings: summary.variantGapReadings,
      currentLevelCoveredReadings: summary.currentLevelCoveredReadings,
      priorLevelCoveredReadings: summary.priorLevelCoveredReadings,
      laterLevelCoveredReadings: summary.laterLevelCoveredReadings,
      deltaFromPrevious: previousReport ? summary.coveredReadings - previousReport.summary.coveredReadings : 0,
      deltaFromBaseline: summary.coveredReadings - baselineCovered,
      newlyCoveredReadings,
    });
    previousReport = coverageReport;
  }

  return {
    targetLevel,
    throughLevel,
    baseline: reports[0],
    final: reports[reports.length - 1],
    steps: reports,
  };
}

function formatNewlyCoveredRows(rows, maxExamples) {
  return rows.slice(0, maxExamples).map((row) => {
    const examples = row.examples.slice(0, 3)
      .map((example) => `${example.written} (${example.reading}, N${example.deckLevel || '?'})`)
      .join(', ');
    return `  - ${row.kanji} ${row.readingType}-reading ${row.reading}${examples ? ` -> ${examples}` : ''}`;
  });
}

function formatWordCoverageUpliftReport(report, { details = false, maxExamples = 20 } = {}) {
  const lines = [];
  lines.push(`Japanese Kanji Builder Word Coverage Uplift (${formatLevel(report.targetLevel)} through ${formatLevel(report.throughLevel)})`);
  lines.push('');
  lines.push(`Target audit: ${formatLevel(report.targetLevel)} kanji readings`);
  lines.push('Read-only diagnostic: does not change readiness, deferrals, review lanes, or proof ledgers.');
  lines.push('Baseline counts only the target word deck; each step adds harder word decks down to the through level.');
  lines.push('');

  for (const [index, step] of report.steps.entries()) {
    const prefix = index === 0 ? `Baseline ${formatLevel(step.addedLevel)} only` : `+ ${formatLevel(step.addedLevel)}`;
    const deltaText = index === 0
      ? ''
      : `, +${step.deltaFromPrevious} from previous, +${step.deltaFromBaseline} total`;
    lines.push(`${prefix}: ${step.coveredReadings}/${step.totalReadings} (${step.coveragePercent}), missing ${step.missingReadings}${deltaText}`);
  }

  const addedSteps = report.steps.filter((step, index) => index > 0);
  if (addedSteps.length > 0) {
    lines.push('');
    lines.push('Newly covered by added levels:');
    for (const step of addedSteps) {
      lines.push(`- ${formatLevel(step.addedLevel)}: ${step.newlyCoveredReadings.length}`);
      if (details && step.newlyCoveredReadings.length > 0) {
        lines.push(...formatNewlyCoveredRows(step.newlyCoveredReadings, maxExamples));
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

function resolveKanjiTsvPath(config, level) {
  return path.join(config.buildOutDir, 'exports', `jlpt-n${level}.tsv`);
}

function resolveWordTsvPath(level) {
  return path.join(process.cwd(), 'out', 'word-build', 'exports', `jlpt-n${level}-words.tsv`);
}

function loadWordTsvByLevel(levels) {
  const wordTsvByLevel = {};
  for (const level of levels) {
    const wordTsvPath = resolveWordTsvPath(level);
    if (!fs.existsSync(wordTsvPath)) {
      throw new Error(`Missing word TSV export at ${wordTsvPath}. Run npm run deck:words:ready -- --levels=${level} first.`);
    }
    wordTsvByLevel[level] = fs.readFileSync(wordTsvPath, 'utf8');
  }
  return wordTsvByLevel;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertNoUnknownArgs('deck:words:coverage-uplift', options.unknownArgs);

  const levels = buildCoverageLevelSteps(options.targetLevel, options.throughLevel)
    .at(-1)
    .levels;
  const config = loadConfig();
  const kanjiTsvPath = resolveKanjiTsvPath(config, options.targetLevel);
  if (!fs.existsSync(kanjiTsvPath)) {
    throw new Error(`Missing kanji TSV export at ${kanjiTsvPath}. Run npm run deck:ready -- --levels=${options.targetLevel} first.`);
  }

  const report = buildWordCoverageUpliftReport({
    targetLevel: options.targetLevel,
    throughLevel: options.throughLevel,
    kanjiRows: parseKanjiTsv(fs.readFileSync(kanjiTsvPath, 'utf8')),
    wordTsvByLevel: loadWordTsvByLevel(levels),
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  process.stdout.write(formatWordCoverageUpliftReport(report, {
    details: options.details,
    maxExamples: options.maxExamples,
  }));
}

if (require.main === module) {
  invokeCliMain(main).catch((error) => {
    console.error(error.stack || error);
    process.exit(1);
  });
}

module.exports = {
  buildCoverageLevelSteps,
  buildNewlyCoveredReadings,
  buildWordCoverageUpliftReport,
  formatWordCoverageUpliftReport,
  parseArgs,
  parseJlptLevel,
};
