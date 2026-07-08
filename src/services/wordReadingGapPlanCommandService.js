const fs = require('node:fs');

const { buildCacheFilePath, buildLegacyCacheFilePath } = require('../clients/kanjiApiClient');
const { loadConfig } = require('../config');
const { loadJlptOnlyJson } = require('../datasets/jlptOnlyJson');
const { loadSentenceCorpus } = require('../datasets/sentenceCorpus');
const { loadWordStudyData } = require('../datasets/wordStudyData');
const {
  assertNoUnknownArgs,
  collectUnknownArg,
  parseNumericOption,
} = require('../utils/cliArgs');
const {
  buildWordReadingGapPlan,
  formatWordReadingGapPlan,
} = require('./wordReadingGapPlanService');
const {
  assertValidWordReadingGapLevel,
  buildWordReadingGapTriageForLevel,
} = require('./wordReadingGapTriageCommandService');

function parseArgs(argv) {
  const options = {
    json: false,
    includeDeferred: false,
    level: 5,
    limit: 50,
    minSuggestionScore: 50,
    only: 'all',
    quality: 'weak',
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
    } else if (arg.startsWith('--only=')) {
      options.only = String(arg.split('=')[1] || '').trim();
    } else if (arg.startsWith('--quality=')) {
      options.quality = String(arg.split('=')[1] || '').trim();
    } else {
      collectUnknownArg(options, arg);
    }
  }

  return options;
}

function assertValidWordReadingGapPlanOptions(options = {}) {
  const level = assertValidWordReadingGapLevel(options.level, 'Word reading gap plan');
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
  if (!['all', 'contract-extensions'].includes(options.only)) {
    throw new Error('Word reading gap plan --only must be one of: all, contract-extensions.');
  }
  if (!['weak', 'review', 'strong'].includes(options.quality)) {
    throw new Error('Word reading gap plan --quality must be one of: weak, review, strong.');
  }

  return {
    includeDeferred: Boolean(options.includeDeferred),
    level,
    limit,
    minSuggestionScore,
    only: options.only,
    quality: options.quality,
    suggestions,
  };
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

function buildWordReadingGapPlanForLevel({ config = loadConfig(), ...rawOptions } = {}) {
  const options = assertValidWordReadingGapPlanOptions(rawOptions);
  const triageResult = buildWordReadingGapTriageForLevel({
    config,
    level: options.level,
  });
  const sentenceCorpus = loadSentenceCorpus(config.sentenceCorpusPath);
  const wordStudyEntries = loadWordStudyData({
    localPath: config.wordStudyDataPath,
  });
  const jlptOnlyJson = loadJlptOnlyJson(config.jlptJsonPath);
  const candidateRows = options.suggestions > 0
    ? buildCandidateRows({
      cacheDir: config.cacheDir,
      sentenceCorpus,
      triage: triageResult.triage,
      wordStudyEntries,
    })
    : [];
  const plan = buildWordReadingGapPlan(triageResult.triage, {
    candidateRows,
    coverageSummary: triageResult.coverageReport.summary,
    includeDeferred: options.includeDeferred,
    jlptOnlyJson,
    limit: options.limit,
    minSuggestionScore: options.minSuggestionScore,
    minSuggestionQuality: options.quality,
    maxSuggestionsPerItem: options.suggestions,
    only: options.only,
    sentenceCorpus,
    targetLevel: options.level,
    wordStudyEntries,
  });

  return {
    ...triageResult,
    candidateRows,
    jlptOnlyJson,
    options,
    plan,
    sentenceCorpus,
    wordStudyEntries,
  };
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  assertNoUnknownArgs('deck:words:gap-plan', options.unknownArgs);

  const { plan } = buildWordReadingGapPlanForLevel(options);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }

  process.stdout.write(formatWordReadingGapPlan(plan));
}

module.exports = {
  assertValidWordReadingGapPlanOptions,
  buildCandidateRows,
  buildKanjiApiCandidateRows,
  buildSentenceCandidateRows,
  buildTrackedWordCandidateRows,
  buildWordReadingGapPlanForLevel,
  main,
  parseArgs,
  readCachedWordsForKanji,
  readJsonIfExists,
};
