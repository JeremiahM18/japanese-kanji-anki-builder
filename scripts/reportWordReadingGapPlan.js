const {
  assertValidWordReadingGapPlanOptions,
  buildCandidateRows,
  buildKanjiApiCandidateRows,
  buildSentenceCandidateRows,
  buildTrackedWordCandidateRows,
  buildWordReadingGapPlanForLevel,
  main,
  parseArgs,
  readCachedWordsForKanji,
} = require('../src/services/wordReadingGapPlanCommandService');
const { invokeCliMain } = require('../src/utils/cliArgs');

if (require.main === module) {
  invokeCliMain(main).catch((error) => {
    console.error(error.stack || error);
    process.exit(1);
  });
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
};
