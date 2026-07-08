const { invokeCliMain } = require("../src/utils/cliArgs");
const obsidianKanjiCertificationStatus = require("../src/services/obsidianKanjiCertificationStatusCommandService");

module.exports = obsidianKanjiCertificationStatus;

if (require.main === module) {
    invokeCliMain(obsidianKanjiCertificationStatus.main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}
