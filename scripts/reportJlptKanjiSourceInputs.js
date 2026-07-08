const {
    buildReports,
    formatJlptKanjiSourceInputsReport,
    formatSourceInputReport,
    main,
    parseArgs,
} = require("../src/services/jlptKanjiSourceInputReportService");

if (require.main === module) {
    main();
}

module.exports = {
    buildReports,
    formatJlptKanjiSourceInputsReport,
    formatSourceInputReport,
    main,
    parseArgs,
};
