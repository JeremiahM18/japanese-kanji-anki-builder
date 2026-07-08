const { invokeCliMain } = require("../src/utils/cliArgs");
const platinumKanjiRereviewStatus = require("../src/services/platinumKanjiRereviewStatusCommandService");
const {
    OBSIDIAN_PROOF_PROVIDER_MODES,
} = require("../src/services/obsidianProofProviderService");

function main(options = {}) {
    return platinumKanjiRereviewStatus.main({
        commandName: "deck:kanji:obsidian:rereview-status",
        defaultProofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE,
        ...options,
    });
}

module.exports = {
    ...platinumKanjiRereviewStatus,
    main,
};

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}
