const {
    DEFAULT_CONFIG,
    DEFAULT_EVIDENCE,
    buildReports,
    formatJlptWordSourceInputsReport,
    formatSourceInputReport,
    main,
    parseArgs,
    readOptionalBuffer,
} = require("../src/services/jlptWordSourceInputReportService");

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_CONFIG,
    DEFAULT_EVIDENCE,
    buildReports,
    formatJlptWordSourceInputsReport,
    formatSourceInputReport,
    main,
    parseArgs,
    readOptionalBuffer,
};
