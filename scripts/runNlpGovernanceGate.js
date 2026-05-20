const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    buildNlpGovernanceGateReport,
    formatNlpGovernanceGateReport,
} = require("../src/services/nlpGovernanceGateService");

function parseArgs(argv) {
    const options = {
        json: false,
        manifestPath: null,
        suggestionArtifactDir: null,
        suggestionArtifactPath: null,
        tokenizationArtifactDir: null,
        tokenizationArtifactPath: null,
        embeddingArtifactDir: null,
        embeddingArtifactPath: null,
        reviewPacketArtifactDir: null,
        reviewPacketArtifactPath: null,
        draftProposalArtifactDir: null,
        draftProposalArtifactPath: null,
        workspaceRoot: null,
        packageJsonPath: null,
        packageLockJsonPath: null,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--manifest=")) {
            options.manifestPath = parseStringOption(arg, "manifest").trim();
        } else if (arg.startsWith("--suggestions-dir=")) {
            options.suggestionArtifactDir = parseStringOption(arg, "suggestions-dir").trim();
        } else if (arg.startsWith("--suggestion-path=")) {
            options.suggestionArtifactPath = parseStringOption(arg, "suggestion-path").trim();
        } else if (arg.startsWith("--tokenization-dir=")) {
            options.tokenizationArtifactDir = parseStringOption(arg, "tokenization-dir").trim();
        } else if (arg.startsWith("--tokenization-path=")) {
            options.tokenizationArtifactPath = parseStringOption(arg, "tokenization-path").trim();
        } else if (arg.startsWith("--embeddings-dir=")) {
            options.embeddingArtifactDir = parseStringOption(arg, "embeddings-dir").trim();
        } else if (arg.startsWith("--embedding-path=")) {
            options.embeddingArtifactPath = parseStringOption(arg, "embedding-path").trim();
        } else if (arg.startsWith("--review-packets-dir=")) {
            options.reviewPacketArtifactDir = parseStringOption(arg, "review-packets-dir").trim();
        } else if (arg.startsWith("--review-packet-path=")) {
            options.reviewPacketArtifactPath = parseStringOption(arg, "review-packet-path").trim();
        } else if (arg.startsWith("--drafts-dir=")) {
            options.draftProposalArtifactDir = parseStringOption(arg, "drafts-dir").trim();
        } else if (arg.startsWith("--draft-path=")) {
            options.draftProposalArtifactPath = parseStringOption(arg, "draft-path").trim();
        } else if (arg.startsWith("--workspace-root=")) {
            options.workspaceRoot = parseStringOption(arg, "workspace-root").trim();
        } else if (arg.startsWith("--package-json=")) {
            options.packageJsonPath = parseStringOption(arg, "package-json").trim();
        } else if (arg.startsWith("--package-lock=")) {
            options.packageLockJsonPath = parseStringOption(arg, "package-lock").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    if (options.suggestionArtifactDir && options.suggestionArtifactPath) {
        collectUnknownArg(options, "use only one of --suggestions-dir or --suggestion-path");
    }
    if (options.tokenizationArtifactDir && options.tokenizationArtifactPath) {
        collectUnknownArg(options, "use only one of --tokenization-dir or --tokenization-path");
    }
    if (options.embeddingArtifactDir && options.embeddingArtifactPath) {
        collectUnknownArg(options, "use only one of --embeddings-dir or --embedding-path");
    }
    if (options.reviewPacketArtifactDir && options.reviewPacketArtifactPath) {
        collectUnknownArg(options, "use only one of --review-packets-dir or --review-packet-path");
    }
    if (options.draftProposalArtifactDir && options.draftProposalArtifactPath) {
        collectUnknownArg(options, "use only one of --drafts-dir or --draft-path");
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("nlp:governance-gate", options.unknownArgs);

    const report = buildNlpGovernanceGateReport({
        manifestPath: options.manifestPath || undefined,
        suggestionArtifactDir: options.suggestionArtifactDir || undefined,
        suggestionArtifactPath: options.suggestionArtifactPath || undefined,
        tokenizationArtifactDir: options.tokenizationArtifactDir || undefined,
        tokenizationArtifactPath: options.tokenizationArtifactPath || undefined,
        embeddingArtifactDir: options.embeddingArtifactDir || undefined,
        embeddingArtifactPath: options.embeddingArtifactPath || undefined,
        reviewPacketArtifactDir: options.reviewPacketArtifactDir || undefined,
        reviewPacketArtifactPath: options.reviewPacketArtifactPath || undefined,
        draftProposalArtifactDir: options.draftProposalArtifactDir || undefined,
        draftProposalArtifactPath: options.draftProposalArtifactPath || undefined,
        workspaceRoot: options.workspaceRoot || undefined,
        packageJsonPath: options.packageJsonPath || undefined,
        packageLockJsonPath: options.packageLockJsonPath || undefined,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatNlpGovernanceGateReport(report));
    }

    if (!report.passed) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    main,
    parseArgs,
};
