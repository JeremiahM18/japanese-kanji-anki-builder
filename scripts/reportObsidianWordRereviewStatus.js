const platinumWordRereviewStatus = require("./reportPlatinumWordRereviewStatus");

module.exports = platinumWordRereviewStatus;

if (require.main === module) {
    platinumWordRereviewStatus.main({ commandName: "deck:words:obsidian:rereview-status" }).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}
