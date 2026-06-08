const obsidianWordCertificationStatus = require("./reportObsidianWordCertificationStatus");
const {
    OBSIDIAN_PROOF_PROVIDER_MODES,
} = require("../src/services/obsidianProofProviderService");

module.exports = obsidianWordCertificationStatus;

if (require.main === module) {
    obsidianWordCertificationStatus.main({
        commandName: "deck:words:legacy-platinum:certify-status",
        defaultProofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE,
    }).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}
