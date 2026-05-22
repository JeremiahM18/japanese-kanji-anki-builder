const obsidianWordCertificationStatus = require("./reportObsidianWordCertificationStatus");

module.exports = obsidianWordCertificationStatus;

if (require.main === module) {
    obsidianWordCertificationStatus.main().catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}
