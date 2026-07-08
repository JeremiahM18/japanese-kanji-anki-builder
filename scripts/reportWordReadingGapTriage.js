const {
  assertRequiredCoverageExportsExist,
  assertValidWordReadingGapLevel,
  buildWordReadingGapTriageForLevel,
  loadCoverageWordTsvByLevel,
  main,
  parseArgs,
  resolveKanjiTsvPath,
  resolveWordTsvPath,
} = require('../src/services/wordReadingGapTriageCommandService');
const { invokeCliMain } = require('../src/utils/cliArgs');

if (require.main === module) {
  invokeCliMain(main).catch((error) => {
    console.error(error.stack || error);
    process.exit(1);
  });
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
