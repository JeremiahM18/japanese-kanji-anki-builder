const service = require("../src/services/voicevoxPitchAccentImportService");
const { invokeCliMain } = require("../src/utils/cliArgs");

if (require.main === module) {
    invokeCliMain(service.main).catch((err) => {
        console.error(err.stack || err);
        process.exit(1);
    });
}

module.exports = service;
