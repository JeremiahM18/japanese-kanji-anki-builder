const fs = require('node:fs');
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseNumericOption } = require('../src/utils/cliArgs');
const { buildCacheFilePath, buildLegacyCacheFilePath } = require('../src/clients/kanjiApiClient');
const { loadSentenceCorpus } = require('../src/datasets/sentenceCorpus');
const { loadWordStudyData } = require('../src/datasets/wordStudyData');
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
    minSuggestionScore: 50,
    suggestions: 5,
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
    } else if (arg.startsWith('--suggestions=')) {
      options.suggestions = parseNumericOption(arg, 'suggestions');
    } else if (arg.startsWith('--min-suggestion-score=')) {
      options.minSuggestionScore = parseNumericOption(arg, 'min-suggestion-score');
    } else {
      collectUnknownArg(options, arg);
    }
  }

  return options;
}

function safeKey(value) {
  return encodeURIComponent(value).replace(/%/g, '_');
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readCachedWordsForKanji(cacheDir, kanji) {
  const cacheKey = `words_${safeKey(kanji)}`;
  const cached = readJsonIfExists(buildCacheFilePath(cacheDir, cacheKey))
    || readJsonIfExists(buildLegacyCacheFilePath(cacheDir, cacheKey));
  return Array.isArray(cached) ? cached : [];
}

function pickPrimaryGloss(entry) {
  const meaning = (Array.isArray(entry?.meanings) ? entry.meanings : [])
    .find((candidate) => Array.isArray(candidate?.glosses) && candidate.glosses.length > 0);
  return {
    gloss: meaning?.glosses?.[0] ? String(meaning.glosses[0]) : '',
    allGlossText: (Array.isArray(entry?.meanings) ? entry.meanings : [])
      .flatMap((candidate) => Array.isArray(candidate?.glosses) ? candidate.glosses : [])
      .map((gloss) => String(gloss || '').trim())
      .filter(Boolean)
      .join(' '),
  };
}

function buildKanjiApiCandidateRows(wordsByKanji = {}) {
  const rows = [];

  for (const [kanji, entries] of Object.entries(wordsByKanji)) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      const { gloss, allGlossText } = pickPrimaryGloss(entry);
      for (const variant of Array.isArray(entry?.variants) ? entry.variants : []) {
        if (!variant?.written || !variant?.pronounced || !gloss) {
          continue;
        }

        rows.push({
          written: String(variant.written),
          reading: String(variant.pronounced),
          meaning: gloss,
          allGlossText,
          source: 'kanjiapi_cache',
          sourceKanji: kanji,
          priorityCount: Array.isArray(variant?.priorities) ? variant.priorities.length : 0,
        });
      }
    }
  }

  return rows;
}

function buildTrackedWordCandidateRows(wordStudyEntries = {}) {
  return Object.values(wordStudyEntries || {}).map((entry) => ({
    written: entry.written,
    reading: entry.reading,
    meaning: entry.meaning,
    source: 'tracked_word',
  }));
}

function buildSentenceCandidateRows(sentenceCorpus = []) {
  return (Array.isArray(sentenceCorpus) ? sentenceCorpus : [])
    .filter((entry) => entry?.written && entry?.reading)
    .map((entry) => ({
      written: String(entry.written),
      reading: String(entry.reading),
      meaning: String(entry.english || ''),
      source: 'sentence_corpus',
      frequencyRank: entry.frequencyRank,
    }));
}

function buildCandidateRows({ cacheDir, sentenceCorpus, triage, wordStudyEntries }) {
  const kanjiList = [...new Set((triage.items || []).map((item) => item.kanji).filter(Boolean))];
  const wordsByKanji = {};
  for (const kanji of kanjiList) {
    wordsByKanji[kanji] = readCachedWordsForKanji(cacheDir, kanji);
  }

  return [
    ...buildTrackedWordCandidateRows(wordStudyEntries),
    ...buildSentenceCandidateRows(sentenceCorpus),
    ...buildKanjiApiCandidateRows(wordsByKanji),
  ];
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
  const suggestions = Number(options.suggestions);
  if (!Number.isInteger(suggestions) || suggestions < 0) {
    throw new Error('Word reading gap plan suggestions must be a non-negative integer.');
  }
  const minSuggestionScore = Number(options.minSuggestionScore);
  if (!Number.isInteger(minSuggestionScore)) {
    throw new Error('Word reading gap plan min suggestion score must be an integer.');
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
  const sentenceCorpus = loadSentenceCorpus(config.sentenceCorpusPath);
  const wordStudyEntries = loadWordStudyData({
    localPath: config.wordStudyDataPath,
  });
  const jlptOnlyJson = readJsonIfExists(config.jlptJsonPath) || {};
  const candidateRows = suggestions > 0
    ? buildCandidateRows({
      cacheDir: config.cacheDir,
      sentenceCorpus,
      triage,
      wordStudyEntries,
    })
    : [];
  const plan = buildWordReadingGapPlan(triage, {
    candidateRows,
    coverageSummary: coverageReport.summary,
    includeDeferred: options.includeDeferred,
    jlptOnlyJson,
    limit,
    minSuggestionScore,
    maxSuggestionsPerItem: suggestions,
    sentenceCorpus,
    targetLevel: level,
    wordStudyEntries,
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
  buildCandidateRows,
  buildKanjiApiCandidateRows,
  buildSentenceCandidateRows,
  buildTrackedWordCandidateRows,
  main,
  parseArgs,
  readCachedWordsForKanji,
};
