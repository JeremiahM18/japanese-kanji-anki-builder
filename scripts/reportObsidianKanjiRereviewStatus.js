const platinumKanjiRereviewStatus = require("./reportPlatinumKanjiRereviewStatus");

module.exports = platinumKanjiRereviewStatus;

if (require.main === module) {
    platinumKanjiRereviewStatus.main({ commandName: "deck:kanji:obsidian:rereview-status" }).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}
