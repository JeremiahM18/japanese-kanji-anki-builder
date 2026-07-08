const {
    DEFAULT_MODEL_ID,
    buildDefaultOutPath,
    buildReadingGapPlanForNlp,
    collectExistingInputHashes,
    main,
    parseArgs,
} = require("../src/services/nlpReadingGapCandidateDiscoveryCommandService");
const { invokeCliMain } = require("../src/utils/cliArgs");

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_MODEL_ID,
    buildDefaultOutPath,
    buildReadingGapPlanForNlp,
    collectExistingInputHashes,
    main,
    parseArgs,
};
