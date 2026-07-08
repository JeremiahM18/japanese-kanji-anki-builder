const { invokeCliMain } = require("../src/utils/cliArgs");
const {
    DEFAULT_CONTRACT,
    DEFAULT_EVIDENCE,
    DEFAULT_SOURCE_INPUTS,
    buildJsonOutput,
    buildSourceInputReviews,
    buildSourceLevelDeltaReportFromPaths,
    formatWorklistPrioritySummary,
    formatJlptKanjiSourceLevelDeltaReport,
    main,
    parseArgs,
    summarizeWorklistPriorities,
} = require("../src/services/jlptKanjiSourceLevelDeltaCommandService");

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_CONTRACT,
    DEFAULT_EVIDENCE,
    DEFAULT_SOURCE_INPUTS,
    buildJsonOutput,
    buildSourceInputReviews,
    buildSourceLevelDeltaReportFromPaths,
    formatWorklistPrioritySummary,
    formatJlptKanjiSourceLevelDeltaReport,
    main,
    parseArgs,
    summarizeWorklistPriorities,
};
