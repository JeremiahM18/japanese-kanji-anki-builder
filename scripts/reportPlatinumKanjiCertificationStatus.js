const obsidianKanjiCertificationStatus = require("./reportObsidianKanjiCertificationStatus");

module.exports = obsidianKanjiCertificationStatus;

if (require.main === module) {
    obsidianKanjiCertificationStatus.main().catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}
