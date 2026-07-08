const {
    invokeCliMain,
} = require("../src/utils/cliArgs");
const {
    main,
    parseArgs,
    readReviewSet,
} = require("../src/services/obsidianKanjiCertificationStatusCommandService");

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    main,
    parseArgs,
    readReviewSet,
};
