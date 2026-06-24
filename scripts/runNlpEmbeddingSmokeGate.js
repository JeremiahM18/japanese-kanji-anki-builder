const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    buildNlpEmbeddingSmokeGateReport,
    formatNlpEmbeddingSmokeGateReport,
} = require("../src/services/nlpEmbeddingSmokeGateService");

function parseArgs(argv) {
    const options = {
        json: false,
        force: false,
        manifestPath: null,
        benchmarkPath: null,
        modelId: null,
        cacheDir: null,
        smokeGatePath: null,
        workspaceRoot: null,
        allowRemoteModels: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--force" || arg === "--force-smoke") {
            options.force = true;
        } else if (arg === "--allow-remote-models") {
            options.allowRemoteModels = true;
        } else if (arg.startsWith("--manifest=")) {
            options.manifestPath = parseStringOption(arg, "manifest").trim();
        } else if (arg.startsWith("--benchmark=")) {
            options.benchmarkPath = parseStringOption(arg, "benchmark").trim();
        } else if (arg.startsWith("--model-id=")) {
            options.modelId = parseStringOption(arg, "model-id").trim();
        } else if (arg.startsWith("--cache-dir=")) {
            options.cacheDir = parseStringOption(arg, "cache-dir").trim();
        } else if (arg.startsWith("--smoke-gate=")) {
            options.smokeGatePath = parseStringOption(arg, "smoke-gate").trim();
        } else if (arg.startsWith("--workspace-root=")) {
            options.workspaceRoot = parseStringOption(arg, "workspace-root").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("nlp:embeddings:smoke-gate", options.unknownArgs);

    const report = await buildNlpEmbeddingSmokeGateReport({
        force: options.force,
        manifestPath: options.manifestPath || undefined,
        benchmarkPath: options.benchmarkPath || undefined,
        modelId: options.modelId || undefined,
        cacheDir: options.cacheDir || undefined,
        smokeGatePath: options.smokeGatePath || undefined,
        workspaceRoot: options.workspaceRoot || undefined,
        allowRemoteModels: options.allowRemoteModels,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatNlpEmbeddingSmokeGateReport(report));
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
