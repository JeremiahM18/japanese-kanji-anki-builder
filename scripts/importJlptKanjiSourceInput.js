const {
    DEFAULT_CONFIG,
    DEFAULT_CONTRACT,
    DEFAULT_EVIDENCE,
    formatImportReport,
    formatMaterializedShiftLine,
    main,
    parseArgs,
    run,
} = require("../src/services/jlptKanjiSourceInputImportCommandService");

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_CONFIG,
    DEFAULT_CONTRACT,
    DEFAULT_EVIDENCE,
    formatImportReport,
    formatMaterializedShiftLine,
    main,
    parseArgs,
    run,
};
