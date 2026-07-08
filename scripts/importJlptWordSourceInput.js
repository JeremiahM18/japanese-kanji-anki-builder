const {
    DEFAULT_CONFIG,
    DEFAULT_CONTRACT,
    DEFAULT_EVIDENCE,
    buildDefaultAssignmentFile,
    formatReport,
    main,
    parseArgs,
    resolveManifestRelativePath,
    run,
} = require("../src/services/jlptWordSourceInputImportCommandService");

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_CONFIG,
    DEFAULT_CONTRACT,
    DEFAULT_EVIDENCE,
    buildDefaultAssignmentFile,
    formatReport,
    main,
    parseArgs,
    resolveManifestRelativePath,
    run,
};
