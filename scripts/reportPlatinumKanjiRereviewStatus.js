const { invokeCliMain } = require("../src/utils/cliArgs");
const {
    main,
    parseArgs,
    readPriorLaneInputs,
    readReviewSet,
} = require("../src/services/platinumKanjiRereviewStatusCommandService");

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    main,
    parseArgs,
    readPriorLaneInputs,
    readReviewSet,
};
