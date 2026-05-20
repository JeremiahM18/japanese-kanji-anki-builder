const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    buildNlpRuntimeDoctorReport,
    formatNlpRuntimeDoctorReport,
} = require("../src/services/nlpRuntimeDoctorService");

function parseArgs(argv) {
    const options = {
        json: false,
        manifestPath: null,
        packageJsonPath: null,
        workspaceRoot: null,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--manifest=")) {
            options.manifestPath = parseStringOption(arg, "manifest").trim();
        } else if (arg.startsWith("--package-json=")) {
            options.packageJsonPath = parseStringOption(arg, "package-json").trim();
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
    assertNoUnknownArgs("nlp:doctor", options.unknownArgs);

    const report = buildNlpRuntimeDoctorReport({
        manifestPath: options.manifestPath || undefined,
        packageJsonPath: options.packageJsonPath || undefined,
        workspaceRoot: options.workspaceRoot || undefined,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatNlpRuntimeDoctorReport(report));
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
