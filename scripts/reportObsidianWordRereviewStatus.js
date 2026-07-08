const { invokeCliMain } = require("../src/utils/cliArgs");
const platinumWordRereviewStatus = require("../src/services/platinumWordRereviewStatusCommandService");
const {
    OBSIDIAN_PROOF_PROVIDER_MODES,
} = require("../src/services/obsidianProofProviderService");

module.exports = platinumWordRereviewStatus;

if (require.main === module) {
    invokeCliMain(() => platinumWordRereviewStatus.main({
        commandName: "deck:words:obsidian:rereview-status",
        defaultProofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE,
    })).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}
